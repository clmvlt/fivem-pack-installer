import { describe, expect, it } from 'vitest'
import { choosePreset, iniGet, iniSet, mergeQuantvPreset, presetDestFromIni, presetIniValue } from '../src/main/core/reshade'
import { isEnbLocal, withEnbFpsLimit, withPackFpsLimit } from '../src/main/core/enb'

describe('presets ReShade', () => {
  const ini = '[GENERAL]\r\nEffectSearchPaths=.\\reshade-shaders\\Shaders\\**\r\nPresetPath=.\\ancien.ini\r\n\r\n[OVERLAY]\r\nKeyOverlay=36,0,0,0\r\n'

  it('modifie une clé sans toucher au reste', () => {
    const out = iniSet(ini, 'GENERAL', 'PresetPath', '.\\preset BH 1960.ini')
    expect(out).toBe(ini.replace('PresetPath=.\\ancien.ini', 'PresetPath=.\\preset BH 1960.ini'))
  })

  it('ajoute une clé absente à la fin de sa section, avant la section suivante', () => {
    const out = iniSet(ini, 'GENERAL', 'StartupPresetPath', '.\\a.ini')
    expect(out).toBe('[GENERAL]\r\nEffectSearchPaths=.\\reshade-shaders\\Shaders\\**\r\nPresetPath=.\\ancien.ini\r\nStartupPresetPath=.\\a.ini\r\n\r\n[OVERLAY]\r\nKeyOverlay=36,0,0,0\r\n')
  })

  it('crée la section si elle manque', () => {
    expect(iniSet('[OVERLAY]\r\nA=1\r\n', 'GENERAL', 'PresetPath', '.\\p.ini')).toBe('[OVERLAY]\r\nA=1\r\n\r\n[GENERAL]\r\nPresetPath=.\\p.ini\r\n')
  })

  it('convertit les chemins de preset', () => {
    expect(iniGet(ini, 'PresetPath')).toBe('.\\ancien.ini')
    expect(presetDestFromIni('.\\presets\\A.ini')).toBe('plugins/presets/A.ini')
    expect(presetDestFromIni('C:\\Users\\auteur\\Desktop\\A.ini')).toBe('plugins/A.ini')
    expect(presetIniValue('plugins/presets/A.ini')).toBe('.\\presets\\A.ini')
  })

  it('choisit le preset du ReShade.ini, sinon le plus probable', () => {
    const presets = ['plugins/NVE.ini', 'plugins/preset BH 1960.ini', 'plugins/autre.ini']
    expect(choosePreset(presets, 'plugins/autre.ini', "BH' 1960")).toBe('plugins/autre.ini')
    expect(choosePreset(presets, null, "BH' 1960")).toBe('plugins/preset BH 1960.ini')
    expect(choosePreset(['plugins/NVE.ini'], null, 'X')).toBe('plugins/NVE.ini')
    expect(choosePreset([], null, 'X')).toBeNull()
  })
})

describe('preset QuantV (QuantV.preset.ini)', () => {
  const quantvDefault = 'Techniques=QuantV@QuantV.fx,QuantV_PostFX@QuantV_Post.fx'

  it('garde tel quel un preset qui active déjà QuantV', () => {
    const preset = 'Techniques=QuantV@QuantV.fx,QuantV_PostFX@QuantV_Post.fx,CAS@CAS.fx\r\n\r\n[QuantV.fx]\r\nBrighter_Nights=0\r\n'
    expect(mergeQuantvPreset(preset, quantvDefault)).toBe(preset)
  })

  it('active les effets QuantV manquants, en tête, et ajoute les réglages QuantV du pack', () => {
    const preset = 'PreprocessorDefinitions=\r\nTechniques=CAS@CAS.fx,Vignette@Vignette.fx\r\nTechniqueSorting=Vignette@Vignette.fx,CAS@CAS.fx\r\n\r\n[CAS.fx]\r\nSharpness=0.5\r\n'
    const base = 'Techniques=QuantV@QuantV.fx\r\n\r\n[QuantV.fx]\r\nBrighter_Nights=1\r\nqGamma_d=1.0\r\n'
    const out = mergeQuantvPreset(preset, base)
    expect(out).toContain('Techniques=QuantV@QuantV.fx,CAS@CAS.fx,Vignette@Vignette.fx\r\n')
    expect(out).toContain('TechniqueSorting=QuantV@QuantV.fx,Vignette@Vignette.fx,CAS@CAS.fx\r\n')
    expect(out).toContain('[CAS.fx]\r\nSharpness=0.5')
    expect(out.trimEnd().endsWith('[QuantV.fx]\r\nBrighter_Nights=1\r\nqGamma_d=1.0')).toBe(true)
  })

  it('les réglages QuantV du preset choisi priment sur ceux du pack', () => {
    const preset = 'Techniques=CAS@CAS.fx\r\n\r\n[QuantV.fx]\r\nBrighter_Nights=0\r\n'
    const out = mergeQuantvPreset(preset, 'Techniques=QuantV@QuantV.fx\r\n\r\n[QuantV.fx]\r\nBrighter_Nights=1\r\n')
    expect(out).toContain('Techniques=QuantV@QuantV.fx,CAS@CAS.fx')
    expect(out.match(/\[QuantV\.fx\]/g)).toHaveLength(1)
    expect(out).toContain('Brighter_Nights=0')
  })

  it('sans QuantV.preset.ini dans le pack : effets QuantV par défaut', () => {
    expect(mergeQuantvPreset('Techniques=CAS@CAS.fx\n', null)).toBe('Techniques=QuantV@QuantV.fx,QuantV_PostFX@QuantV_Post.fx,CAS@CAS.fx\n')
  })
})

describe('limite ENB (enblocal.ini)', () => {
  it('active, change ou désactive la limite sans toucher au reste', () => {
    const ini = '[PROXY]\r\nEnableProxyLibrary=false\r\n\r\n[LIMITER]\r\nEnableFPSLimit=false\r\nFPSLimit=60.0\r\n\r\n[ENGINE]\r\nForceAnisotropicFiltering=true\r\n'
    expect(withEnbFpsLimit(ini, 120)).toBe(ini.replace('EnableFPSLimit=false', 'EnableFPSLimit=true').replace('FPSLimit=60.0', 'FPSLimit=120.0'))
    expect(withEnbFpsLimit(ini.replace('EnableFPSLimit=false', 'EnableFPSLimit=true'), 0)).toBe(ini)
  })

  it('ajoute la section [LIMITER] si elle manque', () => {
    expect(withEnbFpsLimit('[PROXY]\r\nEnableProxyLibrary=false\r\n', 120)).toBe('[PROXY]\r\nEnableProxyLibrary=false\r\n\r\n[LIMITER]\r\nEnableFPSLimit=true\r\nFPSLimit=120.0\r\n')
  })

  it('remet la limite du pack dans une copie retouchée', () => {
    const original = '[LIMITER]\r\nEnableFPSLimit=true\r\nFPSLimit=60.0\r\n'
    expect(withPackFpsLimit('[PROXY]\r\nX=1\r\n\r\n[LIMITER]\r\nEnableFPSLimit=true\r\nFPSLimit=120.0\r\n', original)).toBe('[PROXY]\r\nX=1\r\n\r\n[LIMITER]\r\nEnableFPSLimit=true\r\nFPSLimit=60.0\r\n')
    expect(withPackFpsLimit('[LIMITER]\r\nEnableFPSLimit=true\r\nFPSLimit=120.0\r\n', '[PROXY]\r\n')).toBe('[LIMITER]\r\nEnableFPSLimit=false\r\nFPSLimit=120.0\r\n')
    expect(isEnbLocal('enblocal.ini')).toBe(true)
    expect(isEnbLocal('plugins/ENBlocal.INI')).toBe(true)
    expect(isEnbLocal('enbseries.ini')).toBe(false)
  })
})
