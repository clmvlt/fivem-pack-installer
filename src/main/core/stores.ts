import path from 'node:path'
import type { AppState, HistoryEntry, Settings } from '@shared/types'
import { readJson, writeJsonAtomic } from '../util/fsx'

export class JsonStore<T> {
  private value: T
  constructor(
    private file: string,
    initial: T
  ) {
    this.value = initial
  }
  async load(fallback: T): Promise<T> {
    this.value = { ...fallback, ...(await readJson<Partial<T>>(this.file, {})) } as T
    return this.value
  }
  get(): T {
    return this.value
  }
  async set(v: T): Promise<void> {
    this.value = v
    await writeJsonAtomic(this.file, v)
  }
  async patch(p: Partial<T>): Promise<T> {
    await this.set({ ...this.value, ...p })
    return this.value
  }
}

export function defaultSettings(dataDir: string): Settings {
  return {
    libraryDir: path.join(dataDir, 'Bibliotheque'),
    fivemPath: null,
    gtaPath: null
  }
}

export const emptyState = (): AppState => ({ schema: 1, active: null, history: [] })

export function pushHistory(state: AppState, e: Omit<HistoryEntry, 'at'>): AppState {
  const history = [{ ...e, at: new Date().toISOString() }, ...state.history].slice(0, 200)
  return { ...state, history }
}
