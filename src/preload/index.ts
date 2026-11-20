import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CHANNELS, CONTRACT_VERSION, type LauncherBridge, type LogChunk, type LaunchStatus } from '@shared/contract'

/** The concrete bridge the renderer sees as `window.dshStarter`. */
const bridge: LauncherBridge = {
  version: CONTRACT_VERSION,
  getSettings: async () => await ipcRenderer.invoke(CHANNELS.settingsGet),
  saveSettings: async (next) => await ipcRenderer.invoke(CHANNELS.settingsSave, next),
  pickWorkspace: async () => await ipcRenderer.invoke(CHANNELS.workspacePick),
  start: async (options) => await ipcRenderer.invoke(CHANNELS.launchStart, options),
  stop: async () => await ipcRenderer.invoke(CHANNELS.launchStop),
  getStatus: async () => await ipcRenderer.invoke(CHANNELS.launchStatus),
  openUi: async (url) => { await ipcRenderer.invoke(CHANNELS.uiOpen, url) },
  pickBackgroundImage: async () => await ipcRenderer.invoke(CHANNELS.backgroundPick),
  loadBackgroundImage: async (path) => await ipcRenderer.invoke(CHANNELS.backgroundLoad, path),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  writeClipboard: async (text) => { await ipcRenderer.invoke(CHANNELS.clipboardWrite, text) },
  onLog: (listener: (chunk: LogChunk) => void) => {
    const handler = (_event: unknown, chunk: LogChunk): void => { listener(chunk) }
    ipcRenderer.on(CHANNELS.logEvent, handler)
    return () => { ipcRenderer.removeListener(CHANNELS.logEvent, handler) }
  },
  onStatus: (listener: (status: LaunchStatus) => void) => {
    const handler = (_event: unknown, status: LaunchStatus): void => { listener(status) }
    ipcRenderer.on(CHANNELS.statusEvent, handler)
    return () => { ipcRenderer.removeListener(CHANNELS.statusEvent, handler) }
  },
}

contextBridge.exposeInMainWorld('dshStarter', bridge)
