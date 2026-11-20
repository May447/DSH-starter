/**
 * Turns four user-editable slots into the complete token set the UI reads.
 *
 * Everything else — text, muted text, borders, washes, semantic colours and
 * the "ink" colour that goes on top of the primary button — is derived from
 * the four slots. That is what keeps a hand-picked palette readable: the user
 * chooses mood, the launcher guarantees contrast.
 */

import type { ThemeSlots } from './palettes'

/** One resolved token set; keys map 1:1 to CSS custom properties. */
export type ThemeTokens = Record<string, string>

interface Rgb {
  r: number
  g: number
  b: number
}

/** Parse `#rrggbb` into components. */
function rgbOf(hex: string): Rgb {
  const value = hex.replace('#', '')
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

/** Relative luminance, 0 (black) … 1 (white). */
function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.4124) / 1.0567) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Mix `a` into `b` by `amount` (0 = b, 1 = a). */
function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: Math.round(b.r + (a.r - b.r) * amount),
    g: Math.round(b.g + (a.g - b.g) * amount),
    b: Math.round(b.b + (a.b - b.b) * amount),
  }
}

/** `rgba()` helper with alpha. */
function alpha(color: Rgb, a: number): string {
  return `rgba(${String(color.r)}, ${String(color.g)}, ${String(color.b)}, ${String(a)})`
}

/** Is this palette light (needs dark text) or dark (needs light text)? */
export function isLightPalette(slots: ThemeSlots): boolean {
  return luminance(rgbOf(slots.background)) > 0.5
}

/**
 * Resolve the full token map for a slot set.
 *
 * @param slots - The four slots the user controls.
 */
export function resolveTokens(slots: ThemeSlots): ThemeTokens {
  const background = rgbOf(slots.background)
  const surface = rgbOf(slots.surface)
  const primary = rgbOf(slots.primary)

  const light = isLightPalette(slots)
  const white: Rgb = { r: 255, g: 255, b: 255 }
  const black: Rgb = { r: 0, g: 0, b: 0 }

  // Background stack: a touch darker / lighter around the base colour.
  const shade = (amount: number): string => {
    const shifted = light ? mix(black, background, amount) : mix(white, background, amount)
    return `rgb(${String(shifted.r)}, ${String(shifted.g)}, ${String(shifted.b)})`
  }

  // Ink for text placed on top of a solid primary/accent fill.
  const ink = luminance(primary) > 0.55 ? '#0b0b0f' : '#ffffff'

  /*
   * Inset fields are tinted *towards* the palette's own text colour instead of
   * a fixed black. On a dark palette that is a black wash (unchanged look); on
   * a light palette it becomes a soft grey well that still reads as "inside"
   * the panel, which a `rgba(0,0,0,0.3)` overlay never did.
   */
  const inkRgb = light ? { r: 16, g: 22, b: 36 } : black
  const field = (onLight: number, onDark: number): string => alpha(inkRgb, light ? onLight : onDark)

  return {
    '--bg-0': light ? shade(0.06) : shade(0.18),
    '--bg-1': slots.background,
    '--bg-2': light ? shade(0.02) : shade(0.22),

    '--surface-1': alpha(surface, light ? 0.35 : 0.3),
    '--surface-2': alpha(surface, light ? 0.5 : 0.42),
    '--surface-3': alpha(surface, light ? 0.65 : 0.55),
    '--border': alpha(surface, light ? 0.16 : 0.28),
    '--border-strong': alpha(surface, light ? 0.3 : 0.45),

    '--text': light ? '#141821' : '#eef1f8',
    '--text-2': light ? '#394153' : '#c8cfdd',
    '--muted': light ? '#5c6478' : '#8e97ab',
    '--muted-2': light ? '#818aa0' : '#626b7e',

    /* Inset fields: derived from the palette's ink, never a fixed black. */
    '--field-bg': field(0.05, 0.3),
    '--field-bg-focus': field(0.02, 0.42),
    '--field-well': field(0.04, 0.26),
    '--field-placeholder': light ? '#8d94a6' : '#565c6d',
    '--hover-wash': light ? alpha(inkRgb, 0.05) : alpha(white, 0.05),

    /* Hairline + glass edges follow the palette: light surfaces need a stronger
       white edge to read, dark ones a fainter one to avoid a wireframe look. */
    '--hairline': alpha(white, light ? 0.7 : 0.08),
    '--glass-edge': alpha(white, light ? 0.5 : 0.18),
    '--glass-edge-strong': alpha(white, light ? 0.62 : 0.26),

    '--accent': slots.primary,
    '--accent-2': slots.accent,
    '--accent-ink': ink,
    '--accent-soft': alpha(primary, light ? 0.16 : 0.2),
    '--accent-ring': alpha(primary, 0.45),

    /* Success is a real semantic colour, not the accent: "ready" has to read as
       ready in every palette, and the bottom bar's dot uses the same token. */
    '--ok': light ? '#1f8f5f' : '#5fe0a8',
    '--ok-soft': alpha(light ? { r: 31, g: 143, b: 95 } : { r: 95, g: 224, b: 168 }, 0.14),
    '--warn': light ? '#b06d00' : '#ffc861',
    '--bad': light ? '#b42318' : '#ff7e96',
    '--cool': light ? '#4a5568' : '#9aa7c9',

    /* The four slots themselves, for swatch UI and derived gradients. */
    '--slot-bg': slots.background,
    '--slot-surface': slots.surface,
    '--slot-primary': slots.primary,
    '--slot-accent': slots.accent,

    '--scheme': light ? 'light' : 'dark',
  }
}

/**
 * Write the resolved tokens onto a DOM root.
 *
 * @param slots - Slot set to apply.
 * @param root - Element that owns the custom properties (usually `<html>`).
 */
export function applyTheme(slots: ThemeSlots, root: HTMLElement = document.documentElement): void {
  const tokens = resolveTokens(slots)
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value)
  root.setAttribute('data-theme-light', String(isLightPalette(slots)))
  root.style.colorScheme = isLightPalette(slots) ? 'light' : 'dark'
}
