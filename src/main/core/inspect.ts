// Vérifications de compatibilité FiveM d'un pack importé (à partir des fichiers réels, pas seulement des noms).

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Destination, Insight } from '@shared/types'
import { inspectPe, inspectRpf, parseVersion, versionAtLeast } from './binary'
import { base, ext, PROXY_DLLS } from './knowledge'

/** À incrémenter quand les vérifications changent : les packs déjà importés sont revérifiés. */
export const INSIGHTS_VERSION = 3

export interface InspectResult {
  insights: Insight[]
  reshadeVersion: string | null
}

const topLevel = (dest: Destination, dir: string): boolean => dest.root === 'fivem' && new RegExp(`^${dir}/[^/]+$`, 'i').test(dest.path)

export async function inspectPack(contentDir: string, installMap: { rel: string; dest: Destination }[]): Promise<InspectResult> {
  const insights: Insight[] = []
  let reshadeVersion: string | null = null
  const abs = (rel: string): string => path.join(contentDir, ...rel.split('/'))

  for (const { rel, dest } of installMap) {
    const name = base(rel)
    const lower = name.toLowerCase()
    const e = ext(lower)

    if (PROXY_DLLS.has(lower)) {
      if (dest.root === 'gta') {
        insights.push({ rel, level: 'warn', title: name, text: 'Dans le dossier GTA V, FiveM ne la charge pas.' })
        continue
      }
      if (!topLevel(dest, 'plugins')) continue
      const pe = await inspectPe(abs(rel))
      const product = (pe?.productName ?? '').trim()
      const v = parseVersion(pe?.productVersion ?? pe?.fileVersion ?? null)
      const vs = v.join('.')
      if (/^reshade$/i.test(product)) {
        reshadeVersion = vs || null
        if (!versionAtLeast(v, [3, 1])) insights.push({ rel, level: 'bad', title: `ReShade ${vs}`, text: 'Trop ancien, refusé par FiveM.' })
        else if (vs.startsWith('5.9.0')) insights.push({ rel, level: 'bad', title: `ReShade ${vs}`, text: 'Version bloquée par FiveM.' })
        else if (versionAtLeast(v, [5])) insights.push({ rel, level: 'ok', title: `ReShade ${vs}`, text: 'Accepté par FiveM.' })
        else insights.push({ rel, level: 'ok', title: `ReShade ${vs}`, text: 'Accepté par FiveM.' })
      } else if (/^enbseries$/i.test(product)) {
        const old = !versionAtLeast(v, [0, 3, 8, 7]) || /2019,\s*Boris/i.test(pe?.copyright ?? '')
        insights.push(
          old
            ? { rel, level: 'bad', title: `ENBSeries ${vs}`, text: 'Trop ancien, refusé par FiveM.' }
            : { rel, level: 'ok', title: `ENBSeries ${vs}`, text: 'Accepté par FiveM.' }
        )
      } else {
        insights.push({ rel, level: 'warn', title: name, text: 'Ni ReShade ni ENB : ignorée par FiveM.' })
      }
      continue
    }

    if (e === '.asi') {
      if (lower === 'openiv.asi') {
        insights.push({ rel, level: 'bad', title: name, text: 'Provoque une erreur fatale dans FiveM.' })
        continue
      }
      if (!topLevel(dest, 'plugins')) {
        insights.push({ rel, level: 'warn', title: name, text: 'Hors de plugins, FiveM ne le charge pas.' })
        continue
      }
      const pe = await inspectPe(abs(rel))
      if (!pe) continue
      if (!pe.asiBuilds.length)
        insights.push({ rel, level: 'warn', title: name, text: 'Ne déclare aucune build : FiveM ne le chargera pas.' })
      else
        insights.push({
          rel,
          level: 'info',
          title: name,
          text: `Builds ${pe.asiBuilds[0]} à ${pe.asiBuilds[pe.asiBuilds.length - 1]}.`,
          builds: pe.asiBuilds
        })
      continue
    }

    if (e === '.rpf' && dest.root === 'fivem' && /^mods\//i.test(dest.path)) {
      if (!topLevel(dest, 'mods')) {
        insights.push({ rel, level: 'warn', title: name, text: 'Dans un sous-dossier de mods, ignoré par FiveM.' })
        continue
      }
      const r = await inspectRpf(abs(rel))
      if (!r.valid) insights.push({ rel, level: 'bad', title: name, text: 'Archive RPF invalide, ignorée par FiveM.' })
      else if (r.encryption === 'AES' || r.encryption === 'NG' || r.encryption === 'UNKNOWN')
        insights.push({ rel, level: 'bad', title: name, text: 'Archive chiffrée, ignorée par FiveM.' })
      else if (r.hasAssembly === false)
        insights.push({ rel, level: 'warn', title: name, text: 'Pas de assembly.xml, ignoré par FiveM.' })
      else if (r.encryption === 'CFXP') insights.push({ rel, level: 'ok', title: name, text: 'Signé Cfx, accepté en mode pur.' })
      else insights.push({ rel, level: 'ok', title: name, text: 'Valide.' })
      continue
    }

    if (lower === 'enbhelper.dll') {
      insights.push({ rel, level: 'info', title: name, text: 'Bloqué par FiveM, sans effet.' })
      continue
    }

    if (dest.root === 'fivem' && /^citizen\//i.test(dest.path) && !insights.some((i) => i.title === 'Fichiers citizen')) {
      insights.push({ rel, level: 'warn', title: 'Fichiers citizen', text: 'Ignorés par les serveurs en mode pur.' })
    }
  }
  return { insights, reshadeVersion }
}

/**
 * Corrige un ReShade.ini exporté depuis le PC de l'auteur : les chemins absolus (C:\Users\auteur\...)
 * sont remplacés par des chemins relatifs au dossier plugins ou par le dossier temporaire de l'utilisateur.
 */
export async function fixReshadeIni(file: string): Promise<number> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return 0
  }
  const isAbs = (p: string): boolean => /^[a-zA-Z]:[\\/]/.test(p.trim()) || /^\\\\/.test(p.trim())
  let changes = 0
  const out = raw.split(/(\r?\n)/).map((line) => {
    const m = /^(\s*)([A-Za-z]+)(\s*=\s*)(.*)$/.exec(line)
    if (!m) return line
    const [, ind, key, eq, value] = m
    const set = (v: string): string => {
      changes++
      return `${ind}${key}${eq}${v}`
    }
    switch (key) {
      case 'IntermediateCachePath':
        return isAbs(value) ? set(path.join(os.tmpdir(), 'ReShade')) : line
      case 'EffectSearchPaths':
      case 'TextureSearchPaths': {
        const parts = value.split(',').filter(Boolean)
        if (!parts.some(isAbs)) return line
        const fixed = parts
          .map((p) => {
            if (!isAbs(p)) return p
            const i = p.toLowerCase().indexOf('reshade-shaders')
            return i >= 0 ? `.\\${p.slice(i)}` : null
          })
          .filter((p): p is string => !!p)
        const def = key === 'EffectSearchPaths' ? '.\\reshade-shaders\\Shaders\\**' : '.\\reshade-shaders\\Textures\\**'
        return set([...new Set(fixed.length ? fixed : [def])].join(','))
      }
      case 'PresetPath':
      case 'StartupPresetPath':
        return isAbs(value) ? set(`.\\${value.trim().split(/[\\/]/).pop()}`) : line
      case 'SavePath':
        return isAbs(value) ? set('.\\') : line
      default:
        return line
    }
  })
  if (changes) await fs.writeFile(file, out.join(''), 'utf8')
  return changes
}
