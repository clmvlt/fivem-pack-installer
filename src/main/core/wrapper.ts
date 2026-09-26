import type { PackFileEntry } from '@shared/types'
import { anchorOf, isJunk, specialDirDestination } from './knowledge'

/** Retire les fichiers parasites (__MACOSX, Thumbs.db...). */
export function dropJunk<T extends { rel: string }>(entries: T[]): T[] {
  return entries.filter((e) => !e.rel.split('/').some((seg) => isJunk(seg)))
}

/**
 * Retire les dossiers « enveloppe » (ex. « BH' 1960/ ») quand tout le pack est rangé dans un seul dossier
 * qui n'a pas de signification propre (≠ mods, plugins, GTA V...).
 */
export function stripWrapper<T extends PackFileEntry>(input: T[]): { entries: T[]; prefix: string } {
  let entries = dropJunk(input)
  let prefix = ''
  for (let guard = 0; guard < 8; guard++) {
    if (!entries.length) break
    const first = entries[0].rel.split('/')[0]
    const allInside = entries.every((e) => e.rel.includes('/') && e.rel.split('/')[0] === first)
    if (!allInside) break
    if (anchorOf(first) || specialDirDestination(first)) break
    prefix += `${first}/`
    entries = entries.map((e) => ({ ...e, rel: e.rel.slice(first.length + 1) }))
  }
  return { entries, prefix }
}
