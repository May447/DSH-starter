/**
 * Turns the user-configured `dshCommand` into a spawn plan that works on every
 * machine.
 *
 * `dshCommand` may be:
 *  - an absolute (or relative-to-launcher) path to `.exe` / `.cmd` / `.bat` / `.ps1`,
 *  - a bare command name resolved on `PATH` (`.COM/.EXE/.BAT/.CMD` on Windows).
 *
 * Windows quirks handled here:
 *  - `.cmd`/`.bat` cannot be executed by `CreateProcess`; they must go through
 *    `cmd.exe /d /s /c "<command line>"`. Node's own `shell: true` simply
 *    space-joins arguments, which breaks on spaces/quotes/`&`/`%`, so the
 *    command line is built and escaped here instead (see `quoteCmdArgument`,
 *    an implementation of the qntm.org/cmd algorithm).
 *  - `.ps1` goes through `powershell.exe -File`.
 *  - `PATH` lookups are done here (not in cmd.exe) so we control the error
 *    message and never depend on a shell for plain `.exe` launches.
 *
 * This module is pure apart from filesystem probes, so it can be unit-tested
 * without Electron (`node .dev/engine-test` compiles it with tsc).
 */

import { existsSync, statSync } from 'node:fs'
import { extname, isAbsolute, join, resolve } from 'node:path'

/** How the final executable is launched. */
export type SpawnKind =
  /** `spawn(<file>, [...args])` — Node does the Windows argv quoting. */
  | 'direct'
  /** `cmd.exe /d /s /c "<escaped command line>"` — needed for `.cmd`/`.bat`. */
  | 'cmd'
  /** `powershell.exe -File <script> [...args]` — for `.ps1` entry points. */
  | 'powershell'

/** A fully resolved launch: what to execute, with which arguments, and how. */
export interface SpawnPlan {
  /** Executable handed to `spawn`. */
  file: string
  /** Argument vector (`windowsVerbatimArguments` is true for the `cmd` kind). */
  args: string[]
  windowsVerbatimArguments: boolean
  kind: SpawnKind
  /** Human-readable command line for logs and status; never executed. */
  display: string
  /** Absolute path the configured command resolved to (when it has one). */
  resolvedPath?: string | undefined
}

/** Resolution result: either a plan, or a human-readable explanation. */
export type CommandResolution = { ok: true; plan: SpawnPlan } | { ok: false; error: string }

/** Inputs for {@link resolveCommand}; all overridable for tests. */
export interface ResolveOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  /** Directory used to resolve relative command paths. */
  cwd?: string
}

/** Extensions CreateProcess can run directly, in `PATHEXT` precedence order. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

/**
 * Characters `cmd.exe` treats specially on a command line (qntm.org/cmd).
 * Kept as a global regex: `String.prototype.replace` consumes the lastIndex.
 */
const CMD_METACHARS = /([()\][%!^"`<>&|;, *?])/g

/**
 * Quote one argument so `cmd.exe` hands it through untouched, including the
 * double-escaping a batch wrapper (`dsh.cmd` re-parses its `%*`) needs.
 *
 * @param value - Raw argument text.
 * @param doubleEscape - Escape the metacharacters twice (for `.cmd`/`.bat`).
 */
export function quoteCmdArgument(value: string, doubleEscape = true): string {
  let arg = value
  // Backslashes that precede a quote must be doubled, then the quote escaped.
  arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"')
  // Trailing backslashes must be doubled before the closing quote.
  arg = arg.replace(/(?=(\\+?)?)\1$/, '$1$1')
  arg = `"${arg}"`
  arg = arg.replace(CMD_METACHARS, '^$1')
  if (doubleEscape) arg = arg.replace(CMD_METACHARS, '^$1')
  return arg
}

/** Quote one path for use as the first token of a `cmd.exe` command line. */
export function quoteCmdCommandPath(path: string): string {
  // Windows paths cannot contain `"`, so plain quoting is enough; carets make
  // the remaining metacharacters literal for cmd.exe itself.
  return `"${path.replace(CMD_METACHARS, '^$1')}"`
}

/** Human-readable quoting used for `display` only (never executed). */
function displayQuote(value: string): string {
  if (value === '') return '""'
  return /[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value
}

/** Compose a display command line from a file and its arguments. */
export function formatCommandLine(file: string, args: readonly string[]): string {
  return [file, ...args].map(displayQuote).join(' ')
}

/** Strip one layer of symmetric double quotes a user may have typed around the command. */
function unquoteCommand(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
}

/** File probe that treats permission errors as "missing" instead of throwing. */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function isWindowsPlatform(platform: NodeJS.Platform): boolean {
  return platform === 'win32'
}

/**
 * Merge `settings.env` over the launcher's environment.
 *
 * Windows environment variable names are case-insensitive; without this a
 * settings override of `Path` would sit next to the inherited `PATH` and the
 * child would inherit whichever the loader happens to pick.
 */
export function mergeEnv(
  base: NodeJS.ProcessEnv,
  overrides: Readonly<Record<string, string>>,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...base }
  if (isWindowsPlatform(platform)) {
    const byLower = new Map<string, string>()
    for (const key of Object.keys(merged)) byLower.set(key.toLowerCase(), key)
    for (const [key, value] of Object.entries(overrides)) {
      if (typeof value !== 'string') continue
      const previous = byLower.get(key.toLowerCase())
      if (previous !== undefined && previous !== key) delete merged[previous]
      merged[key] = value
      byLower.set(key.toLowerCase(), key)
    }
    return merged
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value !== 'string') continue
    merged[key] = value
  }
  return merged
}

/** Read `PATH` / `PATHEXT` from an environment regardless of the key's case. */
function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const direct = env[name]
  if (direct !== undefined) return direct
  const lower = name.toLowerCase()
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === lower)
  return key === undefined ? undefined : env[key]
}

function windowsExtensions(env: NodeJS.ProcessEnv): string[] {
  const raw = envValue(env, 'PATHEXT') ?? DEFAULT_PATHEXT
  const extensions = raw.split(';').map((entry) => entry.trim()).filter((entry) => entry !== '')
  return extensions.length === 0 ? DEFAULT_PATHEXT.split(';') : extensions
}

/** Search `PATH` for a Windows executable, honouring `PATHEXT` order per directory. */
function findOnWindowsPath(command: string, env: NodeJS.ProcessEnv): string | undefined {
  const pathValue = envValue(env, 'PATH')
  if (pathValue === undefined) return undefined
  const directories = pathValue.split(';').map((entry) => entry.trim()).filter((entry) => entry !== '')
  const extensions = extname(command) === '' ? windowsExtensions(env) : ['']
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`)
      if (isFile(candidate)) return candidate
    }
  }
  return undefined
}

/** Resolve a command that contains a path separator or a drive root. */
function findWindowsFile(target: string, env: NodeJS.ProcessEnv): string | undefined {
  if (isFile(target)) return target
  for (const extension of windowsExtensions(env)) {
    if (isFile(`${target}${extension}`)) return `${target}${extension}`
  }
  return undefined
}

function windowsSystemFile(env: NodeJS.ProcessEnv, relative: string, fallbackName: string): string | undefined {
  const root = envValue(env, 'SystemRoot') ?? envValue(env, 'windir')
  if (root !== undefined) {
    const candidate = join(root, relative)
    if (isFile(candidate)) return candidate
  }
  return findOnWindowsPath(fallbackName, env)
}

function windowsPlan(executable: string, args: readonly string[], env: NodeJS.ProcessEnv): CommandResolution {
  const ext = extname(executable).toLowerCase()
  if (ext === '.cmd' || ext === '.bat') return cmdPlan(executable, args, env)
  if (ext === '.ps1') return powershellPlan(executable, args, env)
  return {
    ok: true,
    plan: {
      file: executable,
      args: [...args],
      windowsVerbatimArguments: false,
      kind: 'direct',
      display: formatCommandLine(executable, args),
      resolvedPath: executable,
    },
  }
}

/** `.cmd`/`.bat`: run through `cmd.exe /d /s /c` with the command line escaped here. */
function cmdPlan(executable: string, args: readonly string[], env: NodeJS.ProcessEnv): CommandResolution {
  const comspec = windowsSystemFile(env, join('System32', 'cmd.exe'), 'cmd.exe')
  if (comspec === undefined) {
    return { ok: false, error: '找不到 cmd.exe：Windows 的 ComSpec/System32 不可用，无法运行 dsh 的 .cmd/.bat 入口。' }
  }
  const commandLine = [quoteCmdCommandPath(executable), ...args.map((arg) => quoteCmdArgument(arg, true))].join(' ')
  return {
    ok: true,
    plan: {
      file: comspec,
      args: ['/d', '/s', '/c', `"${commandLine}"`],
      windowsVerbatimArguments: true,
      kind: 'cmd',
      display: `${formatCommandLine(comspec, ['/d', '/s', '/c'])} ${commandLine}`,
      resolvedPath: executable,
    },
  }
}

/** `.ps1`: run through Windows PowerShell (or `pwsh` when that is what exists). */
function powershellPlan(script: string, args: readonly string[], env: NodeJS.ProcessEnv): CommandResolution {
  const powershell =
    windowsSystemFile(env, join('System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), 'pwsh.exe') ??
    findOnWindowsPath('powershell.exe', env)
  if (powershell === undefined) {
    return { ok: false, error: `找不到 powershell.exe，无法运行 .ps1 入口：${script}` }
  }
  const scriptArgs = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args]
  return {
    ok: true,
    plan: {
      file: powershell,
      args: scriptArgs,
      windowsVerbatimArguments: false,
      kind: 'powershell',
      display: formatCommandLine(powershell, scriptArgs),
      resolvedPath: script,
    },
  }
}

function resolveWindows(command: string, args: readonly string[], env: NodeJS.ProcessEnv, cwd: string): CommandResolution {
  const hasSeparator = /[\\/]/.test(command)
  const executable = hasSeparator
    ? findWindowsFile(isAbsolute(command) ? command : resolve(cwd, command), env)
    : findOnWindowsPath(command, env)
  if (executable === undefined) {
    const hint = hasSeparator
      ? `找不到 dsh 命令文件：${command}`
      : `PATH 上找不到命令行「${command}」（查找了 PATH 中的 .COM/.EXE/.BAT/.CMD）`
    return {
      ok: false,
      error: `${hint}。请在设置里填写 dsh 的绝对路径，或确认它已安装。`,
    }
  }
  return windowsPlan(executable, args, env)
}

/** POSIX: everything is spawn-able directly; bare names resolve through `PATH`. */
function resolveUnix(command: string, args: readonly string[], env: NodeJS.ProcessEnv, cwd: string): CommandResolution {
  if (command.includes('/')) {
    const target = isAbsolute(command) ? command : resolve(cwd, command)
    if (!existsSync(target) || !isFile(target)) {
      return { ok: false, error: `找不到 dsh 命令文件：${target}。请在设置里填写 dsh 的绝对路径，或确认它已安装。` }
    }
    return {
      ok: true,
      plan: {
        file: target,
        args: [...args],
        windowsVerbatimArguments: false,
        kind: 'direct',
        display: formatCommandLine(target, args),
        resolvedPath: target,
      },
    }
  }
  const pathValue = envValue(env, 'PATH') ?? ''
  for (const directory of pathValue.split(':')) {
    const candidate = join(directory === '' ? '.' : directory, command)
    if (isFile(candidate)) {
      return {
        ok: true,
        plan: {
          file: candidate,
          args: [...args],
          windowsVerbatimArguments: false,
          kind: 'direct',
          display: formatCommandLine(candidate, args),
          resolvedPath: candidate,
        },
      }
    }
  }
  return { ok: false, error: `PATH 上找不到命令行「${command}」。请在设置里填写 dsh 的绝对路径，或确认它已安装。` }
}

/**
 * Resolve the configured command plus its arguments into a {@link SpawnPlan}.
 *
 * Argument order is the caller's business; the engine appends
 * `--no-open --port <N>` after the user's extra arguments.
 */
export function resolveCommand(
  command: string,
  args: readonly string[],
  options: ResolveOptions = {},
): CommandResolution {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const raw = unquoteCommand(command.trim())
  if (raw === '') {
    return { ok: false, error: 'dsh 命令为空：请填写 dsh 的绝对路径，或 PATH 上的命令名。' }
  }
  if (raw.includes('\0')) {
    return { ok: false, error: 'dsh 命令包含非法字符（NUL）。' }
  }
  const invalidArg = args.find((arg) => arg.includes('\0') || arg.includes('\n') || arg.includes('\r'))
  if (invalidArg !== undefined) {
    return { ok: false, error: '参数中包含换行或 NUL 字符，无法安全传递给子进程。' }
  }
  if (/\s/.test(raw) && !/[\\/]/.test(raw) && extname(raw) === '') {
    return {
      ok: false,
      error: `dsh 命令「${raw}」包含空格，看起来像把参数写进了命令里。命令请只填可执行文件本身，参数填到“额外参数”里。`,
    }
  }
  return isWindowsPlatform(platform) ? resolveWindows(raw, args, env, cwd) : resolveUnix(raw, args, env, cwd)
}
