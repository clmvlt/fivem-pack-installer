// Signature des mises à jour de l'application.
//
// Chaque version publiée est signée (Ed25519) avec une clé privée qui ne quitte jamais le poste de publication
// (scripts/sign-release.mjs). L'application contient la clé publique et n'installe une mise à jour que si la
// signature correspond exactement au fichier téléchargé : ni le serveur ni un compte d'administration volé ne
// peuvent faire installer autre chose. Le message signé doit rester identique à celui de l'API
// (packs_api : ReleaseSignatures.java) et du script de signature.

import { createHash, createPublicKey, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'

export const RELEASE_PUBLIC_KEY = 'MCowBQYDK2VwAyEAdoozT2piABLmJkg2Ar/jl4QW4jivTRp275tldhyFpSM='

export function releaseMessage(version: string, size: number, sha512Base64: string): string {
  return `fivem-pack-manager-update-v1\nversion=${version}\nsize=${size}\nsha512=${sha512Base64}\n`
}

export function verifyRelease(message: string, signatureBase64: string, publicKey = RELEASE_PUBLIC_KEY): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' })
    return verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureBase64.trim(), 'base64'))
  } catch {
    return false
  }
}

/** SHA-512 en base64 (format d'electron-updater) d'un fichier. */
export async function sha512File(file: string): Promise<string> {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
  return hash.digest('base64')
}
