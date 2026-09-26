// Presets ReShade : ReShade charge le preset désigné par « PresetPath » dans ReShade.ini (dossier plugins sous FiveM).
// Sans cette ligne, il faut ouvrir le menu de ReShade en jeu pour choisir le preset du pack.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Destination } from '@shared/types'
import { base, ext } from './knowledge'

export const RESHADE_INI_DEST = 'plugins/reshade.ini'

/** ReShade.ini minimal, créé quand un pack fournit ReShade sans son fichier de configuration. */
export function defaultReshadeIni(presetValue: string): string {
  return [
    '[GENERAL]',
    'EffectSearchPaths=.\\reshade-shaders\\Shaders\\**',
    'TextureSearchPaths=.\\reshade-shaders\\Textures\\**',
    `PresetPath=${presetValue}`,
    `StartupPresetPath=${presetValue}`,
    '',
    '[OVERLAY]',
    'TutorialProgress=4',
    ''
  ].join('\r\n')
}

export function looksLikePreset(text: string): boolean {
  return /^\s*Techniques\s*=/im.test(text)
}

/** Valeur d'une clé (première occurrence, toutes sections confondues). */
export function iniGet(content: string, key: string): string | null {
  const m = new RegExp(`^\\s*${key}\\s*=(.*)$`, 'im').exec(content)
  return m ? m[1].trim() : null
}

/** Écrit « key=value » dans la section, en conservant tout le reste du fichier ; ajoute la clé ou la section si besoin. */
export function iniSet(content: string, section: string, key: string, value: string): string {
  const eol = content.includes('\r\n') || !content ? '\r\n' : '\n'
  const lines = content ? content.split(/\r?\n/) : []
  const header = lines.findIndex((l) => l.trim().toLowerCase() === `[${section.toLowerCase()}]`)
  if (header < 0) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    const block = [`[${section}]`, `${key}=${value}`]
    return [...(lines.length ? [...lines, ''] : []), ...block, ''].join(eol)
  }
  let end = lines.length
  for (let i = header + 1; i < lines.length; i++) if (/^\s*\[.*\]\s*$/.test(lines[i])) {
    end = i
    break
  }
  const keyRe = new RegExp(`^\\s*${key}\\s*=`, 'i')
  for (let i = header + 1; i < end; i++) {
    if (keyRe.test(lines[i])) {
      lines[i] = `${key}=${value}`
      return lines.join(eol)
    }
  }
  // Clé absente : ajoutée à la fin de la section (avant les lignes vides qui la séparent de la suivante).
  let insert = end
  while (insert > header + 1 && lines[insert - 1].trim() === '') insert--
  lines.splice(insert, 0, `${key}=${value}`)
  return lines.join(eol)
}

/** « .\presets\A.ini » (relatif à plugins) → « plugins/presets/A.ini ». Un chemin absolu est ramené à son nom de fichier. */
export function presetDestFromIni(value: string | null): string | null {
  if (!value) return null
  let v = value.trim().replace(/^"|"$/g, '').replace(/\\/g, '/')
  if (!v) return null
  if (/^[a-zA-Z]:\//.test(v) || v.startsWith('//')) v = v.split('/').pop() ?? v
  v = v.replace(/^(\.\/)+/, '')
  return `plugins/${v}`
}

export function presetIniValue(destPath: string): string {
  return `.\\${destPath.replace(/^plugins\//i, '').split('/').join('\\')}`
}

/** Presets ReShade d'un pack (fichiers .ini destinés à plugins et contenant « Techniques= »), et celui désigné par son ReShade.ini. */
export async function detectPresets(
  contentDir: string,
  installMap: { rel: string; dest: Destination }[]
): Promise<{ presets: string[]; fromIni: string | null }> {
  const presets: string[] = []
  let reshadeIni: string | null = null
  for (const { rel, dest } of installMap) {
    if (dest.root !== 'fivem' || !/^plugins\//i.test(dest.path) || ext(rel) !== '.ini') continue
    if (dest.path.toLowerCase() === RESHADE_INI_DEST) {
      reshadeIni = rel
      continue
    }
    try {
      const h = await fs.open(path.join(contentDir, ...rel.split('/')), 'r')
      const buf = Buffer.alloc(64 * 1024)
      const { bytesRead } = await h.read(buf, 0, buf.length, 0)
      await h.close()
      if (looksLikePreset(buf.subarray(0, bytesRead).toString('utf8'))) presets.push(rel)
    } catch {
      /* fichier illisible : ignoré */
    }
  }
  let fromIni: string | null = null
  if (reshadeIni) {
    try {
      const target = presetDestFromIni(iniGet(await fs.readFile(path.join(contentDir, ...reshadeIni.split('/')), 'utf8'), 'PresetPath'))
      fromIni = presets.find((p) => installMap.find((m) => m.rel === p)?.dest.path.toLowerCase() === target?.toLowerCase()) ?? null
    } catch {
      /* ignoré */
    }
  }
  return { presets, fromIni }
}

/** Preset par défaut : celui du ReShade.ini du pack, sinon le seul présent, sinon le plus probable. */
export function choosePreset(presets: string[], fromIni: string | null, packName: string): string | null {
  if (fromIni && presets.includes(fromIni)) return fromIni
  if (presets.length <= 1) return presets[0] ?? null
  const words = packName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
  const score = (rel: string): number => {
    const n = base(rel).toLowerCase()
    let s = 0
    if (n.includes('preset')) s += 3
    if (words.some((w) => n.includes(w))) s += 2
    // Configurations de plugins qui ressemblent à des presets (NVE, QuantV) : choisies en dernier.
    if (/^(nve|quantv|enbfeeder)\.ini$/.test(n)) s -= 3
    return s
  }
  return [...presets].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0]
}
