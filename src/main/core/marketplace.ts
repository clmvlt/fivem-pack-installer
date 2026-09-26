// Marketplace : packs publiés sur packs.dimzou.fr, téléchargés directement dans la bibliothèque.
//
// Le téléchargement se fait dans <bibliothèque>/.downloads/<id>/ (conservé entre deux lancements pour reprendre
// là où il s'était arrêté), l'archive est vérifiée (SHA-256) puis importée comme un pack ajouté à la main.
// Le pack garde un lien vers sa fiche (marketplace.id / sha256 / révision) : une autre révision en ligne signale une
// nouvelle version. Quand seule une partie des fichiers change en ligne (« fichiers mis à jour », ex. QuantV.addon),
// seuls ces fichiers sont téléchargés et la nouvelle version est construite à partir du pack local (marketUpdate.ts).
// Les images sont servies à l'interface par pm-media://market/... avec un cache sur le disque.

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import { net } from 'electron'
import type { MarketPack, MarketPackDetail, MarketPage, MarketTag } from '@shared/types'
import type { MarketQuery } from '@shared/api'
import type { Report } from './installer'
import type { Library, StoredManifest } from './library'
import { localRevision, matchingFiles, planUpdate, remoteRevision, type RemoteFile, type UpdatePlan } from './marketUpdate'
import { exists, formatBytes, freeSpace, walkFiles } from '../util/fsx'
import { log } from '../util/log'

interface RemoteImage {
  id: string
  width: number
  height: number
}

interface RemoteSummary {
  id: string
  slug: string
  name: string
  summary: string
  author: string
  version: string
  tags: string[]
  archiveName: string | null
  archiveSize: number | null
  sha256: string | null
  downloadCount: number
  publishedAt: string | null
  updatedAt: string
  archiveUpdatedAt: string | null
  cover: RemoteImage | null
  /** Révision (archive et fichiers mis à jour) ; absente sur une API plus ancienne. */
  revision?: string | null
  files?: RemoteFile[]
}

interface RemoteDetail extends RemoteSummary {
  description: string
  images: RemoteImage[]
}

interface RemotePage {
  items: RemoteSummary[]
  page: number
  size: number
  total: number
  totalPages: number
}

export interface InstallHooks {
  /** Pack actuellement installé dans le jeu. */
  activeId: () => string | null
  /** Installe un pack dans le jeu (remplace le pack installé). */
  apply: (packId: string, report: Report) => Promise<unknown>
}

export interface InstallResult {
  packId: string
  name: string
  status: 'added' | 'updated' | 'linked' | 'up-to-date'
  /** Message à afficher (mise à jour faite mais pas encore installée dans le jeu, par exemple). */
  note?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IMAGE_CACHE_MAX = 300 * 1024 * 1024

export class Marketplace {
  private catalog = new Map<string, RemoteSummary>()
  private catalogComplete = false

  constructor(
    private apiUrl: string,
    private cacheDir: string,
    private library: () => Library
  ) {}

  // ------------------------------------------------------------------ lecture

  private async get<T>(pathAndQuery: string): Promise<T> {
    let response: Response
    try {
      response = await net.fetch(`${this.apiUrl}${pathAndQuery}`, { signal: AbortSignal.timeout(20_000) })
    } catch {
      throw new Error('Marketplace injoignable. Vérifiez votre connexion à Internet.')
    }
    if (response.status === 404) throw new Error('Ce pack n’est plus disponible sur la Marketplace.')
    if (!response.ok) throw new Error(`La Marketplace ne répond pas correctement (erreur ${response.status}).`)
    return (await response.json()) as T
  }

  private async localIndex(): Promise<Map<string, StoredManifest>> {
    const index = new Map<string, StoredManifest>()
    for (const m of await this.library().list()) {
      if (!m.marketplace || m.deleting) continue
      // Deux versions du même pack (mise à jour pas encore installée) : la plus récente fait foi.
      const other = index.get(m.marketplace.id)
      if (!other || other.marketplace!.downloadedAt < m.marketplace.downloadedAt) index.set(m.marketplace.id, m)
    }
    return index
  }

  private toMarket(r: RemoteSummary, index: Map<string, StoredManifest>): MarketPack {
    const local = index.get(r.id)
    const plan: UpdatePlan = local ? planUpdate({ marketplace: local.marketplace!, files: local.files }, r) : { kind: 'none' }
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      summary: r.summary,
      author: r.author,
      version: r.version,
      tags: r.tags,
      archiveSize: r.archiveSize ?? 0,
      sha256: r.sha256 ?? '',
      downloadCount: r.downloadCount,
      publishedAt: r.publishedAt,
      updatedAt: r.updatedAt,
      archiveUpdatedAt: r.archiveUpdatedAt,
      cover: r.cover,
      localId: local?.id ?? null,
      revision: remoteRevision(r) ?? '',
      updateAvailable: plan.kind !== 'none',
      updateSize: plan.kind === 'files' ? plan.files.reduce((sum, f) => sum + f.size, 0) : (r.archiveSize ?? 0)
    }
  }

  async list(query: MarketQuery): Promise<MarketPage> {
    const params = new URLSearchParams({ page: String(query.page ?? 0), size: '24', sort: query.sort ?? 'recent' })
    if (query.q?.trim()) params.set('q', query.q.trim())
    if (query.tag) params.set('tag', query.tag)
    const [page, index] = await Promise.all([this.get<RemotePage>(`/packs?${params}`), this.localIndex()])
    for (const r of page.items) this.catalog.set(r.id, r)
    return { items: page.items.map((r) => this.toMarket(r, index)), page: page.page, total: page.total, totalPages: page.totalPages }
  }

  tags(): Promise<MarketTag[]> {
    return this.get<MarketTag[]>('/packs/tags')
  }

  async detail(idOrSlug: string): Promise<MarketPackDetail> {
    const [r, index] = await Promise.all([this.remoteDetail(idOrSlug), this.localIndex()])
    return { ...this.toMarket(r, index), description: r.description, archiveName: r.archiveName ?? '', images: r.images }
  }

  private async remoteDetail(idOrSlug: string): Promise<RemoteDetail> {
    const r = await this.get<RemoteDetail>(`/packs/${encodeURIComponent(idOrSlug)}`)
    this.catalog.set(r.id, r)
    return r
  }

  /** Catalogue complet, pour signaler les mises à jour dans la bibliothèque. */
  async refreshCatalog(): Promise<void> {
    const all = new Map<string, RemoteSummary>()
    for (let page = 0; page < 50; page++) {
      const result = await this.get<RemotePage>(`/packs?page=${page}&size=100`)
      for (const r of result.items) all.set(r.id, r)
      if (page + 1 >= result.totalPages) break
    }
    this.catalog = all
    this.catalogComplete = true
  }

  /** Packs de la bibliothèque dont une autre version est en ligne, et ceux qui ne sont plus publiés. */
  async status(): Promise<{ updates: string[]; gone: string[] }> {
    const updates: string[] = []
    const gone: string[] = []
    for (const m of (await this.localIndex()).values()) {
      const remote = this.catalog.get(m.marketplace!.id)
      if (remote) {
        if (planUpdate({ marketplace: m.marketplace!, files: m.files }, remote).kind !== 'none') updates.push(m.id)
      } else if (this.catalogComplete) gone.push(m.id)
    }
    return { updates, gone }
  }

  /**
   * Adresse d'une page du site : même domaine que l'API (en développement, le serveur Vite sur le port 5173). Les
   * adresses officielles des pages se terminent par « / » (ex. /packs/bh-1960/) ; les autres passent par une redirection.
   */
  siteUrl(sitePath: string): string {
    const site = this.apiUrl.replace(/\/api\/?$/, '').replace(/:8080$/, ':5173')
    return `${site}${sitePath}`
  }

  // ------------------------------------------------------------------ images

  /** pm-media://market/<pack>/<image>[?size=thumb] : image mise en cache sur le disque (les images ne changent jamais). */
  async image(packId: string, imageId: string, thumb: boolean): Promise<Response> {
    if (!UUID.test(packId) || !UUID.test(imageId)) return new Response('Interdit', { status: 403 })
    const file = path.join(this.cacheDir, `${imageId}${thumb ? '-thumb' : ''}.jpg`)
    if (await exists(file)) return net.fetch(pathToFileURL(file).toString())
    try {
      const data = await this.fetchImage(packId, imageId, thumb)
      await fs.mkdir(this.cacheDir, { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      await fs.writeFile(tmp, data)
      await fs.rename(tmp, file).catch(() => fs.rm(tmp, { force: true }))
      return new Response(new Uint8Array(data), { headers: { 'Content-Type': 'image/jpeg' } })
    } catch {
      return new Response('', { status: 404 })
    }
  }

  private async fetchImage(packId: string, imageId: string, thumb: boolean): Promise<Buffer> {
    const response = await net.fetch(`${this.apiUrl}/packs/${packId}/images/${imageId}${thumb ? '?size=thumb' : ''}`, {
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = Buffer.from(await response.arrayBuffer())
    // Toujours du JPEG (ré-encodé par le serveur).
    if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error('Image invalide')
    return data
  }

  /** Garde le cache des images sous 300 Mo en supprimant les plus anciennes. */
  async pruneImageCache(): Promise<void> {
    const files = await walkFiles(this.cacheDir).catch(() => [])
    let total = files.reduce((s, f) => s + f.size, 0)
    if (total <= IMAGE_CACHE_MAX) return
    const stats = await Promise.all(
      files.map(async (f) => ({ f, mtime: (await fs.stat(path.join(this.cacheDir, f.rel)).catch(() => null))?.mtimeMs ?? 0 }))
    )
    stats.sort((a, b) => a.mtime - b.mtime)
    for (const { f } of stats) {
      if (total <= IMAGE_CACHE_MAX * 0.7) break
      await fs.rm(path.join(this.cacheDir, f.rel), { force: true }).catch(() => undefined)
      total -= f.size
    }
  }

  /** Téléchargements abandonnés depuis plus d'une semaine. */
  async pruneDownloads(): Promise<void> {
    const root = path.join(this.library().dir, '.downloads')
    const limit = Date.now() - 7 * 24 * 3600 * 1000
    for (const e of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
      const dir = path.join(root, e.name)
      const st = await fs.stat(dir).catch(() => null)
      if (st && st.mtimeMs < limit) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  // ------------------------------------------------------------------ téléchargement et ajout à la bibliothèque

  async install(id: string, report: Report, signal: AbortSignal, hooks: InstallHooks): Promise<InstallResult> {
    const remote = await this.remoteDetail(id)
    if (!remote.sha256 || !remote.archiveSize || !remote.archiveName) throw new Error('Ce pack n’a pas encore d’archive.')
    const lib = this.library()
    const index = await this.localIndex()
    const linked = index.get(remote.id) ?? null
    const plan = linked ? planUpdate({ marketplace: linked.marketplace!, files: linked.files }, remote) : null
    const revision = remoteRevision(remote)!

    if (linked && plan!.kind === 'none') {
      // Rien de nouveau pour ce pack (les fichiers mis à jour en ligne ne le concernent pas) : fiche seulement.
      await this.applyMetadata(linked, remote, false, report, { revision: localRevision(linked.marketplace!), files: linked.marketplace!.files ?? [] })
      return { packId: linked.id, name: linked.name, status: 'up-to-date' }
    }
    if (!linked) {
      // Même archive déjà ajoutée à la main : on la relie à sa fiche plutôt que de la télécharger à nouveau. Ses
      // fichiers d'origine sont gardés : une révision différente proposera ensuite les fichiers mis à jour.
      const duplicate = await lib.findDuplicate(remote.archiveName, remote.archiveSize)
      if (duplicate && !duplicate.marketplace) {
        await this.applyMetadata(duplicate, remote, false, report, { revision: remote.sha256, files: [] })
        return { packId: duplicate.id, name: duplicate.name, status: 'linked' }
      }
    }

    let imported: StoredManifest
    let applied: { name: string; sha256: string }[]
    if (linked && plan!.kind === 'files') {
      // Même archive : seuls les fichiers mis à jour sont téléchargés, puis une nouvelle version est construite à
      // partir du pack local (liens physiques, sans recopier les gigaoctets du pack).
      const downloaded = await this.downloadFiles(remote, plan!.files, report, signal)
      try {
        imported = (await lib.derive(linked.id, downloaded.files, (p) => report(p.phase, p.current, p.total), signal)).manifest
      } finally {
        await fs.rm(downloaded.dir, { recursive: true, force: true }).catch(() => undefined)
      }
      const merged = new Map((linked.marketplace!.files ?? []).map((f) => [f.name.toLowerCase(), f]))
      for (const f of plan!.files) merged.set(f.fileName.toLowerCase(), { name: f.fileName, sha256: f.sha256 })
      applied = [...merged.values()]
      await this.applyMetadata(imported, remote, false, report, { revision, files: applied })
      log.info(`Marketplace : ${remote.name} mis à jour (${plan!.files.map((f) => f.fileName).join(', ')})`)
    } else {
      const file = await this.download(remote, report, signal)
      imported = await lib.import(file, (p) => report(p.phase, p.current, p.total), signal, { skipDuplicateCheck: true })
      await fs.rm(path.dirname(file), { recursive: true, force: true }).catch(() => undefined)
      // Fichiers mis à jour en ligne qui concernent ce pack : appliqués tout de suite.
      const matching = matchingFiles(imported.files, remote.files ?? [])
      if (matching.length) {
        const downloaded = await this.downloadFiles(remote, matching, report, signal)
        try {
          await lib.replaceFiles(imported.id, downloaded.files)
        } finally {
          await fs.rm(downloaded.dir, { recursive: true, force: true }).catch(() => undefined)
        }
      }
      applied = matching.map((f) => ({ name: f.fileName, sha256: f.sha256 }))
      await this.applyMetadata(imported, remote, true, report, { revision, files: applied })
      log.info(`Marketplace : ${remote.name} téléchargé (${formatBytes(remote.archiveSize)})`)
    }
    if (!linked) return { packId: imported.id, name: imported.name, status: 'added' }

    // Nouvelle version d'un pack déjà présent : même nom, même preset, mêmes réglages personnels.
    const next = await lib.get(imported.id)
    next.name = linked.name
    if (linked.reshadePreset && (next.reshadePresets ?? []).includes(linked.reshadePreset)) next.reshadePreset = linked.reshadePreset
    await lib.save(next)
    await copyUserConfigs(lib, linked.id, next.id)

    if (hooks.activeId() === linked.id) {
      try {
        await hooks.apply(next.id, report)
        // Réglages modifiés pendant la dernière partie, récupérés au remplacement : repris pour la suite.
        await copyUserConfigs(lib, linked.id, next.id)
      } catch (err) {
        log.warn(`Nouvelle version de ${linked.name} non installée : ${(err as Error).message}`)
        return {
          packId: next.id,
          name: next.name,
          status: 'updated',
          note: `La nouvelle version de ${linked.name} est dans la bibliothèque. Installez-la pour remplacer l’ancienne : ${(err as Error).message}`
        }
      }
    }
    await lib.remove(linked.id)
    return { packId: next.id, name: next.name, status: 'updated' }
  }

  /** Télécharge l'archive (avec reprise) puis vérifie son empreinte. */
  private async download(remote: RemoteDetail, report: Report, signal: AbortSignal): Promise<string> {
    const dir = path.join(this.library().dir, '.downloads', remote.id)
    const final = path.join(dir, safeFileName(remote.archiveName!))
    const part = `${final}.part`
    const metaFile = path.join(dir, 'download.json')
    const size = remote.archiveSize!
    const sha = remote.sha256!

    // Téléchargement d'une autre version du pack laissé en plan : on repart de zéro.
    const meta = await fs.readFile(metaFile, 'utf8').then((t) => JSON.parse(t) as { sha256?: string }).catch(() => null)
    if (meta?.sha256 !== sha) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(metaFile, JSON.stringify({ sha256: sha, name: remote.name }))

    if ((await fs.stat(final).catch(() => null))?.size === size && (await sha256File(final, signal)) === sha) return final

    const already = (await fs.stat(part).catch(() => null))?.size ?? 0
    const free = await freeSpace(this.library().dir)
    // L'archive, puis son contenu extrait (environ deux fois sa taille) pendant l'ajout à la bibliothèque.
    const needed = size - already + size * 2.2
    if (free !== null && free < needed) throw new Error(`Pas assez de place sur le disque (${formatBytes(needed)} nécessaires).`)

    const url = `${this.apiUrl}/packs/${remote.id}/download`
    for (let attempt = 1; ; attempt++) {
      try {
        await this.fetchInto(url, part, size, sha, report, signal)
        break
      } catch (err) {
        if (signal.aborted || attempt >= 5 || (err as Error & { fatal?: boolean }).fatal) throw err
        log.warn(`Téléchargement interrompu (${(err as Error).message}), reprise dans ${attempt * 2} s`)
        report(`Connexion interrompue, reprise…`, 0, 0)
        await new Promise((r) => setTimeout(r, attempt * 2000))
      }
    }

    report('Vérification du fichier', 0, 0)
    if ((await sha256File(part, signal)) !== sha) {
      await fs.rm(part, { force: true })
      throw new Error('Le fichier téléchargé est endommagé. Relancez le téléchargement.')
    }
    await fs.rename(part, final)
    return final
  }

  /**
   * Télécharge des fichiers mis à jour (vérifiés) dans .downloads/<pack>-files/ ; renvoie leurs chemins par nom de
   * fichier en minuscules, le nom qui désigne les fichiers à remplacer dans le pack.
   */
  private async downloadFiles(
    remote: RemoteDetail,
    files: RemoteFile[],
    report: Report,
    signal: AbortSignal
  ): Promise<{ dir: string; files: Map<string, string> }> {
    const dir = path.join(this.library().dir, '.downloads', `${remote.id}-files`)
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    await fs.mkdir(dir, { recursive: true })
    const total = files.reduce((sum, f) => sum + f.size, 0)
    const result = new Map<string, string>()
    let before = 0
    for (const f of files) {
      const target = path.join(dir, `${f.id}-${safeFileName(f.fileName)}`)
      const part = `${target}.part`
      const url = `${this.apiUrl}/packs/${remote.id}/files/${f.id}`
      for (let attempt = 1; ; attempt++) {
        try {
          await this.fetchInto(url, part, f.size, f.sha256, (_phase, current) => report(`Téléchargement de ${f.fileName}`, before + current, total), signal)
          break
        } catch (err) {
          if (signal.aborted || attempt >= 5 || (err as Error & { fatal?: boolean }).fatal) throw err
          await new Promise((r) => setTimeout(r, attempt * 2000))
        }
      }
      if ((await sha256File(part, signal)) !== f.sha256) throw new Error(`${f.fileName} : fichier reçu endommagé. Relancez la mise à jour.`)
      await fs.rename(part, target)
      result.set(f.fileName.toLowerCase(), target)
      before += f.size
    }
    return { dir, files: result }
  }

  private async fetchInto(url: string, part: string, size: number, sha: string, report: Report, signal: AbortSignal): Promise<void> {
    let start = (await fs.stat(part).catch(() => null))?.size ?? 0
    if (start > size) {
      await fs.rm(part, { force: true })
      start = 0
    }
    if (start === size) return
    const headers: Record<string, string> = start > 0 ? { Range: `bytes=${start}-`, 'If-Range': `"${sha}"` } : {}
    const response = await net.fetch(url, { headers, signal })
    if (response.status === 200) start = 0
    else if (response.status !== 206) {
      const error = new Error(response.status === 404 ? 'Ce pack n’est plus disponible.' : `Téléchargement impossible (erreur ${response.status}).`)
      if (response.status < 500) Object.assign(error, { fatal: true })
      throw error
    }
    if (!response.body) throw new Error('Réponse vide.')
    let received = start
    const progress = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        report('Téléchargement', received, size)
        callback(null, chunk)
      }
    })
    await pipeline(
      Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream),
      progress,
      createWriteStream(part, { flags: start > 0 ? 'a' : 'w' }),
      { signal }
    )
    if (received !== size) throw new Error('Téléchargement incomplet.')
  }

  /** Nom, description, auteur et images de la fiche, copiés dans le pack de la bibliothèque. */
  private async applyMetadata(
    pack: StoredManifest,
    remote: RemoteDetail,
    fresh: boolean,
    report: Report,
    content: { revision: string; files: { name: string; sha256: string }[] }
  ): Promise<void> {
    const lib = this.library()
    const m = await lib.get(pack.id)
    const packDir = lib.packDir(m.id)
    report('Images', 0, remote.images.length)
    const rels: string[] = []
    for (const [i, image] of remote.images.entries()) {
      const rel = `market-${image.id}.jpg`
      const target = path.join(packDir, rel)
      if (!(await exists(target))) {
        try {
          const cached = path.join(this.cacheDir, `${image.id}.jpg`)
          if (await exists(cached)) await fs.copyFile(cached, target)
          else await fs.writeFile(target, await this.fetchImage(remote.id, image.id, false))
        } catch (err) {
          log.warn(`Image ${image.id} non récupérée : ${(err as Error).message}`)
          continue
        }
      }
      rels.push(rel)
      report('Images', i + 1, remote.images.length)
    }
    // Anciennes images de la fiche qui n'en font plus partie.
    for (const old of m.gallery.filter((g) => /^market-/.test(g) && !rels.includes(g)))
      await fs.rm(path.join(packDir, old), { force: true }).catch(() => undefined)

    const coverWasMarket = !m.cover || /^market-/.test(m.cover)
    m.gallery = [...rels, ...m.gallery.filter((g) => !/^market-/.test(g))]
    if (fresh || coverWasMarket) m.cover = rels[0] ?? (coverWasMarket ? null : m.cover)
    if (fresh) m.name = remote.name
    m.description = remote.description
    m.author = remote.author
    m.marketplace = {
      id: remote.id,
      slug: remote.slug,
      sha256: remote.sha256!,
      revision: content.revision,
      files: content.files,
      version: remote.version,
      downloadedAt: new Date().toISOString()
    }
    await lib.save(m)
  }
}

async function copyUserConfigs(lib: Library, from: string, to: string): Promise<void> {
  const source = lib.userDir(from)
  if (!(await exists(source))) return
  await fs.cp(source, lib.userDir(to), { recursive: true, force: true })
  const m = await lib.get(to)
  m.userConfigCount = await lib.countUserConfigs(to)
  await lib.save(m)
}

async function sha256File(file: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file, { highWaterMark: 1024 * 1024 })) {
    if (signal?.aborted) throw new Error('Annulé.')
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

function safeFileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim()
  return base && !/^\.+$/.test(base) ? base : 'pack.zip'
}
