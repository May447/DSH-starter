import type { LaunchPhase } from '@shared/contract'

/** Short label for the status pill / status bar. */
export const PHASE_LABEL: Record<LaunchPhase, string> = {
  idle: '待机',
  starting: '启动中',
  ready: '已就绪',
  stopped: '已停止',
  failed: '启动失败',
}

/** One-line stage copy per phase: the big title and the supporting sentence. */
export interface PhaseCopy {
  title: string
  description: string
}

/**
 * One-line stage copy per phase. The title is unused today (the workspace name
 * owns the headline) but stays as the canonical short form; the description is
 * the only supporting sentence on screen, so it must fit on one line.
 */
export const PHASE_COPY: Record<LaunchPhase, PhaseCopy> = {
  idle: {
    title: '选好工作区，按下去。',
    description: '在选中的目录里启动 dsh。',
  },
  starting: {
    title: '正在启动…',
    description: '等它打印就绪地址，一般 3–8 秒。',
  },
  ready: {
    title: '已就绪。',
    description: '在浏览器里干活就行。',
  },
  stopped: {
    title: '已停下。',
    description: '日志还在，随时可以重来。',
  },
  failed: {
    title: '没起来。',
    description: '下面是原因，日志末尾通常更具体。',
  },
}

/** Whether the launcher is allowed to stop/relaunch from this phase. */
export function isLive(phase: LaunchPhase): boolean {
  return phase === 'starting' || phase === 'ready'
}
