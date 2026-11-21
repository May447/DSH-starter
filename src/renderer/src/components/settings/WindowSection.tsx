import { useEffect, useRef, useState } from 'react'
import type { LauncherWindow } from '@shared/contract'
import { DEFAULT_WINDOW } from '@shared/defaults'
import { WIDTH_FACTOR_RANGE, WINDOW_RATIOS, sizeFor } from '@shared/window-shape'
import { Button } from '../ui/Button'
import { SegmentedControl } from './SegmentedControl'
import { SettingField } from './SettingField'

export interface WindowSectionProps {
  shape: LauncherWindow
  onApply(next: LauncherWindow): void
}

/** Pause after the last slider tick before the window is actually resized. */
const COMMIT_DELAY_MS = 260

const RATIO_OPTIONS = WINDOW_RATIOS.map((preset) => ({ value: preset.id, label: preset.label }))

/** What the window would measure on this display, in CSS px. */
function preview(shape: LauncherWindow): string {
  const { width, height } = sizeFor(shape, { width: window.screen.availWidth, height: window.screen.availHeight })
  return `${String(width)} × ${String(height)}`
}

/**
 * Window proportion. The launcher never hard-codes a rectangle: it takes an
 * aspect ratio plus a share of the work area, and both are the user's to pick.
 */
export function WindowSection({ shape, onApply }: WindowSectionProps) {
  const [factor, setFactor] = useState(shape.widthFactor)

  const shapeRef = useRef(shape)
  shapeRef.current = shape
  const applyRef = useRef(onApply)
  applyRef.current = onApply

  useEffect(() => { setFactor(shape.widthFactor) }, [shape.widthFactor])

  useEffect(() => {
    if (Math.abs(factor - shapeRef.current.widthFactor) < 1e-4) return
    const timer = window.setTimeout(() => {
      applyRef.current({ ...shapeRef.current, widthFactor: factor })
    }, COMMIT_DELAY_MS)
    return () => { window.clearTimeout(timer) }
  }, [factor])

  const live = { ...shape, widthFactor: factor }
  const isDefault =
    shape.ratio === DEFAULT_WINDOW.ratio && Math.abs(shape.widthFactor - DEFAULT_WINDOW.widthFactor) < 1e-4

  return (
    <section className="group" data-action="windowsec">
      <div className="group__head">
        <h3 className="group__title">窗口</h3>
        <Button
          variant="quiet"
          size="sm"
          data-action="resetwin"
          disabled={isDefault}
          onClick={() => {
            setFactor(DEFAULT_WINDOW.widthFactor)
            onApply({ ...DEFAULT_WINDOW })
          }}
        >
          重置
        </Button>
      </div>

      <SettingField id="settings-window-ratio" label="比例">
        <SegmentedControl
          name="窗口比例"
          value={shape.ratio}
          options={RATIO_OPTIONS}
          onChange={(ratio) => { onApply({ ...shapeRef.current, ratio }) }}
        />
      </SettingField>

      <SettingField
        id="settings-window-scale"
        label="宽度占比"
        aside={<span className="value-badge">{preview(live)}</span>}
      >
        <input
          id="settings-window-scale"
          className="range"
          type="range"
          min={WIDTH_FACTOR_RANGE.min}
          max={WIDTH_FACTOR_RANGE.max}
          step={0.02}
          value={factor}
          onChange={(event) => { setFactor(Number(event.target.value)) }}
        />
      </SettingField>
    </section>
  )
}
