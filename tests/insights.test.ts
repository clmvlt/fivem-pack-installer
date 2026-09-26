import { describe, expect, it } from 'vitest'
import { asiBuildText, levelOf, problemCount } from '../src/shared/insights'
import type { Insight, PackManifest } from '../src/shared/types'

const asi = (builds: number[]): Insight => ({ rel: 'plugins/test.asi', level: 'info', title: 'test.asi', text: 'Builds.', builds })

describe('plugins .asi et build du jeu', () => {
  it('chargé : OK', () => {
    expect(levelOf(asi([1604, 2802, 3258]), 3258)).toBe('ok')
    expect(asiBuildText([1604, 2802, 3258], 3258)).toBe('Chargé par FiveM : prévu pour les builds 1604 à 3258, dont la 3258 utilisée en dernier.')
  })

  it('build non déclarée : simple information, pas un problème', () => {
    expect(levelOf(asi([1604, 2845, 3095]), 3258)).toBe('info')
    expect(asiBuildText([1604, 3095], 3258)).toContain('Ignoré par FiveM en build 3258 (prévu pour les builds 1604 à 3095)')
    const pack = { insights: [asi([1604, 3095]), asi([1604, 2845])] } as unknown as PackManifest
    expect(problemCount(pack, 3258)).toBe(0)
  })

  it('build inconnue : niveau d’origine', () => {
    expect(levelOf(asi([1604, 3095]), null)).toBe('info')
  })

  it('les vrais problèmes restent comptés', () => {
    const pack = { insights: [{ rel: 'plugins/x.asi', level: 'warn', title: 'x.asi', text: 'Ne déclare aucune build.' }] } as unknown as PackManifest
    expect(problemCount(pack, 3258)).toBe(1)
  })
})
