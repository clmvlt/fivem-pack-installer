import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

// updater.ts importe electron et electron-updater : inutiles pour ces tests.
vi.mock('electron', () => ({ app: {}, net: {} }))
vi.mock('electron-updater', () => ({ autoUpdater: {} }))

const { releaseMessage, verifyRelease } = await import('../src/main/core/releaseSignature')
const { isNewer } = await import('../src/main/core/updater')

describe('signature des versions', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  const message = releaseMessage('1.3.0', 123456, 'abc==')
  const signature = sign(null, Buffer.from(message), privateKey).toString('base64')

  it('produit le message attendu par l’API et le script de signature', () => {
    expect(message).toBe('fivem-pack-manager-update-v1\nversion=1.3.0\nsize=123456\nsha512=abc==\n')
  })

  it('accepte une signature valide et refuse toute modification', () => {
    expect(verifyRelease(message, signature, spki)).toBe(true)
    expect(verifyRelease(releaseMessage('1.3.1', 123456, 'abc=='), signature, spki)).toBe(false)
    expect(verifyRelease(releaseMessage('1.3.0', 123457, 'abc=='), signature, spki)).toBe(false)
    expect(verifyRelease(message, signature.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')), spki)).toBe(false)
    expect(verifyRelease(message, 'pas-une-signature', spki)).toBe(false)
  })

  it('refuse une signature faite avec une autre clé', () => {
    const other = generateKeyPairSync('ed25519')
    const forged = sign(null, Buffer.from(message), other.privateKey).toString('base64')
    expect(verifyRelease(message, forged, spki)).toBe(false)
  })
})

describe('comparaison des versions', () => {
  it('compare majeur, mineur puis correctif', () => {
    expect(isNewer('1.3.0', '1.2.0')).toBe(true)
    expect(isNewer('1.10.0', '1.9.9')).toBe(true)
    expect(isNewer('1.2.0', '1.2.0')).toBe(false)
    expect(isNewer('1.1.9', '1.2.0')).toBe(false)
    expect(isNewer('v2.0.0', '1.99.99')).toBe(true)
  })
})
