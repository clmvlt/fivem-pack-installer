// Dossier de données de l'application : %LOCALAPPDATA%\Reflect FiveM.
//
// Les versions publiées sous l'ancien nom utilisaient %LOCALAPPDATA%\FiveM Pack Manager : au premier lancement, ce
// dossier est renommé (instantané, même disque : les liens physiques des packs installés restent valables) et le
// dossier des packs enregistré dans settings.json suit s'il était dedans. Si le renommage est impossible (dossier
// utilisé par l'ancienne version encore ouverte, antivirus…), l'ancien dossier reste utilisé et le renommage est
// retenté au lancement suivant.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const DATA_DIR_NAME = 'Reflect FiveM'
export const OLD_DATA_DIR_NAME = 'FiveM Pack Manager'

export interface DataDirChoice {
  dir: string
  /** Résultat du renommage de l'ancien dossier, à journaliser (null : rien à faire). */
  note: string | null
}

export function resolveDataDir(localAppData: string): DataDirChoice {
  const dir = path.join(localAppData, DATA_DIR_NAME)
  const oldDir = path.join(localAppData, OLD_DATA_DIR_NAME)
  if (existsSync(dir) || !existsSync(oldDir)) return { dir, note: null }
  try {
    renameSync(oldDir, dir)
  } catch (err) {
    return { dir: oldDir, note: `Dossier de données non renommé (${(err as Error).message}) : ${oldDir} reste utilisé.` }
  }
  try {
    moveLibrarySetting(path.join(dir, 'settings.json'), oldDir, dir)
  } catch (err) {
    // Sans le nouveau chemin des packs, la bibliothèque paraîtrait vide : retour à l'ancien dossier.
    try {
      renameSync(dir, oldDir)
      return { dir: oldDir, note: `Dossier de données non renommé (réglages : ${(err as Error).message}) : ${oldDir} reste utilisé.` }
    } catch {
      return { dir, note: `Dossier de données renommé, mais réglages non mis à jour : ${(err as Error).message}` }
    }
  }
  return { dir, note: `Dossier de données renommé : ${oldDir} -> ${dir}` }
}

/** Dossier des packs enregistré dans l'ancien dossier de données : même chemin relatif dans le nouveau. */
function moveLibrarySetting(file: string, oldDir: string, dir: string): void {
  let settings: Record<string, unknown>
  try {
    settings = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return // pas de réglages : chemin par défaut, déjà dans le nouveau dossier
  }
  if (typeof settings.libraryDir !== 'string') return
  const rel = path.relative(path.resolve(oldDir), path.resolve(settings.libraryDir))
  if (rel.startsWith('..') || path.isAbsolute(rel)) return // dossier choisi ailleurs : inchangé
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify({ ...settings, libraryDir: path.join(dir, rel) }, null, 2), 'utf8')
  renameSync(tmp, file)
}
