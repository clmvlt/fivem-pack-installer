import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { PackManagerApi } from '../shared/api'
import type { TaskProgress, UpdateState } from '../shared/types'

// Canaux dupliqués ici : un preload « sandbox » ne peut importer que le module electron.
const IPC = { invoke: 'pm:invoke', task: 'pm:task', changed: 'pm:changed', update: 'pm:update' }

const call =
  (method: string) =>
  (...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(IPC.invoke, method, args)

const methods = [
  'getOverview',
  'refreshGames',
  'setGamePath',
  'pickFolder',
  'pickArchives',
  'importPacks',
  'renamePack',
  'updatePack',
  'resetUserConfigs',
  'getComponentFiles',
  'setCover',
  'setCoverFromFile',
  'setReshadePreset',
  'deletePack',
  'openPackFolder',
  'applyPack',
  'removeActive',
  'stashForeign',
  'scanForeign',
  'cacheInfo',
  'clearCache',
  'moveScreenshots',
  'trashScreenshots',
  'openScreenshots',
  'cleanGame',
  'getGraphics',
  'saveGraphics',
  'restoreGraphics',
  'moveLibrary',
  'openPath',
  'packMenu',
  'confirm',
  'marketList',
  'marketTags',
  'marketDetail',
  'marketInstall',
  'openSite',
  'checkForUpdates',
  'installUpdate'
] as const

const api = Object.fromEntries(methods.map((m) => [m, call(m)])) as unknown as PackManagerApi

api.getPathForFile = (file: File) => webUtils.getPathForFile(file)
api.onTask = (cb: (p: TaskProgress) => void) => {
  const h = (_e: unknown, p: TaskProgress): void => cb(p)
  ipcRenderer.on(IPC.task, h)
  return () => ipcRenderer.removeListener(IPC.task, h)
}
api.onChanged = (cb: () => void) => {
  const h = (): void => cb()
  ipcRenderer.on(IPC.changed, h)
  return () => ipcRenderer.removeListener(IPC.changed, h)
}

api.onUpdate = (cb: (s: UpdateState) => void) => {
  const h = (_e: unknown, s: UpdateState): void => cb(s)
  ipcRenderer.on(IPC.update, h)
  return () => ipcRenderer.removeListener(IPC.update, h)
}

contextBridge.exposeInMainWorld('api', api)
