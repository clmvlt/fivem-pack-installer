import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyGraphics, GraphicsManager, parseGraphics } from '../src/main/core/graphics'
import { recommendationsFor, unmet } from '../src/shared/graphics'

// Extrait du vrai fichier %APPDATA%\CitizenFX\gta5_settings.xml
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>

<Settings>
  <version value="27" />
  <configSource>SMC_AUTO</configSource>
  <graphics>
    <Tessellation value="3" />
    <LodScale value="1.000000" />
    <ShadowQuality value="2" />
    <MSAA value="0" />
    <ShaderQuality value="2" />
    <FXAA_Enabled value="true" />
    <DX_Version value="2" />
    <PostFX value="2" />
    <MotionBlurStrength value="0.000000" />
  </graphics>
  <video>
    <ScreenWidth value="1920" />
    <ScreenHeight value="1080" />
    <RefreshRate value="144" />
    <Windowed value="2" />
    <VSync value="0" />
  </video>
  <VideoCardDescription>NVIDIA GeForce RTX 3080</VideoCardDescription>
</Settings>
`

describe('réglages graphiques', () => {
  it('lit les valeurs, la carte graphique et la résolution', () => {
    const p = parseGraphics(SAMPLE)
    expect(p.values.ShadowQuality).toBe('2')
    expect(p.values.Windowed).toBe('2')
    expect(p.values.FXAA_Enabled).toBe('true')
    expect(p.videoCard).toBe('NVIDIA GeForce RTX 3080')
    expect(p.resolution).toBe('1920 × 1080 · 144 Hz')
  })

  it('ne modifie que les valeurs demandées, au format du jeu', () => {
    const out = applyGraphics(SAMPLE, { PostFX: '3', LodScale: '0.8', FXAA_Enabled: 'false' })
    expect(out).toContain('<PostFX value="3" />')
    expect(out).toContain('<LodScale value="0.800000" />')
    expect(out).toContain('<FXAA_Enabled value="false" />')
    const diff = out.split('\n').filter((l, i) => l !== SAMPLE.split('\n')[i])
    expect(diff).toHaveLength(3)
  })

  it('refuse une valeur hors du menu du jeu', () => {
    expect(() => applyGraphics(SAMPLE, { PostFX: '7' })).toThrow(/invalide/)
    expect(() => applyGraphics(SAMPLE, { LodScale: '3' })).toThrow(/invalide/)
    expect(() => applyGraphics(SAMPLE, { Inconnu: '1' })).toThrow(/inconnu/)
  })

  it("sauvegarde l'original une fois, le restaure, et garde la lecture seule", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-gfx-'))
    const file = path.join(dir, 'gta5_settings.xml')
    await fs.writeFile(file, SAMPLE)
    await fs.chmod(file, 0o444)
    const g = new GraphicsManager(path.join(dir, 'backup'))
    const target = { id: 'fivem' as const, label: 'FiveM', path: file }
    await g.write(target, { PostFX: '3' })
    await g.write(target, { ShadowQuality: '3' })
    const state = await g.read(target, [target])
    expect(state.values.PostFX).toBe('3')
    expect(state.values.ShadowQuality).toBe('3')
    expect(state.hasBackup).toBe(true)
    expect(state.readOnly).toBe(true)
    await g.restore(target)
    expect(await fs.readFile(file, 'utf8')).toBe(SAMPLE)
    expect(existsSync(path.join(dir, 'backup', 'fivem-origine.xml'))).toBe(false)
    await fs.chmod(file, 0o666)
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('recommandations selon le contenu du pack', () => {
    const recos = recommendationsFor(['NVE', 'ReShade', 'RPF'])
    const values = parseGraphics(SAMPLE).values
    // DX11, shaders très élevés et MSAA désactivé : déjà bons ; post-traitement « Très élevé » accepté.
    expect(unmet(recos, values)).toHaveLength(0)
    expect(unmet(recos, { ...values, DX_Version: '1', MSAA: '4', PostFX: '1' }).map((r) => r.key)).toEqual(['DX_Version', 'PostFX', 'MSAA'])
    expect(recommendationsFor(['RPF'])).toHaveLength(0)
  })
})
