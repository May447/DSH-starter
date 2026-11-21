import type { LauncherWindow } from './contract'

/**
 * Window shape maths, shared by the main process (which sets the size) and the
 * settings panel (which previews it), so the two can never disagree.
 */

export interface RatioPreset {
  /** Stored in settings.json. */
  id: string
  label: string
  /** width / height. */
  value: number
}

export const WINDOW_RATIOS: readonly RatioPreset[] = [
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '16:10', label: '16:10', value: 16 / 10 },
  { id: '21:9', label: '21:9', value: 21 / 9 },
  { id: '2:1', label: '2:1', value: 2 },
]

export const WIDTH_FACTOR_RANGE = { min: 0.5, max: 1 } as const

/** Never open larger than this share of the work area, whatever the maths says. */
const FILL_LIMIT = { width: 0.96, height: 0.9 } as const

/** Fallback when settings hold an unknown preset id. */
const FALLBACK_RATIO = 16 / 9

export function ratioValue(id: string): number {
  return WINDOW_RATIOS.find((candidate) => candidate.id === id)?.value ?? FALLBACK_RATIO
}

export interface WorkArea {
  width: number
  height: number
}

export interface WindowSize {
  width: number
  height: number
}

/** Size for one work area, clamped so the window always fits with margin. */
export function sizeFor(shape: LauncherWindow, workArea: WorkArea): WindowSize {
  const ratio = ratioValue(shape.ratio)
  const factor = Math.min(Math.max(shape.widthFactor, WIDTH_FACTOR_RANGE.min), WIDTH_FACTOR_RANGE.max)

  let width = Math.round(workArea.width * factor)
  let height = Math.round(width / ratio)

  const maxHeight = Math.round(workArea.height * FILL_LIMIT.height)
  if (height > maxHeight) {
    height = maxHeight
    width = Math.round(height * ratio)
  }

  const maxWidth = Math.round(workArea.width * FILL_LIMIT.width)
  if (width > maxWidth) {
    width = maxWidth
    height = Math.round(width / ratio)
  }

  return { width, height }
}
