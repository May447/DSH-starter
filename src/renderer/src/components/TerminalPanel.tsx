import { useCallback, useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import type { LogChunk } from '@shared/contract'
import '@xterm/xterm/css/xterm.css'
import { clearLogBuffer, replayLogs, subscribeLogs } from '../lib/logHub'
import { formatBytes } from '../lib/format'
import { IconChevron, IconTerminal, IconTrash } from './icons'

/** Bounded scrollback: xterm drops the oldest rows, so memory cannot grow forever. */
const MAX_SCROLLBACK = 5_000

const STDOUT_COLOR = ''
const STDERR_COLOR = '\x1b[38;5;210m'
const SYSTEM_COLOR = '\x1b[38;5;146m'
const RESET = '\x1b[0m'

const THEME: ITheme = {
  background: '#00000000',
  foreground: '#d9deef',
  cursor: '#8b96ff',
  cursorAccent: '#0a0c12',
  selectionBackground: 'rgba(124, 140, 255, 0.28)',
  selectionInactiveBackground: 'rgba(124, 140, 255, 0.16)',
  scrollbarSliderBackground: 'rgba(255, 255, 255, 0.12)',
  scrollbarSliderHoverBackground: 'rgba(255, 255, 255, 0.2)',
  scrollbarSliderActiveBackground: 'rgba(255, 255, 255, 0.26)',
  black: '#181b24',
  red: '#ff8fa3',
  green: '#7fe1a8',
  yellow: '#f2c46d',
  blue: '#8fb2ff',
  magenta: '#c9a2ff',
  cyan: '#7fd9d6',
  white: '#e6e9f4',
  brightBlack: '#5f6678',
  brightRed: '#ffaab8',
  brightGreen: '#a3f0c3',
  brightYellow: '#ffd98f',
  brightBlue: '#aec7ff',
  brightMagenta: '#dfc4ff',
  brightCyan: '#a9efec',
  brightWhite: '#ffffff',
}

interface FormattedChunk {
  payload: string
  /** True when the chunk left a line open (no trailing newline). */
  endsLine: boolean
  lines: number
}

/** Colour-code by stream while preserving whatever ANSI the child already sent. */
function formatChunk(chunk: LogChunk, lastLineOpen: boolean): FormattedChunk {
  const lines = countLines(chunk.data)
  if (chunk.stream === 'system') {
    // Engine narration already ends with a newline; trim it so the marker line
    // does not come with an extra blank line.
    const text = chunk.data.replace(/[\r\n]+$/, '')
    const leadingBreak = lastLineOpen ? '\r\n' : ''
    return { payload: `${leadingBreak}${SYSTEM_COLOR}· ${text}${RESET}\r\n`, endsLine: true, lines: 1 }
  }
  if (chunk.stream === 'stderr') {
    return {
      payload: `${STDERR_COLOR}${chunk.data}${RESET}`,
      endsLine: chunk.data.endsWith('\n'),
      lines,
    }
  }
  return { payload: `${STDOUT_COLOR}${chunk.data}`, endsLine: chunk.data.endsWith('\n'), lines }
}

function countLines(data: string): number {
  let count = 0
  for (let index = 0; index < data.length; index += 1) {
    if (data.charCodeAt(index) === 10) count += 1
  }
  return count
}

export interface TerminalPanelProps {
  /** xterm font size, mirrored from settings. */
  fontSize: number
  /** Close the sheet; the bottom bar's 日志 button is the toggle. */
  onClose(): void
}

/**
 * Launch log sheet.
 *
 * - `@xterm/xterm` with the fit addon, so ANSI colours, selection and scrollback
 *   come for free; stdout stays raw, stderr gets a warm wash, launcher narration
 *   shows up as tinted `·` lines.
 * - Sticks to the bottom while following; stops following as soon as the user
 *   scrolls up, and the header tells them so.
 * - Rendered only while the log sheet is open; closing it never touches the
 *   child process.
 */
export function TerminalPanel({ fontSize, onClose }: TerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | undefined>(undefined)
  const fitRef = useRef<FitAddon | undefined>(undefined)
  const followRef = useRef(true)
  const lastLineOpenRef = useRef(false)
  const initialFontSizeRef = useRef(fontSize)

  const [follow, setFollow] = useState(true)
  const [lineCount, setLineCount] = useState(0)
  const [byteCount, setByteCount] = useState(0)

  const fitTerminal = useCallback(() => {
    const term = termRef.current
    const fit = fitRef.current
    const host = hostRef.current
    if (term === undefined || fit === undefined || host === null) return
    const rect = host.getBoundingClientRect()
    if (rect.width < 40 || rect.height < 24) return
    try {
      fit.fit()
    } catch {
      /* fit can throw while the panel is mid-transition; the next resize retries. */
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return

    const term = new Terminal({
      allowTransparency: true,
      convertEol: true,
      cursorBlink: false,
      disableStdin: true,
      drawBoldTextInBrightColors: true,
      fontFamily: "'Cascadia Mono', 'JetBrains Mono', Consolas, 'Courier New', monospace",
      fontSize: initialFontSizeRef.current,
      letterSpacing: 0,
      lineHeight: 1.32,
      scrollback: MAX_SCROLLBACK,
      smoothScrollDuration: 60,
      theme: THEME,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    const writeChunk = (chunk: LogChunk): void => {
      const formatted = formatChunk(chunk, lastLineOpenRef.current)
      term.write(formatted.payload)
      lastLineOpenRef.current = !formatted.endsLine
      setLineCount((previous) => previous + formatted.lines)
      setByteCount((previous) => previous + chunk.data.length)
      if (followRef.current) term.scrollToBottom()
    }

    replayLogs(writeChunk)
    const unsubscribe = subscribeLogs(writeChunk)
    const scrollSubscription = term.onScroll(() => {
      const buffer = term.buffer.active
      const atBottom = buffer.viewportY >= buffer.baseY
      if (atBottom === followRef.current) return
      followRef.current = atBottom
      setFollow(atBottom)
    })

    const observer = new ResizeObserver(() => {
      fitTerminal()
    })
    observer.observe(host)
    const onWindowResize = (): void => {
      fitTerminal()
    }
    window.addEventListener('resize', onWindowResize)
    const firstFit = requestAnimationFrame(() => {
      fitTerminal()
    })

    return () => {
      cancelAnimationFrame(firstFit)
      window.removeEventListener('resize', onWindowResize)
      observer.disconnect()
      unsubscribe()
      scrollSubscription.dispose()
      term.dispose()
      termRef.current = undefined
      fitRef.current = undefined
    }
  }, [fitTerminal])

  useEffect(() => {
    const term = termRef.current
    if (term === undefined) return
    if (term.options.fontSize === fontSize) return
    term.options.fontSize = fontSize
    const frame = requestAnimationFrame(() => {
      fitTerminal()
    })
    return () => cancelAnimationFrame(frame)
  }, [fontSize, fitTerminal])

  const toggleFollow = (): void => {
    setFollow((previous) => {
      const next = !previous
      followRef.current = next
      if (next) termRef.current?.scrollToBottom()
      return next
    })
  }

  const clearLog = (): void => {
    const term = termRef.current
    if (term !== undefined) {
      term.clear()
      term.scrollToBottom()
    }
    clearLogBuffer()
    lastLineOpenRef.current = false
    setLineCount(0)
    setByteCount(0)
  }

  return (
    <section className="logsheet" aria-label="启动日志">
      <header className="terminal__bar">
        <span className="terminal__title">
          <span className="terminal__icon" aria-hidden="true">
            <IconTerminal size={14} />
          </span>
          <span className="terminal__name">启动日志</span>
          <span className="terminal__meta">
            {lineCount} 行 · {formatBytes(byteCount)}
          </span>
        </span>

        <div className="terminal__tools">
          <button
            type="button"
            className="terminal__tool"
            aria-pressed={follow}
            data-on={follow}
            title={follow ? '日志自动滚到底部（滚上去会自动暂停）' : '滚回底部并恢复自动跟随'}
            onClick={toggleFollow}
          >
            <span className="terminal__follow-dot" aria-hidden="true" />
            {follow ? '跟随中' : '已暂停'}
          </button>
          <button type="button" className="terminal__tool" title="清空终端内容（不影响正在运行的 dsh）" onClick={clearLog}>
            <IconTrash size={13} />
            <span>清空</span>
          </button>
          <button
            type="button"
            className="terminal__tool"
            title="收起日志面板"
            onClick={onClose}
          >
            <IconChevron size={13} dir="up" />
            <span>收起</span>
          </button>
        </div>
      </header>

      <div className="terminal__body logsheet__body">
        <div ref={hostRef} className="terminal__host" />
        {lineCount === 0 ? (
          <div className="terminal__empty">
            <span>dsh 的输出会实时滚在这里</span>
            <span className="terminal__empty-sub">stdout 保持原本 ANSI 颜色，stderr 用暖红标出</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
