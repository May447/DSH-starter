/**
 * Colour presets, in the spirit of ColorHunt's popular palettes.
 *
 * Every preset is exactly the four user-editable slots:
 *   background  the app backdrop
 *   surface     cards, rails and panels (rendered with alpha over background)
 *   primary     the one action colour (launch button, active state)
 *   accent      the secondary pop (links, highlights, ready state)
 *
 * Text, borders, hover washes and semantic colours are *derived* from these
 * four so a user can never pick a combination that makes text unreadable.
 */

export interface ThemeSlots {
  background: string
  surface: string
  primary: string
  accent: string
}

export interface ThemePreset {
  id: string
  name: string
  slots: ThemeSlots
}

/** Eight hand-picked sets: dark, calm, high-contrast and one light. */
export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'midnight',
    name: '午夜蓝',
    slots: { background: '#0b0f1a', surface: '#151c2c', primary: '#5b8cff', accent: '#8f6bff' },
  },
  {
    id: 'graphite',
    name: '石墨橙',
    slots: { background: '#121212', surface: '#1f1d1b', primary: '#ff8a3d', accent: '#ffd166' },
  },
  {
    id: 'forest',
    name: '林间绿',
    slots: { background: '#0d1512', surface: '#16241e', primary: '#3ddc97', accent: '#8fe3c0' },
  },
  {
    id: 'plum',
    name: '梅子紫',
    slots: { background: '#140f1c', surface: '#221a30', primary: '#b07cff', accent: '#ff7ab6' },
  },
  {
    id: 'ocean',
    name: '深海青',
    slots: { background: '#061a1f', surface: '#0d2b33', primary: '#22d3ee', accent: '#5eead4' },
  },
  {
    id: 'ember',
    name: '余烬红',
    slots: { background: '#170d12', surface: '#2a161d', primary: '#ff5470', accent: '#ffb561' },
  },
  {
    id: 'paper',
    name: '纸白',
    slots: { background: '#f5f3ef', surface: '#ffffff', primary: '#2f6fed', accent: '#ef8354' },
  },
  {
    id: 'mono',
    name: '黑白',
    slots: { background: '#0a0a0a', surface: '#171717', primary: '#e5e5e5', accent: '#9ca3af' },
  },
]

/** Look a preset up by id, falling back to the first one. */
export function findPreset(id: string | undefined): ThemePreset {
  const found = THEME_PRESETS.find((preset) => preset.id === id)
  return found ?? THEME_PRESETS[0]!
}

/** A preset is "custom" once any slot differs from its preset values. */
export function isCustomSlots(slots: ThemeSlots, preset: ThemePreset): boolean {
  return (Object.keys(preset.slots) as (keyof ThemeSlots)[]).some((key) => normalizeHex(slots[key]) !== normalizeHex(preset.slots[key]))
}

/** Normalize user input to `#rrggbb`, or return null when it is not a colour. */
export function normalizeHex(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  const short = /^#([0-9a-f]{3})$/.exec(trimmed)
  if (short?.[1] !== undefined) {
    const [r, g, b] = short[1]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : null
}
