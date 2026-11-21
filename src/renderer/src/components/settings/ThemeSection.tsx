import type { LauncherTheme } from '@shared/contract'
import { THEME_PRESETS, isCustomSlots, normalizeHex } from '../../theme/palettes'
import type { ThemePreset } from '../../theme/palettes'
import { SettingField } from './SettingField'

export interface ThemeSectionProps {
  theme: LauncherTheme
  saving: boolean
  onApply(next: LauncherTheme): void
}

const SLOTS = [
  { key: 'background', label: '背景' },
  { key: 'surface', label: '卡片' },
  { key: 'primary', label: '主色' },
  { key: 'accent', label: '强调' },
] as const satisfies readonly { key: keyof Pick<LauncherTheme, 'background' | 'surface' | 'primary' | 'accent'>; label: string }[]

/**
 * Four-slot theme editor.
 *
 * Presets are one click; any slot can then be overridden with the picker or a
 * hex value. Changes save immediately (the drawer stays open), so the whole
 * window repaints while the user tries palettes.
 */
export function ThemeSection({ theme, saving, onApply }: ThemeSectionProps) {
  const preset = THEME_PRESETS.find((candidate) => candidate.id === theme.preset)
  const custom = preset === undefined ? true : isCustomSlots(theme, preset)

  const applySlots = (patch: Partial<Pick<LauncherTheme, 'background' | 'surface' | 'primary' | 'accent'>>): void => {
    onApply({ ...theme, ...patch, preset: 'custom' })
  }

  const applyPreset = (candidate: ThemePreset): void => {
    onApply({ preset: candidate.id, ...candidate.slots })
  }

  return (
    <section className="group">
      <h3 className="group__title">外观</h3>
      <div className="theme-grid" role="radiogroup" aria-label="预置配色">
        {THEME_PRESETS.map((candidate) => {
          const active = theme.preset === candidate.id
          return (
            <button
              key={candidate.id}
              type="button"
              role="radio"
              aria-checked={active}
              className="theme-card"
              data-active={active}
              disabled={saving}
              title={candidate.name}
              onClick={() => { applyPreset(candidate) }}
            >
              <span className="theme-card__swatch" aria-hidden="true">
                <i style={{ background: candidate.slots.background }} />
                <i style={{ background: candidate.slots.surface }} />
                <i style={{ background: candidate.slots.primary }} />
                <i style={{ background: candidate.slots.accent }} />
              </span>
              <span className="theme-card__name">{candidate.name}</span>
            </button>
          )
        })}
      </div>

      {custom ? <p className="theme-state">当前是自定义配色，选上面任意一套可以还原。</p> : null}

      <SettingField id="settings-theme-slots" label="四个颜色">
        <div className="theme-slots">
          {SLOTS.map((slot) => (
            <label className="theme-slot" key={slot.key}>
              <span className="theme-slot__label">{slot.label}</span>
              <span className="theme-slot__control">
                <input
                  type="color"
                  className="theme-slot__picker"
                  aria-label={`${slot.label}颜色`}
                  value={normalizeHex(theme[slot.key]) ?? '#000000'}
                  disabled={saving}
                  onChange={(event) => {
                    const hex = normalizeHex(event.target.value)
                    if (hex !== null) applySlots({ [slot.key]: hex })
                  }}
                />
                <input
                  type="text"
                  className="input input--mono theme-slot__hex"
                  spellCheck={false}
                  defaultValue={theme[slot.key]}
                  key={`${slot.key}-${theme[slot.key]}`}
                  disabled={saving}
                  onChange={(event) => {
                    const hex = normalizeHex(event.target.value)
                    if (hex !== null) applySlots({ [slot.key]: hex })
                  }}
                />
              </span>
            </label>
          ))}
        </div>
      </SettingField>
    </section>
  )
}
