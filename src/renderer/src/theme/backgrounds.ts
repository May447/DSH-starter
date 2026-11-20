/**
 * Built-in backdrops.
 *
 * The launcher is a full-screen picture first: every one of these is a layered
 * gradient (base wash + two glows) rather than a flat colour, so the UI floats
 * on something with depth even before the user picks their own image.
 */

export interface BackgroundPreset {
  id: string
  name: string
  /** Layered `background-image` value. */
  image: string
  /** Colour the top bar and bottom bar tint themselves with. */
  tint: string
}

export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  {
    id: 'aurora',
    name: '极光',
    image: [
      'radial-gradient(1200px 700px at 12% -10%, rgba(120, 150, 255, 0.45), transparent 62%)',
      'radial-gradient(1000px 620px at 92% 8%, rgba(176, 107, 255, 0.4), transparent 60%)',
      'radial-gradient(900px 600px at 50% 120%, rgba(34, 211, 238, 0.22), transparent 65%)',
      'linear-gradient(160deg, #101a3a 0%, #0a0f24 55%, #06080f 100%)',
    ].join(', '),
    tint: 'rgba(6, 8, 15, 0.72)',
  },
  {
    id: 'dusk',
    name: '黄昏',
    image: [
      'radial-gradient(1100px 680px at 8% -8%, rgba(255, 138, 128, 0.42), transparent 60%)',
      'radial-gradient(980px 620px at 96% 4%, rgba(176, 107, 255, 0.42), transparent 58%)',
      'linear-gradient(155deg, #241331 0%, #180d20 52%, #09060d 100%)',
    ].join(', '),
    tint: 'rgba(9, 6, 13, 0.72)',
  },
  {
    id: 'ocean',
    name: '深海',
    image: [
      'radial-gradient(1150px 720px at 18% -12%, rgba(34, 211, 238, 0.38), transparent 62%)',
      'radial-gradient(900px 560px at 88% 10%, rgba(56, 130, 246, 0.32), transparent 60%)',
      'linear-gradient(165deg, #07252e 0%, #04161d 55%, #02080b 100%)',
    ].join(', '),
    tint: 'rgba(2, 8, 11, 0.74)',
  },
  {
    id: 'forest',
    name: '林间',
    image: [
      'radial-gradient(1200px 700px at 10% -10%, rgba(61, 220, 151, 0.34), transparent 62%)',
      'radial-gradient(940px 600px at 94% 6%, rgba(143, 227, 192, 0.26), transparent 58%)',
      'linear-gradient(160deg, #0c241c 0%, #07160f 55%, #030806 100%)',
    ].join(', '),
    tint: 'rgba(3, 8, 6, 0.74)',
  },
  {
    id: 'ember',
    name: '余烬',
    image: [
      'radial-gradient(1200px 720px at 14% -12%, rgba(255, 122, 84, 0.4), transparent 62%)',
      'radial-gradient(980px 620px at 90% 12%, rgba(255, 200, 97, 0.28), transparent 60%)',
      'linear-gradient(160deg, #2a1310 0%, #180a09 55%, #080404 100%)',
    ].join(', '),
    tint: 'rgba(8, 4, 4, 0.76)',
  },
  {
    id: 'mono',
    name: '石墨',
    image: [
      'radial-gradient(1200px 700px at 12% -12%, rgba(255, 255, 255, 0.16), transparent 62%)',
      'radial-gradient(900px 560px at 92% 10%, rgba(255, 255, 255, 0.1), transparent 60%)',
      'linear-gradient(160deg, #1c1f26 0%, #101216 55%, #070809 100%)',
    ].join(', '),
    tint: 'rgba(7, 8, 9, 0.76)',
  },
]

/** Look a preset up by id, falling back to the first one. */
export function findBackground(id: string | undefined): BackgroundPreset {
  const found = BACKGROUND_PRESETS.find((preset) => preset.id === id)
  return found ?? BACKGROUND_PRESETS[0]!
}
