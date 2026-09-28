import { useEffect, useState } from 'react'
import type { Destination, Insight, PackComponent, PackManifest } from '@shared/types'
import type { ComponentFile } from '@shared/api'
import { useStore } from '../store'
import { bytes, mediaUrl, packImages } from '../lib/format'
import { asiBuildText, LEVEL_LABEL, levelOf, type Level } from '@shared/insights'
import { Cover, packMenuAction, Progress, PROTECTED_HINT, RenameInput } from './common'
import { Gallery } from './Gallery'
import { Markdown } from './Markdown'

const DESTINATIONS: { key: string; label: string; dest: Destination | null }[] = [
  { key: 'fivem:mods', label: 'FiveM › mods', dest: { root: 'fivem', path: 'mods' } },
  { key: 'fivem:plugins', label: 'FiveM › plugins', dest: { root: 'fivem', path: 'plugins' } },
  { key: 'fivem:citizen', label: 'FiveM › citizen', dest: { root: 'fivem', path: 'citizen' } },
  { key: 'fivem:addons', label: 'FiveM › addons', dest: { root: 'fivem', path: 'addons' } },
  { key: 'fivem:', label: 'FiveM.app', dest: { root: 'fivem', path: '' } },
  { key: 'gta:', label: 'GTA V', dest: { root: 'gta', path: '' } },
  { key: 'none', label: 'Ne pas installer', dest: null }
]

const keyOf = (d: Destination | null): string => (d ? `${d.root}:${d.path}` : 'none')
const labelOf = (d: Destination): string => `${d.root === 'fivem' ? 'FiveM' : 'GTA V'}${d.path ? ` › ${d.path.split('/').join(' › ')}` : ''}`

export function PackDetail({ pack, onBack }: { pack: PackManifest; onBack: () => void }) {
  const { overview, task, run } = useStore()
  const [renaming, setRenaming] = useState(false)
  const [fetched, setFetched] = useState<{ marketId: string; youtubeId: string | null } | null>(null)
  const marketId = pack.marketplace?.id

  // Pack téléchargé avant l'ajout des vidéos : on la cherche sur sa fiche.
  useEffect(() => {
    if (!marketId || pack.youtubeId !== undefined) return
    let live = true
    window.api.marketDetail(marketId).then(
      (d) => live && setFetched({ marketId, youtubeId: d.youtubeId }),
      () => undefined
    )
    return () => {
      live = false
    }
  }, [marketId, pack.youtubeId])
  const video = pack.youtubeId !== undefined ? pack.youtubeId : fetched && fetched.marketId === marketId ? fetched.youtubeId : null

  if (!overview) return null
  const active = overview.state.active?.packId === pack.id
  const mine = task && task.detail === pack.id ? task : null
  const build = overview.games.fivem.buildNumber ? Number(overview.games.fivem.buildNumber) : null
  const installable = pack.components.filter((c) => c.enabled && c.destination)
  const modified = pack.components.some((c) => keyOf(c.destination) !== keyOf(c.suggested) || c.enabled !== (c.suggested !== null && !c.optional))
  const images = packImages(pack)
  const imported = new Date(pack.importedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const market = pack.marketplace
  const updateAvailable = overview.market.updates.includes(pack.id)
  const gone = overview.market.gone.includes(pack.id)
  const downloading = task?.kind === 'download' && market && task.detail === market.id ? task : null

  return (
    <div className="page">
      <div className="back-row">
        <button className="link" onClick={onBack}>
          ‹ Bibliothèque
        </button>
      </div>

      <div className="store">
        <Gallery
          key={pack.id}
          images={images}
          youtubeId={video}
          image={(rel) => <Cover pack={pack} rel={rel} />}
          thumb={(rel) => mediaUrl(pack.id, rel)}
          empty={<div className="cover-empty">Aucune image</div>}
          actions={(current) => (
            <div className="media-actions">
              {current && current !== images[0] && (
                <button className="link" onClick={() => void run(() => window.api.setCover(pack.id, current))}>
                  Utiliser comme image du pack
                </button>
              )}
              <button className="link" onClick={() => void run(() => window.api.setCoverFromFile(pack.id))}>
                {images.length ? 'Choisir une autre image…' : 'Choisir une image…'}
              </button>
            </div>
          )}
        />

        <aside className="side">
          {renaming ? <RenameInput pack={pack} onDone={() => setRenaming(false)} className="rename big" /> : <h1 className="pack-title">{pack.name}</h1>}
          {pack.author && <div className="tags">par {pack.author}</div>}
          {pack.features.length > 0 && <div className="tags">{pack.features.join(' · ')}</div>}

          {market && updateAvailable && (
            <div className="side-update">
              {downloading ? (
                <Progress task={downloading} />
              ) : (
                <>
                  <span>Nouvelle version sur la Marketplace.</span>
                  <button onClick={() => void run(() => window.api.marketInstall(market.id))} disabled={!!task}>
                    Mettre à jour
                  </button>
                </>
              )}
            </div>
          )}

          <div className="side-actions">
            {mine ? (
              <Progress task={mine} />
            ) : active ? (
              <>
                <div className="state big">Installé</div>
                <button className="wide" onClick={() => void run(() => window.api.removeActive())} disabled={!!task}>
                  Retirer du jeu
                </button>
              </>
            ) : (
              <button className="primary wide" onClick={() => void run(() => window.api.applyPack(pack.id))} disabled={!!task || !installable.length}>
                Installer
              </button>
            )}
          </div>

          <dl className="facts">
            <dt>Taille</dt>
            <dd>{bytes(pack.contentSize)}</dd>
            <dt>Fichiers installés</dt>
            <dd>{installable.reduce((s, c) => s + c.fileCount, 0)}</dd>
            <dt>Ajouté le</dt>
            <dd>{imported}</dd>
            <dt>Source</dt>
            <dd className="ellipsis" title={pack.sourceArchive}>
              {pack.captured ? 'Installation existante' : market ? `Marketplace${market.version ? `, version ${market.version}` : ''}` : pack.sourceArchive}
            </dd>
            {(pack.reshadePresets?.length ?? 0) > 0 && (
              <>
                <dt>Preset ReShade</dt>
                <dd>
                  {pack.reshadePresets!.length > 1 ? (
                    <select
                      className="preset-select"
                      value={pack.reshadePreset ?? ''}
                      disabled={!!task}
                      title={active ? 'Pris en compte à la prochaine installation du pack' : 'Chargé automatiquement à l’installation'}
                      onChange={(e) => void run(() => window.api.setReshadePreset(pack.id, e.target.value))}
                    >
                      {pack.reshadePresets!.map((p) => (
                        <option key={p} value={p}>
                          {p.split('/').pop()!.replace(/\.ini$/i, '')}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="ellipsis" title="Chargé automatiquement à l’installation">
                      {pack.reshadePresets![0].split('/').pop()!.replace(/\.ini$/i, '')}
                    </span>
                  )}
                </dd>
              </>
            )}
          </dl>

          {gone && <p className="hint">Ce pack n’est plus proposé sur la Marketplace. Votre copie reste utilisable.</p>}
          {pack.protected && <p className="hint">{PROTECTED_HINT}</p>}

          <div className="side-links">
            {!pack.protected && <button onClick={() => void run(() => window.api.openPackFolder(pack.id))}>Ouvrir le dossier</button>}
            <button
              className="more"
              aria-label="Plus d’options"
              title="Plus d’options"
              onClick={async () => {
                if (await packMenuAction(pack, run)) setRenaming(true)
              }}
            >
              ⋯
            </button>
          </div>
        </aside>
      </div>

      {pack.description?.trim() && (
        <>
          <div className="section-head">
            <h2>Description</h2>
          </div>
          <Markdown text={pack.description} />
        </>
      )}

      <Compatibility insights={pack.insights ?? []} build={build} />

      <div className="section-head">
        <h2>Contenu</h2>
        {modified && (
          <button onClick={() => void run(() => window.api.updatePack(pack.id, { resetComponents: true }))} disabled={active}>
            Rétablir les destinations
          </button>
        )}
      </div>
      <ul className="list">
        {pack.components.map((c) => (
          <ComponentRow key={c.id} packId={pack.id} c={c} locked={active || !!task} />
        ))}
      </ul>
      {active && <p className="hint">Retirez le pack du jeu pour modifier son contenu.</p>}

      {pack.userConfigCount > 0 && (
        <div className="section-note">
          <span>
            {pack.userConfigCount} réglage{pack.userConfigCount > 1 ? 's' : ''} modifié{pack.userConfigCount > 1 ? 's' : ''} en jeu, réinstallé
            {pack.userConfigCount > 1 ? 's' : ''} avec le pack.
          </span>
          <button onClick={() => void run(() => window.api.resetUserConfigs(pack.id))}>Revenir à l’original</button>
        </div>
      )}
    </div>
  )
}

function Compatibility({ insights, build }: { insights: Insight[]; build: number | null }) {
  if (!insights.length) return null
  const isRpf = (i: Insight): boolean => /\.rpf$/i.test(i.rel)
  const rpfOk = insights.filter((i) => isRpf(i) && levelOf(i, build) === 'ok')
  const signed = rpfOk.filter((i) => /Cfx/.test(i.text)).length
  const rows: { title: string; level: Level; text: string }[] = []
  if (rpfOk.length)
    rows.push({ title: `${rpfOk.length} mod${rpfOk.length > 1 ? 's' : ''} .rpf`, level: 'ok', text: signed ? `Valides, dont ${signed} signé${signed > 1 ? 's' : ''} Cfx.` : 'Valides.' })
  for (const i of insights) {
    if (isRpf(i) && levelOf(i, build) === 'ok') continue
    const level = levelOf(i, build)
    const text = i.builds?.length && build ? asiBuildText(i.builds, build) : i.text
    rows.push({ title: i.title, level, text })
  }
  const rank: Record<Level, number> = { bad: 0, warn: 1, ok: 2, info: 3 }
  rows.sort((a, b) => rank[a.level] - rank[b.level])

  return (
    <>
      <div className="section-head">
        <h2>Compatibilité FiveM</h2>
      </div>
      <ul className="list compact">
        {rows.map((r, k) => (
          <li key={k} className="row">
            <span className="ins-title">{r.title}</span>
            <span className={`ins-level level-${r.level}`}>{LEVEL_LABEL[r.level]}</span>
            <span className="ins-text">{r.text}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function ComponentRow({ packId, c, locked }: { packId: string; c: PackComponent; locked: boolean }) {
  const { run } = useStore()
  const [files, setFiles] = useState<ComponentFile[] | null>(null)
  const [open, setOpen] = useState(false)

  const options = [...DESTINATIONS]
  for (const extra of [c.suggested, c.destination]) {
    if (extra && !options.some((o) => o.key === keyOf(extra))) options.splice(options.length - 1, 0, { key: keyOf(extra), label: labelOf(extra), dest: extra })
  }

  const toggle = async (): Promise<void> => {
    if (!open && !files) setFiles((await run(() => window.api.getComponentFiles(packId, c.id))) ?? [])
    setOpen(!open)
  }
  const setDest = (key: string): void => {
    const opt = options.find((o) => o.key === key)
    if (!opt) return
    setFiles(null)
    setOpen(false)
    void run(() => window.api.updatePack(packId, { components: [{ id: c.id, destination: opt.dest }] }))
  }

  return (
    <li className={`comp ${c.enabled && c.destination ? '' : 'is-off'}`}>
      <div className="row">
        <input
          type="checkbox"
          checked={c.enabled && !!c.destination}
          disabled={locked || !c.destination}
          onChange={(e) => void run(() => window.api.updatePack(packId, { components: [{ id: c.id, enabled: e.target.checked }] }))}
          aria-label="Installer cette partie"
        />
        <button className="comp-label" onClick={() => void toggle()} title="Voir les fichiers">
          <span className="chevron">{open ? '▾' : '▸'}</span>
          <span className="row-main">
            <span className="name">{c.label}</span>
            <span className="meta">
              {c.fileCount} fichier{c.fileCount > 1 ? 's' : ''} · {bytes(c.size)}
              {c.kind === 'unknown' ? ' · non reconnu' : c.kind === 'unsupported' ? ' · incompatible avec FiveM' : c.optional ? ' · optionnel' : ''}
            </span>
          </span>
        </button>
        <select value={keyOf(c.destination)} onChange={(e) => setDest(e.target.value)} disabled={locked}>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {open && files && (
        <div className="files">
          {files.slice(0, 300).map((f) => (
            <div key={f.rel} className="file">
              <span className="file-src">{f.rel}</span>
              <span className="file-dst">{f.dest ?? 'non installé'}</span>
            </div>
          ))}
          {files.length > 300 && <div className="file">et {files.length - 300} autres</div>}
        </div>
      )}
    </li>
  )
}
