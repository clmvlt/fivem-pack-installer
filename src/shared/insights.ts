import type { Insight, PackManifest } from './types'

export type Level = 'ok' | 'info' | 'warn' | 'bad'

/**
 * Niveau réel d'une vérification. Un .asi est chargé si la build utilisée par FiveM fait partie de celles qu'il
 * déclare ; sinon FiveM l'ignore simplement, sans conséquence pour le reste du pack : c'est une information, pas
 * une erreur (la build dépend du serveur rejoint).
 */
export function levelOf(i: Insight, build: number | null): Level {
  if (build && i.builds?.length) return i.builds.includes(build) ? 'ok' : 'info'
  return i.level
}

/** Texte d'un .asi selon la dernière build lancée par FiveM. */
export function asiBuildText(builds: number[], build: number): string {
  const range = builds.length > 1 ? `les builds ${builds[0]} à ${builds[builds.length - 1]}` : `la build ${builds[0]}`
  return builds.includes(build)
    ? `Chargé par FiveM : prévu pour ${range}, dont la ${build} utilisée en dernier.`
    : `Ignoré par FiveM en build ${build} (prévu pour ${range}). Le reste du pack n’est pas concerné ; il se charge sur les serveurs qui utilisent une de ces builds.`
}

export function problemCount(pack: PackManifest, build: number | null): number {
  return (pack.insights ?? []).filter((i) => {
    const l = levelOf(i, build)
    return l === 'warn' || l === 'bad'
  }).length
}

export const LEVEL_LABEL: Record<Level, string> = { ok: 'OK', info: 'Info', warn: 'Attention', bad: 'Problème' }
