import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LaunchStatus, LauncherSettings, WorkspaceEntry } from '@shared/contract'
import { messageOf } from '../lib/errors'
import { publishLog } from '../lib/logHub'

/** Remembers the last chosen card between launches of the launcher itself. */
const SELECTED_KEY = 'dsh-starter:selected-workspace'

/** How long a transient IPC notice stays on screen. */
const NOTICE_TTL_MS = 6_000

export interface LauncherController {
  /** `undefined` until the first settings read resolves. */
  settings: LauncherSettings | undefined
  status: LaunchStatus
  /** Whether `status` is a real snapshot yet (avoids announcing stale idle). */
  statusKnown: boolean
  selected: WorkspaceEntry | undefined
  /** Transient IPC failure shown as a dismissible notice (not a launch failure). */
  notice: string | undefined
  picking: boolean
  saving: boolean
  select(workspaceId: string): void
  addWorkspace(): Promise<void>
  start(workspaceId?: string): Promise<void>
  stop(): Promise<void>
  openUi(): Promise<void>
  saveSettings(next: LauncherSettings): Promise<LauncherSettings>
  dismissNotice(): void
}

/**
 * Owns the renderer-side view of the bridge: settings, launch status, the
 * selected workspace card, and the actions the UI can invoke.
 */
export function useLauncher(): LauncherController {
  const [settings, setSettings] = useState<LauncherSettings>()
  const [status, setStatus] = useState<LaunchStatus>({ phase: 'idle' })
  const [statusKnown, setStatusKnown] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | undefined>(() => {
    try {
      const stored = window.localStorage.getItem(SELECTED_KEY)
      return stored === null ? undefined : stored
    } catch {
      return undefined
    }
  })

  const settingsRef = useRef<LauncherSettings | undefined>(undefined)
  settingsRef.current = settings
  const statusRef = useRef<LaunchStatus>(status)
  statusRef.current = status
  const selectedIdRef = useRef<string | undefined>(selectedId)
  selectedIdRef.current = selectedId
  /** Guards against a stale `getStatus` snapshot clobbering a newer event. */
  const sawStatusEvent = useRef(false)

  useEffect(() => {
    let alive = true

    const offStatus = window.dshStarter.onStatus((next) => {
      sawStatusEvent.current = true
      setStatus(next)
      setStatusKnown(true)
    })
    const offLog = window.dshStarter.onLog((chunk) => {
      publishLog(chunk)
    })

    void window.dshStarter
      .getSettings()
      .then((loaded) => {
        if (alive) setSettings(loaded)
      })
      .catch((error: unknown) => {
        if (alive) setNotice(`读取设置失败：${messageOf(error)}`)
      })

    void window.dshStarter
      .getStatus()
      .then((snapshot) => {
        if (!alive || sawStatusEvent.current) return
        setStatus(snapshot)
        setStatusKnown(true)
      })
      .catch((error: unknown) => {
        if (alive) setNotice(`读取启动状态失败：${messageOf(error)}`)
      })

    return () => {
      alive = false
      offStatus()
      offLog()
    }
  }, [])

  useEffect(() => {
    if (notice === undefined) return
    const timer = window.setTimeout(() => setNotice(undefined), NOTICE_TTL_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const select = useCallback((workspaceId: string) => {
    setSelectedId(workspaceId)
    try {
      window.localStorage.setItem(SELECTED_KEY, workspaceId)
    } catch {
      /* localStorage can be unavailable; selection still works for this session. */
    }
  }, [])

  const reloadSettings = useCallback(async () => {
    const loaded = await window.dshStarter.getSettings()
    setSettings(loaded)
    return loaded
  }, [])

  const selected = useMemo<WorkspaceEntry | undefined>(() => {
    const list = settings?.workspaces ?? []
    const requested = selectedId === undefined ? undefined : list.find((workspace) => workspace.id === selectedId)
    return requested ?? list[0]
  }, [settings, selectedId])

  const addWorkspace = useCallback(async () => {
    setPicking(true)
    try {
      const entry = await window.dshStarter.pickWorkspace()
      if (entry === null) return
      const loaded = await reloadSettings()
      const known = loaded.workspaces.some((workspace) => workspace.id === entry.id)
      select(known ? entry.id : (loaded.workspaces[0]?.id ?? entry.id))
    } catch (error) {
      setNotice(`添加工作区失败：${messageOf(error)}`)
    } finally {
      setPicking(false)
    }
  }, [reloadSettings, select])

  const start = useCallback(async (workspaceId?: string) => {
    const target = workspaceId ?? selectedIdRef.current ?? settingsRef.current?.workspaces[0]?.id
    try {
      const result = await window.dshStarter.start(target === undefined ? undefined : { workspaceId: target })
      setStatus(result)
      setStatusKnown(true)
      if (result.workspace !== undefined) select(result.workspace.id)
    } catch (error) {
      setNotice(`启动请求失败：${messageOf(error)}`)
    }
  }, [select])

  const stop = useCallback(async () => {
    try {
      const result = await window.dshStarter.stop()
      setStatus(result)
      setStatusKnown(true)
    } catch (error) {
      setNotice(`停止失败：${messageOf(error)}`)
    }
  }, [])

  const openUi = useCallback(async () => {
    const url = statusRef.current.url
    if (url === undefined) {
      setNotice('还没有可打开的地址：等 dsh 报告就绪之后再试。')
      return
    }
    try {
      await window.dshStarter.openUi(url)
    } catch (error) {
      setNotice(`打开浏览器失败：${messageOf(error)}`)
    }
  }, [])

  const saveSettings = useCallback(async (next: LauncherSettings) => {
    setSaving(true)
    try {
      const saved = await window.dshStarter.saveSettings(next)
      setSettings(saved)
      return saved
    } finally {
      setSaving(false)
    }
  }, [])

  const dismissNotice = useCallback(() => setNotice(undefined), [])

  return {
    settings,
    status,
    statusKnown,
    selected,
    notice,
    picking,
    saving,
    select,
    addWorkspace,
    start,
    stop,
    openUi,
    saveSettings,
    dismissNotice,
  }
}
