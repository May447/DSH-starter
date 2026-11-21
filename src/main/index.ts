import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, clipboard, desktopCapturer, dialog, ipcMain, nativeImage, screen, session, shell } from 'electron'
import { CHANNELS, type LaunchStatus, type LauncherSettings, type LauncherWindow, type StartOptions, type WorkspaceEntry } from '@shared/contract'
import { sizeFor } from '@shared/window-shape'
import { LaunchEngine } from './engine'
import { SettingsStore } from './settings-store'

/*
 * Dev/CI affordance: keep Electron's own caches (cookies, GPU cache, crashpad)
 * inside a caller-provided directory instead of the user profile. Used by the
 * sandboxed dev loop and harmless in normal runs.
 */
const userDataOverride = process.env['DSH_STARTER_USER_DATA']
if (userDataOverride !== undefined && userDataOverride !== '') app.setPath('userData', userDataOverride)

/** Flags that drive an unattended smoke run; all are ignored in normal launches. */
interface DevFlags {
  /** `--capture <file>`: render one frame to PNG, then exit. */
  capture?: string | undefined
  /** `--dump-dom <file>`: write the renderer's `body.innerText`, then exit. */
  dumpDom?: string | undefined
  /** `--autostart`: start a launch before capturing, instead of waiting for a click. */
  autostart: boolean
  /** `--capture-delay <ms>`: extra settle time before capture/dump. */
  delay: number
  /**
   * `--quit-while-running`: skip the explicit `engine.stop()` at the end of the
   * smoke run, so the app-quit shutdown path (`before-quit`) is exercised.
   */
  quitWhileRunning: boolean
  /**
   * `--ui <action>`: click the `[data-action]` control before capturing, so a
   * headless run can screenshot the drawer or the log sheet instead of the idle
   * stage. Only used for visual smoke runs.
   */
  ui?: string | undefined
  /**
   * `--capture-window <file>`: grab the *composited* window (native title-bar
   * buttons included) via desktopCapturer. `capturePage` cannot see the OS
   * window-controls overlay, so this is the only way to check that strip.
   */
  captureWindow?: string | undefined
}

function parseDevFlags(argv: readonly string[]): DevFlags {
  const valueOf = (name: string): string | undefined => {
    const index = argv.indexOf(name)
    if (index === -1) return undefined
    return argv[index + 1]
  }
  const rawDelay = Number(valueOf('--capture-delay') ?? '600')
  const ui = valueOf('--ui')
  return {
    capture: valueOf('--capture'),
    dumpDom: valueOf('--dump-dom'),
    autostart: argv.includes('--autostart'),
    delay: Number.isFinite(rawDelay) && rawDelay >= 0 ? rawDelay : 600,
    quitWhileRunning: argv.includes('--quit-while-running'),
    // Whitelisted shape: the value is interpolated into a selector.
    ui: ui !== undefined && /^[a-z]+(,[a-z]+)*$/.test(ui) ? ui : undefined,
    captureWindow: valueOf('--capture-window'),
  }
}

const devFlags = parseDevFlags(process.argv)
const smokeMode = devFlags.autostart || devFlags.capture !== undefined || devFlags.dumpDom !== undefined || devFlags.ui !== undefined || devFlags.captureWindow !== undefined
const settings = new SettingsStore()
const engine = new LaunchEngine()

let launcherWindow: BrowserWindow | undefined

function createLauncherWindow(shape: LauncherWindow): BrowserWindow {
  /* Shape comes from settings (ratio + share of the work area), never a fixed box. */
  const { width, height } = sizeFor(shape, screen.getPrimaryDisplay().workAreaSize)

  const window = new BrowserWindow({
    width,
    height,
    minWidth: 960,
    minHeight: 540,
    center: true,
    show: false,
    /* Window/taskbar icon; packaged builds ship it via extraResources. */
    icon: app.isPackaged ? join(process.resourcesPath, 'app-icon.png') : join(app.getAppPath(), 'resources', 'icon.png'),
    backgroundColor: '#08090d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32'
      ? {
          /*
           * A transparent overlay keeps the native min/max/close buttons but lets
           * the wallpaper run underneath them. Without this the OS paints an
           * opaque rectangle in the top-right corner of an otherwise glass window.
           * `#RRGGBBAA` is an accepted format and supports transparency.
           */
          titleBarOverlay: { color: '#00000000', symbolColor: '#e6eaf5', height: 44 },
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      /* Sandboxed: the preload only needs ipcRenderer/contextBridge/webUtils, and
         all three work in a sandboxed preload — verified with a real file drop. */
      sandbox: true,
      /*
       * A launcher window that an OS-occluded browser window covers still has to
       * paint: Chromium otherwise throttles it, and both the visuals and the
       * `--capture` smoke frames go stale (they wait for a composited frame that
       * never comes).
       */
      backgroundThrottling: false,
    },
  })

  window.once('ready-to-show', () => { window.show() })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl !== undefined) void window.loadURL(rendererUrl)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))

  window.on('closed', () => { launcherWindow = undefined })
  return window
}

/** Re-apply the shape while running (the settings panel changes it live). */
function applyWindowShape(shape: LauncherWindow): void {
  if (launcherWindow === undefined || launcherWindow.isDestroyed()) return
  const { width, height } = sizeFor(shape, screen.getPrimaryDisplay().workAreaSize)
  const [currentWidth, currentHeight] = launcherWindow.getSize()
  if (currentWidth === width && currentHeight === height) return
  launcherWindow.setSize(width, height)
  launcherWindow.center()
}

/** Only hand http(s) URLs to the OS; never `file:` etc. */
function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Compare workspace paths; Windows paths are case-insensitive. */
function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/** Resolve the workspace to launch and start the child, handing the URL onward when configured. */
async function startLaunch(options?: StartOptions): Promise<LaunchStatus> {
  const current = await settings.get()
  const phase = engine.getStatus().phase
  if (phase === 'starting' || phase === 'ready') return engine.getStatus()

  const requested = options?.workspaceId === undefined
    ? current.workspaces[0]
    : current.workspaces.find((workspace) => workspace.id === options.workspaceId || samePath(workspace.path, options.workspaceId ?? ''))
  const home = app.getPath('home')
  const workspace = requested ?? { id: 'home', name: home, path: home }
  const status = await engine.start(current, workspace)
  if (status.phase === 'ready' && status.url !== undefined && current.openOnReady === 'external') {
    await shell.openExternal(status.url)
  }
  return status
}

function registerIpc(): void {
  ipcMain.handle(CHANNELS.settingsGet, async () => await settings.get())
  ipcMain.handle(CHANNELS.settingsSave, async (_event, next: LauncherSettings) => {
    const saved = await settings.save(next)
    applyWindowShape(saved.window)
    return saved
  })

  ipcMain.handle(CHANNELS.workspacePick, async (): Promise<WorkspaceEntry | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Choose a workspace for DSH' })
    const first = result.filePaths[0]
    if (result.canceled || first === undefined) return null
    const current = await settings.get()
    const known = current.workspaces.find((workspace) => samePath(workspace.path, first))
    const entry: WorkspaceEntry = {
      id: known?.id ?? first,
      name: known?.name ?? (first.split(/[\\/]/).filter(Boolean).pop() ?? first),
      path: first,
    }
    // Picked workspaces go to the front and are never duplicated.
    await settings.save({ ...current, workspaces: [entry, ...current.workspaces.filter((workspace) => !samePath(workspace.path, first))] })
    return entry
  })

  ipcMain.handle(CHANNELS.launchStart, async (_event, options: StartOptions | undefined) => await startLaunch(options))
  ipcMain.handle(CHANNELS.launchStop, async () => await engine.stop())
  ipcMain.handle(CHANNELS.launchStatus, () => engine.getStatus())

  /* Renderer-side clipboard is gated on a secure context; go through the OS. */
  ipcMain.handle(CHANNELS.clipboardWrite, (_event, text: unknown) => {
    if (typeof text === 'string' && text !== '') clipboard.writeText(text)
  })

  ipcMain.handle(CHANNELS.uiOpen, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isHttpUrl(url)) return
    await shell.openExternal(url)
  })

  ipcMain.handle(CHANNELS.backgroundPick, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: '选择背景图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
    })
    const first = result.filePaths[0]
    return result.canceled || first === undefined ? null : first
  })

  /*
   * The chosen path is stored as-is (the user asked for no copying), but the
   * renderer cannot read `file:` images from an `http:` dev origin, so main
   * hands back a size-capped JPEG data URL instead. 2560 px keeps a 4K photo
   * usable without pushing 30 MB of base64 over IPC.
   */
  ipcMain.handle(CHANNELS.backgroundLoad, async (_event, path: unknown): Promise<string | null> => {
    if (typeof path !== 'string' || path === '') return null
    /* Only the picture the user actually selected is readable. Without this the
       channel is an arbitrary-image-to-base64 gadget for a compromised renderer. */
    const current = await settings.get()
    if (current.background.imagePath === null || !samePath(current.background.imagePath, path)) return null
    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) return null
    const size = image.getSize()
    const scaled = size.width > 2560 ? image.resize({ width: 2560, quality: 'good' }) : image
    return `data:image/jpeg;base64,${scaled.toJPEG(82).toString('base64')}`
  })
}

/* Broadcast every transition/output chunk to the launcher renderer. */
engine.on('log', (chunk) => {
  if (launcherWindow === undefined || launcherWindow.isDestroyed()) return
  launcherWindow.webContents.send(CHANNELS.logEvent, chunk)
})
engine.on('status', (status) => {
  if (launcherWindow === undefined || launcherWindow.isDestroyed()) return
  launcherWindow.webContents.send(CHANNELS.statusEvent, status)
})

/* In smoke mode echo engine activity to stdout so a headless run is inspectable. */
if (smokeMode) {
  engine.on('log', (chunk) => {
    const text = chunk.data.replace(/\s+$/, '')
    if (text === '') return
    console.log(`smoke: ${chunk.stream}: ${text.slice(0, 400)}`)
  })
  engine.on('status', (status) => {
    const parts = [`phase=${status.phase}`]
    if (status.url !== undefined) parts.push(`url=${status.url}`)
    if (status.error !== undefined) parts.push(`error=${status.error}`)
    if (status.exitCode !== undefined) parts.push(`exitCode=${String(status.exitCode)}`)
    if (status.signal !== undefined && status.signal !== null) parts.push(`signal=${status.signal}`)
    console.log(`smoke: status ${parts.join(' ')}`)
  })
}

/** Fail a smoke-harness step instead of hanging the whole run. */
async function withTimeout<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new Error(`${label} timed out after ${String(milliseconds)}ms`)) }, milliseconds)
  })
  try {
    return await Promise.race([promise, deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Unattended smoke run: preload state, optionally launch, then dump DOM and/or capture a frame. */
async function runSmoke(window: BrowserWindow): Promise<void> {
  if (devFlags.autostart) {
    try {
      const status = await startLaunch()
      console.log(`smoke: launch phase=${status.phase}${status.url === undefined ? '' : ` url=${status.url}`}${status.error === undefined ? '' : ` error=${status.error}`}`)
    } catch (error) {
      console.error('smoke: launch failed', error)
    }
  }

  await new Promise((resolve) => { setTimeout(resolve, devFlags.delay) })

  /*
   * The click runs *after* the settle delay: at `did-finish-load` the renderer
   * has not read settings yet, so controls that depend on them are still
   * disabled and a click would be swallowed. `--ui a,b` clicks in order, which
   * is enough to open the drawer and then expand a section inside it.
   */
  if (devFlags.ui !== undefined) {
    for (const action of devFlags.ui.split(',').filter((part) => part !== '')) {
      const selector = `[data-action="${action}"]`
      await withTimeout(
        window.webContents.executeJavaScript(
          `(() => {
             const el = document.querySelector('${selector}')
             if (el === null) return false
             el.click()
             el.scrollIntoView({ block: 'center' })
             return true
           })()`,
        ) as Promise<unknown>,
        8_000,
        `ui click ${action}`,
      )
        .then((hit) => { console.log(`smoke: clicked ${selector} hit=${String(hit)}`) })
        .catch((error: unknown) => { console.error(`smoke: ui click ${action} failed`, error) })
      // Let the transition (drawer slide, section expand) finish.
      await new Promise((resolve) => { setTimeout(resolve, 420) })
    }
  }

  if (devFlags.dumpDom !== undefined) {
    const dumpTarget = devFlags.dumpDom
    const text = await withTimeout(
      window.webContents.executeJavaScript('document.body.innerText') as Promise<string>,
      8_000,
      'DOM dump',
    ).catch((error: unknown) => {
      console.error('smoke: DOM dump failed', error)
      return ''
    })
    await mkdir(dirname(dumpTarget), { recursive: true })
    await writeFile(dumpTarget, text.slice(0, 64_000), 'utf8')
    console.log(`dumped DOM text to ${dumpTarget}`)
  }
  if (devFlags.capture !== undefined) {
    const captureFile = devFlags.capture
    const image = await withTimeout(window.webContents.capturePage(), 15_000, 'frame capture').catch((error: unknown) => {
      console.error('smoke: frame capture failed', error)
      return undefined
    })
    if (image !== undefined) {
      await mkdir(dirname(captureFile), { recursive: true })
      await writeFile(captureFile, image.toPNG())
      console.log(`captured ${captureFile}`)
    }
  }

  /*
   * `capturePage` renders the web contents only, so the OS window-controls strip
   * is invisible to it. A desktopCapturer window thumbnail is the composited
   * window and does include that strip — the only way to catch a black overlay.
   */
  if (devFlags.captureWindow !== undefined) {
    const shotFile = devFlags.captureWindow
    let mediaId: string | undefined
    try {
      mediaId = window.getMediaSourceId()
    } catch {
      mediaId = undefined
    }
    const shot = await withTimeout(
      desktopCapturer
        .getSources({ types: ['window'], thumbnailSize: { width: 2600, height: 1800 } })
        .then((sources) => {
          const own = sources.find((source) => source.id === mediaId) ?? sources.find((source) => source.name === window.getTitle())
          return own?.thumbnail ?? null
        }),
      15_000,
      'window capture',
    ).catch((error: unknown) => {
      console.error('smoke: window capture failed', error)
      return null
    })
    if (shot !== null && shot !== undefined && !shot.isEmpty()) {
      await mkdir(dirname(shotFile), { recursive: true })
      await writeFile(shotFile, shot.toPNG())
      console.log(`captured window ${shotFile}`)
    } else {
      console.error('smoke: window capture produced no image')
    }
  }

  if (devFlags.quitWhileRunning) {
    // Deliberately leave the child alive: `before-quit` below must stop it.
    console.log('smoke: quitting while dsh is running (before-quit shutdown path)')
    app.quit()
    return
  }

  const stopped = await engine.stop()
  console.log(`smoke: stopped phase=${stopped.phase} exitCode=${String(stopped.exitCode)} signal=${String(stopped.signal ?? 'null')}`)
  app.quit()
}

/*
 * One launcher per machine: two instances would spawn two `dsh` children and
 * race on the same settings.json.
 */
/* Smoke runs must not be blocked by a launcher the developer already has open. */
const hasSingleInstanceLock = smokeMode ? true : app.requestSingleInstanceLock()

app.on('second-instance', () => {
  if (launcherWindow === undefined || launcherWindow.isDestroyed()) return
  if (launcherWindow.isMinimized()) launcherWindow.restore()
  launcherWindow.focus()
})

/** Deny every renderer capability the launcher does not use. */
function hardenSession(): void {
  const allowed = new Set(smokeMode ? ['media', 'display-capture'] : [])
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowed.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed.has(permission))
}

/**
 * The renderer only ever shows local files, so any navigation or new window is
 * either a bug or an attempt to escape: refuse it, and hand http(s) URLs to the
 * user's real browser instead of an Electron window.
 */
function hardenWebContents(contents: Electron.WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

if (hasSingleInstanceLock) void app.whenReady().then(async () => {
  registerIpc()
  hardenSession()
  app.on('web-contents-created', (_event, contents) => { hardenWebContents(contents) })
  const current = await settings.get()
  launcherWindow = createLauncherWindow(current.window)

  if (smokeMode) {
    launcherWindow.webContents.once('did-finish-load', () => {
      runSmoke(launcherWindow as BrowserWindow).catch((error: unknown) => {
        console.error('smoke: failed', error)
        void engine.stop().finally(() => { app.exit(1) })
      })
    })
  }
})

if (!hasSingleInstanceLock) app.quit()

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/*
 * Never leave the dsh child running after the launcher goes away.
 *
 * `event.preventDefault()` once is essential: the quit must wait for
 * `engine.stop()` (graceful → force tree kill on Windows) before the Electron
 * process exits, otherwise the shutdown race leaves `node bin.js web` orphans
 * behind. The second `app.quit()` re-enters with `shutdownStarted === true` and
 * is allowed through.
 */
let shutdownStarted = false
app.on('before-quit', (event) => {
  if (shutdownStarted) return
  event.preventDefault()
  shutdownStarted = true
  void engine.stop().finally(() => {
    const status = engine.getStatus()
    console.log(`shutdown: dsh phase=${status.phase} exitCode=${String(status.exitCode)} signal=${String(status.signal ?? 'null')}`)
    app.quit()
  })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void settings.get().then((current) => { launcherWindow = createLauncherWindow(current.window) })
  }
})
