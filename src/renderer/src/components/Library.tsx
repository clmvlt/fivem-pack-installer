import { useMemo, useState, type MouseEvent } from 'react'
import type { PackManifest, RootId, TaskProgress } from '@shared/types'
import { useStore } from '../store'
import { bytes } from '../lib/format'
import { problemCount } from '../lib/insights'
import { Cover, packMenuAction, packMeta, Progress, RenameInput } from './common'

export function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const { overview, task, run } = useStore()
  const [query, setQuery] = useState('')
  const library = overview?.library
  const activeId = overview?.state.active?.packId ?? null

  const packs = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (library ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.features.some((f) => f.toLowerCase().includes(q)))
    return list.sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0))
  }, [library, query, activeId])

  if (!overview) return null
  const { games, state, foreign } = overview
  const build = games.fivem.buildNumber ? Number(games.fivem.buildNumber) : null

  const add = async (): Promise<void> => {
    const paths = await window.api.pickArchives()
    if (paths.length) await run(() => window.api.importPacks(paths))
  }
  const choose = async (which: RootId): Promise<void> => {
    const p = await window.api.pickFolder(which === 'fivem' ? 'Dossier FiveM.app' : 'Dossier de GTA V')
    if (p) await run(() => window.api.setGamePath(which, p))
  }

  const problems: { text: string; which: RootId }[] = []
  if (!games.fivem.valid) problems.push({ text: 'Dossier FiveM introuvable.', which: 'fivem' })
  if (!games.gta.valid) problems.push({ text: 'Dossier GTA V introuvable.', which: 'gta' })
  else if (games.gta.edition === 'enhanced') problems.push({ text: "Le dossier GTA V choisi est l'édition Enhanced, qui n'accepte pas les mods FiveM.", which: 'gta' })

  const importing = task?.kind === 'import' ? task : null
  const showForeign = !!foreign && !state.active && !query
  const empty = !(library ?? []).length && !showForeign && !importing

  return (
    <div className="page">
      <header className="page-head">
        <h1>Bibliothèque</h1>
        <span className="page-note">{(library ?? []).length ? `${library!.length} pack${library!.length > 1 ? 's' : ''} · ${bytes(library!.reduce((s, p) => s + p.contentSize, 0))}` : ''}</span>
        <div className="spacer" />
        {(library ?? []).length > 3 && <input className="search" type="search" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} />}
        <button className="primary" onClick={() => void add()} disabled={!!task}>
          Ajouter un pack…
        </button>
      </header>

      {problems.map((p) => (
        <div key={p.which} className="bar bar-warning">
          <span className="bar-text">{p.text}</span>
          <button onClick={() => void choose(p.which)}>Choisir le dossier…</button>
        </div>
      ))}

      {empty ? (
        <div className="empty-state">
          <p>Votre bibliothèque est vide.</p>
          <p className="muted">Glissez une archive .zip, .rar ou .7z dans cette fenêtre, ou utilisez « Ajouter un pack… ».</p>
        </div>
      ) : (
        <div className="grid">
          {importing && (
            <article className="card">
              <div className="cover">
                <div className="cover-empty">{importing.title.replace(/^Ajout de /, '')}</div>
              </div>
              <div className="card-body">
                <div className="name">{importing.title}</div>
                <div className="meta">{importing.phase || 'Préparation'}</div>
                <div className="card-foot">
                  <Progress task={importing} />
                </div>
              </div>
            </article>
          )}
          {showForeign && <ForeignCard files={foreign!.files} size={foreign!.size} task={task} />}
          {packs.map((p) => (
            <PackCard
              key={p.id}
              pack={p}
              active={p.id === activeId}
              partial={p.id === activeId && !!state.active?.partial}
              problems={problemCount(p, build)}
              update={overview.market.updates.includes(p.id)}
              task={task}
              onOpen={() => onOpen(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PackCard({
  pack,
  active,
  partial,
  problems,
  update,
  task,
  onOpen
}: {
  pack: PackManifest
  active: boolean
  partial: boolean
  problems: number
  update: boolean
  task: TaskProgress | null
  onOpen: () => void
}) {
  const { run } = useStore()
  const [renaming, setRenaming] = useState(false)
  const mine = task && task.detail === pack.id ? task : null

  const menu = async (e?: MouseEvent): Promise<void> => {
    e?.preventDefault()
    e?.stopPropagation()
    if (await packMenuAction(pack, run)) setRenaming(true)
  }

  return (
    <article className={`card clickable ${active ? 'is-active' : ''}`} onClick={onOpen} onContextMenu={(e) => void menu(e)}>
      <div className="cover">
        <Cover pack={pack} />
      </div>
      <div className="card-body">
        {renaming ? <RenameInput pack={pack} onDone={() => setRenaming(false)} /> : <div className="name" title={pack.name}>{pack.name}</div>}
        <div className="meta">{packMeta(pack)}</div>
        <div className="card-foot" onClick={(e) => e.stopPropagation()}>
          {mine ? (
            <Progress task={mine} />
          ) : (
            <>
              {active ? (
                <span className="state">{partial ? 'Retrait incomplet' : 'Installé'}</span>
              ) : update ? (
                <span className="accent-text small">Nouvelle version</span>
              ) : problems > 0 ? (
                <span className="warn-text small">
                  {problems} point{problems > 1 ? 's' : ''} à vérifier
                </span>
              ) : null}
              <div className="spacer" />
              {active ? (
                <button onClick={() => void run(() => window.api.removeActive())} disabled={!!task}>
                  Retirer
                </button>
              ) : (
                <button onClick={() => void run(() => window.api.applyPack(pack.id))} disabled={!!task}>
                  Installer
                </button>
              )}
              <button className="more" onClick={(e) => void menu(e)} aria-label="Plus d’options" title="Plus d’options">
                ⋯
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function ForeignCard({ files, size, task }: { files: number; size: number; task: TaskProgress | null }) {
  const { run } = useStore()
  const mine = task && task.detail === 'foreign' ? task : null
  return (
    <article className="card is-active">
      <div className="cover">
        <div className="cover-empty">Mods installés à la main</div>
      </div>
      <div className="card-body">
        <div className="name">Mods installés à la main</div>
        <div className="meta">
          {files} fichier{files > 1 ? 's' : ''} · {bytes(size)}
        </div>
        <div className="card-foot">
          {mine ? (
            <Progress task={mine} />
          ) : (
            <>
              <span className="state">Installé</span>
              <div className="spacer" />
              <button onClick={() => void run(() => window.api.stashForeign())} disabled={!!task} title="Les ranger dans un pack « Ancienne installation »">
                Retirer
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  )
}
