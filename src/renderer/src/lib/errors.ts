/** Turn engine-level failure strings into something a human can act on. */

export interface LaunchErrorCopy {
  /** Short headline, e.g. 「启动超时」. */
  title: string
  /** What it means and what to try. */
  hint: string
  /** The raw string from the engine, kept for the detail drawer. */
  detail: string
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '未知错误'
}

/** Map `status.error` onto actionable copy; never dump a raw stack in the hero. */
export function describeLaunchError(error: string | undefined): LaunchErrorCopy | undefined {
  if (error === undefined || error.trim() === '') return undefined
  const raw = error.trim()
  const lower = raw.toLowerCase()

  if (/did not report ready within/.test(lower)) {
    return {
      title: '启动超时',
      hint: 'dsh 在 120 秒内没有打印就绪地址。通常是插件加载失败、端口被占或权限问题——看下面日志的最后几行，那里一般有真正的原因。',
      detail: raw,
    }
  }
  if (lower.includes('eperm') || lower.includes('access is denied') || lower.includes('permission denied')) {
    return {
      title: '权限被拒绝',
      hint: 'dsh 在访问某个目录、临时目录或端口时被拒绝了。换个可写的工作区，或者检查杀毒软件/沙箱策略。',
      detail: raw,
    }
  }
  if (lower.includes('enoent') || lower.includes('failed to start') || lower.includes('not found')) {
    return {
      title: '找不到 dsh',
      hint: '设置里的「dsh 命令」可能不是有效路径，或者 PATH 上没有这个名字。填绝对路径最稳，比如 node ...\\bin.js 也可以。',
      detail: raw,
    }
  }
  const exit = /exited with code\s+(-?\d+)/i.exec(raw)
  if (exit?.[1] !== undefined) {
    return {
      title: `dsh 提前退出（退出码 ${exit[1]}）`,
      hint: '进程在打印就绪地址之前就结束了。下面日志的末尾几行通常就是原因；如果是配置问题，改完设置再启动一次。',
      detail: raw,
    }
  }
  return {
    title: '启动失败',
    hint: 'dsh 没能走到就绪这一步。看下面日志的最后几行，或者去设置里检查命令、profile 和端口。',
    detail: raw,
  }
}
