import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'ghost' | 'quiet' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and disables the button while an async action runs. */
  loading?: boolean
  /** Icon rendered before the label. */
  leading?: ReactNode
  /** Icon rendered after the label. */
  trailing?: ReactNode
}

/** One button implementation so radii, motion and focus rings cannot drift. */
export function Button({
  variant = 'ghost',
  size = 'md',
  loading = false,
  leading,
  trailing,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, className ?? ''].filter((part) => part !== '').join(' ')
  const isDisabled = (disabled ?? false) || loading

  return (
    <button {...rest} type={type} className={classes} disabled={isDisabled} aria-busy={loading || undefined}>
      {loading ? <Spinner size={size === 'lg' ? 16 : 13} /> : leading}
      <span className="btn__label">{children}</span>
      {trailing}
    </button>
  )
}
