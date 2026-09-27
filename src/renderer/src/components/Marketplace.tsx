import { useCallback, useEffect, useState } from 'react'
import type { MarketPack, MarketPackDetail, MarketPage, MarketTag, PackManifest, TaskProgress } from '@shared/types'
import type { MarketQuery } from '@shared/api'
import { cleanError, useStore } from '../store'
import { bytes, marketImageUrl } from '../lib/format'
import { Gallery } from './Gallery'
import { Markdown } from './Markdown'
import { Progress } from './common'

/** État d'un pack de la Marketplace par rapport à la bibliothèque. */
function localState(item: { id: string; sha256: string }, library: PackManifest[]): { local: PackManifest | null; update: boolean } {
  // Deux versions présentes (mise à jour pas encore installée) : la plus récente fait foi.
  const matches = library.filter((p) => p.marketplace?.id === item.id).sort((a, b) => b.marketplace!.downloadedAt.localeCompare(a.marketplace!.downloadedAt))
  const local = matches[0] ?? null
  return { local, update: !!local && !!item.sha256 && local.marketplace!.sha256 !== item.sha256 }
}

export function Marketplace({ openId, onOpen, onOpenLocal }: { openId: string | null; onOpen: (id: string | null) => void; onOpenLocal: (id: string) => void }) {
  if (openId) return <MarketDetail id={openId} onBack={() => onOpen(null)} onOpenLocal={onOpenLocal} />
  return <MarketList onOpen={onOpen} onOpenLocal={onOpenLocal} />
}

function MarketList({ onOpen, onOpenLocal }: { onOpen: (id: string) => void; onOpenLocal: (id: string) => void }) {
  const { overview, task } = useStore()
  const [query, setQuery] = useState<MarketQuery>({ sort: 'recent', page: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState<MarketPage | null>(null)
  const [tags, setTags] = useState<MarketTag[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (q: MarketQuery) => {
    setLoading(true)
    try {
      setPage(await window.api.marketList(q))
      setError(null)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(query)
  }, [query, load])

  useEffect(() => {
    window.api.marketTags().then(setTags, () => setTags([]))
  }, [])

  // Recherche lancée 300 ms après la dernière frappe.
  useEffect(() => {
    if (search === (query.q ?? '')) return
    const t = setTimeout(() => setQuery((q) => ({ ...q, q: search, page: 0 })), 300)
    return () => clearTimeout(t)
  }, [search, query.q])

  if (!overview) return null

  return (
    <div className="page">
      <header className="page-head">
        <h1>Marketplace</h1>
        <span className="page-note">{page ? `${page.total} pack${page.total > 1 ? 's' : ''}` : ''}</span>
        <div className="spacer" />
        <input className="search" type="search" placeholder="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={query.sort} onChange={(e) => setQuery({ ...query, sort: e.target.value as MarketQuery['sort'], page: 0 })} aria-label="Trier">
          <option value="recent">Plus récents</option>
          <option value="popular">Plus téléchargés</option>
          <option value="name">Nom</option>
        </select>
      </header>

      {tags.length > 1 && (
        <div className="chips">
          <button className={`chip ${query.tag ? '' : 'is-selected'}`} onClick={() => setQuery({ ...query, tag: undefined, page: 0 })}>
            Tous
          </button>
          {tags.map((t) => (
            <button key={t.tag} className={`chip ${query.tag === t.tag ? 'is-selected' : ''}`} onClick={() => setQuery({ ...query, tag: query.tag === t.tag ? undefined : t.tag, page: 0 })}>
              {t.tag}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div className="empty-state">
          <p>{error}</p>
          <p>
            <button onClick={() => void load(query)}>Réessayer</button>
          </p>
        </div>
      ) : !page ? (
        loading && <p className="muted">Chargement…</p>
      ) : page.items.length === 0 ? (
        <div className="empty-state">
          <p>{query.q || query.tag ? 'Aucun pack ne correspond à cette recherche.' : 'Aucun pack publié pour le moment.'}</p>
        </div>
      ) : (
        <>
          <div className="grid">
            {page.items.map((item) => (
              <MarketCard key={item.id} item={item} library={overview.library} task={task} onOpen={() => onOpen(item.id)} onOpenLocal={onOpenLocal} />
            ))}
          </div>
          {page.totalPages > 1 && (
            <div className="pager">
              <button disabled={(query.page ?? 0) === 0} onClick={() => setQuery({ ...query, page: (query.page ?? 0) - 1 })}>
                Précédent
              </button>
              <span className="muted">
                Page {(query.page ?? 0) + 1} sur {page.totalPages}
              </span>
              <button disabled={(query.page ?? 0) + 1 >= page.totalPages} onClick={() => setQuery({ ...query, page: (query.page ?? 0) + 1 })}>
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MarketCard({
  item,
  library,
  task,
  onOpen,
  onOpenLocal
}: {
  item: MarketPack
  library: PackManifest[]
  task: TaskProgress | null
  onOpen: () => void
  onOpenLocal: (id: string) => void
}) {
  const [failed, setFailed] = useState(false)
  const mine = task?.kind === 'download' && task.detail === item.id ? task : null
  return (
    <article className="card clickable" onClick={onOpen}>
      <div className="cover">
        {item.cover && !failed ? (
          <img className="cover-img" src={marketImageUrl(item.id, item.cover.id, true)} alt="" draggable={false} onError={() => setFailed(true)} />
        ) : (
          <div className="cover-empty">{item.name}</div>
        )}
      </div>
      <div className="card-body">
        <div className="name" title={item.name}>
          {item.name}
        </div>
        <div className="meta">{[item.author, item.tags.slice(0, 3).join(', '), bytes(item.archiveSize)].filter(Boolean).join(' · ')}</div>
        <div className="card-foot" onClick={(e) => e.stopPropagation()}>
          {mine ? <Progress task={mine} /> : <MarketAction item={item} library={library} task={task} onOpenLocal={onOpenLocal} />}
        </div>
      </div>
    </article>
  )
}

/** Télécharger / Mettre à jour / Dans la bibliothèque. */
function MarketAction({
  item,
  library,
  task,
  onOpenLocal,
  wide = false
}: {
  item: { id: string; sha256: string }
  library: PackManifest[]
  task: TaskProgress | null
  onOpenLocal: (id: string) => void
  wide?: boolean
}) {
  const { run } = useStore()
  const { local, update } = localState(item, library)
  const install = (): void => void run(() => window.api.marketInstall(item.id))
  if (local && !update)
    return (
      <>
        <span className="state">Dans la bibliothèque</span>
        <div className="spacer" />
        <button className={wide ? 'wide' : ''} onClick={() => onOpenLocal(local.id)}>
          Ouvrir
        </button>
      </>
    )
  return (
    <>
      {update && !wide && <span className="accent-text small">Nouvelle version</span>}
      <div className="spacer" />
      <button className={`primary ${wide ? 'wide' : ''}`} onClick={install} disabled={!!task}>
        {update ? 'Mettre à jour' : 'Télécharger'}
      </button>
    </>
  )
}

function MarketDetail({ id, onBack, onOpenLocal }: { id: string; onBack: () => void; onOpenLocal: (id: string) => void }) {
  const { overview, task, run } = useStore()
  const [pack, setPack] = useState<MarketPackDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setPack(await window.api.marketDetail(id))
      setError(null)
    } catch (e) {
      setError(cleanError(e))
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (!overview) return null
  const back = (
    <div className="back-row">
      <button className="link" onClick={onBack}>
        ‹ Marketplace
      </button>
    </div>
  )
  if (error)
    return (
      <div className="page">
        {back}
        <div className="empty-state">
          <p>{error}</p>
          <p>
            <button onClick={() => void load()}>Réessayer</button>
          </p>
        </div>
      </div>
    )
  if (!pack)
    return (
      <div className="page">
        {back}
        <p className="muted">Chargement…</p>
      </div>
    )

  const mine =task?.kind === 'download' && task.detail === pack.id ? task : null
  const { update } = localState(pack, overview.library)
  const date = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

  return (
    <div className="page">
      {back}
      <div className="store">
        <Gallery
          key={pack.id}
          images={pack.images.map((image) => image.id)}
          youtubeId={pack.youtubeId}
          image={(imageId) => <img className="cover-img contain" src={marketImageUrl(pack.id, imageId)} alt="" draggable={false} />}
          thumb={(imageId) => marketImageUrl(pack.id, imageId, true)}
          empty={<div className="cover-empty">{pack.name}</div>}
        />

        <aside className="side">
          <h1 className="pack-title">{pack.name}</h1>
          {pack.author && <div className="tags">par {pack.author}</div>}
          {pack.summary && <p className="summary">{pack.summary}</p>}
          <div className="side-actions row-actions">
            {mine ? <Progress task={mine} /> : <MarketAction item={pack} library={overview.library} task={task} onOpenLocal={onOpenLocal} wide />}
          </div>
          {update && !mine && <p className="hint">Une nouvelle version est en ligne. Vos réglages et votre preset ReShade sont conservés.</p>}
          <dl className="facts">
            <dt>Taille</dt>
            <dd>{bytes(pack.archiveSize)}</dd>
            {pack.version && (
              <>
                <dt>Version</dt>
                <dd>{pack.version}</dd>
              </>
            )}
            <dt>Mis à jour le</dt>
            <dd>{date(pack.archiveUpdatedAt ?? pack.updatedAt)}</dd>
            <dt>Téléchargements</dt>
            <dd>{pack.downloadCount.toLocaleString('fr-FR')}</dd>
            {pack.tags.length > 0 && (
              <>
                <dt>Étiquettes</dt>
                <dd>{pack.tags.join(', ')}</dd>
              </>
            )}
          </dl>
          <div className="side-links">
            <button onClick={() => void run(() => window.api.openSite(`/packs/${pack.slug}/`))}>Voir sur le site</button>
          </div>
        </aside>
      </div>

      {pack.description.trim() && (
        <>
          <div className="section-head">
            <h2>Description</h2>
          </div>
          <Markdown text={pack.description} />
        </>
      )}
    </div>
  )
}
