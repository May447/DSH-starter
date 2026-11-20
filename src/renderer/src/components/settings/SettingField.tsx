import type { ReactNode } from 'react'

export interface SettingFieldProps {
  /** Stable id used by the `<label for>` of the field's control. */
  id: string
  label: string
  hint?: string
  error?: string
  /** Extra inline content placed after the control (ranges, counters). */
  aside?: ReactNode
  children: ReactNode
}

/** Label + control + hint/error, so every setting row looks the same. */
export function SettingField({ id, label, hint, error, aside, children }: SettingFieldProps) {
  const invalid = error !== undefined
  return (
    <div className="field" data-invalid={invalid}>
      <div className="field__head">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        {aside === undefined ? null : <span className="field__aside">{aside}</span>}
      </div>
      {children}
      {invalid ? (
        <p className="field__error">{error}</p>
      ) : hint === undefined ? null : (
        <p className="field__hint">{hint}</p>
      )}
    </div>
  )
}
