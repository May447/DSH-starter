import { useEffect, useRef, useState } from 'react'
import { displayUrl } from '../lib/format'
import { Button } from './ui/Button'
import { IconCheck, IconCopy, IconExternal, IconMore, IconTerminal } from './icons'

export interface MoreMenuProps {
  /** A ready URL exists, so the Web GUI entries are meaningful. */
  ready: boolean
  url: string | undefined
  logOpen: boolean
  onOpen(): void
  onToggleLog(): void
}

/**
 * The launcher's secondary menu, anchored top-left.
 *
 * Everything Web-GUI-shaped lives here (address, open, copy) so the main screen
 * only ever shows two things: what you are about to launch, and the launch
 * button. Stop/launch are *not* duplicated here — the dock owns them.
 */
export function MoreMenu({ ready, url, logOpen, onOpen, onToggleLog }: MoreMenuProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      const node = root.current
      if (node === null) return
      if (event.target instanceof Node && node.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (copied === 'idle') return
    const timer = window.setTimeout(() => setCopied('idle'), 2_000)
    return () => { window.clearTimeout(timer) }
  }, [copied])

  const copy = async (): Promise<void> => {
    if (url === undefined) return
    try {
      await window.dshStarter.writeClipboard(url)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }

  /* Every entry closes the menu first, so focus never lands on a hidden node. */
  const run = (action: () => void) => (): void => {
    setOpen(false)
    action()
  }

  return (
    <div className="moremenu" ref={root}>
      <Button
        variant="quiet"
        size="sm"
        data-action="more"
        aria-haspopup="menu"
        aria-expanded={open}
        leading={<IconMore size={14} />}
        onClick={() => { setOpen((previous) => !previous) }}
        title="启动器菜单"
      >
        更多
      </Button>

      {open ? (
        <div className="moremenu__panel" role="menu" aria-label="启动器菜单">
          <div className="moremenu__head">
            <span className="moremenu__dot" data-ready={ready} aria-hidden="true" />
            <span className="moremenu__head-label">Web GUI</span>
            <span className="moremenu__head-state">{ready ? '已就绪' : '未启动'}</span>
          </div>

          {url === undefined ? null : (
            <code className="moremenu__url" title={url}>
              {displayUrl(url)}
            </code>
          )}

          <button
            type="button"
            role="menuitem"
            className="moremenu__item"
            data-action="open"
            disabled={!ready}
            onClick={run(onOpen)}
          >
            <IconExternal size={14} />
            打开 Web GUI
          </button>

          <button
            type="button"
            role="menuitem"
            className="moremenu__item"
            data-action="copy"
            disabled={!ready}
            onClick={() => { void copy() }}
          >
            {copied === 'ok' ? <IconCheck size={14} /> : <IconCopy size={14} />}
            {copied === 'ok' ? '已复制' : copied === 'fail' ? '复制失败' : '复制地址'}
          </button>

          <div className="moremenu__sep" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="moremenu__item"
            data-action="log"
            data-active={logOpen}
            aria-pressed={logOpen}
            onClick={run(onToggleLog)}
          >
            <IconTerminal size={14} />
            {logOpen ? '收起启动日志' : '启动日志'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
