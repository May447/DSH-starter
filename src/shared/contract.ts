/**
 * The IPC contract shared by the Electron main process, the preload bridge,
 * and the renderer.
 *
 * This file is the single source of truth: the preload implements
 * {@link LauncherBridge}, the renderer consumes `window.dshStarter`, and the
 * main process answers the same channels. Change it in one place only.
 */

/** Bumped whenever a bridge shape changes incompatibly. */
export const CONTRACT_VERSION = 6

/**
 * User-rewritable strings and display switches.
 *
 * The launcher is meant to be re-skinned into someone's own front door, so the
 * words on the main screen are data, not constants. An empty string means "use
 * the shipped wording" — that keeps upgrades from silently reintroducing a
 * sentence the user deleted.
 */
export interface LauncherCopy {
  /** Product name in the title bar. */
  appName: string
  /** Overrides the big headline; empty = the selected workspace's name. */
  title: string
  /** Small uppercase line above the workspace title; empty hides it. */
  kicker: string
  /** Sentence under the title once the Web UI is ready; empty = built-in copy. */
  readyNote: string
  /** Show the workspace path under the title. */
  showPath: boolean
}

/** The four colours the user owns. Only the launch button and settings use them. */
export interface LauncherTheme {
  /** Preset id the slots came from; `custom` once the user edits a slot. */
  preset: string
  /** Backdrop accent for the settings panel. */
  background: string
  /** Cards, rails and panels inside the settings panel. */
  surface: string
  /** The one action colour (launch button, active state). */
  primary: string
  /** Secondary pop (links, ready state, success). */
  accent: string
}

/**
 * Window shape. The launcher sizes itself from the primary work area and these
 * two numbers, so the same build reads correctly on a 13" laptop and a 4K
 * monitor instead of hard-coding one rectangle.
 */
export interface LauncherWindow {
  /** Aspect ratio preset id: `16:9` | `16:10` | `21:9` | `2:1`. */
  ratio: string
  /** Fraction of the work area width to occupy, 0.5…1. */
  widthFactor: number
}

/** The full-screen launcher backdrop. */
export interface LauncherBackground {
  /** Built-in gradient id (see the renderer's background presets). */
  preset: string
  /** Absolute path of a user-picked image (Stage 2); null = preset gradient. */
  imagePath: string | null
  /** Scrim darkness over the backdrop, 0…1, so text stays readable. */
  dim: number
  /** Backdrop blur in px, 0…24. */
  blur: number
}

/** How a launch is progressing, from the launcher's point of view. */
export type LaunchPhase =
  /** Nothing is running. */
  | 'idle'
  /** The child was spawned; waiting for `dsh` to print its ready line. */
  | 'starting'
  /** `dsh web` printed its URL; the Web UI can be handed over. */
  | 'ready'
  /** The child exited (on its own, or because the user asked to stop it). */
  | 'stopped'
  /** Spawn error, early crash, or a non-zero exit before readiness. */
  | 'failed'

/** One card on the launcher screen: a directory `dsh` can be started in. */
export interface WorkspaceEntry {
  /** Stable id used for React keys and settings updates. */
  id: string
  /** Display name; defaults to the directory's base name. */
  name: string
  /** Absolute directory handed to `dsh` as its working directory. */
  path: string
}

/** Persisted launcher preferences (one JSON file in Electron's `userData`). */
export interface LauncherSettings {
  /** `dsh` executable: an absolute path, or a bare name resolved on `PATH`. */
  dshCommand: string
  /** Profile booted as `dsh <profile>`; `web` is the one the launcher can hand over. */
  profile: string
  /** Extra CLI arguments inserted before the launcher's own `--no-open --port` arguments. */
  extraArgs: string[]
  /** Environment overrides for the child; `DSH_HOME` belongs here. */
  env: Record<string, string>
  /** Workspace cards, most recently used first. */
  workspaces: WorkspaceEntry[]
  /** Port handed to `dsh web`; `0` lets the OS pick a free one. */
  port: number
  /** What to do with the printed URL once the child reports ready. */
  openOnReady: 'none' | 'external'
  /** xterm font size, in px, for the launch-log terminal. */
  terminalFontSize: number
  /** Four-slot colour theme; only the launch button and settings use it. */
  theme: LauncherTheme
  /** Full-screen backdrop behind the whole launcher. */
  background: LauncherBackground
  /** Rewritable main-screen strings and display switches. */
  copy: LauncherCopy
  /** Window proportion; applied on launch and whenever it changes. */
  window: LauncherWindow
}

/** Current launch state, mirrored into the renderer on every transition. */
export interface LaunchStatus {
  phase: LaunchPhase
  /** Web UI URL parsed from the ready line, once known. */
  url?: string | undefined
  /** Child pid while it lives. */
  pid?: number | undefined
  /** Wall-clock ms when the child was spawned. */
  startedAt?: number | undefined
  /** Wall-clock ms when the child exited. */
  exitedAt?: number | undefined
  exitCode?: number | null | undefined
  signal?: string | null | undefined
  /** Human-readable failure summary (spawn error, early exit, readiness timeout). */
  error?: string | undefined
  /** Workspace this launch used, for the header. */
  workspace?: WorkspaceEntry | undefined
  /**
   * Command line the engine actually spawned, for the log header and bug
   * reports. Display only: it is never executed. Added in field-compatible
   * fashion (renderers may ignore it).
   */
  commandLine?: string | undefined
}

/** One chunk of child output, already decoded to text. */
export interface LogChunk {
  stream: 'stdout' | 'stderr' | 'system'
  data: string
  /** Wall-clock ms when the chunk was observed. */
  at: number
}

/** Options for {@link LauncherBridge.start}. */
export interface StartOptions {
  /** Workspace to launch; falls back to the most recently used one. */
  workspaceId?: string | undefined
}

/** The bridge exposed on `window.dshStarter` by the preload script. */
export interface LauncherBridge {
  version: typeof CONTRACT_VERSION
  getSettings(): Promise<LauncherSettings>
  saveSettings(next: LauncherSettings): Promise<LauncherSettings>
  /** Show the OS directory picker and append the chosen directory as a card. */
  pickWorkspace(): Promise<WorkspaceEntry | null>
  start(options?: StartOptions): Promise<LaunchStatus>
  stop(): Promise<LaunchStatus>
  getStatus(): Promise<LaunchStatus>
  /** Hand the ready URL to the OS browser. */
  openUi(url: string): Promise<void>
  /** Show the OS image picker; returns the chosen absolute path or null. */
  pickBackgroundImage(): Promise<string | null>
  /**
   * Read a local image for display. The stored path is never rewritten; the
   * main process returns a size-capped JPEG data URL so the renderer can show it
   * on both `file:` and `http:` origins.
   */
  loadBackgroundImage(path: string): Promise<string | null>
  /** Resolve the absolute path of a dropped file (drag & drop support). */
  pathForFile(file: File): string
  /**
   * Copy text through the main process. The renderer's Clipboard API needs a
   * secure context and a user gesture; a packaged app loads from `file://`, so
   * the main process is the only path that always works.
   */
  writeClipboard(text: string): Promise<void>
  /** Subscribe to child output; the returned function unsubscribes. */
  onLog(listener: (chunk: LogChunk) => void): () => void
  /** Subscribe to launch-status transitions; the returned function unsubscribes. */
  onStatus(listener: (status: LaunchStatus) => void): () => void
  /**
   * M3 only: interactive terminal for the running launch. Absent at runtime
   * until M3 ships (see the M3 design block below); feature-detect it.
   */
  terminal?: TerminalBridge | undefined
}

/* ---------------------------------------------------------------------------
 * M3 terminal — DESIGN ONLY, nothing in this block is implemented yet.
 *
 * M3 turns the read-only launch log into an interactive terminal once `dsh`
 * is ready. Two candidate implementations, with the trade-offs we know today:
 *
 * 1. Local pty via `node-pty`: a real shell running in the selected workspace,
 *    rendered by the existing `@xterm/xterm` panel. Highest fidelity (real TTY,
 *    Ctrl-C/SIGINT, resize, progress bars), but it is a native module that must
 *    be built for Electron's ABI (`electron-rebuild`, prebuilt binaries) and
 *    needs VS Build Tools + Python on Windows CI. That is a new packaging
 *    dependency on every platform.
 * 2. Reuse DSH's own terminal-controller API (`packages/api/terminal-controller`
 *    in the harness checkout): commands then run inside the running DSH session
 *    over the HTTP/WS endpoint behind the ready URL. No native code and no
 *    rebuild, but the protocol must be pinned and the semantics are "terminal
 *    of the DSH session", not "shell in the launcher window".
 *
 * Recommendation for M3: start with option 2 (zero native build risk) if its
 * protocol is stable enough; keep option 1 as the fallback if true TTY
 * behaviour is required. The IPC shape below is identical for both, so the
 * renderer never has to care which one wins.
 *
 * The bridge member `LauncherBridge.terminal` is optional because it is absent
 * until M3; preload/main are not wired to these channels yet.
 * ------------------------------------------------------------------------- */

/** M3: one keystroke/paste payload sent to the terminal (design only). */
export interface TerminalWritePayload {
  /** Raw text (may be a single key, a paste, or `\r` for Enter). */
  data: string
}

/** M3: rendered terminal grid size after an xterm `fit` (design only). */
export interface TerminalResizePayload {
  cols: number
  rows: number
}

/** M3: interactive terminal surface exposed on the bridge (design only). */
export interface TerminalBridge {
  /** Send raw keystrokes/paste to the terminal. */
  write(data: string): Promise<void>
  /** Report the rendered grid size so the backend can resize its pty. */
  resize(cols: number, rows: number): Promise<void>
  /** Subscribe to terminal output chunks; the returned function unsubscribes. */
  onOutput(listener: (data: string) => void): () => void
}

/** M3 IPC channel names (design only; same conventions as {@link CHANNELS}). */
export const TERMINAL_CHANNELS = {
  write: 'terminal:write',
  resize: 'terminal:resize',
  outputEvent: 'terminal:output',
} as const

/** IPC channel names, kept together so main and preload cannot drift. */
export const CHANNELS = {
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  workspacePick: 'workspace:pick',
  launchStart: 'launch:start',
  launchStop: 'launch:stop',
  launchStatus: 'launch:status',
  uiOpen: 'ui:open',
  backgroundPick: 'background:pick',
  backgroundLoad: 'background:load',
  clipboardWrite: 'clipboard:write',
  logEvent: 'launch:log',
  statusEvent: 'launch:status-event',
} as const
