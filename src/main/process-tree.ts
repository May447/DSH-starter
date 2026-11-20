/**
 * Tree-aware child termination.
 *
 * `dsh` on Windows is usually a `.cmd` shim (`cmd.exe /c node ...\bin.js`), so
 * the process we spawned is not the process doing the work. `child.kill()`
 * only calls `TerminateProcess` on the *direct* child, which is exactly how
 * orphaned `node bin.js web` processes appear.
 *
 * Two mechanisms are used together, because each one alone has a hole:
 *  - `taskkill /PID <pid> /T /F` walks the tree while the parent links exist;
 *  - a descendant snapshot taken *before* the kill still finds the real worker
 *    even if Windows reparents it partway through, because `ParentProcessId`
 *    keeps the original creator pid.
 *
 * There is no SIGTERM equivalent for console processes on Windows, so no
 * graceful attempt is made there: the whole tree is killed in one forced pass.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

/** How a graceful stop request was received. */
export type GracefulStopResult =
  /** The signal was delivered (POSIX) or accepted by taskkill (Windows GUI). */
  | 'accepted'
  /** Windows console process: only a forced kill can stop it. */
  | 'unsupported'
  /** The process is already gone. */
  | 'noop'

/** Wait helper shared by the shutdown sequence. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, Math.max(0, ms)) })
}

function systemTaskkill(): string {
  const root = process.env['SystemRoot'] ?? process.env['windir'] ?? 'C:\\Windows'
  return join(root, 'System32', 'taskkill.exe')
}

function systemPowerShell(): string {
  const root = process.env['SystemRoot'] ?? process.env['windir'] ?? 'C:\\Windows'
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** Run `taskkill`, resolving to its exit status (`null` when it could not run). */
function taskkill(pid: number, force: boolean): Promise<number | null> {
  const args = ['/PID', String(pid), '/T']
  if (force) args.push('/F')
  return new Promise((resolve) => {
    let killer: ChildProcess
    try {
      killer = spawn(systemTaskkill(), args, { stdio: 'ignore', windowsHide: true })
    } catch {
      resolve(null)
      return
    }
    killer.once('error', () => { resolve(null) })
    killer.once('close', (status) => { resolve(status) })
  })
}

/**
 * Collect every descendant pid of `root` (Windows only).
 *
 * `ParentProcessId` records the creator pid and survives its death, so this
 * snapshot still identifies the worker after Windows reparents it.
 */
function descendantPids(root: number): Promise<number[]> {
  const script = [
    '$ids = New-Object System.Collections.Generic.List[int];',
    `$front = @(${String(root)});`,
    'while ($front.Count -gt 0) {',
    '  $next = @();',
    '  foreach ($p in $front) {',
    '    $next += @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$p" -ErrorAction SilentlyContinue | ForEach-Object { $_.ProcessId })',
    '  }',
    '  foreach ($n in $next) { [void]$ids.Add([int]$n) }',
    '  $front = $next',
    '}',
    '$ids -join ","',
  ].join(' ')

  return new Promise((resolve) => {
    let collector: ChildProcess
    try {
      collector = spawn(systemPowerShell(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      })
    } catch {
      resolve([])
      return
    }
    let output = ''
    collector.stdout?.setEncoding('utf8')
    collector.stdout?.on('data', (chunk: string) => { output += chunk })
    collector.once('error', () => { resolve([]) })
    collector.once('close', () => {
      resolve(
        output
          .split(',')
          .map((value) => Number.parseInt(value.trim(), 10))
          .filter((value) => Number.isSafeInteger(value) && value > 0),
      )
    })
  })
}

/**
 * Ask the child tree to stop as gracefully as the platform allows.
 *
 * @param child - Direct child previously returned by `spawn`.
 * @param platform - Defaults to the real platform.
 */
export async function requestGracefulStop(
  child: ChildProcess,
  platform: NodeJS.Platform = process.platform,
): Promise<GracefulStopResult> {
  if (child.exitCode !== null || child.signalCode !== null) return 'noop'
  const pid = child.pid
  if (platform === 'win32') {
    if (pid === undefined) return 'noop'
    return 'unsupported'
  }
  try {
    return child.kill('SIGTERM') ? 'accepted' : 'noop'
  } catch {
    return 'noop'
  }
}

/**
 * Forcefully terminate the whole child tree (SIGKILL equivalent).
 *
 * @param child - Direct child previously returned by `spawn`.
 * @param platform - Defaults to the real platform.
 */
export async function requestForcedStop(
  child: ChildProcess,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const pid = child.pid
  const descendants = platform === 'win32' && pid !== undefined ? await descendantPids(pid) : []

  if (platform === 'win32' && pid !== undefined) {
    await taskkill(pid, true)
  }
  try {
    child.kill('SIGKILL')
  } catch {
    // The process is already gone; nothing to do.
  }

  // Belt and braces: terminate any descendant the tree walk missed. This is
  // what leaves `node bin.js web` behind when Windows reparents it mid-kill.
  for (const descendant of descendants) {
    if (descendant === pid) continue
    try {
      process.kill(descendant, 'SIGKILL')
    } catch {
      // Already exited.
    }
  }
}
