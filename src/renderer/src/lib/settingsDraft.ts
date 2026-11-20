import type { LauncherSettings } from '@shared/contract'

/** Rows carry ids so React keys survive add/remove/reorder while editing. */
export interface DraftArg {
  id: string
  value: string
}

export interface DraftEnv {
  id: string
  key: string
  value: string
}

/**
 * Editable mirror of {@link LauncherSettings}: numeric fields stay strings so a
 * half-typed value ("0", "") never turns into NaN before validation runs.
 */
export interface SettingsDraft {
  dshCommand: string
  profile: string
  port: string
  openOnReady: LauncherSettings['openOnReady']
  terminalFontSize: string
  extraArgs: DraftArg[]
  env: DraftEnv[]
}

export type ScalarField = 'dshCommand' | 'profile' | 'port' | 'terminalFontSize'

/** Field errors for the drawer; `env` is keyed by row id. */
export interface DraftErrors {
  dshCommand?: string
  profile?: string
  port?: string
  terminalFontSize?: string
  env?: Record<string, string>
}

export interface DraftValidation {
  /** Present only when the whole draft is valid. */
  settings?: LauncherSettings
  errors: DraftErrors
  /** Human-countable number of rows that need fixing. */
  problemCount: number
}

let rowSeq = 0
/** Monotonic ids for transient editor rows. */
function nextRowId(prefix: string): string {
  rowSeq += 1
  return `${prefix}-${String(rowSeq)}`
}

/** Font size range the engine-side normalizer also enforces (see shared/defaults.ts). */
export const FONT_SIZE_RANGE = { min: 9, max: 24 } as const
export const PORT_RANGE = { min: 0, max: 65535 } as const
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function draftFromSettings(settings: LauncherSettings): SettingsDraft {
  return {
    dshCommand: settings.dshCommand,
    profile: settings.profile,
    port: String(settings.port),
    openOnReady: settings.openOnReady,
    terminalFontSize: String(settings.terminalFontSize),
    extraArgs: settings.extraArgs.map((value) => ({ id: nextRowId('arg'), value })),
    env: Object.entries(settings.env).map(([key, value]) => ({ id: nextRowId('env'), key, value })),
  }
}

/**
 * Validate the draft and assemble the exact object handed to `saveSettings`.
 * An invalid draft returns `settings: undefined`, so the save button can never
 * write a broken port/env/font size into settings.json.
 */
export function validateDraft(draft: SettingsDraft, base: LauncherSettings): DraftValidation {
  const errors: DraftErrors = {}

  const dshCommand = draft.dshCommand.trim()
  if (dshCommand === '') errors.dshCommand = 'dsh 命令不能为空'

  const profile = draft.profile.trim()
  if (profile === '') errors.profile = 'profile 不能为空'

  const portText = draft.port.trim()
  let port = Number.NaN
  if (!/^\d+$/.test(portText)) errors.port = '端口必须是 0–65535 的整数'
  else {
    port = Number(portText)
    if (!Number.isInteger(port) || port < PORT_RANGE.min || port > PORT_RANGE.max) {
      errors.port = '端口必须在 0–65535 之间（0 = 自动挑选）'
    }
  }

  const fontText = draft.terminalFontSize.trim()
  let terminalFontSize = Number.NaN
  if (!/^\d+$/.test(fontText)) errors.terminalFontSize = `终端字号必须是 ${String(FONT_SIZE_RANGE.min)}–${String(FONT_SIZE_RANGE.max)} 的整数`
  else {
    terminalFontSize = Number(fontText)
    if (!Number.isInteger(terminalFontSize) || terminalFontSize < FONT_SIZE_RANGE.min || terminalFontSize > FONT_SIZE_RANGE.max) {
      errors.terminalFontSize = `终端字号必须在 ${String(FONT_SIZE_RANGE.min)}–${String(FONT_SIZE_RANGE.max)} 之间`
    }
  }

  const envErrors: Record<string, string> = {}
  const env: Record<string, string> = {}
  const seenKeys = new Set<string>()
  for (const row of draft.env) {
    const key = row.key.trim()
    const value = row.value
    if (key === '' && value.trim() === '') continue
    if (key === '') {
      envErrors[row.id] = '键不能为空'
      continue
    }
    if (!ENV_KEY_PATTERN.test(key)) {
      envErrors[row.id] = '键名只能包含字母、数字、下划线，且不能以数字开头'
      continue
    }
    if (seenKeys.has(key)) {
      envErrors[row.id] = '键名重复'
      continue
    }
    if (/[\r\n]/.test(value)) {
      envErrors[row.id] = '值里不能有换行'
      continue
    }
    seenKeys.add(key)
    env[key] = value
  }
  const envProblemCount = Object.keys(envErrors).length
  if (envProblemCount > 0) errors.env = envErrors

  const extraArgs = draft.extraArgs.map((arg) => arg.value.trim()).filter((value) => value !== '')
  const problemCount =
    (errors.dshCommand === undefined ? 0 : 1) +
    (errors.profile === undefined ? 0 : 1) +
    (errors.port === undefined ? 0 : 1) +
    (errors.terminalFontSize === undefined ? 0 : 1) +
    envProblemCount

  if (problemCount > 0) return { errors, problemCount }

  return {
    errors,
    problemCount,
    settings: {
      ...base,
      dshCommand,
      profile,
      port,
      openOnReady: draft.openOnReady,
      terminalFontSize,
      extraArgs,
      env,
    },
  }
}

/** Whether the draft differs from the persisted settings (drives the save CTA). */
export function isDraftDirty(draft: SettingsDraft, settings: LauncherSettings): boolean {
  const current = draftFromSettings(settings)
  if (draft.dshCommand.trim() !== current.dshCommand.trim()) return true
  if (draft.profile.trim() !== current.profile.trim()) return true
  if (draft.port.trim() !== current.port) return true
  if (draft.terminalFontSize.trim() !== current.terminalFontSize) return true
  if (draft.openOnReady !== current.openOnReady) return true

  const argsSignature = (rows: DraftArg[]): string => rows.map((row) => row.value.trim()).filter((value) => value !== '').join('\n')
  if (argsSignature(draft.extraArgs) !== argsSignature(current.extraArgs)) return true

  const envSignature = new Map<string, string>()
  for (const row of draft.env) {
    const key = row.key.trim()
    if (key === '' || envSignature.has(key)) continue
    envSignature.set(key, row.value)
  }
  const currentEnvSignature = new Map(Object.entries(settings.env))
  if (envSignature.size !== currentEnvSignature.size) return true
  for (const [key, value] of envSignature) {
    if (currentEnvSignature.get(key) !== value) return true
  }
  return false
}

/** Empty helper rows appended by the editors. */
export function blankArg(): DraftArg {
  return { id: nextRowId('arg'), value: '' }
}

export function blankEnv(): DraftEnv {
  return { id: nextRowId('env'), key: '', value: '' }
}
