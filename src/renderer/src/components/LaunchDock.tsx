import type { LaunchStatus } from '@shared/contract'
import { Button } from './ui/Button'
import { IconPlay, IconStop } from './icons'

export interface LaunchDockProps {
  status: LaunchStatus
  /** Settings have not loaded yet, so a launch would use half-known values. */
  canStart: boolean
  onStart(): void
  onStop(): void
}

/**
 * Bottom-right launch dock, the HoYoPlay convention: one large button in the
 * corner carries the whole state machine.
 *
 * idle / stopped / failed → 启动  ·  starting → 取消  ·  ready → 停止
 *
 * Opening the Web GUI is *not* here on purpose: that lives in the menu, so the
 * corner button always means "change the process state".
 */
export function LaunchDock({ status, canStart, onStart, onStop }: LaunchDockProps) {
  const phase = status.phase

  if (phase === 'starting') {
    return (
      <div className="dock">
        <Button variant="ghost" size="lg" leading={<IconStop size={15} />} onClick={onStop}>
          取消启动
        </Button>
      </div>
    )
  }

  if (phase === 'ready') {
    return (
      <div className="dock">
        <Button variant="ghost" size="lg" leading={<IconStop size={15} />} onClick={onStop}>
          停止 DSH
        </Button>
      </div>
    )
  }

  return (
    <div className="dock">
      <Button
        variant="primary"
        size="lg"
        data-action="start"
        leading={<IconPlay size={17} />}
        disabled={!canStart}
        onClick={onStart}
      >
        {phase === 'failed' || phase === 'stopped' ? '重新启动' : '启动 DSH'}
      </Button>
    </div>
  )
}
