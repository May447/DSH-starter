import type { LauncherBackground } from '@shared/contract'
import { findBackground } from '../theme/backgrounds'

export interface BackgroundLayerProps {
  background: LauncherBackground
  /** Data URL of the user's picture, once loaded; null = built-in gradient. */
  photoUrl: string | null
}

/**
 * Full-bleed backdrop: the picture (or built-in gradient) is the whole app,
 * a scrim keeps text readable, and a vignette anchors the top/bottom bars.
 *
 * It never reacts to the four-slot theme: colour belongs to the launch button
 * and the settings panel, not to the wallpaper.
 */
export function BackgroundLayer({ background, photoUrl }: BackgroundLayerProps) {
  const preset = findBackground(background.preset)
  const blur = background.blur > 0 ? `blur(${String(background.blur)}px)` : undefined

  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop__art" style={{ backgroundImage: preset.image, filter: blur }} />
      {photoUrl === null ? null : (
        <div className="backdrop__photo" style={{ backgroundImage: `url("${photoUrl}")`, filter: blur }} />
      )}
      <div className="backdrop__scrim" style={{ backgroundColor: `rgba(0, 0, 0, ${String(background.dim)})` }} />
      <div className="backdrop__vignette" />
    </div>
  )
}
