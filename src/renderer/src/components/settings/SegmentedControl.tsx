export interface SegmentedOption<T extends string> {
  value: T
  label: string
  hint?: string
}

export interface SegmentedControlProps<T extends string> {
  name: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange(value: T): void
}

/** Small radio-group used for `openOnReady`. */
export function SegmentedControl<T extends string>({ name, value, options, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-selected={selected}
            className="segmented__option"
            onClick={() => { onChange(option.value) }}
          >
            <span className="segmented__label">{option.label}</span>
            {option.hint === undefined ? null : <span className="segmented__hint">{option.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}
