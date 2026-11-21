import type { ReactNode } from 'react'

export interface SettingFieldProps {
  /** Stable id used by the `<label for>` of the field's control. */
  id: string
  label: string
  error?: string
  /** Extra inline content placed after the label (ranges, counters). */
  aside?: ReactNode
  children: ReactNode
}

/**
 * Label + control + optional error, so every setting row looks the same.
 *
 * Deliberately no description line: the panel is dense enough that captions had
 * to go. Errors are the only exception — they appear only when something is
 * actually wrong.
 */
export function SettingField({ id, label, error, aside, children }: SettingFieldProps) {
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
      {invalid ? <p className="field__error">{error}</p> : null}
    </div>
  )
}
