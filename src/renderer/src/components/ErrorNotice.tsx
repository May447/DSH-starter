import { useState } from 'react'
import { describeLaunchError } from '../lib/errors'
import { IconAlert, IconChevron } from './icons'

export interface ErrorNoticeProps {
  error: string | undefined
}

/**
 * Human-readable failure panel. The headline and hint are mapped from the
 * engine string; the raw text stays one click away instead of being dumped.
 */
export function ErrorNotice({ error }: ErrorNoticeProps) {
  const [showDetail, setShowDetail] = useState(false)
  const copy = describeLaunchError(error)
  if (copy === undefined) return null

  return (
    <div className="error-notice" role="alert">
      <span className="error-notice__icon" aria-hidden="true">
        <IconAlert size={18} />
      </span>
      <div className="error-notice__body">
        <p className="error-notice__title">{copy.title}</p>
        <p className="error-notice__hint">{copy.hint}</p>
        <button
          type="button"
          className="error-notice__toggle"
          aria-expanded={showDetail}
          onClick={() => setShowDetail((previous) => !previous)}
        >
          <IconChevron size={13} dir={showDetail ? 'up' : 'down'} />
          技术细节
        </button>
        {showDetail ? <pre className="error-notice__detail">{copy.detail}</pre> : null}
      </div>
    </div>
  )
}
