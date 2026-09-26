// Presets ReShade : ReShade charge le preset désigné par « PresetPath » dans ReShade.ini (dossier plugins sous FiveM).
// Sans cette ligne, il faut ouvrir le menu de ReShade en jeu pour choisir le preset du pack.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Destination } from '@shared/types'
import { base, ext } from './knowledge'

export const RESHADE_INI_DEST = 'plugins/reshade.ini'

// QuantV (version add-on de ReShade : QuantV.addon + QuantV.asi) impose à ReShade son propre preset : sa
// configuration intégrée contient « PresetPath=.\QuantV.preset.ini ». Le preset choisi pour le pack doit donc aussi
// se trouver dans ce fichier, sinon ReShade charge les réglages QuantV par défaut.
export const QUANTV_ADDON_DEST = 'plugins/quantv.addon'
export const QUANTV_PRESET_DEST = 'plugins/quantv.preset.ini'
/** Effets activés par QuantV quand son preset n'en indique pas d'autres (valeurs intégrées à QuantV.addon). */
export const QUANTV_DEFAULT_TECHNIQUES = 'QuantV@QuantV.fx,QuantV_PostFX@QuantV_Post.fx'

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

/**
 * Preset destiné à QuantV (QuantV.preset.ini) : même syntaxe que ReShade. Les effets QuantV y sont activés s'il leur
 * manque, et les réglages QuantV du pack (sections [QuantV*.fx] de son QuantV.preset.ini) ajoutés s'ils ne figurent
 * pas déjà dans le preset. Le reste du preset est gardé tel quel.
 */
export function mergeQuantvPreset(preset: string, quantvBase: string | null): string {
  const eol = preset.includes('\r\n') ? '\r\n' : '\n'
  const baseTechniques = splitList(iniTopValue(quantvBase ?? '', 'Techniques') ?? QUANTV_DEFAULT_TECHNIQUES).filter((t) => /quantv/i.test(t))
  const techniques = splitList(iniTopValue(preset, 'Techniques') ?? '')
  const missing = baseTechniques.filter((t) => !techniques.some((x) => x.toLowerCase() === t.toLowerCase()))
  let out = preset
  if (missing.length) {
    out = setTopList(out, 'Techniques', [...missing, ...techniques], eol)
    const sorting = iniTopValue(out, 'TechniqueSorting')
    if (sorting !== null) out = setTopList(out, 'TechniqueSorting', [...missing, ...splitList(sorting)], eol)
  }
  // Réglages QuantV du pack pour les effets QuantV que le preset ne règle pas.
  const present = new Set([...out.matchAll(/^\s*\[([^\]]+)\]\s*$/gm)].map((m) => m[1].trim().toLowerCase()))
  for (const block of sectionBlocks(quantvBase ?? '')) {
    if (!/quantv/i.test(block.name) || present.has(block.name.toLowerCase())) continue
    out = `${out.replace(/\s*$/, '')}${eol}${eol}${block.lines.join(eol)}${eol}`
  }
  return out
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Valeur d'une clé placée avant la première section (Techniques, TechniqueSorting…). */
function iniTopValue(content: string, key: string): string | null {
  const keyRe = new RegExp(`^\\s*${key}\\s*=(.*)$`, 'i')
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*\[.*\]\s*$/.test(line)) break
    const m = keyRe.exec(line)
    if (m) return m[1].trim()
  }
  return null
}

function setTopList(content: string, key: string, values: string[], eol: string): string {
  const lines = content.split(/\r?\n/)
  const keyRe = new RegExp(`^\\s*${key}\\s*=`, 'i')
  for (let i = 0; i < lines.length && !/^\s*\[.*\]\s*$/.test(lines[i]); i++) {
    if (keyRe.test(lines[i])) {
      lines[i] = `${key}=${values.join(',')}`
      return lines.join(eol)
    }
  }
  return [`${key}=${values.join(',')}`, ...lines].join(eol)
}

function sectionBlocks(content: string): { name: string; lines: string[] }[] {
  const blocks: { name: string; lines: string[] }[] = []
  for (const line of content.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (header) blocks.push({ name: header[1].trim(), lines: [line.trim()] })
    else if (blocks.length && line.trim()) blocks[blocks.length - 1].lines.push(line)
  }
  return blocks
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
    // Fichier de travail de QuantV (rempli à l'installation avec le preset choisi), pas un preset à proposer.
    if (dest.path.toLowerCase() === QUANTV_PRESET_DEST) continue
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
