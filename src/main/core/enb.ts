// ENBSeries lit enblocal.ini à la racine de GTA V ; sa section [LIMITER] plafonne les images par seconde
// (EnableFPSLimit, FPSLimit). FiveM n'a pas de limite à lui : c'est par là que l'application bloque les FPS.
import { iniGet, iniSet } from './reshade'

export const ENB_LOCAL_INI = 'enblocal.ini'

/** Limites proposées par l'interface (0 = aucune limite). */
export const FPS_LIMIT_MIN = 30
export const FPS_LIMIT_MAX = 360

export function isEnbLocal(destPath: string): boolean {
  return (destPath.split('/').pop() ?? '').toLowerCase() === ENB_LOCAL_INI
}

/** enblocal.ini avec la limite demandée (0 = limite désactivée) ; le reste du fichier est gardé tel quel. */
export function withEnbFpsLimit(content: string, limit: number): string {
  const out = iniSet(content, 'LIMITER', 'EnableFPSLimit', limit > 0 ? 'true' : 'false')
  return limit > 0 ? iniSet(out, 'LIMITER', 'FPSLimit', `${limit}.0`) : out
}

/** Copie retouchée d'un enblocal.ini avec la limite de l'original du pack (le reste des retouches est gardé). */
export function withPackFpsLimit(content: string, original: string): string {
  let out = content
  for (const key of ['EnableFPSLimit', 'FPSLimit']) {
    const value = iniGet(original, key)
    if (value !== null) out = iniSet(out, 'LIMITER', key, value)
    // Pas de limite dans l'original : ENB la laisse désactivée.
    else if (key === 'EnableFPSLimit' && iniGet(out, key) !== null) out = iniSet(out, 'LIMITER', key, 'false')
  }
  return out
}
