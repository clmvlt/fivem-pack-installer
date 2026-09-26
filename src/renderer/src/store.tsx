import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { Overview, TaskProgress, UpdateState } from '@shared/types'
import { q } from './lib/format'

export interface Message {
  kind: 'error' | 'info'
  text: string
}

interface Store {
  overview: Overview | null
  refresh: () => Promise<void>
  task: TaskProgress | null
  /** Mise à jour de l'application. */
  update: UpdateState | null
  message: Message | null
  setMessage: (m: Message | null) => void
  /** Appelle l'API ; une erreur s'affiche dans la barre de message. */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }): ReactElement {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [task, setTask] = useState<TaskProgress | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const lastTask = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const o = await window.api.getOverview()
      setOverview(o)
      setUpdate((u) => u ?? o.update)
    } catch (e) {
      setMessage({ kind: 'error', text: cleanError(e) })
    }
  }, [])

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn()
    } catch (e) {
      setMessage({ kind: 'error', text: cleanError(e) })
      return undefined
    }
  }, [])

  useEffect(() => {
    void refresh()
    const offChanged = window.api.onChanged(() => void refresh())
    const offUpdate = window.api.onUpdate(setUpdate)
    const offTask = window.api.onTask((p) => {
      if (!p.done) {
        // Nouvelle action : l'ancien message n'a plus lieu d'être.
        if (lastTask.current !== p.taskId) setMessage(null)
        lastTask.current = p.taskId
        setTask(p)
        return
      }
      setTask(null)
      if (!p.ok) setMessage({ kind: 'error', text: p.error ?? 'Échec.' })
      else {
        const info = resultMessage(p)
        if (info) setMessage(info)
      }
    })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F5') void window.api.refreshGames()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offChanged()
      offTask()
      offUpdate()
      window.removeEventListener('keydown', onKey)
    }
  }, [refresh])

  // Les messages disparaissent seuls (un peu plus tard pour une erreur, le temps de la lire).
  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), message.kind === 'error' ? 10000 : 7000)
    return () => window.clearTimeout(t)
  }, [message])

  // Couleur d'accent de Windows
  useEffect(() => {
    if (overview?.accent) document.documentElement.style.setProperty('--accent', overview.accent)
  }, [overview?.accent])

  const value = useMemo<Store>(() => ({ overview, refresh, task, update, message, setMessage, run }), [overview, refresh, task, update, message, run])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider manquant')
  return s
}

export function cleanError(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e)
  // Les erreurs IPC sont préfixées par « Error invoking remote method 'pm:invoke': Error: ».
  return msg.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}

function resultMessage(p: TaskProgress): Message | null {
  if (p.kind === 'download') {
    const d = (p.result ?? {}) as { name?: string; status?: string; note?: string }
    if (d.note) return { kind: 'info', text: d.note }
    const name = q(d.name ?? 'Le pack')
    if (d.status === 'updated') return { kind: 'info', text: `${name} est à jour.` }
    if (d.status === 'linked') return { kind: 'info', text: `${name} était déjà dans la bibliothèque : il est maintenant relié à la Marketplace.` }
    if (d.status === 'up-to-date') return { kind: 'info', text: `${name} est déjà à jour.` }
    return { kind: 'info', text: `${name} est dans la bibliothèque.` }
  }
  const r = (p.result ?? {}) as { captured?: string | null; errors?: string[] }
  if (p.kind === 'clean')
    return { kind: 'info', text: r.captured ? `Jeu remis d’origine. Vos mods sont rangés dans ${q(r.captured)}.` : 'Jeu remis d’origine.' }
  if ((p.kind === 'apply' || p.kind === 'stash') && r.captured)
    return { kind: 'info', text: `Vos anciens mods sont rangés dans ${q(r.captured)}. Installez-le pour les retrouver.` }
  if (p.kind === 'import' && r.errors?.length) return { kind: 'error', text: r.errors.join('\n') }
  return null
}
