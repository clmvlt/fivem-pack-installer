import { describe, expect, it } from 'vitest'
import { choosePreset, iniGet, iniSet, presetDestFromIni, presetIniValue } from '../src/main/core/reshade'

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
