import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { AuthorProfile, MarketPack, MarketPackDetail, MarketPage, MarketTag, PackManifest, TaskProgress } from '@shared/types'
import type { MarketQuery } from '@shared/api'
import { cleanError, useStore } from '../store'
import { bytes, marketImageUrl } from '../lib/format'
import { Gallery } from './Gallery'
import { Markdown } from './Markdown'
import { Avatar, Progress, PROTECTED_HINT } from './common'

/** Vue ouverte dans la Marketplace : fiche d'un pack ou page d'un auteur. */
export type MarketView = { kind: 'pack'; id: string } | { kind: 'author'; slug: string }

interface Nav {
  onOpen: (view: MarketView) => void
  onOpenLocal: (id: string) => void
}

/** État d'un pack de la Marketplace par rapport à la bibliothèque. */
function localState(item: { id: string; sha256: string }, library: PackManifest[]): { local: PackManifest | null; update: boolean } {
  // Deux versions présentes (mise à jour pas encore installée) : la plus récente fait foi.
  const matches = library.filter((p) => p.marketplace?.id === item.id).sort((a, b) => b.marketplace!.downloadedAt.localeCompare(a.marketplace!.downloadedAt))
  const local = matches[0] ?? null
  return { local, update: !!local && !!item.sha256 && local.marketplace!.sha256 !== item.sha256 }
}

export function Marketplace({
  view,
  depth,
  onOpen,
  onBack,
  onOpenLocal
}: Nav & { view: MarketView | null; depth: number; onBack: () => void }) {
  // Retour : à la liste depuis la première vue ouverte, sinon à la vue précédente (fiche ou auteur).
  const back = (
    <div className="back-row">
      <button className="link" onClick={onBack}>
        {depth > 1 ? '‹ Retour' : '‹ Marketplace'}
      </button>
    </div>
  )
  if (view?.kind === 'pack') return <MarketDetail key={view.id} id={view.id} back={back} onOpen={onOpen} onOpenLocal={onOpenLocal} />
  if (view?.kind === 'author') return <AuthorView key={view.slug} slug={view.slug} back={back} onOpen={onOpen} onOpenLocal={onOpenLocal} />
  return <MarketList onOpen={onOpen} onOpenLocal={onOpenLocal} />
}

/** Page de packs de l'API pour une recherche. */
function useMarketPage(query: MarketQuery): { page: MarketPage | null; error: string | null; loading: boolean; reload: () => void } {
  const [page, setPage] = useState<MarketPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const key = JSON.stringify(query)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPage(await window.api.marketList(JSON.parse(key) as MarketQuery))
      setError(null)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setLoading(false)
    }
  }, [key])

  useEffect(() => {
    void load()
  }, [load])

  return { page, error, loading, reload: () => void load() }
}

function MarketList({ onOpen, onOpenLocal }: Nav) {
  const { overview } = useStore()
  const [query, setQuery] = useState<MarketQuery>({ sort: 'recent', page: 0 })
  const [search, setSearch] = useState('')
  const [tags, setTags] = useState<MarketTag[]>([])
  const { page, error, loading, reload } = useMarketPage(query)

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

      <PackGrid
        page={page}
        error={error}
        loading={loading}
        reload={reload}
        current={query.page ?? 0}
        onPage={(p) => setQuery({ ...query, page: p })}
        empty={query.q || query.tag ? 'Aucun pack ne correspond à cette recherche.' : 'Aucun pack publié pour le moment.'}
        onOpen={onOpen}
        onOpenLocal={onOpenLocal}
      />
    </div>
  )
}

/** Cartes des packs d'une page, avec la pagination. */
function PackGrid({
  page,
  error,
  loading,
  reload,
  current,
  onPage,
  empty,
  onOpen,
  onOpenLocal
}: Nav & {
  page: MarketPage | null
  error: string | null
  loading: boolean
  reload: () => void
  current: number
  onPage: (page: number) => void
  empty: string
}) {
  const { overview, task } = useStore()
  if (!overview) return null
  if (error)
    return (
      <div className="empty-state">
        <p>{error}</p>
        <p>
          <button onClick={reload}>Réessayer</button>
        </p>
      </div>
    )
  if (!page) return loading ? <p className="muted">Chargement…</p> : null
  if (page.items.length === 0)
    return (
      <div className="empty-state">
        <p>{empty}</p>
      </div>
    )
  return (
    <>
      <div className="grid">
        {page.items.map((item) => (
          <MarketCard key={item.id} item={item} library={overview.library} task={task} onOpen={onOpen} onOpenLocal={onOpenLocal} />
        ))}
      </div>
      {page.totalPages > 1 && (
        <div className="pager">
          <button disabled={current === 0} onClick={() => onPage(current - 1)}>
            Précédent
          </button>
          <span className="muted">
            Page {current + 1} sur {page.totalPages}
          </span>
          <button disabled={current + 1 >= page.totalPages} onClick={() => onPage(current + 1)}>
            Suivant
          </button>
        </div>
      )}
    </>
  )
}

/** « par Auteur » : ouvre la page de l'auteur quand le pack est rattaché à son compte. */
function AuthorLink({ item, onOpen, avatar = false }: { item: MarketPack; onOpen: (view: MarketView) => void; avatar?: boolean }) {
  const profile = item.authorProfile
  if (!profile) return <>{item.author}</>
  return (
    <button
      className="link author-link"
      title={`Voir la page de ${profile.displayName}`}
      onClick={(e) => {
        e.stopPropagation()
        onOpen({ kind: 'author', slug: profile.slug })
      }}
    >
      {avatar && <Avatar url={profile.avatarUrl} name={profile.displayName} size={20} />}
      {item.author}
    </button>
  )
}

function MarketCard({
  item,
  library,
  task,
  onOpen,
  onOpenLocal
}: Nav & {
  item: MarketPack
  library: PackManifest[]
  task: TaskProgress | null
}) {
  const [failed, setFailed] = useState(false)
  const mine = task?.kind === 'download' && task.detail === item.id ? task : null
  const others = [item.tags.slice(0, 3).join(', '), bytes(item.archiveSize), item.protected && 'protégé'].filter(Boolean).join(' · ')
  return (
    <article className="card clickable" onClick={() => onOpen({ kind: 'pack', id: item.id })}>
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
        <div className="meta">
          {item.author && <AuthorLink item={item} onOpen={onOpen} />}
          {item.author && others && ' · '}
          {others}
        </div>
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

function MarketDetail({ id, back, onOpen, onOpenLocal }: Nav & { id: string; back: ReactNode }) {
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

  const mine = task?.kind === 'download' && task.detail === pack.id ? task : null
  const { update } = localState(pack, overview.library)

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
          {pack.author && (
            <div className="tags by">
              par <AuthorLink item={pack} onOpen={onOpen} avatar />
            </div>
          )}
          {pack.summary && <p className="summary">{pack.summary}</p>}
          <div className="side-actions row-actions">
            {mine ? <Progress task={mine} /> : <MarketAction item={pack} library={overview.library} task={task} onOpenLocal={onOpenLocal} wide />}
          </div>
          {update && !mine && <p className="hint">Une nouvelle version est en ligne. Vos réglages et votre preset ReShade sont conservés.</p>}
          {pack.protected && <p className="hint">{PROTECTED_HINT}</p>}
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

const date = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`

/** Page d'un auteur : photo, nom, description, liens, et ses packs. */
function AuthorView({ slug, back, onOpen, onOpenLocal }: Nav & { slug: string; back: ReactNode }) {
  const { run } = useStore()
  const [author, setAuthor] = useState<AuthorProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const packs = useMarketPage({ author: slug, sort: 'popular', page: current })

  const load = useCallback(async () => {
    try {
      setAuthor(await window.api.marketAuthor(slug))
      setError(null)
    } catch (e) {
      setError(cleanError(e))
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

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
  if (!author)
    return (
      <div className="page">
        {back}
        <p className="muted">Chargement…</p>
      </div>
    )

  const stats = [
    plural(author.packCount, 'pack', 'packs'),
    plural(author.downloads, 'téléchargement', 'téléchargements'),
    author.createdAt && `membre depuis le ${date(author.createdAt)}`
  ]
  return (
    <div className="page">
      {back}
      <header className="author-head">
        <Avatar url={author.avatarUrl} name={author.displayName} size={96} />
        <div className="author-id">
          <h1 className="pack-title">{author.displayName}</h1>
          <div className="muted">{stats.filter(Boolean).join(' · ')}</div>
          {author.links.length > 0 && (
            <div className="author-links">
              {author.links.map((l, i) => (
                <button key={i} title={l.url} onClick={() => void run(() => window.api.openLink(l.url))}>
                  {l.label || l.url}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      {author.bio.trim() && <p className="author-bio">{author.bio}</p>}

      <div className="section-head">
        <h2>Packs</h2>
      </div>
      <PackGrid {...packs} current={current} onPage={setCurrent} empty="Aucun pack publié pour le moment." onOpen={onOpen} onOpenLocal={onOpenLocal} />
    </div>
  )
}
