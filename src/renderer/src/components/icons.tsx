import type { SVGProps } from 'react'

/** Shared stroke defaults so every icon stays visually consistent. */
function strokeProps(size: number): Pick<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'fill' | 'stroke' | 'strokeWidth' | 'strokeLinecap' | 'strokeLinejoin'> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
}

export interface IconProps {
  size?: number
}

export function IconLogo({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="dsh-logo-gradient" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b96ff" />
          <stop offset="1" stopColor="#b07bff" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.6 21.4 12 12 21.4 2.6 12Z"
        fill="url(#dsh-logo-gradient)"
        fillOpacity="0.16"
        stroke="url(#dsh-logo-gradient)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 7.2 16.8 12 12 16.8 7.2 12Z" fill="url(#dsh-logo-gradient)" fillOpacity="0.85" />
    </svg>
  )
}

export function IconGear({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 14.2a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.55V20a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.03H4a2 2 0 1 1 0-4h.11a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1.03-1.55V4a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.55 1.03H20a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49.99Z" />
    </svg>
  )
}

export function IconPlus({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconPlay({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.2 5.4a1 1 0 0 1 1.53-.85l8.2 5.52a1.9 1.9 0 0 1 0 3.16l-8.2 5.52a1 1 0 0 1-1.53-.85Z" />
    </svg>
  )
}

export function IconStop({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
    </svg>
  )
}

export function IconExternal({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 19V7a1.5 1.5 0 0 1 1.5-1.5H9" />
    </svg>
  )
}

export function IconWindow({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.4" />
      <path d="M3.4 9.2h17.2" />
      <circle cx="6.3" cy="6.9" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="8.6" cy="6.9" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconCopy({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <rect x="8.6" y="8.6" width="11.4" height="11.4" rx="2.2" />
      <path d="M15.4 8.6V6.2A2.2 2.2 0 0 0 13.2 4H6.2A2.2 2.2 0 0 0 4 6.2v7a2.2 2.2 0 0 0 2.2 2.2h2.4" />
    </svg>
  )
}

export function IconTerminal({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <rect x="2.8" y="4.4" width="18.4" height="15.2" rx="2.4" />
      <path d="m6.6 9.4 2.9 2.6-2.9 2.6" />
      <path d="M12.4 15h4.6" />
    </svg>
  )
}

export function IconChevron({ size = 16, dir = 'down' }: IconProps & { dir?: 'up' | 'down' }) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      {dir === 'down' ? <path d="m6 9.5 6 6 6-6" /> : <path d="m6 14.5 6-6 6 6" />}
    </svg>
  )
}

/** "More" affordance: three dots, used for the bottom-bar secondary menu. */
export function IconMore({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5.4" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.6" cy="12" r="1.7" />
    </svg>
  )
}

export function IconClose({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  )
}

export function IconAlert({ size = 18 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <path d="M12 3.6 21 19.6a1.2 1.2 0 0 1-1.05 1.8H4.05A1.2 1.2 0 0 1 3 19.6Z" />
      <path d="M12 9.4v4.4" />
      <circle cx="12" cy="17.3" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconFolder({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <path d="M3.2 7.2A2 2 0 0 1 5.2 5.2h3.7l2 2.2h7.9a1.6 1.6 0 0 1 1.6 1.6v8.4a1.6 1.6 0 0 1-1.6 1.6H4.8a1.6 1.6 0 0 1-1.6-1.6Z" />
    </svg>
  )
}

/** Inline rename affordance for workspace rows. */
export function IconPencil({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <path d="M4.8 19.2h3.1L19 8.1a1.5 1.5 0 0 0 0-2.1l-1-1a1.5 1.5 0 0 0-2.1 0L4.8 16.1Z" />
      <path d="m14.7 6.6 2.7 2.7" />
    </svg>
  )
}

export function IconTrash({ size = 16 }: IconProps) {  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <path d="M4.4 7h15.2" />
      <path d="M9.4 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.8a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="M6.4 7.2 7.2 19a1.4 1.4 0 0 0 1.4 1.3h6.8a1.4 1.4 0 0 0 1.4-1.3l.8-11.8" />
      <path d="M10.4 11v5.6M13.6 11v5.6" />
    </svg>
  )
}

export function IconCheck({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <path d="m4.8 12.6 4.8 4.8 9.6-10" />
    </svg>
  )
}

export function IconRefresh({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.2" />
      <path d="M19.6 4.6V9h-4.4" />
    </svg>
  )
}

export function IconArrowDown({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)} aria-hidden="true">
      <path d="M12 4.6v14.4" />
      <path d="m6.4 13.4 5.6 5.6 5.6-5.6" />
    </svg>
  )
}
