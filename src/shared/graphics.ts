// Réglages graphiques de GTA V (gta5_settings.xml pour FiveM, settings.xml pour le mode solo).
// Valeurs : correspondance du menu Graphismes du jeu (0 = Normal, 1 = Élevé, 2 = Très élevé, 3 = Ultra...).

export type GraphicsKind = 'choice' | 'bool' | 'range'

export interface GraphicsSettingDef {
  key: string
  label: string
  group: string
  kind: GraphicsKind
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
}

const q3 = [
  { value: '0', label: 'Normal' },
  { value: '1', label: 'Élevé' },
  { value: '2', label: 'Très élevé' }
]
const q4 = [...q3, { value: '3', label: 'Ultra' }]
const aa = [
  { value: '0', label: 'Désactivé' },
  { value: '2', label: 'x2' },
  { value: '4', label: 'x4' },
  { value: '8', label: 'x8' }
]

export const GRAPHICS_GROUPS = ['Affichage', 'Qualité', 'Anticrénelage', 'Distance et densité', 'Effets'] as const

export const GRAPHICS_SETTINGS: GraphicsSettingDef[] = [
  {
    key: 'DX_Version',
    label: 'Version de DirectX',
    group: 'Affichage',
    kind: 'choice',
    options: [
      { value: '0', label: 'DirectX 10' },
      { value: '1', label: 'DirectX 10.1' },
      { value: '2', label: 'DirectX 11' }
    ]
  },
  {
    key: 'Windowed',
    label: "Mode d'affichage",
    group: 'Affichage',
    kind: 'choice',
    options: [
      { value: '0', label: 'Plein écran' },
      { value: '1', label: 'Fenêtré' },
      { value: '2', label: 'Fenêtré sans bordure' }
    ]
  },
  {
    key: 'VSync',
    label: 'Synchronisation verticale',
    group: 'Affichage',
    kind: 'choice',
    options: [
      { value: '0', label: 'Désactivée' },
      { value: '1', label: 'Activée' },
      { value: '2', label: 'Moitié' }
    ]
  },

  { key: 'TextureQuality', label: 'Textures', group: 'Qualité', kind: 'choice', options: q3 },
  { key: 'ShaderQuality', label: 'Shaders', group: 'Qualité', kind: 'choice', options: q3 },
  {
    key: 'ShadowQuality',
    label: 'Ombres',
    group: 'Qualité',
    kind: 'choice',
    options: [
      { value: '0', label: 'Désactivées' },
      { value: '1', label: 'Normal' },
      { value: '2', label: 'Élevé' },
      { value: '3', label: 'Très élevé' }
    ]
  },
  {
    key: 'Shadow_SoftShadows',
    label: 'Ombres adoucies',
    group: 'Qualité',
    kind: 'choice',
    options: [
      { value: '0', label: 'Nettes' },
      { value: '1', label: 'Douces' },
      { value: '2', label: 'Plus douces' },
      { value: '3', label: 'Les plus douces' },
      { value: '4', label: 'AMD CHS' },
      { value: '5', label: 'NVIDIA PCSS' }
    ]
  },
  { key: 'ReflectionQuality', label: 'Réflexions', group: 'Qualité', kind: 'choice', options: q4 },
  { key: 'WaterQuality', label: 'Eau', group: 'Qualité', kind: 'choice', options: q3 },
  { key: 'ParticleQuality', label: 'Particules', group: 'Qualité', kind: 'choice', options: q3 },
  { key: 'GrassQuality', label: 'Herbe', group: 'Qualité', kind: 'choice', options: q4 },
  { key: 'PostFX', label: 'Post-traitement', group: 'Qualité', kind: 'choice', options: q4 },
  {
    key: 'SSAO',
    label: 'Occlusion ambiante',
    group: 'Qualité',
    kind: 'choice',
    options: [
      { value: '0', label: 'Désactivée' },
      { value: '1', label: 'Normal' },
      { value: '2', label: 'Élevé' }
    ]
  },
  {
    key: 'Tessellation',
    label: 'Tessellation',
    group: 'Qualité',
    kind: 'choice',
    options: [
      { value: '0', label: 'Désactivée' },
      { value: '1', label: 'Normal' },
      { value: '2', label: 'Élevé' },
      { value: '3', label: 'Très élevé' }
    ]
  },
  {
    key: 'AnisotropicFiltering',
    label: 'Filtrage anisotrope',
    group: 'Qualité',
    kind: 'choice',
    options: [{ value: '0', label: 'Désactivé' }, ...aa.slice(1), { value: '16', label: 'x16' }]
  },

  { key: 'MSAA', label: 'MSAA', group: 'Anticrénelage', kind: 'choice', options: aa },
  { key: 'ReflectionMSAA', label: 'MSAA des réflexions', group: 'Anticrénelage', kind: 'choice', options: aa },
  { key: 'FXAA_Enabled', label: 'FXAA', group: 'Anticrénelage', kind: 'bool' },
  { key: 'TXAA_Enabled', label: 'TXAA (NVIDIA)', group: 'Anticrénelage', kind: 'bool' },

  { key: 'LodScale', label: "Distance d'affichage", group: 'Distance et densité', kind: 'range', min: 0, max: 1, step: 0.1 },
  { key: 'MaxLodScale', label: 'Distance étendue', group: 'Distance et densité', kind: 'range', min: 0, max: 1, step: 0.1 },
  { key: 'Shadow_Distance', label: 'Distance des ombres', group: 'Distance et densité', kind: 'range', min: 0, max: 2, step: 0.1 },
  { key: 'CityDensity', label: 'Densité de population', group: 'Distance et densité', kind: 'range', min: 0, max: 1, step: 0.1 },
  { key: 'PedVarietyMultiplier', label: 'Variété des piétons', group: 'Distance et densité', kind: 'range', min: 0, max: 1, step: 0.1 },
  { key: 'VehicleVarietyMultiplier', label: 'Variété des véhicules', group: 'Distance et densité', kind: 'range', min: 0, max: 1, step: 0.1 },

  { key: 'DoF', label: 'Profondeur de champ', group: 'Effets', kind: 'bool' },
  { key: 'MotionBlurStrength', label: 'Flou de mouvement', group: 'Effets', kind: 'range', min: 0, max: 1, step: 0.1 },
  { key: 'UltraShadows_Enabled', label: 'Ombres haute résolution', group: 'Effets', kind: 'bool' },
  { key: 'Shadow_LongShadows', label: 'Ombres longues', group: 'Effets', kind: 'bool' },
  { key: 'HdStreamingInFlight', label: 'Streaming haute définition en vol', group: 'Effets', kind: 'bool' }
]

export const GRAPHICS_KEYS = new Set(GRAPHICS_SETTINGS.map((s) => s.key))

/** Préréglages : ne touchent qu'à la qualité (jamais à l'affichage ni à DirectX). */
export const GRAPHICS_PRESETS: { id: string; label: string; values: Record<string, string> }[] = [
  {
    id: 'performance',
    label: 'Performance',
    values: {
      TextureQuality: '1',
      ShaderQuality: '1',
      ShadowQuality: '1',
      Shadow_SoftShadows: '1',
      ReflectionQuality: '0',
      ReflectionMSAA: '0',
      WaterQuality: '0',
      ParticleQuality: '0',
      GrassQuality: '0',
      PostFX: '1',
      SSAO: '0',
      Tessellation: '0',
      AnisotropicFiltering: '4',
      MSAA: '0',
      FXAA_Enabled: 'true',
      TXAA_Enabled: 'false',
      LodScale: '0.500000',
      MaxLodScale: '0.000000',
      Shadow_Distance: '1.000000',
      CityDensity: '0.600000',
      PedVarietyMultiplier: '0.600000',
      VehicleVarietyMultiplier: '0.600000',
      DoF: 'false',
      UltraShadows_Enabled: 'false',
      Shadow_LongShadows: 'false'
    }
  },
  {
    id: 'balanced',
    label: 'Équilibré',
    values: {
      TextureQuality: '2',
      ShaderQuality: '2',
      ShadowQuality: '2',
      Shadow_SoftShadows: '2',
      ReflectionQuality: '1',
      ReflectionMSAA: '0',
      WaterQuality: '1',
      ParticleQuality: '1',
      GrassQuality: '1',
      PostFX: '2',
      SSAO: '1',
      Tessellation: '2',
      AnisotropicFiltering: '16',
      MSAA: '0',
      FXAA_Enabled: 'true',
      TXAA_Enabled: 'false',
      LodScale: '0.800000',
      MaxLodScale: '0.000000',
      Shadow_Distance: '1.000000',
      CityDensity: '0.800000',
      PedVarietyMultiplier: '0.800000',
      VehicleVarietyMultiplier: '0.800000',
      DoF: 'false',
      UltraShadows_Enabled: 'false',
      Shadow_LongShadows: 'false'
    }
  },
  {
    id: 'quality',
    label: 'Qualité',
    values: {
      TextureQuality: '2',
      ShaderQuality: '2',
      ShadowQuality: '3',
      Shadow_SoftShadows: '3',
      ReflectionQuality: '2',
      ReflectionMSAA: '2',
      WaterQuality: '2',
      ParticleQuality: '2',
      GrassQuality: '2',
      PostFX: '2',
      SSAO: '2',
      Tessellation: '3',
      AnisotropicFiltering: '16',
      MSAA: '0',
      FXAA_Enabled: 'true',
      TXAA_Enabled: 'false',
      LodScale: '1.000000',
      MaxLodScale: '0.300000',
      Shadow_Distance: '1.300000',
      CityDensity: '1.000000',
      PedVarietyMultiplier: '1.000000',
      VehicleVarietyMultiplier: '1.000000',
      DoF: 'true',
      UltraShadows_Enabled: 'false',
      Shadow_LongShadows: 'true'
    }
  },
  {
    id: 'ultra',
    label: 'Ultra',
    values: {
      TextureQuality: '2',
      ShaderQuality: '2',
      ShadowQuality: '3',
      Shadow_SoftShadows: '3',
      ReflectionQuality: '3',
      ReflectionMSAA: '4',
      WaterQuality: '2',
      ParticleQuality: '2',
      GrassQuality: '3',
      PostFX: '3',
      SSAO: '2',
      Tessellation: '3',
      AnisotropicFiltering: '16',
      MSAA: '0',
      FXAA_Enabled: 'true',
      TXAA_Enabled: 'false',
      LodScale: '1.000000',
      MaxLodScale: '1.000000',
      Shadow_Distance: '2.000000',
      CityDensity: '1.000000',
      PedVarietyMultiplier: '1.000000',
      VehicleVarietyMultiplier: '1.000000',
      DoF: 'true',
      UltraShadows_Enabled: 'true',
      Shadow_LongShadows: 'true'
    }
  }
]

export interface GraphicsRecommendation {
  key: string
  /** Valeur minimale acceptée (comparaison numérique) ou valeur exacte. */
  min?: number
  exact?: string
  /** Valeur appliquée par « Appliquer les recommandations ». */
  value: string
  reason: string
}

/**
 * Réglages nécessaires au bon rendu des mods graphiques présents dans un pack :
 * ENB et ReShade exigent DirectX 11 ; NVE et QuantV demandent post-traitement et shaders au moins en « Très élevé » ;
 * le MSAA empêche ReShade et NVE d'accéder à la profondeur de l'image.
 */
export function recommendationsFor(features: string[]): GraphicsRecommendation[] {
  const f = new Set(features)
  const out: GraphicsRecommendation[] = []
  if (f.has('ENB') || f.has('ReShade') || f.has('NVE') || f.has('QuantV'))
    out.push({ key: 'DX_Version', exact: '2', value: '2', reason: 'DirectX 11 (nécessaire pour ENB et ReShade)' })
  if (f.has('NVE') || f.has('QuantV')) {
    out.push({ key: 'PostFX', min: 2, value: '3', reason: 'post-traitement au moins en « Très élevé »' })
    out.push({ key: 'ShaderQuality', min: 2, value: '2', reason: 'shaders en « Très élevé »' })
  }
  if (f.has('ReShade') || f.has('NVE')) out.push({ key: 'MSAA', exact: '0', value: '0', reason: 'MSAA désactivé (effets de profondeur)' })
  return out
}

export function unmet(recos: GraphicsRecommendation[], values: Record<string, string>): GraphicsRecommendation[] {
  return recos.filter((r) => {
    const v = values[r.key]
    if (v === undefined) return false
    if (r.exact !== undefined) return v !== r.exact
    return Number(v) < (r.min ?? 0)
  })
}

export interface GraphicsTarget {
  id: 'fivem' | 'gta'
  label: string
  path: string
}

export interface GraphicsState {
  target: GraphicsTarget
  targets: GraphicsTarget[]
  values: Record<string, string>
  videoCard: string | null
  resolution: string | null
  hasBackup: boolean
  readOnly: boolean
}
