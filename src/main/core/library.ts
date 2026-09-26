// Bibliothèque de packs : import (extraction + analyse), stockage, modification, suppression.
//
// Organisation sur le disque :
//   <bibliothèque>/<id>/pack.json   manifeste (composants, destinations, fichiers)
//   <bibliothèque>/<id>/content/    contenu extrait du pack (jamais modifié)
//   <bibliothèque>/<id>/user/       réglages modifiés en jeu, conservés entre deux applications
//   <bibliothèque>/<id>/cover-*.jpg image choisie pour le pack

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Destination, PackComponent, PackFileEntry, PackManifest, PackPatch, RootId } from '@shared/types'
import { analyzePack, galleryOf, resolveInstallMap, type AnalyzedComponent } from './analyzer'
import { fixReshadeIni, inspectPack, INSIGHTS_VERSION } from './inspect'
import { choosePreset, detectPresets } from './reshade'
import { ARCHIVE_EXT, detectFeatures, ext, isJunk } from './knowledge'
import { dropJunk, stripWrapper } from './wrapper'
import { extractInWorker } from '../archive'
import { rarVolumeIndex } from '../archive/sanitize'
import { exists, freeSpace, isDir, moveDir, newId, readJson, slugify, walkFiles, writeJsonAtomic, formatBytes } from '../util/fsx'
import { log } from '../util/log'
import { q } from '../util/text'

export interface StoredManifest extends Omit<PackManifest, 'components'> {
  components: AnalyzedComponent[]
  files: PackFileEntry[]
  sourceSize: number
}

export interface ImportProgress {
  phase: string
  current: number
  total: number
  detail?: string
}

export class ImportError extends Error {}

const MAX_NESTED_DEPTH = 3

export class Library {
  constructor(public dir: string) {}

  packDir(id: string): string {
    return path.join(this.dir, id)
  }
  contentDir(id: string): string {
    return path.join(this.dir, id, 'content')
  }
  userDir(id: string): string {
    return path.join(this.dir, id, 'user')
  }
  userFile(id: string, dest: Destination): string {
    return path.join(this.userDir(id), dest.root, ...dest.path.split('/'))
  }

  async list(): Promise<StoredManifest[]> {
    await fs.mkdir(this.dir, { recursive: true })
    const out: StoredManifest[] = []
    for (const e of await fs.readdir(this.dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue
      const m = await readJson<StoredManifest | null>(path.join(this.dir, e.name, 'pack.json'), null)
      if (!m || m.id !== e.name) continue
      if (m.insightsVersion !== INSIGHTS_VERSION || !Array.isArray(m.gallery)) {
        await this.refreshInsights(m).catch(() => undefined)
        // Les images de la Marketplace (market-*.jpg) ne viennent pas du contenu : conservées.
        const market = (Array.isArray(m.gallery) ? m.gallery : []).filter((g) => /^market-/.test(g))
        m.gallery = [...market, ...galleryOf(m.files, m.components).map((r) => `content/${r}`)]
        await this.save(m).catch(() => undefined)
      }
      out.push(m)
    }
    out.sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    return out
  }

  async get(id: string): Promise<StoredManifest> {
    const m = await readJson<StoredManifest | null>(path.join(this.packDir(id), 'pack.json'), null)
    if (!m) throw new Error('Pack introuvable.')
    return m
  }

  async save(m: StoredManifest): Promise<void> {
    m.updatedAt = new Date().toISOString()
    await writeJsonAtomic(path.join(this.packDir(m.id), 'pack.json'), m)
  }

  async update(id: string, patch: PackPatch): Promise<StoredManifest> {
    const m = await this.get(id)
    if (patch.name !== undefined) m.name = patch.name.trim() || m.name
    if (patch.notes !== undefined) m.notes = patch.notes
    if (patch.resetComponents) {
      for (const c of m.components) {
        c.destination = c.suggested
        c.enabled = c.suggested !== null && !c.optional
      }
    }
    for (const p of patch.components ?? []) {
      const c = m.components.find((x) => x.id === p.id)
      if (!c) continue
      if (p.destination !== undefined) {
        c.destination = p.destination
        if (p.destination === null) c.enabled = false
        else if (p.enabled === undefined) c.enabled = true
      }
      if (p.enabled !== undefined) c.enabled = p.enabled && c.destination !== null
    }
    if (patch.components?.length || patch.resetComponents) await this.refreshInsights(m)
    await this.save(m)
    return m
  }

  /** Recalcule les vérifications de compatibilité (elles dépendent des destinations choisies). */
  async refreshInsights(m: StoredManifest): Promise<void> {
    const map = resolveInstallMap(m.components)
    const { insights, reshadeVersion } = await inspectPack(this.contentDir(m.id), map)
    const notes = (m.insights ?? []).filter((i) => i.rel === '').map((i) => ({ ...i, title: 'ReShade.ini', text: RESHADE_FIXED }))
    m.insights = [...insights, ...notes]
    m.reshadeVersion = reshadeVersion
    const { presets, fromIni } = await detectPresets(this.contentDir(m.id), map)
    m.reshadePresets = presets
    // Le choix de l'utilisateur est conservé tant que ce preset existe encore dans le pack.
    if (!m.reshadePreset || !presets.includes(m.reshadePreset)) m.reshadePreset = choosePreset(presets, fromIni, m.name)
    m.insightsVersion = INSIGHTS_VERSION
  }

  async setReshadePreset(id: string, rel: string): Promise<StoredManifest> {
    const m = await this.get(id)
    if (!(m.reshadePresets ?? []).includes(rel)) throw new Error('Preset inconnu.')
    m.reshadePreset = rel
    await this.save(m)
    return m
  }

  /**
   * Supprime un pack en rapportant la progression. Le pack est d'abord marqué « en suppression » :
   * si l'application est fermée en cours de route, la suppression est terminée au démarrage suivant.
   */
  async remove(id: string, onProgress?: (done: number, total: number) => void): Promise<void> {
    const dir = this.packDir(id)
    const m = await this.get(id)
    m.deleting = true
    await this.save(m)
    // Le temps de suppression dépend du nombre de fichiers et, dans une moindre mesure, de leur taille.
    const files = (await walkFiles(dir)).filter((f) => f.rel !== 'pack.json')
    const weight = (size: number): number => size + 4 * 1024 * 1024
    const total = files.reduce((s, f) => s + weight(f.size), 0)
    let done = 0
    onProgress?.(0, total)
    for (const f of files) {
      const p = path.join(dir, ...f.rel.split('/'))
      try {
        await fs.unlink(p)
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'EPERM') {
          // Fichier en lecture seule (ex. venu du dossier GTA V) : on retire l'attribut puis on réessaie.
          await fs.chmod(p, 0o666).catch(() => undefined)
          await fs.unlink(p)
        } else if (code !== 'ENOENT') throw err
      }
      done += weight(f.size)
      onProgress?.(done, total)
    }
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 })
    onProgress?.(total, total)
  }

  async resetUserConfigs(id: string): Promise<StoredManifest> {
    await fs.rm(this.userDir(id), { recursive: true, force: true })
    const m = await this.get(id)
    m.userConfigCount = 0
    await this.save(m)
    return m
  }

  /** Définit l'image du pack : une image de sa galerie ou un fichier enregistré dans le dossier du pack. */
  async setCover(id: string, rel: string | null): Promise<StoredManifest> {
    const m = await this.get(id)
    if (rel && !m.gallery.includes(rel) && !/^cover-[\w-]+\.(jpe?g|png|webp)$/i.test(rel)) throw new Error('Image inconnue.')
    // Ancienne image enregistrée : supprimée pour ne pas accumuler de fichiers.
    if (m.cover && m.cover !== rel && /^cover-/.test(m.cover)) await fs.rm(path.join(this.packDir(id), m.cover), { force: true }).catch(() => undefined)
    m.cover = rel
    await this.save(m)
    return m
  }

  async countUserConfigs(id: string): Promise<number> {
    if (!(await isDir(this.userDir(id)))) return 0
    return (await walkFiles(this.userDir(id))).length
  }

  /**
   * Nettoie les imports interrompus (fermeture de l'application pendant une extraction). Les téléchargements de la
   * Marketplace (.downloads) sont gardés pour reprendre là où ils s'étaient arrêtés.
   */
  async cleanupStaging(): Promise<void> {
    await fs.rm(path.join(this.dir, '.staging'), { recursive: true, force: true }).catch(() => undefined)
    await fs.rm(path.join(this.dir, '.trash'), { recursive: true, force: true }).catch(() => undefined)
    // Suppressions interrompues (application fermée pendant la suppression d'un pack).
    for (const e of await fs.readdir(this.dir, { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue
      const m = await readJson<StoredManifest | null>(path.join(this.dir, e.name, 'pack.json'), null)
      if (m?.deleting) await fs.rm(path.join(this.dir, e.name), { recursive: true, force: true }).catch(() => undefined)
    }
  }

  // -------------------------------------------------------------------------
  // Import

  async findDuplicate(sourceName: string, sourceSize: number): Promise<StoredManifest | null> {
    return (await this.list()).find((m) => m.sourceArchive === sourceName && m.sourceSize === sourceSize) ?? null
  }

  /**
   * Importe une archive (.zip / .rar / .7z) ou un dossier déjà extrait. skipDuplicateCheck : nouvelle version d'un
   * pack de la Marketplace, qui peut porter le même nom de fichier que l'ancienne.
   */
  async import(
    source: string,
    onProgress: (p: ImportProgress) => void,
    signal?: AbortSignal,
    options: { skipDuplicateCheck?: boolean } = {}
  ): Promise<StoredManifest> {
    const st = await fs.stat(source).catch(() => null)
    if (!st) throw new ImportError('Fichier introuvable.')
    const isFolder = st.isDirectory()
    const sourceName = path.basename(source)
    const sourceSize = isFolder ? 0 : st.size

    if (!isFolder) {
      const vol = rarVolumeIndex(sourceName)
      if (vol !== null && vol > 1)
        throw new ImportError("Ajoutez la première partie de l'archive (.part1.rar).")
      if (!ARCHIVE_EXT.has(ext(sourceName))) throw new ImportError('Format non pris en charge. Utilisez une archive .zip, .rar ou .7z.')
      const dup = options.skipDuplicateCheck ? null : await this.findDuplicate(sourceName, sourceSize)
      if (dup) throw new ImportError(`${q(dup.name)} est déjà dans la liste.`)
    }

    const id = `${slugify(cleanName(sourceName))}-${newId()}`
    const staging = path.join(this.dir, '.staging', id)
    const raw = path.join(staging, 'raw')
    await fs.mkdir(raw, { recursive: true })

    try {
      if (isFolder) {
        onProgress({ phase: 'Copie du dossier', current: 0, total: 1, detail: sourceName })
        await fs.cp(source, raw, { recursive: true })
      } else {
        const free = await freeSpace(this.dir)
        const spaceError = (need: number): string =>
          `Pas assez de place sur le disque (${formatBytes(need)} nécessaires).`
        if (free !== null && free < sourceSize * 1.05) throw new ImportError(spaceError(sourceSize))
        // La taille décompressée réelle n'est connue qu'après lecture de l'archive : on interrompt tôt si elle ne tient pas.
        const local = new AbortController()
        signal?.addEventListener('abort', () => local.abort())
        let tooBig: number | null = null
        try {
          await extractInWorker(
            source,
            raw,
            (p) => {
              if (p.phase === 'list' && free !== null && p.totalBytes > free - 100 * 1024 * 1024) {
                tooBig = p.totalBytes
                local.abort()
              }
              onProgress({
                phase: p.phase === 'list' ? "Lecture de l'archive" : 'Extraction',
                current: p.totalBytes ? p.bytes : p.files,
                total: p.totalBytes || p.totalFiles,
                detail: p.current
              })
            },
            local.signal
          )
        } catch (err) {
          if (tooBig !== null) throw new ImportError(spaceError(tooBig))
          throw err
        }
      }

      await this.extractNested(raw, onProgress, signal)

      onProgress({ phase: 'Analyse du pack', current: 0, total: 1 })
      let entries = (await walkFiles(raw)).map((f) => ({ rel: f.rel, size: f.size }))
      // Supprime les fichiers parasites (__MACOSX, Thumbs.db...)
      const keep = new Set(dropJunk(entries).map((e) => e.rel))
      for (const e of entries) if (!keep.has(e.rel)) await fs.rm(path.join(raw, ...e.rel.split('/')), { force: true })
      entries = entries.filter((e) => keep.has(e.rel))
      if (!entries.length) throw new ImportError("L'archive est vide.")

      const { entries: stripped, prefix } = stripWrapper(entries)
      const presets = await this.detectPresets(raw, prefix, stripped)
      const analysis = analyzePack(stripped, { isPreset: (rel) => presets.has(rel) })

      const packDir = this.packDir(id)
      await fs.mkdir(packDir, { recursive: true })
      const contentSrc = prefix ? path.join(raw, ...prefix.replace(/\/$/, '').split('/')) : raw
      await moveDir(contentSrc, this.contentDir(id))


      // ReShade.ini exporté depuis le PC de l'auteur : chemins absolus corrigés.
      let fixedPaths = 0
      for (const { rel } of resolveInstallMap(analysis.components)) {
        if (/(^|\/)reshade\.ini$/i.test(rel)) fixedPaths += await fixReshadeIni(path.join(this.contentDir(id), ...rel.split('/')))
      }

      const now = new Date().toISOString()
      const manifest: StoredManifest = {
        schema: 1,
        id,
        name: cleanName(sourceName),
        sourceArchive: sourceName,
        sourceSize,
        importedAt: now,
        updatedAt: now,
        contentSize: stripped.reduce((s, e) => s + e.size, 0),
        fileCount: stripped.length,
        components: analysis.components,
        features: analysis.features,
        warnings: analysis.warnings,
        cover: null,
        gallery: analysis.gallery.map((r) => `content/${r}`),
        notes: '',
        captured: false,
        userConfigCount: 0,
        insights: [],
        reshadeVersion: null,
        files: stripped
      }
      onProgress({ phase: 'Vérification de la compatibilité FiveM', current: 0, total: 1 })
      await this.refreshInsights(manifest)
      if (fixedPaths)
        manifest.insights.push({
          rel: '',
          level: 'info',
          title: 'ReShade.ini',
          text: RESHADE_FIXED
        })
      await this.save(manifest)
      log.info(`Pack importé : ${manifest.name} (${manifest.fileCount} fichiers, ${formatBytes(manifest.contentSize)})`)
      return manifest
    } catch (err) {
      await fs.rm(this.packDir(id), { recursive: true, force: true }).catch(() => undefined)
      throw err
    } finally {
      await fs.rm(staging, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined)
    }
  }

  /**
   * Nouvelle version d'un pack à partir d'une autre, sans rien retélécharger : mêmes fichiers (liens physiques pour
   * les gros fichiers, donc instantané et sans place en plus), sauf ceux dont le nom figure dans `replacements`
   * (nom en minuscules → fichier de remplacement). Les réglages du pack (destinations, preset, images) sont repris.
   */
  async derive(
    fromId: string,
    replacements: Map<string, string>,
    onProgress: (p: ImportProgress) => void,
    signal?: AbortSignal
  ): Promise<{ manifest: StoredManifest; replaced: string[] }> {
    const from = await this.get(fromId)
    const id = `${slugify(from.name) || 'pack'}-${newId()}`
    const staging = path.join(this.dir, '.staging', id)
    const content = path.join(staging, 'content')
    const source = this.contentDir(fromId)
    const replaced: string[] = []
    try {
      const files = await walkFiles(source)
      for (const [i, f] of files.entries()) {
        signal?.throwIfAborted()
        const target = path.join(content, ...f.rel.split('/'))
        await fs.mkdir(path.dirname(target), { recursive: true })
        const replacement = replacements.get(path.posix.basename(f.rel).toLowerCase())
        if (replacement) {
          await fs.copyFile(replacement, target)
          replaced.push(f.rel)
        } else {
          await linkOrCopy(path.join(source, ...f.rel.split('/')), target, f.size)
        }
        onProgress({ phase: 'Préparation de la nouvelle version', current: i + 1, total: files.length, detail: f.rel })
      }
      // Images du pack (couverture, images de la Marketplace…) ; les réglages en jeu (user/) sont repris à part.
      for (const entry of await fs.readdir(this.packDir(fromId), { withFileTypes: true })) {
        if (!entry.isFile() || entry.name === 'pack.json') continue
        await fs.copyFile(path.join(this.packDir(fromId), entry.name), path.join(staging, entry.name))
      }
      await moveDir(staging, this.packDir(id))
    } catch (err) {
      await fs.rm(staging, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined)
      throw err
    }

    const now = new Date().toISOString()
    const manifest: StoredManifest = { ...structuredClone(from), id, importedAt: now, updatedAt: now, deleting: undefined, userConfigCount: 0 }
    await this.syncSizes(manifest, replaced)
    await this.refreshInsights(manifest)
    await this.save(manifest)
    log.info(`Nouvelle version de ${manifest.name} : ${replaced.length} fichier(s) remplacé(s)`)
    return { manifest, replaced }
  }

  /** Remplace sur place des fichiers d'un pack qui vient d'être importé (pas encore installé dans le jeu). */
  async replaceFiles(id: string, replacements: Map<string, string>): Promise<string[]> {
    const m = await this.get(id)
    const replaced: string[] = []
    for (const f of m.files) {
      const replacement = replacements.get(path.posix.basename(f.rel).toLowerCase())
      if (!replacement) continue
      await fs.copyFile(replacement, path.join(this.contentDir(id), ...f.rel.split('/')))
      replaced.push(f.rel)
    }
    if (replaced.length) {
      await this.syncSizes(m, replaced)
      await this.refreshInsights(m)
      await this.save(m)
    }
    return replaced
  }

  /** Tailles des fichiers remplacés, dans le manifeste. */
  private async syncSizes(m: StoredManifest, rels: string[]): Promise<void> {
    const changed = new Set(rels)
    for (const f of m.files) {
      if (changed.has(f.rel)) f.size = (await fs.stat(path.join(this.contentDir(m.id), ...f.rel.split('/')))).size
    }
    m.contentSize = m.files.reduce((sum, f) => sum + f.size, 0)
  }

  /** Les packs contiennent souvent d'autres archives (ex. « mods.rar » dans un .zip) : on les extrait sur place. */
  private async extractNested(root: string, onProgress: (p: ImportProgress) => void, signal?: AbortSignal): Promise<void> {
    for (let depth = 0; depth < MAX_NESTED_DEPTH; depth++) {
      const archives = (await walkFiles(root)).filter((f) => {
        const name = path.posix.basename(f.rel)
        if (!ARCHIVE_EXT.has(ext(name)) || isJunk(name)) return false
        const vol = rarVolumeIndex(name)
        return vol === null || vol === 1
      })
      if (!archives.length) return
      for (const a of archives) {
        const abs = path.join(root, ...a.rel.split('/'))
        const name = path.posix.basename(a.rel)
        const stem = name.replace(/(\.part0*1)?\.(zip|rar|7z)$/i, '')
        let target = path.join(path.dirname(abs), stem)
        if (await exists(target)) target = path.join(path.dirname(abs), `${stem} (archive)`)
        try {
          await extractInWorker(
            abs,
            target,
            (p) =>
              onProgress({
                phase: `Extraction de ${name}`,
                current: p.totalBytes ? p.bytes : p.files,
                total: p.totalBytes || p.totalFiles,
                detail: p.current
              }),
            signal
          )
          await fs.rm(abs, { force: true })
          // Parties suivantes d'une archive découpée
          if (rarVolumeIndex(name) === 1) {
            const base = name.replace(/\.part0*1\.rar$/i, '')
            for (const f of await fs.readdir(path.dirname(abs)))
              if (f.startsWith(base) && rarVolumeIndex(f) !== null) await fs.rm(path.join(path.dirname(abs), f), { force: true })
          }
        } catch (err) {
          await fs.rm(target, { recursive: true, force: true }).catch(() => undefined)
          log.warn(`Archive interne non extraite (${a.rel}) : ${(err as Error).message}`)
          // On renomme pour ne pas la retraiter à la profondeur suivante.
          await fs.rename(abs, `${abs}.non-extrait`).catch(() => undefined)
        }
      }
    }
  }

  private async detectPresets(raw: string, prefix: string, entries: PackFileEntry[]): Promise<Set<string>> {
    const out = new Set<string>()
    for (const e of entries) {
      if (ext(e.rel) !== '.ini' || e.size > 2_000_000) continue
      try {
        const abs = path.join(raw, ...(prefix + e.rel).split('/'))
        const head = (await fs.readFile(abs, 'utf8')).slice(0, 64_000)
        if (/^\s*Techniques\s*=/im.test(head) || /^\s*\[[^\]]+\.fx\]\s*$/im.test(head)) out.add(e.rel)
      } catch {
        /* ignore */
      }
    }
    return out
  }

  // -------------------------------------------------------------------------
  // Packs créés à partir d'une installation faite à la main.
  // Les fichiers sont déplacés (pas copiés) dans content/FiveM Application Data/... et content/GTA V/...,
  // puis le manifeste est écrit une fois le déplacement réussi.

  newCapturedId(name: string): string {
    return `${slugify(name)}-${newId()}`
  }

  capturedFile(id: string, root: RootId, rel: string): string {
    return path.join(this.contentDir(id), CAPTURE_TOP[root], ...rel.split('/'))
  }

  async uniqueName(base: string): Promise<string> {
    const names = new Set((await this.list()).map((m) => m.name.toLowerCase()))
    if (!names.has(base.toLowerCase())) return base
    for (let i = 2; ; i++) if (!names.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
  }

  async finalizeCaptured(id: string, name: string, items: { root: RootId; rel: string; size: number }[]): Promise<StoredManifest> {
    const files: PackFileEntry[] = items.map((it) => ({ rel: `${CAPTURE_TOP[it.root]}/${it.rel}`, size: it.size }))
    const components: AnalyzedComponent[] = (['fivem', 'gta'] as RootId[])
      .map((root) => {
        const list = files.filter((f) => f.rel.startsWith(`${CAPTURE_TOP[root]}/`))
        const c: AnalyzedComponent = {
          id: `captured-${root}`,
          source: CAPTURE_TOP[root],
          isFile: false,
          label: root === 'fivem' ? 'FiveM' : 'GTA V',
          kind: root === 'fivem' ? 'fivem-root' : 'gta-root',
          destination: { root, path: '' },
          suggested: { root, path: '' },
          enabled: true,
          optional: false,
          fileCount: list.length,
          size: list.reduce((s, f) => s + f.size, 0),
          reason: "Réinstallé exactement à l'emplacement d'origine",
          stripPrefix: `${CAPTURE_TOP[root]}/`,
          files: list.map((f) => f.rel)
        }
        return c
      })
      .filter((c) => c.files.length)
    const now = new Date().toISOString()
    const manifest: StoredManifest = {
      schema: 1,
      id,
      name,
      sourceArchive: '',
      sourceSize: 0,
      importedAt: now,
      updatedAt: now,
      contentSize: files.reduce((s, f) => s + f.size, 0),
      fileCount: files.length,
      components,
      features: detectFeatures(items.map((it) => it.rel)),
      warnings: [],
      cover: null,
      gallery: [],
      notes: '',
      captured: true,
      userConfigCount: 0,
      insights: [],
      reshadeVersion: null,
      files
    }
    await this.refreshInsights(manifest)
    await this.save(manifest)
    return manifest
  }
}

const CAPTURE_TOP: Record<RootId, string> = { fivem: 'FiveM Application Data', gta: 'GTA V' }
const RESHADE_FIXED = "Chemins du PC de l'auteur corrigés."

/** Gros fichiers : lien physique (même disque que la bibliothèque) ; petits fichiers ou disque sans liens : copie. */
const LINK_MIN_SIZE = 256 * 1024

async function linkOrCopy(from: string, to: string, size: number): Promise<void> {
  if (size >= LINK_MIN_SIZE) {
    try {
      await fs.link(from, to)
      return
    } catch {
      // Disque sans liens physiques (FAT32, réseau) : copie.
    }
  }
  await fs.copyFile(from, to)
}

export function cleanName(fileName: string): string {
  return (
    fileName
      .replace(/(\.part0*\d+)?\.(zip|rar|7z)$/i, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Pack sans nom'
  )
}

/** Version « publique » du manifeste envoyée à l'interface (sans les listes de fichiers). */
export function toPublic(m: StoredManifest): PackManifest {
  const { files: _files, sourceSize: _s, components, ...rest } = m
  void _files
  void _s
  return {
    ...rest,
    components: components.map(({ files: _f, stripPrefix: _p, ...c }) => {
      void _f
      void _p
      return c as PackComponent
    })
  }
}
