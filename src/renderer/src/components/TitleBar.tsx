import type { ReactNode } from 'react'
import { IconLogo } from './icons'

export interface TitleBarProps {
  /** Product name, editable in Settings → 文案. */
  appName: string
  /** Utility controls (menu, settings) that sit next to the brand. */
  children?: ReactNode
}

/**
 * The frameless window's drag strip: brand on the left, utility controls right
 * after it, then empty drag space. The far-right strip belongs to the OS window
 * controls, which stay transparent over the wallpaper.
 *
 * Deliberately carries no status: the launch dock is the only place that speaks
 * about state, so there is exactly one source of truth on screen.
 */
export function TitleBar({ appName, children }: TitleBarProps) {
  return (
    <header className="titlebar">
      <span className="titlebar__brand">
        <span className="titlebar__mark">
          <IconLogo size={26} />
        </span>
        <span className="titlebar__name">{appName}</span>
      </span>

      {children === undefined ? null : <div className="titlebar__tools">{children}</div>}

      <span className="titlebar__drag" />
    </header>
  )
}
