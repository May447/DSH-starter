/**
 * Child-process manager for a `dsh` launch.
 *
 * Owns at most one `dsh` child at a time. It spawns the configured command,
 * streams stdout/stderr to the renderer, watches for the ready line
 * (`dsh web: http://127.0.0.1:PORT/?token=…`), and turns every lifecycle
 * event into a {@link LaunchStatus} transition (which the main process
 * broadcasts to the renderer).
 *
 * Safety properties this file is responsible for:
 *  - `dshCommand` is resolved portably (absolute path / PATH name / .cmd /
 *    .bat / .ps1) without hardcoding any machine path (see `./command`).
 *  - Readiness survives chunk boundaries and ANSI colouring.
 *  - A launch that never reports ready fails after {@link READY_TIMEOUT_MS}
 *    and the child tree is killed, never left orphaned.
 *  - Stop escalates graceful → grace → forceful tree kill (`. /process-tree`).
 *  - Repeated `start()` while a child is alive returns the current status
 *    instead of spawning a second child.
 *  - No state can stay stuck in `starting`: every exit path settles.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { statSync } from 'node:fs'
import type { LaunchPhase, LaunchStatus, LauncherSettings, LogChunk, WorkspaceEntry } from '@shared/contract'
import { mergeEnv, resolveCommand, type SpawnPlan } from './command'
import { delay, requestForcedStop, requestGracefulStop } from './process-tree'

/**
 * The ready line printed by `dsh` once its HTTP server listens:
 * `dsh web: http://127.0.0.1:PORT/?token=…`.
 */
export const READY_LINE = /dsh\s+[^\s:]+:\s+(https?:\/\/[^\s"'<>]+)/i

/**
 * Fallback for a future output-format change: any local URL carrying a token
 * query parameter is good enough to hand over.
 */
export const READY_URL_FALLBACK = /(https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):\d+\/[^\s"'<>]*[?&]token=[A-Za-z0-9._~-]+)/i

/** Readiness deadline measured from spawn; a slow first boot still has to fit. */
export const READY_TIMEOUT_MS = 120_000

/** How long a graceful stop waits for the child to exit before escalating. */
export const STOP_GRACE_MS = 8_000

/**
 * A ready-line match waits this long before being committed, so a line split
 * across pipe chunks (e.g. cut right after `?token=`) is completed first.
 * Real `dsh` writes the line in one `console.log`, so the usual cost is 50ms.
 */
export const READY_SETTLE_MS = 50

/** How long a forced kill may take before we stop trusting the exit event. */
const FORCE_SETTLE_MS = 3_000

/** Terminal phases: a `start()` call resolves once one of them is reached. */
const TERMINAL_PHASES: ReadonlySet<LaunchPhase> = new Set<LaunchPhase>(['ready', 'failed', 'stopped'])

/** ANSI escape sequences (CSI, OSC and single-character escapes). */
const ANSI_ESCAPE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-_])/g

/** Strip terminal colour codes before looking for the ready line. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '')
}

/** Options mainly used by tests to shrink timeouts and pin the platform. */
export interface LaunchEngineOptions {
  /** Override the readiness deadline (default {@link READY_TIMEOUT_MS}). */
  readyTimeoutMs?: number
  /** Override the graceful-stop grace period (default {@link STOP_GRACE_MS}). */
  stopGraceMs?: number
  platform?: NodeJS.Platform
  /** Base environment for the child; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
  /** Base directory for resolving relative `dshCommand` paths. */
  cwd?: string
}

type LaunchEvents = {
  log: [LogChunk]
  status: [LaunchStatus]
}

/** One live child plus everything needed to interpret its output and stop it. */
interface LaunchRun {
  child: ChildProcess
  plan: SpawnPlan
  workspace: WorkspaceEntry | undefined
  startedAt: number
  readyTimer: NodeJS.Timeout
  /** Raw stdout/stderr tails so a ready line split across chunks still matches. */
  stdoutBuffer: string
  stderrBuffer: string
  /** Stripped stderr tail used to decorate exit messages. */
  stderrTail: string
  /** The user (or app shutdown) asked for the stop. */
  stopRequested: boolean
  /** We gave up on this run (timeout / spawn failure) and already emitted failed. */
  aborted: boolean
  /** The ready line was seen; the URL was handed over. */
  ready: boolean
  /** The `close` event arrived. */
  closed: boolean
  /** Debounce timer for {@link READY_SETTLE_MS}. */
  readySettleTimer?: NodeJS.Timeout | undefined
}

function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Collapse the tail of a stderr buffer into a single human-readable line. */
function summarizeTail(tail: string, maxLength = 400): string {
  const lines = stripAnsi(tail)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const text = lines.slice(-3).join(' | ')
  return text.length > maxLength ? `…${text.slice(-maxLength)}` : text
}

/** Turn a spawn error into something a human can act on; never expose a stack. */
function humanizeSpawnError(error: unknown, plan: SpawnPlan): string {
  const detail = error as NodeJS.ErrnoException
  const prefix = `无法启动 dsh（${plan.display}）`
  switch (detail.code) {
    case 'ENOENT':
      return `${prefix}：找不到可执行文件。请检查 dsh 命令路径，或确认它已经安装。`
    case 'EACCES':
      return `${prefix}：没有执行权限。`
    case 'EPERM':
      return `${prefix}：系统拒绝了执行（权限不足）。`
    case 'UNKNOWN':
      return `${prefix}：Windows 拒绝启动该命令（可能不是可执行文件，或被安全策略拦截）。`
    default:
      return `${prefix}：${detail.message === '' ? '未知错误' : detail.message}`
  }
}

/** Compose the human error for a process that died before / after readiness. */
function exitErrorMessage(code: number | null, signal: NodeJS.Signals | null, tail: string, afterReady: boolean): string {
  const how = code === null
    ? `被信号 ${signal ?? 'unknown'} 终止`
    : `退出码 ${String(code)}`
  const context = afterReady ? '运行中' : '报告就绪前'
  const summary = summarizeTail(tail)
  const base = `dsh 在${context}退出（${how}）`
  return summary === '' ? `${base}。` : `${base}：${summary}`
}

/** Resolve a URL printed on the ready line, rejecting anything that is not HTTP. */
export function parseReadyUrl(candidate: string): string | undefined {
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** Build the CLI argument vector: `<dsh> <profile> <extraArgs…> --no-open --port <N>`. */
export function buildLaunchArgs(settings: LauncherSettings): string[] {
  const profile = typeof settings.profile === 'string' ? settings.profile.trim() : ''
  const extraArgs = Array.isArray(settings.extraArgs) ? settings.extraArgs.filter((arg): arg is string => typeof arg === 'string') : []
  const port = Number.isInteger(settings.port) && settings.port >= 0 && settings.port <= 65_535 ? settings.port : 0
  return [profile === '' ? 'web' : profile, ...extraArgs, '--no-open', '--port', String(port)]
}

/** Owns at most one dsh child at a time. */
export class LaunchEngine extends EventEmitter<LaunchEvents> {
  #status: LaunchStatus = { phase: 'idle' }
  #run: LaunchRun | undefined
  #termination: { run: LaunchRun; promise: Promise<void> } | undefined
  readonly #options: LaunchEngineOptions
  readonly #platform: NodeJS.Platform

  constructor(options: LaunchEngineOptions = {}) {
    super()
    this.#options = options
    this.#platform = options.platform ?? process.platform
  }

  /** Snapshot of the current launch state (a copy, so callers cannot mutate it). */
  getStatus(): LaunchStatus {
    return { ...this.#status }
  }

  /**
   * Spawn `dsh` and resolve once the launch reaches a terminal phase
   * (`ready`, `failed` or `stopped`).
   *
   * If a child is already alive, the current status is returned immediately —
   * the engine never holds two children.
   *
   * @param settings - Command, profile, arguments, environment and port to use.
   * @param workspace - Workspace card this launch belongs to (its path becomes `cwd`).
   */
  async start(settings: LauncherSettings, workspace?: WorkspaceEntry): Promise<LaunchStatus> {
    if (this.#run !== undefined) return this.getStatus()

    const args = buildLaunchArgs(settings)
    const baseEnv = this.#options.env ?? process.env
    const env = mergeEnv(baseEnv, settings.env ?? {}, this.#platform)
    const cwd = workspace?.path
    if (cwd !== undefined && cwd !== '' && !directoryExists(cwd)) {
      return this.immediateFailure(`工作区目录不存在或不是文件夹：${cwd}。请在设置里重新选择工作区。`, workspace)
    }

    const resolution = resolveCommand(settings.dshCommand, args, {
      platform: this.#platform,
      env,
      cwd: this.#options.cwd ?? process.cwd(),
    })
    if (!resolution.ok) return this.immediateFailure(resolution.error, workspace)
    const plan = resolution.plan

    let child: ChildProcess
    try {
      child = spawn(plan.file, plan.args, {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: plan.windowsVerbatimArguments,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      return this.immediateFailure(humanizeSpawnError(error, plan))
    }

    const startedAt = Date.now()
    const run: LaunchRun = {
      child,
      plan,
      workspace,
      startedAt,
      stdoutBuffer: '',
      stderrBuffer: '',
      stderrTail: '',
      stopRequested: false,
      aborted: false,
      ready: false,
      closed: false,
      readyTimer: setTimeout(() => {
        if (this.#run !== run || run.ready || run.closed) return
        this.fail(run, `dsh 在 ${String(this.readyTimeoutMs / 1000)} 秒内没有报告就绪。请检查 profile 与额外参数，或查看上面的输出日志。`)
      }, this.readyTimeoutMs),
    }
    this.#run = run
    this.#termination = undefined

    this.transition({
      phase: 'starting',
      pid: child.pid,
      startedAt,
      workspace,
      commandLine: plan.display,
    })
    this.emitLog('system', `启动：${plan.display}\n`)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      this.emitLog('stdout', chunk)
      this.scan(run, 'stdout', chunk)
    })
    child.stderr?.on('data', (chunk: string) => {
      this.emitLog('stderr', chunk)
      this.scan(run, 'stderr', chunk)
    })
    child.once('error', (error) => {
      this.fail(run, humanizeSpawnError(error, plan))
    })
    child.once('close', (code, signal) => { this.settle(run, code, signal) })

    return await this.waitForTerminal()
  }

  /**
   * Stop the child tree and resolve with the resulting status.
   *
   * Escalation: graceful request → `STOP_GRACE_MS` → forceful tree kill. On
   * Windows console trees the graceful request is reported as unsupported
   * immediately, so the force kill happens without an idle 8-second wait.
   */
  async stop(): Promise<LaunchStatus> {
    const run = this.#run
    if (run === undefined) return this.getStatus()
    run.stopRequested = true
    this.clearRunTimers(run)
    this.emitLog('system', '正在停止 dsh…\n')
    await this.terminate(run)
    return this.getStatus()
  }

  /** Readiness timeout in ms (instance override or the exported default). */
  private get readyTimeoutMs(): number {
    return this.#options.readyTimeoutMs ?? READY_TIMEOUT_MS
  }

  private get stopGraceMs(): number {
    return this.#options.stopGraceMs ?? STOP_GRACE_MS
  }

  /** Settle an error that happened before any child existed. */
  private immediateFailure(message: string, workspace?: WorkspaceEntry): LaunchStatus {
    this.transition({
      phase: 'failed',
      error: message,
      exitedAt: Date.now(),
      workspace,
    })
    this.emitLog('system', `启动失败：${message}\n`)
    return this.getStatus()
  }

  /** Resolve as soon as a terminal phase is observed. */
  private async waitForTerminal(): Promise<LaunchStatus> {
    if (TERMINAL_PHASES.has(this.#status.phase)) return this.getStatus()
    return await new Promise<LaunchStatus>((resolve) => {
      const onStatus = (status: LaunchStatus): void => {
        if (!TERMINAL_PHASES.has(status.phase)) return
        this.off('status', onStatus)
        resolve({ ...status })
      }
      this.on('status', onStatus)
      // A transition may have landed between spawn and subscribe.
      if (TERMINAL_PHASES.has(this.#status.phase)) {
        this.off('status', onStatus)
        resolve(this.getStatus())
      }
    })
  }

  /** Split arbitrary chunk boundaries into lines and look for the ready URL. */
  private scan(run: LaunchRun, stream: 'stdout' | 'stderr', chunk: string): void {
    if (run.closed || run.aborted || run.ready) return
    if (stream === 'stdout') {
      run.stdoutBuffer = (run.stdoutBuffer + chunk).slice(-65_536)
    } else {
      run.stderrBuffer = (run.stderrBuffer + chunk).slice(-65_536)
      run.stderrTail = (run.stderrTail + stripAnsi(chunk)).slice(-1_024)
    }
    if (this.#status.phase !== 'starting') return
    if (this.findReadyMatch(run) === undefined) return
    // Debounce: a chunk boundary may have cut the line; let the rest arrive.
    if (run.readySettleTimer === undefined) {
      run.readySettleTimer = setTimeout(() => { this.commitReady(run) }, READY_SETTLE_MS)
    }
  }

  /** Look for the ready URL in either stream, preferring stdout. */
  private findReadyMatch(run: LaunchRun): string | undefined {
    const stdout = stripAnsi(run.stdoutBuffer).replace(/\r/g, '')
    const stderr = stripAnsi(run.stderrBuffer).replace(/\r/g, '')
    const match = READY_LINE.exec(stdout) ?? READY_URL_FALLBACK.exec(stdout) ?? READY_LINE.exec(stderr) ?? READY_URL_FALLBACK.exec(stderr)
    return match?.[1]
  }

  /** Commit a debounced ready match, re-reading the buffers for the full URL. */
  private commitReady(run: LaunchRun): void {
    run.readySettleTimer = undefined
    if (run.closed || run.aborted || run.ready) return
    if (this.#status.phase !== 'starting') return
    const candidate = this.findReadyMatch(run)
    if (candidate === undefined) return
    const url = parseReadyUrl(candidate)
    if (url === undefined) return
    this.markReady(run, url)
  }

  /** Switch to `ready` exactly once and hand the URL over. */
  private markReady(run: LaunchRun, url: string): void {
    if (run.ready || run.closed || run.aborted) return
    run.ready = true
    this.clearRunTimers(run)
    this.transition({
      phase: 'ready',
      url,
      pid: run.child.pid,
      startedAt: run.startedAt,
      workspace: run.workspace,
      commandLine: run.plan.display,
    })
    this.emitLog('system', `就绪：${url}\n`)
  }

  /** Mark the launch as failed and kill the child tree. */
  private fail(run: LaunchRun, message: string): void {
    if (run.aborted || run.closed) return
    run.aborted = true
    this.clearRunTimers(run)
    this.transition({
      phase: 'failed',
      error: message,
      pid: run.child.pid,
      startedAt: run.startedAt,
      workspace: run.workspace,
      commandLine: run.plan.display,
    })
    this.emitLog('system', `启动失败：${message}\n`)
    void this.terminate(run)
  }

  /** Handle the child's `close` event: finalize phase plus exit details. */
  private settle(run: LaunchRun, code: number | null, signal: NodeJS.Signals | null): void {
    if (run.closed) return
    run.closed = true
    this.clearRunTimers(run)
    if (this.#run === run) this.#run = undefined
    this.#termination = undefined

    let phase: LaunchPhase
    let error: string | undefined
    if (run.aborted) {
      phase = 'failed'
      error = this.#status.error ?? '启动失败，子进程已退出。'
    } else if (run.stopRequested) {
      phase = 'stopped'
    } else if (run.ready) {
      // Exiting on its own after readiness: clean exit is a normal stop,
      // a crash is a failure the UI must show.
      if (code === 0) {
        phase = 'stopped'
      } else {
        phase = 'failed'
        error = exitErrorMessage(code, signal, run.stderrTail, true)
      }
    } else {
      phase = 'failed'
      error = exitErrorMessage(code, signal, run.stderrTail, false)
    }

    this.transition({
      phase,
      url: run.ready ? this.#status.url : undefined,
      pid: run.child.pid ?? this.#status.pid,
      startedAt: run.startedAt,
      exitedAt: Date.now(),
      exitCode: code,
      signal,
      workspace: run.workspace,
      commandLine: run.plan.display,
      ...(error === undefined ? {} : { error }),
    })
    this.emitLog('system', `dsh 已退出（退出码 ${String(code)}${signal === null ? '' : `，信号 ${String(signal)}`}）\n`)
  }

  /** Idempotent shutdown driver: one sequence per run. */
  private terminate(run: LaunchRun): Promise<void> {
    const current = this.#termination
    if (current !== undefined && current.run === run) return current.promise
    const promise = this.shutdown(run)
    this.#termination = { run, promise }
    return promise
  }

  /** Graceful → grace window → forceful, with a manual finalize fallback. */
  private async shutdown(run: LaunchRun): Promise<void> {
    if (run.closed) return
    const graceful = await requestGracefulStop(run.child, this.#platform)
    if (graceful === 'noop') return this.settleLostExit(run)
    if (graceful === 'accepted' && await this.waitClosed(run, this.stopGraceMs)) return
    await requestForcedStop(run.child, this.#platform)
    if (await this.waitClosed(run, FORCE_SETTLE_MS)) return
    // The exit event never arrived; take over so the state machine cannot stick.
    this.settleLostExit(run)
  }

  /** Poll for the close event so a lost exit event cannot wedge the engine. */
  private async waitClosed(run: LaunchRun, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (!run.closed && Date.now() < deadline) await delay(50)
    return run.closed
  }

  /** Finalize a run whose `close` event never arrived (rare, but must not wedge). */
  private settleLostExit(run: LaunchRun): void {
    if (run.closed) return
    run.closed = true
    this.clearRunTimers(run)
    if (this.#run === run) this.#run = undefined
    this.#termination = undefined
    // Preserve the phase the launch already reported: a failed run stays failed,
    // a user-requested stop stays stopped. Nothing is forced into `ready`.
    let phase: LaunchPhase
    let error: string | undefined
    if (run.aborted || (run.ready && !run.stopRequested)) {
      phase = 'failed'
      error = this.#status.error ?? '未能确认 dsh 子进程退出，已按强制结束处理。'
    } else {
      phase = 'stopped'
    }
    this.transition({
      phase,
      url: run.ready ? this.#status.url : undefined,
      pid: run.child.pid ?? this.#status.pid,
      startedAt: run.startedAt,
      exitedAt: Date.now(),
      exitCode: run.child.exitCode ?? null,
      signal: run.child.signalCode ?? null,
      workspace: run.workspace,
      commandLine: run.plan.display,
      ...(error === undefined ? {} : { error }),
    })
    this.emitLog('system', '未能确认 dsh 正常退出，已按强制结束处理。\n')
  }

  /** Cancel both timers owned by a run. */
  private clearRunTimers(run: LaunchRun): void {
    clearTimeout(run.readyTimer)
    if (run.readySettleTimer !== undefined) {
      clearTimeout(run.readySettleTimer)
      run.readySettleTimer = undefined
    }
  }

  private transition(next: LaunchStatus): void {
    this.#status = next
    this.emit('status', { ...next })
  }

  private emitLog(stream: 'stdout' | 'stderr' | 'system', data: string): void {
    this.emit('log', { stream, data, at: Date.now() })
  }
}
