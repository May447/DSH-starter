import { useEffect, useState } from 'react'
import { DEFAULT_BACKGROUND, DEFAULT_COPY, DEFAULT_THEME } from '@shared/defaults'
import { BackgroundLayer } from './components/BackgroundLayer'
import { HeroStage } from './components/HeroStage'
import { LaunchDock } from './components/LaunchDock'
import { MoreMenu } from './components/MoreMenu'
import { SettingsDrawer } from './components/SettingsDrawer'
import { TerminalPanel } from './components/TerminalPanel'
import { TitleBar } from './components/TitleBar'
import { Button } from './components/ui/Button'
import { IconGear } from './components/icons'
import { useLauncher } from './hooks/useLauncher'
import { applyTheme } from './theme/theme'

/** Fallback when settings have not loaded yet; the bridge normalizes this value. */
const DEFAULT_TERMINAL_FONT_SIZE = 13

/** Drop a picture on the window to make it the wallpaper. */
const IMAGE_DROP = /\.(png|jpe?g|webp|bmp)$/i

/**
 * Launcher shell.
 *
 * Layout follows the game-launcher convention, mirrored: utilities (menu,
 * settings) top-left next to the brand, the one big action bottom-right, and
 * the middle of the screen reserved for the wallpaper and the workspace name.
 * Everything Web-GUI-shaped lives in the menu, so the first screen never grows
 * a second column of buttons.
 */
export default function App() {
  const launcher = useLauncher()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const phase = launcher.status.phase
  const status = launcher.status
  const settings = launcher.settings
  const selected = launcher.selected
  const copy = settings?.copy ?? DEFAULT_COPY
  const imagePath = settings?.background.imagePath ?? null
  const url = status.url
  const webReady = phase === 'ready' && url !== undefined

  /* Palette -> CSS custom properties (launch button + settings panel read them). */
  useEffect(() => {
    applyTheme(settings?.theme ?? DEFAULT_THEME)
  }, [settings?.theme])

  /* The stored path is the source of truth; the data URL is display only. */
  useEffect(() => {
    let alive = true
    if (imagePath === null) {
      setPhotoUrl(null)
      return () => { alive = false }
    }
    void window.dshStarter
      .loadBackgroundImage(imagePath)
      .then((next) => { if (alive) setPhotoUrl(next) })
      .catch(() => { if (alive) setPhotoUrl(null) })
    return () => { alive = false }
  }, [imagePath])

  /* A failed launch opens the log on its own so the stderr tail is visible. */
  useEffect(() => {
    if (phase === 'failed') setLogOpen(true)
  }, [phase])

  /* Drag a picture anywhere on the window to set it as the backdrop. */
  useEffect(() => {
    if (settings === undefined) return

    const onDragOver = (event: DragEvent): void => {
      event.preventDefault()
      setDragging(true)
    }
    const onDragLeave = (event: DragEvent): void => {
      if (event.relatedTarget === null) setDragging(false)
    }
    const onDrop = (event: DragEvent): void => {
      event.preventDefault()
      setDragging(false)
      const file = event.dataTransfer?.files?.[0]
      if (file === undefined || !IMAGE_DROP.test(file.name)) return
      const path = window.dshStarter.pathForFile(file)
      if (path === '') return
      void launcher.saveSettings({ ...settings, background: { ...settings.background, imagePath: path } })
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [settings, launcher])

  /* Enter launches / opens the Web UI, unless the user is typing in settings. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || settingsOpen || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      event.preventDefault()
      if (phase === 'ready') void launcher.openUi()
      else if (phase !== 'starting') void launcher.start()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [phase, settingsOpen, launcher])

  /* Rename is a list operation, so it saves directly like select/remove do. */
  const renameWorkspace = async (workspaceId: string, name: string): Promise<void> => {
    if (settings === undefined) return
    const trimmed = name.trim()
    if (trimmed === '') return
    await launcher.saveSettings({
      ...settings,
      workspaces: settings.workspaces.map((workspace) => (workspace.id === workspaceId ? { ...workspace, name: trimmed } : workspace)),
    })
  }

  return (
    <div className="app">
      <BackgroundLayer background={settings?.background ?? DEFAULT_BACKGROUND} photoUrl={photoUrl} />

      {dragging ? (
        <div className="drop-hint" aria-hidden="true">
          <span className="drop-hint__inner">松手设为背景</span>
        </div>
      ) : null}

      <TitleBar appName={copy.appName}>
        <MoreMenu
          ready={webReady}
          url={url}
          logOpen={logOpen}
          onOpen={() => { void launcher.openUi() }}
          onToggleLog={() => { setLogOpen((previous) => !previous) }}
        />
        <Button
          variant="quiet"
          size="sm"
          data-action="settings"
          leading={<IconGear size={14} />}
          onClick={() => { setSettingsOpen(true) }}
          disabled={settings === undefined}
          title="设置"
        >
          设置
        </Button>
      </TitleBar>

      <main className="stage">
        <HeroStage
          status={status}
          settings={settings}
          copy={copy}
          selected={selected}
          notice={launcher.notice}
          picking={launcher.picking}
          onAddWorkspace={() => { void launcher.addWorkspace() }}
          onDismissNotice={launcher.dismissNotice}
        />
      </main>

      <LaunchDock
        status={status}
        canStart={settings !== undefined}
        onStart={() => { void launcher.start() }}
        onStop={() => { void launcher.stop() }}
      />

      {logOpen ? (
        <TerminalPanel
          fontSize={settings?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE}
          onClose={() => { setLogOpen(false) }}
        />
      ) : null}

      {settingsOpen && settings !== undefined ? (
        <SettingsDrawer
          settings={settings}
          saving={launcher.saving}
          picking={launcher.picking}
          selectedWorkspaceId={selected?.id}
          onClose={() => { setSettingsOpen(false) }}
          onSave={launcher.saveSettings}
          onSelectWorkspace={launcher.select}
          onAddWorkspace={() => { void launcher.addWorkspace() }}
          onRenameWorkspace={renameWorkspace}
        />
      ) : null}
    </div>
  )
}
