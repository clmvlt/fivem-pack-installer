// Dossier de données : renommage de l'ancien dossier « FiveM Pack Manager » au premier lancement sous le nouveau nom.
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDataDir } from '../src/main/core/dataDir'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function localAppData(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pm data '))
  dirs.push(dir)
  return dir
}

function oldInstall(root: string, libraryDir: string): string {
  const old = path.join(root, 'FiveM Pack Manager')
  mkdirSync(path.join(old, 'Bibliotheque', 'bh-1960'), { recursive: true })
  writeFileSync(path.join(old, 'Bibliotheque', 'bh-1960', 'pack.json'), '{}')
  writeFileSync(path.join(old, 'settings.json'), JSON.stringify({ libraryDir, fivemPath: 'D:\\FiveM', gtaPath: null }))
  return old
}

const settingsOf = (dir: string): Record<string, unknown> => JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf8'))

describe('resolveDataDir', () => {
  it('nouvelle installation : nouveau dossier, rien à renommer', () => {
    const root = localAppData()
    expect(resolveDataDir(root)).toEqual({ dir: path.join(root, 'Reflect FiveM'), note: null })
  })

  it("renomme l'ancien dossier et y fait suivre le dossier des packs", () => {
    const root = localAppData()
    const old = oldInstall(root, path.join(root, 'FiveM Pack Manager', 'Bibliotheque'))
    const { dir, note } = resolveDataDir(root)
    expect(dir).toBe(path.join(root, 'Reflect FiveM'))
    expect(note).toContain('renommé')
    expect(existsSync(old)).toBe(false)
    expect(existsSync(path.join(dir, 'Bibliotheque', 'bh-1960', 'pack.json'))).toBe(true)
    expect(settingsOf(dir)).toEqual({ libraryDir: path.join(dir, 'Bibliotheque'), fivemPath: 'D:\\FiveM', gtaPath: null })
  })

  it('dossier des packs choisi ailleurs : inchangé', () => {
    const root = localAppData()
    oldInstall(root, 'E:\\Packs')
    const { dir } = resolveDataDir(root)
    expect(settingsOf(dir).libraryDir).toBe('E:\\Packs')
  })

  it.runIf(process.platform === 'win32')("ancien dossier encore utilisé (fichier ouvert) : gardé, renommage retenté plus tard", () => {
    const root = localAppData()
    const old = oldInstall(root, path.join(root, 'FiveM Pack Manager', 'Bibliotheque'))
    const fd = openSync(path.join(old, 'settings.json'), 'r')
    try {
      const { dir, note } = resolveDataDir(root)
      expect(dir).toBe(old)
      expect(note).toContain('non renommé')
      expect(existsSync(path.join(root, 'Reflect FiveM'))).toBe(false)
    } finally {
      closeSync(fd)
    }
    expect(resolveDataDir(root).dir).toBe(path.join(root, 'Reflect FiveM'))
  })

  it('nouveau dossier déjà présent : utilisé tel quel, ancien dossier laissé', () => {
    const root = localAppData()
    const old = oldInstall(root, path.join(root, 'FiveM Pack Manager', 'Bibliotheque'))
    mkdirSync(path.join(root, 'Reflect FiveM'))
    expect(resolveDataDir(root)).toEqual({ dir: path.join(root, 'Reflect FiveM'), note: null })
    expect(existsSync(old)).toBe(true)
  })
})
