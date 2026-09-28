// Packs protégés (chiffrés sur la Marketplace) : format du paquet écrit par l'API, puis parcours complet sur de faux
// dossiers FiveM / GTA V. Le contenu d'un pack protégé ne doit jamais se trouver en clair dans la bibliothèque : seulement
// dans le jeu, pendant qu'il y est installé.
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AppState, GamesInfo } from '../src/shared/types'

vi.mock('../src/main/archive', async () => {
  const ex = await import('../src/main/archive/extractors')
  return {
    sevenZipPath: () => null,
    extractInWorker: (file: string, target: string, onProgress: (p: unknown) => void) => ex.extractArchive(file, target, onProgress, null)
  }
})
vi.mock('../src/main/util/win', () => ({
  runningGameProcesses: async () => [],
  readRegistry: async () => ({ rockstarPaths: [], steamPath: null, fivemLastRun: null, fivemProtocol: null, uninstall: [] }),
  listProcesses: async () => [],
  runPowerShell: async () => ''
}))

const sealed = await import('../src/main/core/sealed')
const { KeyRing } = await import('../src/main/core/keys')
const { Library } = await import('../src/main/core/library')
const { Installer } = await import('../src/main/core/installer')
const { JsonStore, emptyState } = await import('../src/main/core/stores')
const { inspectFiveM, inspectGta } = await import('../src/main/core/games')
const { executePlan } = await import('../src/main/core/executor')

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex')
const report = (): void => undefined

/** Paquet chiffré au format de l'API (encryption/PackageFormat.java). */
function writePackage(files: { path: string; data: Buffer }[], key: Buffer): { bytes: Buffer; id: string } {
  const id = randomBytes(16)
  const parts: Buffer[] = [Buffer.concat([Buffer.from('FPMPACK1', 'latin1'), id, Buffer.alloc(8)])]
  let offset = 32
  const entries = files.map((f, i) => {
    const stream = sealed.sealBytes(f.data, sealed.hkdf(key, id, `fpm-pack/file/${i}`))
    parts.push(stream)
    const entry = { p: f.path, s: f.data.length, o: offset, l: stream.length }
    offset += stream.length
    return entry
  })
  const index = sealed.sealBytes(Buffer.from(JSON.stringify({ v: 1, files: entries })), sealed.hkdf(key, id, 'fpm-pack/index'))
  const trailer = Buffer.alloc(16)
  trailer.writeBigUInt64BE(BigInt(offset), 0)
  trailer.writeBigUInt64BE(BigInt(index.length), 8)
  return { bytes: Buffer.concat([...parts, index, trailer]), id: id.toString('hex') }
}

describe('format du paquet chiffré', () => {
  const fixture = path.join(__dirname, 'fixtures', 'sample.fpk')
  const key = Buffer.from('09c0e5af57ca3f2d94e80595a64bcaf78d088c7eaa396de66ebed7536eef029e', 'hex')

  it('lit le paquet de référence écrit par l’API (Java)', async () => {
    expect(await sealed.packageId(fixture)).toBe('15735e1bb091b287542fd41564f180a2')
    const index = await sealed.readPackageIndex(fixture, key)
    expect(index.id).toBe('15735e1bb091b287542fd41564f180a2')
    expect(index.entries.map((e) => [e.path, e.size])).toEqual([
      ['Pack de test/plugins/Réglages été.ini', 19],
      ['Pack de test/enb/enbseries.ini', 1100006],
      ['Pack de test/mods/aleatoire.rpf', 5000],
      ['Pack de test/vide.txt', 0]
    ])
    const hashes = await Promise.all(index.entries.map(async (e) => sha256(await sealed.unsealToBuffer(fixture, e.ref))))
    expect(hashes).toEqual([
      '43af63e3d839f0104d681e1b27d2003fda45fa108d5e1604304a94d58e7ea7f7',
      '1dadaa716e63e9cc9ce42d891f223e7a103003176c1147aa99df1ba13b75ed8f',
      '0a02b6deb73f2e9a4a150f2f01aab2eaef4856523237f1b24595e1313da8f702',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    ])
    // Premiers octets seulement : pas besoin de tout déchiffrer.
    const head = await sealed.unsealToBuffer(fixture, index.entries[1].ref, 10)
    expect(head.toString()).toBe('ligne 0\nli')
  })

  it('refuse une mauvaise clé, un paquet modifié ou tronqué', async () => {
    const wrong = Buffer.from(key)
    wrong[0] ^= 1
    await expect(sealed.readPackageIndex(fixture, wrong)).rejects.toThrow()

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-fpk-'))
    try {
      const data = await fs.readFile(fixture)
      const index = await sealed.readPackageIndex(fixture, key)
      const altered = Buffer.from(data)
      altered[index.entries[2].ref.offset + 20] ^= 1
      await fs.writeFile(path.join(dir, 'modifie.fpk'), altered)
      await expect(sealed.unsealToBuffer(path.join(dir, 'modifie.fpk'), index.entries[2].ref)).rejects.toThrow(sealed.SealedError)
      // Flux raccourci d'un morceau entier : le dernier morceau restant n'est pas marqué comme dernier.
      const big = index.entries[1].ref
      const first = data.readUInt32BE(big.offset)
      await expect(sealed.unsealToBuffer(fixture, { ...big, length: 4 + first })).rejects.toThrow(sealed.SealedError)
      await fs.writeFile(path.join(dir, 'tronque.fpk'), data.subarray(0, data.length - 30))
      await expect(sealed.readPackageIndex(path.join(dir, 'tronque.fpk'), key)).rejects.toThrow()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('chiffre les fichiers locaux, sans les rendre lisibles avec une autre clé locale', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-seal-'))
    try {
      const local = randomBytes(32)
      const big = Buffer.concat([randomBytes(1 << 20), Buffer.from('SECRET'.repeat(300_000))])
      await fs.writeFile(path.join(dir, 'source.ini'), big)
      await sealed.sealFileFrom(path.join(dir, 'source.ini'), path.join(dir, 'a', 'copie.ini'), local)
      const stored = await fs.readFile(path.join(dir, 'a', 'copie.ini'))
      expect(stored.subarray(0, 8).toString()).toBe('FPMSEAL1')
      expect(stored.includes(Buffer.from('SECRET'))).toBe(false)
      expect((await sealed.readSealedFile(path.join(dir, 'a', 'copie.ini'), local)).equals(big)).toBe(true)
      await expect(sealed.readSealedFile(path.join(dir, 'a', 'copie.ini'), randomBytes(32))).rejects.toThrow(sealed.SealedError)

      await sealed.writeSealedFile(path.join(dir, 'vide.ini'), Buffer.alloc(0), local)
      expect((await sealed.readSealedFile(path.join(dir, 'vide.ini'), local)).length).toBe(0)
      expect(await sealed.sealedFileRef(path.join(dir, 'source.ini'), local)).toBeNull()

      const packageKey = randomBytes(32)
      const wrapped = sealed.wrapKey(packageKey, local)
      expect(sealed.unwrapKey(wrapped, local)?.equals(packageKey)).toBe(true)
      expect(sealed.unwrapKey(wrapped, randomBytes(32))).toBeNull()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('déchiffre directement à la destination, et annule proprement', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-unseal-'))
    try {
      const key = randomBytes(32)
      const data = randomBytes(3 * (1 << 20) + 7)
      const { bytes } = writePackage([{ path: 'mods/a.rpf', data }], key)
      const file = path.join(dir, 'p.fpk')
      await fs.writeFile(file, bytes)
      const [entry] = (await sealed.readPackageIndex(file, key)).entries
      const to = path.join(dir, 'jeu', 'mods', 'a.rpf')
      const ok = await executePlan({ id: 't', title: 't', mode: 'atomic', ops: [{ t: 'unseal', from: file, ...entry.ref, to, size: data.length }] }, () => undefined)
      expect(ok.ok).toBe(true)
      expect((await fs.readFile(to)).equals(data)).toBe(true)
      // Destination occupée : échec, rien n'est écrasé.
      const again = await executePlan({ id: 't2', title: 't', mode: 'atomic', ops: [{ t: 'unseal', from: file, ...entry.ref, to, size: 1 }] }, () => undefined)
      expect(again.ok).toBe(false)
      expect((await fs.readFile(to)).equals(data)).toBe(true)
      // Mauvaise clé : le fichier incomplet est supprimé.
      const bad = path.join(dir, 'jeu', 'mods', 'b.rpf')
      const failed = await executePlan(
        { id: 't3', title: 't', mode: 'atomic', ops: [{ t: 'unseal', from: file, ...entry.ref, key: randomBytes(32).toString('hex'), to: bad, size: 1 }] },
        () => undefined
      )
      expect(failed.ok).toBe(false)
      expect(existsSync(bad)).toBe(false)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('pack protégé dans la bibliothèque et le jeu', () => {
  let root: string
  let fivem: string
  let gta: string
  let libDir: string
  let installer: InstanceType<typeof Installer>
  let library: InstanceType<typeof Library>
  let state: InstanceType<typeof JsonStore<AppState>>
  let fpsLimit: number | null = null
  let packId = ''
  const key = randomBytes(32)
  let packageIdHex = ''
  let fetched = 0
  let serverPackageId = ''

  const rpf = Buffer.concat([Buffer.from('SECRET-RPF'), randomBytes(2 * (1 << 20) + 5)])
  const enblocal = '[PROXY]\r\nEnableProxyLibrary=false\r\n\r\n[LIMITER]\r\nEnableFPSLimit=true\r\nFPSLimit=60.0\r\n; SECRET-LOCAL\r\n'
  const files = [
    { path: 'Pack Protégé/enb/enbseries.ini', data: Buffer.from('[SECRET-ENB]\r\n') },
    { path: 'Pack Protégé/enb/enblocal.ini', data: Buffer.from(enblocal) },
    { path: 'Pack Protégé/enb/d3dcompiler_46e.dll', data: Buffer.from('dll SECRET-DLL') },
    { path: 'Pack Protégé/mods/routes.rpf', data: rpf },
    { path: 'Pack Protégé/plugins/dxgi.dll', data: Buffer.from('reshade SECRET-RESHADE') },
    {
      path: 'Pack Protégé/plugins/ReShade.ini',
      data: Buffer.from('[GENERAL]\r\nEffectSearchPaths=C:\\Users\\auteur\\reshade-shaders\\Shaders\\**\r\nPresetPath=C:\\Users\\auteur\\Preset.ini\r\n')
    },
    { path: 'Pack Protégé/plugins/Preset.ini', data: Buffer.from('Techniques=A@a.fx\r\n; SECRET-PRESET\r\n') },
    { path: 'Pack Protégé/plugins/reshade-shaders/Shaders/a.fx', data: Buffer.from('SECRET-SHADER') },
    { path: 'Pack Protégé/Thumbs.db', data: Buffer.from('parasite') }
  ]

  const write = async (p: string, content: string | Buffer = 'x'): Promise<void> => {
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, content)
  }
  const games = async (): Promise<GamesInfo> => ({
    fivem: await inspectFiveM(fivem, 'test'),
    gta: await inspectGta(gta, 'test'),
    fivemCandidates: [],
    gtaCandidates: [],
    mismatch: false,
    runningProcesses: []
  })
  const keyRing = (file: string): InstanceType<typeof KeyRing> =>
    new KeyRing(file, { available: () => true, protect: (b) => b, unprotect: (b) => b }, async () => {
      fetched++
      return { packageId: serverPackageId, key }
    })
  const makeInstaller = (lib: InstanceType<typeof Library>): InstanceType<typeof Installer> =>
    new Installer({ jobsDir: path.join(root, 'data', 'jobs'), library: () => lib, state, detectGames: games, fpsLimit: () => fpsLimit })

  /** Fichiers de la bibliothèque qui contiennent en clair un morceau du contenu du pack. */
  async function plainInLibrary(): Promise<string[]> {
    const out: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) await walk(p)
        else if ((await fs.readFile(p)).includes(Buffer.from('SECRET'))) out.push(path.relative(libDir, p))
      }
    }
    await walk(libDir)
    return out
  }

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-protected-'))
    fivem = path.join(root, 'FiveM', 'FiveM.app')
    gta = path.join(root, 'GTA V')
    libDir = path.join(root, 'Bibliotheque')
    await write(path.join(fivem, 'CoreRT.dll'))
    await write(path.join(fivem, 'citizen', 'version.txt'))
    await write(path.join(fivem, 'CitizenFX.ini'), `[Game]\r\nIVPath=${gta}\r\nSavedBuildNumber=3095\r\n`)
    for (const f of ['GTA5.exe', 'common.rpf', 'x64a.rpf', 'x64b.rpf', 'update/update.rpf', 'x64/audio/audio_rel.rpf', 'd3dcompiler_46.dll'])
      await write(path.join(gta, ...f.split('/')))
    state = new JsonStore<AppState>(path.join(root, 'data', 'state.json'), emptyState())
    await state.load(emptyState())
    library = new Library(libDir, keyRing(path.join(root, 'data', 'protection.key')))
    installer = makeInstaller(library)
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('ajoute le pack sans rien extraire : le paquet est gardé chiffré', async () => {
    const pkg = writePackage(files, key)
    packageIdHex = pkg.id
    serverPackageId = pkg.id
    const download = path.join(libDir, '.downloads', 'x', 'Pack Protégé.fpk')
    await write(download, pkg.bytes)
    const m = await library.importPackage(download, key, { name: 'Pack Protégé.zip', size: 1234 }, () => undefined)
    packId = m.id
    // Lien avec la fiche, posé par la Marketplace après l'ajout (applyMetadata).
    m.marketplace = { id: 'fiche', slug: 'pack-protege', sha256: 'a'.repeat(64), version: '1', downloadedAt: new Date().toISOString() }
    await library.save(m)
    expect(existsSync(download)).toBe(false)
    expect(existsSync(library.contentDir(m.id))).toBe(false)
    expect((await fs.readFile(library.packageFile(m.id))).equals(pkg.bytes)).toBe(true)
    expect(m.protection?.packageId).toBe(packageIdHex)
    expect(m.name).toBe('Pack Protégé')
    // Analyse faite sur le contenu chiffré : dossier enveloppe retiré, parasites ignorés, preset reconnu.
    expect(m.fileCount).toBe(8)
    expect(m.files.map((f) => f.rel)).not.toContain('Thumbs.db')
    expect(m.components.map((c) => [c.source, c.destination?.root, c.destination?.path])).toEqual(
      expect.arrayContaining([
        ['mods', 'fivem', 'mods'],
        ['plugins', 'fivem', 'plugins'],
        ['enb', 'gta', '']
      ])
    )
    expect(m.reshadePreset).toBe('plugins/Preset.ini')
    expect(m.insights.some((i) => i.title === 'ReShade.ini')).toBe(true)
    expect(m.gallery).toEqual([])
    expect(await plainInLibrary()).toEqual([])
    // L'interface sait qu'il est protégé, sans voir sa clé.
    const { toPublic } = await import('../src/main/core/library')
    const pub = toPublic(m) as unknown as Record<string, unknown>
    expect(pub.protected).toBe(true)
    expect(JSON.stringify(pub)).not.toContain(m.protection!.key)
  })

  it('installe le pack en déchiffrant chaque fichier à sa place dans le jeu', async () => {
    await installer.apply(packId, report)
    expect((await fs.readFile(path.join(fivem, 'mods', 'routes.rpf'))).equals(rpf)).toBe(true)
    expect(await fs.readFile(path.join(fivem, 'plugins', 'reshade-shaders', 'Shaders', 'a.fx'), 'utf8')).toBe('SECRET-SHADER')
    expect(await fs.readFile(path.join(gta, 'enbseries.ini'), 'utf8')).toBe('[SECRET-ENB]\r\n')
    // ReShade.ini : chemins de l'auteur corrigés et preset du pack chargé directement.
    const ini = await fs.readFile(path.join(fivem, 'plugins', 'ReShade.ini'), 'utf8')
    expect(ini).not.toContain('C:\\Users\\auteur')
    expect(ini).toContain('PresetPath=.\\Preset.ini')
    // Aucun lien physique vers la bibliothèque : les fichiers du jeu sont des copies déchiffrées.
    expect(state.get().active?.files.every((f) => !f.linked)).toBe(true)
    expect(await plainInLibrary()).toEqual([])
  })

  it('garde chiffrés les réglages modifiés en jeu, et les réinstalle', async () => {
    await fs.writeFile(path.join(gta, 'enbseries.ini'), '[SECRET-ENB]\r\nretouche=1\r\n')
    await fs.writeFile(path.join(fivem, 'plugins', 'Preset.ini'), 'Techniques=A@a.fx\r\n; SECRET-PRESET retouché\r\n')
    await installer.removeActive(report)
    expect(existsSync(path.join(fivem, 'mods', 'routes.rpf'))).toBe(false)
    expect(existsSync(path.join(gta, 'enbseries.ini'))).toBe(false)
    expect(existsSync(path.join(fivem, 'plugins', 'Preset.ini'))).toBe(false)
    const m = await library.get(packId)
    expect(m.userConfigCount).toBe(2)
    const user = await fs.readFile(library.userFile(packId, { root: 'gta', path: 'enbseries.ini' }))
    expect(user.subarray(0, 8).toString()).toBe('FPMSEAL1')
    // Plus rien du pack en clair sur le disque, ni dans le jeu ni dans la bibliothèque.
    expect(await plainInLibrary()).toEqual([])

    await installer.apply(packId, report)
    expect(await fs.readFile(path.join(gta, 'enbseries.ini'), 'utf8')).toBe('[SECRET-ENB]\r\nretouche=1\r\n')
    expect(await fs.readFile(path.join(fivem, 'plugins', 'Preset.ini'), 'utf8')).toContain('retouché')
  })

  it('réinstalle le même pack avec les retouches de la partie en cours', async () => {
    await fs.writeFile(path.join(gta, 'enbseries.ini'), '[SECRET-ENB]\r\nretouche=2\r\n')
    await installer.apply(packId, report)
    expect(await fs.readFile(path.join(gta, 'enbseries.ini'), 'utf8')).toBe('[SECRET-ENB]\r\nretouche=2\r\n')
    expect(await plainInLibrary()).toEqual([])
  })

  it('applique la limite d’images par seconde avec une copie chiffrée d’enblocal.ini', async () => {
    fpsLimit = 90
    expect(await installer.applyFpsLimit(report)).toBe(1)
    const installed = await fs.readFile(path.join(gta, 'enblocal.ini'), 'utf8')
    expect(installed).toContain('FPSLimit=90.0')
    expect(installed).toContain('SECRET-LOCAL')
    fpsLimit = null
    expect(await plainInLibrary()).toEqual([])
    await installer.removeActive(report)
    expect(await plainInLibrary()).toEqual([])
  })

  it('bibliothèque copiée sur un autre PC : clé redemandée au serveur, réglages locaux ignorés', async () => {
    const other = new Library(libDir, keyRing(path.join(root, 'autre-pc', 'protection.key')))
    const otherInstaller = makeInstaller(other)
    await otherInstaller.apply(packId, report)
    expect(fetched).toBe(1)
    // Réglages chiffrés avec l'autre clé locale : illisibles, le fichier d'origine du pack est installé.
    expect(await fs.readFile(path.join(gta, 'enbseries.ini'), 'utf8')).toBe('[SECRET-ENB]\r\n')
    await otherInstaller.removeActive(report)
    // Clé gardée chiffrée avec la nouvelle clé locale : plus besoin du serveur.
    await other.refreshInsights(await other.get(packId))
    expect(fetched).toBe(1)

    // Le serveur a une nouvelle version : l'ancienne ne peut plus être déverrouillée.
    serverPackageId = 'f'.repeat(32)
    const third = new Library(libDir, keyRing(path.join(root, 'troisieme-pc', 'protection.key')))
    await expect(makeInstaller(third).apply(packId, report)).rejects.toThrow(/nouvelle version/)
    expect(existsSync(path.join(fivem, 'mods', 'routes.rpf'))).toBe(false)
  })

  it('reprend les réglages d’une version en clair dans une nouvelle version protégée, chiffrés', async () => {
    const plainDir = path.join(root, 'pack-en-clair')
    await write(path.join(plainDir, 'Pack/enb/enbseries.ini'), '[ENB en clair]')
    const plain = await library.import(plainDir, () => undefined)
    await write(library.userFile(plain.id, { root: 'gta', path: 'enbseries.ini' }), '[retouche en clair SECRET-USER]')
    await library.copyUserConfigs(plain.id, packId)
    const copy = await fs.readFile(library.userFile(packId, { root: 'gta', path: 'enbseries.ini' }))
    expect(copy.subarray(0, 8).toString()).toBe('FPMSEAL1')
    expect((await library.readUserFile(await library.get(packId), { root: 'gta', path: 'enbseries.ini' }))?.toString()).toBe('[retouche en clair SECRET-USER]')
    await library.remove(plain.id)
    expect(await plainInLibrary()).toEqual([])
  })
})
