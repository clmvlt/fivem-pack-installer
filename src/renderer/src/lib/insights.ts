import type { Insight, PackManifest } from '@shared/types'

export type Level = 'ok' | 'info' | 'warn' | 'bad'

/** Niveau réel d'une vérification : un .asi qui ne déclare pas la build utilisée par FiveM devient un avertissement. */
export function levelOf(i: Insight, build: number | null): Level {
  if (build && i.builds?.length && !i.builds.includes(build)) return 'warn'
  return i.level
}

export function problemCount(pack: PackManifest, build: number | null): number {
  return (pack.insights ?? []).filter((i) => {
    const l = levelOf(i, build)
    return l === 'warn' || l === 'bad'
  }).length
}

export const LEVEL_LABEL: Record<Level, string> = { ok: 'OK', info: 'Info', warn: 'Attention', bad: 'Problème' }
