import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ForeignItem } from '@shared/types'
import { useStore } from '../store'
import { bytes, q } from '../lib/format'
import { Progress } from './common'

const key = (i: ForeignItem): string => `${i.root}:${i.path}`

function groupOf(i: ForeignItem): string {
  if (i.root === 'gta') return 'GTA V'
  return `FiveM › ${i.path.split('/')[0]}`
}

export function Cleanup() {
  const { overview, task, run } = useStore()
  const [items, setItems] = useState<ForeignItem[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [cache, setCache] = useState<{ size: number } | null | undefined>(undefined)

  const scan = useCallback(async () => {
    const list = (await run(() => window.api.scanForeign())) ?? []
    setItems(list)
    setSelected(new Set(list.filter((i) => i.recommended).map(key)))
    setCache(undefined)
    setCache((await run(() => window.api.cacheInfo())) ?? null)
  }, [run])

  // Analyse à l'ouverture et après chaque opération.
  useEffect(() => {
    if (!task) void scan()
  }, [task, scan])

  const mods = useMemo(() => (items ?? []).filter((i) => i.category !== 'screenshot' && i.category !== 'log'), [items])
  const shots = useMemo(() => (items ?? []).filter((i) => i.category === 'screenshot'), [items])
  const groups = useMemo(() => {
    const g = new Map<string, ForeignItem[]>()
    for (const i of mods) g.set(groupOf(i), [...(g.get(groupOf(i)) ?? []), i])
    return [...g.entries()]
  }, [mods])

  const sel = mods.filter((i) => selected.has(key(i)))
  const toggle = (list: ForeignItem[], on: boolean): void => {
    const n = new Set(selected)
    for (const i of list) {
      if (on) n.add(key(i))
      else n.delete(key(i))
    }
    setSelected(n)
  }
  const mine = (target: string) => (task && task.detail === target ? task : null)

  const clearCache = async (): Promise<void> => {
    const ok = await window.api.confirm('Vider le cache de FiveM ?', 'FiveM le reconstruira au prochain lancement. Les fichiers du jeu téléchargés et vos réglages sont conservés.', 'Vider')
    if (ok) await run(() => window.api.clearCache())
  }
  const shotsSize = shots.reduce((s, i) => s + i.size, 0)
  const trashShots = async (): Promise<void> => {
    const ok = await window.api.confirm(
      `Supprimer ${shots.length} capture${shots.length > 1 ? 's' : ''} d’écran\u00a0?`,
      `${bytes(shotsSize)} seront mis à la corbeille de Windows.`,
      'Supprimer'
    )
    if (ok) await run(() => window.api.trashScreenshots())
  }

  // Remise d'origine du jeu : pack installé + mods installés à la main.
  const active = overview?.state.active ?? null
  const recommended = mods.filter((i) => i.recommended)
  const nothingToClean = !active && !recommended.length
  const cleanSummary = [
    active ? `le pack ${q(active.packName)}` : null,
    recommended.length ? `${recommended.length} mod${recommended.length > 1 ? 's' : ''} installé${recommended.length > 1 ? 's' : ''} à la main` : null
  ]
    .filter(Boolean)
    .join(' et ')
  const cleanGame = async (): Promise<void> => {
    const ok = await window.api.confirm(
      'Remettre le jeu d’origine\u00a0?',
      `Retire ${cleanSummary}. Les mods installés à la main sont rangés dans un pack « Ancienne installation », réinstallable à tout moment. Les captures d’écran ne sont pas touchées.`,
      'Nettoyer le jeu'
    )
    if (ok) await run(() => window.api.cleanGame())
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Nettoyage</h1>
        <div className="spacer" />
        <button onClick={() => void scan()} disabled={!!task}>
          Actualiser
        </button>
      </header>

      <ul className="list">
        <li className="row">
          <div className="row-main">
            <div className="name">Remettre le jeu d’origine</div>
            <div className="meta">{items === null ? 'Analyse…' : nothingToClean ? 'Aucun mod graphique installé.' : `Retire ${cleanSummary}.`}</div>
          </div>
          {mine('game') ? (
            <Progress task={mine('game')!} />
          ) : (
            <div className="actions">
              <button onClick={() => void cleanGame()} disabled={!!task || nothingToClean || items === null}>
                Nettoyer le jeu
              </button>
            </div>
          )}
        </li>
      </ul>

      <div className="section-head">
        <h2>Mods installés à la main</h2>
      </div>
      {items === null ? (
        <p className="empty">Analyse…</p>
      ) : !mods.length ? (
        <p className="empty">Aucun mod installé hors de l’application.</p>
      ) : (
        <>
          <ul className="list">
            {groups.map(([label, list]) => (
              <li key={label} className="group">
                <label className="row group-head">
                  <input type="checkbox" checked={list.every((i) => selected.has(key(i)))} onChange={(e) => toggle(list, e.target.checked)} />
                  <span className="name">{label}</span>
                  <span className="meta right">
                    {list.length} élément{list.length > 1 ? 's' : ''} · {bytes(list.reduce((s, i) => s + i.size, 0))}
                  </span>
                </label>
                {list.map((i) => (
                  <label key={key(i)} className="row item">
                    <input type="checkbox" checked={selected.has(key(i))} onChange={(e) => toggle([i], e.target.checked)} />
                    <span className="item-path">{i.root === 'fivem' ? i.path.split('/').slice(1).join('/') : i.path}</span>
                    <span className="meta item-label">{i.label}</span>
                    <span className="meta right">{i.isDir ? `${i.fileCount} fichier${i.fileCount > 1 ? 's' : ''} · ` : ''}{bytes(i.size)}</span>
                  </label>
                ))}
              </li>
            ))}
          </ul>
          <div className="section-actions">
            {mine('foreign') ? (
              <Progress task={mine('foreign')!} />
            ) : (
              <>
                <span className="meta">
                  {sel.length} sélectionné{sel.length > 1 ? 's' : ''} · {bytes(sel.reduce((s, i) => s + i.size, 0))}
                </span>
                <button onClick={() => void run(() => window.api.stashForeign(sel.map((i) => ({ root: i.root, path: i.path, isDir: i.isDir }))))} disabled={!sel.length || !!task}>
                  Ranger dans un pack
                </button>
              </>
            )}
          </div>
          <p className="hint">Les éléments rangés quittent le jeu et deviennent un pack de la liste, réinstallable à tout moment.</p>
        </>
      )}

      {shots.length > 0 && (
        <>
          <div className="section-head">
            <h2>Captures d’écran ReShade</h2>
          </div>
          <ul className="list">
            <li className="row">
              <div className="row-main">
                <div className="name">
                  {shots.length} capture{shots.length > 1 ? 's' : ''} dans le dossier plugins
                </div>
                <div className="meta">{bytes(shotsSize)}</div>
              </div>
              {mine('screenshots') ? (
                <Progress task={mine('screenshots')!} />
              ) : (
                <div className="actions">
                  <button onClick={() => void run(() => window.api.openScreenshots('plugins'))}>Ouvrir</button>
                  <button onClick={() => void run(() => window.api.moveScreenshots())} disabled={!!task} title="Vers Images\FiveM">
                    Déplacer dans Images
                  </button>
                  <button onClick={() => void trashShots()} disabled={!!task}>
                    Supprimer
                  </button>
                </div>
              )}
            </li>
          </ul>
        </>
      )}

      {overview?.games.fivem.valid && (
        <>
          <div className="section-head">
            <h2>Cache de FiveM</h2>
          </div>
          <ul className="list">
            <li className="row">
              <div className="row-main">
                <div className="name">{cache === undefined ? 'Calcul…' : cache?.size ? bytes(cache.size) : 'Vide'}</div>
                <div className="meta">Les fichiers du jeu téléchargés et vos réglages ne sont pas touchés.</div>
              </div>
              {mine('cache') ? (
                <Progress task={mine('cache')!} />
              ) : (
                <div className="actions">
                  <button onClick={() => void clearCache()} disabled={!!task || !cache?.size}>
                    Vider
                  </button>
                </div>
              )}
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
