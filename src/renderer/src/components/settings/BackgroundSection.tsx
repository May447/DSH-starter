import { useEffect, useRef, useState } from 'react'
import type { LauncherBackground } from '@shared/contract'
import { BACKGROUND_PRESETS } from '../../theme/backgrounds'
import { Button } from '../ui/Button'
import { SettingField } from './SettingField'

export interface BackgroundSectionProps {
  background: LauncherBackground
  saving: boolean
  onApply(next: LauncherBackground): void
  onPickImage(): void
}

/** How long a dragged slider waits before it writes to disk. */
const COMMIT_DELAY_MS = 220

/**
 * Backdrop editor: built-in gradient, or a picture picked from disk (also
 * droppable onto the window), plus the scrim controls that keep text readable.
 *
 * The two sliders keep a local value while the pointer is down and commit on a
 * short debounce. Writing on every `input` event used to flip `saving` on, which
 * disabled the range mid-drag — the thumb looked glued to the start.
 */
export function BackgroundSection({ background, saving, onApply, onPickImage }: BackgroundSectionProps) {
  const [dim, setDim] = useState(background.dim)
  const [blur, setBlur] = useState(background.blur)

  /* Latest settings for the debounced commit, without re-arming the timer. */
  const backgroundRef = useRef(background)
  backgroundRef.current = background
  const applyRef = useRef(onApply)
  applyRef.current = onApply

  /* External changes (preset switch, reset, another window) flow back in. */
  useEffect(() => { setDim(background.dim) }, [background.dim])
  useEffect(() => { setBlur(background.blur) }, [background.blur])

  useEffect(() => {
    if (Math.abs(dim - backgroundRef.current.dim) < 1e-4) return
    const timer = window.setTimeout(() => { applyRef.current({ ...backgroundRef.current, dim }) }, COMMIT_DELAY_MS)
    return () => { window.clearTimeout(timer) }
  }, [dim])

  useEffect(() => {
    if (blur === backgroundRef.current.blur) return
    const timer = window.setTimeout(() => { applyRef.current({ ...backgroundRef.current, blur }) }, COMMIT_DELAY_MS)
    return () => { window.clearTimeout(timer) }
  }, [blur])

  const patch = (values: Partial<LauncherBackground>): void => {
    onApply({ ...background, ...values })
  }

  return (
    <section className="group">
      <h3 className="group__title">背景</h3>
      <div className="bg-grid" role="radiogroup" aria-label="内置背景">
        {BACKGROUND_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={background.preset === preset.id}
            className="bg-card"
            data-active={background.preset === preset.id}
            disabled={saving}
            title={preset.name}
            onClick={() => { patch({ preset: preset.id }) }}
          >
            <span className="bg-card__art" style={{ backgroundImage: preset.image }} aria-hidden="true" />
            <span className="bg-card__name">{preset.name}</span>
          </button>
        ))}
      </div>

      <SettingField
        id="settings-bg-image"
        label="自己的图片"
        aside={
          background.imagePath === null ? undefined : (
            <span className="value-badge" title={background.imagePath}>
              {background.imagePath.split(/[\\/]/).pop()}
            </span>
          )
        }
      >
        <div className="bg-image-actions">
          <Button variant="ghost" size="sm" onClick={onPickImage} disabled={saving}>
            选择图片
          </Button>
          {background.imagePath === null ? null : (
            <Button variant="quiet" size="sm" onClick={() => { patch({ imagePath: null }) }} disabled={saving}>
              清除
            </Button>
          )}
        </div>
      </SettingField>

      <SettingField
        id="settings-bg-dim"
        label="暗度"
        aside={<span className="value-badge">{Math.round(dim * 100)}%</span>}
      >
        <input
          id="settings-bg-dim"
          className="range"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(dim * 100)}
          onChange={(event) => { setDim(Number(event.target.value) / 100) }}
        />
      </SettingField>

      <SettingField
        id="settings-bg-blur"
        label="模糊"
        aside={<span className="value-badge">{blur} px</span>}
      >
        <input
          id="settings-bg-blur"
          className="range"
          type="range"
          min={0}
          max={24}
          step={1}
          value={blur}
          onChange={(event) => { setBlur(Number(event.target.value)) }}
        />
      </SettingField>
    </section>
  )
}
