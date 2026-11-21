import type { LauncherBackground, LauncherCopy, LauncherSettings, LauncherTheme, LauncherWindow } from '@shared/contract'

/** Shipped theme: only the launch button and the settings panel read these. */
export const DEFAULT_THEME: LauncherTheme = {
  preset: 'midnight',
  background: '#0b0f1a',
  surface: '#151c2c',
  primary: '#5b8cff',
  accent: '#8f6bff',
}

/** Shipped backdrop: the built-in "aurora" gradient, lightly dimmed. */
export const DEFAULT_BACKGROUND: LauncherBackground = {
  preset: 'aurora',
  imagePath: null,
  dim: 0.35,
  blur: 0,
}

/** Shipped wording; every field is editable from Settings → 文案. */
export const DEFAULT_COPY: LauncherCopy = {
  appName: 'DSH-starter',
  title: '',
  kicker: 'DEEPSEEK HARNESS',
  readyNote: '',
  showPath: true,
}

/** Shipped window shape: 16:9 at 80% of the work area (1366x768 on a 1707px screen). */
export const DEFAULT_WINDOW: LauncherWindow = {
  ratio: '16:9',
  widthFactor: 0.8,
}

/** Longest accepted value per copy field, so a pasted essay cannot break layout. */
const COPY_LIMITS = { appName: 40, title: 60, kicker: 48, readyNote: 120 } as const

/** Shipped defaults; every field is overridable from settings.json or the UI. */
export const DEFAULT_SETTINGS: LauncherSettings = {
  dshCommand: 'dsh',
  profile: 'web',
  extraArgs: [],
  env: {},
  workspaces: [],
  port: 0,
  /**
   * Hand off to the OS browser by default: the launcher is a front door, not
   * a file manager, and the user's own browser already has their logins.
   */
  openOnReady: 'external',
  terminalFontSize: 13,
  theme: { ...DEFAULT_THEME },
  background: { ...DEFAULT_BACKGROUND },
  copy: { ...DEFAULT_COPY },
  window: { ...DEFAULT_WINDOW },
}

/** Normalize user input to `#rrggbb`, or return undefined when it is not a colour. */
function hexOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  const short = /^#([0-9a-f]{3})$/.exec(trimmed)
  if (short?.[1] !== undefined) {
    const [r, g, b] = short[1]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : undefined
}

/** Merge persisted JSON over the shipped defaults, dropping unknown/broken fields. */
export function normalizeSettings(raw: unknown): LauncherSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS, theme: { ...DEFAULT_THEME } }
  const input = raw as Record<string, unknown>
  const merged: LauncherSettings = { ...DEFAULT_SETTINGS, theme: { ...DEFAULT_THEME } }
  if (typeof input.dshCommand === 'string' && input.dshCommand.trim() !== '') merged.dshCommand = input.dshCommand.trim()
  if (typeof input.profile === 'string' && input.profile.trim() !== '') merged.profile = input.profile.trim()
  if (Number.isInteger(input.port) && (input.port as number) >= 0 && (input.port as number) <= 65535) merged.port = input.port as number
  // `window` was removed when the embedded Web UI window was dropped.
  if (input.openOnReady === 'none' || input.openOnReady === 'external') merged.openOnReady = input.openOnReady
  if (typeof input.terminalFontSize === 'number' && input.terminalFontSize >= 9 && input.terminalFontSize <= 24) merged.terminalFontSize = input.terminalFontSize
  if (Array.isArray(input.extraArgs)) merged.extraArgs = input.extraArgs.filter((arg): arg is string => typeof arg === 'string')
  if (typeof input.env === 'object' && input.env !== null && !Array.isArray(input.env)) {
    merged.env = Object.fromEntries(
      Object.entries(input.env as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  }
  if (typeof input.theme === 'object' && input.theme !== null && !Array.isArray(input.theme)) {
    const theme = input.theme as Record<string, unknown>
    merged.theme = {
      preset: typeof theme.preset === 'string' && theme.preset !== '' ? theme.preset : DEFAULT_THEME.preset,
      background: hexOf(theme.background) ?? DEFAULT_THEME.background,
      surface: hexOf(theme.surface) ?? DEFAULT_THEME.surface,
      primary: hexOf(theme.primary) ?? DEFAULT_THEME.primary,
      accent: hexOf(theme.accent) ?? DEFAULT_THEME.accent,
    }
  }
  if (typeof input.background === 'object' && input.background !== null && !Array.isArray(input.background)) {
    const background = input.background as Record<string, unknown>
    merged.background = {
      preset: typeof background.preset === 'string' && background.preset !== '' ? background.preset : DEFAULT_BACKGROUND.preset,
      imagePath: typeof background.imagePath === 'string' && background.imagePath !== '' ? background.imagePath : null,
      dim: typeof background.dim === 'number' && background.dim >= 0 && background.dim <= 1 ? background.dim : DEFAULT_BACKGROUND.dim,
      blur: typeof background.blur === 'number' && background.blur >= 0 && background.blur <= 24 ? Math.round(background.blur) : DEFAULT_BACKGROUND.blur,
    }
  }
  if (Array.isArray(input.workspaces)) {
    merged.workspaces = input.workspaces.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return []
      const candidate = entry as Record<string, unknown>
      if (typeof candidate.path !== 'string' || candidate.path === '') return []
      const name = typeof candidate.name === 'string' && candidate.name !== '' ? candidate.name : candidate.path.split(/[\\/]/).pop() ?? candidate.path
      const id = typeof candidate.id === 'string' && candidate.id !== '' ? candidate.id : candidate.path
      return [{ id, name, path: candidate.path }]
    })
  }
  if (typeof input.window === 'object' && input.window !== null && !Array.isArray(input.window)) {
    const shape = input.window as Record<string, unknown>
    merged.window = {
      ratio: typeof shape.ratio === 'string' && shape.ratio !== '' ? shape.ratio : DEFAULT_WINDOW.ratio,
      widthFactor:
        typeof shape.widthFactor === 'number' && shape.widthFactor >= 0.5 && shape.widthFactor <= 1
          ? shape.widthFactor
          : DEFAULT_WINDOW.widthFactor,
    }
  }
  if (typeof input.copy === 'object' && input.copy !== null && !Array.isArray(input.copy)) {
    const copy = input.copy as Record<string, unknown>
    const text = (value: unknown, limit: number): string =>
      typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim().slice(0, limit) : ''
    merged.copy = {
      appName: text(copy.appName, COPY_LIMITS.appName) || DEFAULT_COPY.appName,
      title: text(copy.title, COPY_LIMITS.title),
      // Deliberately allow empty: an empty kicker is how you hide that line.
      kicker: typeof copy.kicker === 'string' ? text(copy.kicker, COPY_LIMITS.kicker) : DEFAULT_COPY.kicker,
      readyNote: text(copy.readyNote, COPY_LIMITS.readyNote),
      showPath: typeof copy.showPath === 'boolean' ? copy.showPath : DEFAULT_COPY.showPath,
    }
  }
  return merged
}
