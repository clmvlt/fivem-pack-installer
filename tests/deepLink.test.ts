// Liens « fivem-pack-manager://pack/<id> » du site : seule une adresse de fiche de pack valide est acceptée.
import { describe, expect, it } from 'vitest'
import { describeLink, findDeepLink, parsePackLink } from '../src/main/core/deepLink'

const ID = '3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c'

describe('findDeepLink', () => {
  it('trouve le lien dans la ligne de commande', () => {
    expect(findDeepLink(['C:\app\FiveM Pack Manager.exe', `fivem-pack-manager://pack/${ID}`])).toBe(`fivem-pack-manager://pack/${ID}`)
    // second-instance : Chromium ajoute ses propres options avant le lien.
    expect(findDeepLink(['electron.exe', '--allow-file-access-from-files', 'D:\app', `FIVEM-PACK-MANAGER://pack/${ID}`])).toBe(
      `FIVEM-PACK-MANAGER://pack/${ID}`
    )
  })

  it('ignore une ligne de commande sans lien', () => {
    expect(findDeepLink(['app.exe'])).toBeNull()
    expect(findDeepLink(['app.exe', 'https://packs.dimzou.fr/', 'fivem-pack-manager:pack'])).toBeNull()
  })
})

describe('parsePackLink', () => {
  it('accepte une fiche de pack', () => {
    expect(parsePackLink(`fivem-pack-manager://pack/${ID}`)).toBe(ID)
    expect(parsePackLink(`fivem-pack-manager://pack/${ID}/`)).toBe(ID)
    expect(parsePackLink(`fivem-pack-manager://PACK/${ID.toUpperCase()}`)).toBe(ID)
    expect(parsePackLink(`fivem-pack-manager://pack/${ID}?source=site#x`)).toBe(ID)
  })

  it('refuse toute autre adresse', () => {
    for (const link of [
      'fivem-pack-manager://pack/',
      'fivem-pack-manager://pack/bh-1960',
      `fivem-pack-manager://pack/${ID}x`,
      `fivem-pack-manager://pack/${ID}/install`,
      `fivem-pack-manager://pack//${ID}`,
      `fivem-pack-manager://pack/..%2F${ID}`,
      `fivem-pack-manager://author/${ID}`,
      `fivem-pack-manager://pack:8080/${ID}`,
      `fivem-pack-manager://user:pass@pack/${ID}`,
      `fivem-pack-manager:pack/${ID}`,
      `https://pack/${ID}`,
      `fivem-pack-manager://pack/${ID} --inspect`,
      'fivem-pack-manager://pack/C:\Windows\System32\cmd.exe',
      'pas une adresse'
    ])
      expect(parsePackLink(link), link).toBeNull()
  })
})

describe('describeLink', () => {
  it('raccourcit et garde une seule ligne', () => {
    expect(describeLink('fivem-pack-manager://pack/a\nb')).not.toContain('\n')
    expect(describeLink(`fivem-pack-manager://${'a'.repeat(500)}`).length).toBeLessThan(210)
  })
})
