import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { planUpdate, type RemoteFile } from '../src/main/core/marketUpdate'
import type { MarketplaceLink } from '../src/shared/types'

vi.mock('../src/main/archive', () => ({ sevenZipPath: () => null, extractInWorker: async () => undefined }))
const { Library } = await import('../src/main/core/library')

const link = (over: Partial<MarketplaceLink> = {}): MarketplaceLink => ({ id: 'p', slug: 'p', sha256: 'A', version: '', downloadedAt: '', ...over })
const file = (fileName: string, sha256: string, size = 10): RemoteFile => ({ id: `${fileName}-${sha256}`, fileName, size, sha256 })
const packFiles = [{ rel: 'plugins/QuantV.addon', size: 5 }, { rel: 'plugins/QuantV.asi', size: 5 }, { rel: 'mods/a.rpf', size: 5 }]

describe('planUpdate : que télécharger pour mettre un pack à jour ?', () => {
  it('même révision : rien', () => {
    expect(planUpdate({ marketplace: link(), files: packFiles }, { sha256: 'A', revision: 'A', files: [] })).toEqual({ kind: 'none' })
    // Pack téléchargé avant les fichiers mis à jour (pas de révision locale) et API ancienne (pas de révision).
    expect(planUpdate({ marketplace: link(), files: packFiles }, { sha256: 'A' })).toEqual({ kind: 'none' })
  })

  it('nouvelle archive : tout retélécharger', () => {
    expect(planUpdate({ marketplace: link(), files: packFiles }, { sha256: 'B', revision: 'B' })).toEqual({ kind: 'full' })
  })

  it('même archive, fichier mis à jour présent dans le pack : seulement ce fichier', () => {
    const addon = file('quantv.ADDON', 'x2')
    const plan = planUpdate({ marketplace: link(), files: packFiles }, { sha256: 'A', revision: 'R1', files: [addon, file('Autre.dll', 'y')] })
    expect(plan).toEqual({ kind: 'files', files: [addon] })
  })

  it('fichier mis à jour qui ne concerne pas ce pack : rien', () => {
    expect(planUpdate({ marketplace: link(), files: packFiles }, { sha256: 'A', revision: 'R1', files: [file('Autre.dll', 'y')] })).toEqual({ kind: 'none' })
  })

  it('fichier déjà appliqué : seuls les nouveaux ou modifiés', () => {
    const local = { marketplace: link({ revision: 'R1', files: [{ name: 'QuantV.addon', sha256: 'x2' }] }), files: packFiles }
    const asi = file('QuantV.asi', 'z1')
    expect(planUpdate(local, { sha256: 'A', revision: 'R2', files: [file('QuantV.addon', 'x2'), asi] })).toEqual({ kind: 'files', files: [asi] })
    const addon3 = file('QuantV.addon', 'x3')
    expect(planUpdate(local, { sha256: 'A', revision: 'R3', files: [addon3] })).toEqual({ kind: 'files', files: [addon3] })
  })

  it('fichier appliqué puis retiré en ligne : retour à l’archive, tout retélécharger', () => {
    const local = { marketplace: link({ revision: 'R1', files: [{ name: 'QuantV.addon', sha256: 'x2' }] }), files: packFiles }
    expect(planUpdate(local, { sha256: 'A', revision: 'A', files: [] })).toEqual({ kind: 'full' })
  })
})

describe('Library.derive / replaceFiles : nouvelle version sans retélécharger', () => {
  let root: string
  let lib: InstanceType<typeof Library>
  let firstId: string

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-derive-'))
    const source = path.join(root, 'source', 'Pack QuantV')
    await fs.mkdir(path.join(source, 'plugins'), { recursive: true })
    await fs.mkdir(path.join(source, 'mods'), { recursive: true })
    await fs.writeFile(path.join(source, 'plugins', 'QuantV.addon'), 'v1')
    await fs.writeFile(path.join(source, 'mods', 'big.rpf'), randomBytes(400 * 1024))
    lib = new Library(path.join(root, 'bibliotheque'))
    await fs.mkdir(lib.dir, { recursive: true })
    firstId = (await lib.import(path.join(root, 'source'), () => undefined)).id
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('remplace les fichiers du même nom et garde les autres (liens physiques pour les gros fichiers)', async () => {
    const first = await lib.get(firstId)
    const addonRel = first.files.find((f) => f.rel.endsWith('QuantV.addon'))!.rel
    const bigRel = first.files.find((f) => f.rel.endsWith('big.rpf'))!.rel
    const v2 = path.join(root, 'QuantV-v2.addon')
    await fs.writeFile(v2, 'version 2')

    const { manifest, replaced } = await lib.derive(firstId, new Map([['quantv.addon', v2]]), () => undefined)
    expect(manifest.id).not.toBe(firstId)
    expect(replaced).toEqual([addonRel])
    const read = (id: string, rel: string): Promise<string> => fs.readFile(path.join(lib.contentDir(id), ...rel.split('/')), 'utf8')
    expect(await read(manifest.id, addonRel)).toBe('version 2')
    expect(await read(firstId, addonRel)).toBe('v1')
    expect(manifest.files.find((f) => f.rel === addonRel)!.size).toBe(9)
    expect(manifest.contentSize).toBe(manifest.files.reduce((s, f) => s + f.size, 0))
    const [a, b] = await Promise.all([fs.stat(path.join(lib.contentDir(firstId), ...bigRel.split('/'))), fs.stat(path.join(lib.contentDir(manifest.id), ...bigRel.split('/')))])
    expect(b.size).toBe(a.size)
    expect(b.ino).toBe(a.ino)
    expect(manifest.components.length).toBe(first.components.length)

    const v3 = path.join(root, 'QuantV-v3.addon')
    await fs.writeFile(v3, 'v3')
    expect(await lib.replaceFiles(manifest.id, new Map([['quantv.addon', v3]]))).toEqual([addonRel])
    expect(await read(manifest.id, addonRel)).toBe('v3')
    expect((await lib.get(manifest.id)).files.find((f) => f.rel === addonRel)!.size).toBe(2)
  })
})
