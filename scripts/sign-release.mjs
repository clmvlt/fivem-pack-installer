#!/usr/bin/env node
// Signe un fichier de version (installateur ou version portable) avec la clé privée de publication.
//
//   node scripts/sign-release.mjs release/FiveM-Pack-Manager-Setup-1.3.0.exe
//   node scripts/sign-release.mjs <fichier.exe> --version 1.3.0 --key C:\chemin\cle.pem
//
// La signature (base64) est affichée et écrite à côté du fichier (<fichier>.sig) : copiez-la dans
// l'administration du site (Versions de l'app). La clé privée ne doit jamais quitter ce poste :
// par défaut %USERPROFILE%\.fivem-pack-manager\release-signing-key.pem, ou PM_SIGNING_KEY.
// Le message signé doit rester identique à src/main/core/releaseSignature.ts et à l'API (ReleaseSignatures.java).

import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : undefined
}
const version = option('--version') ?? JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version
const keyFile = option('--key') ?? process.env.PM_SIGNING_KEY ?? path.join(os.homedir(), '.fivem-pack-manager', 'release-signing-key.pem')
const file = args[0]

if (!file) {
  console.error('Usage : node scripts/sign-release.mjs <fichier.exe> [--version X.Y.Z] [--key cle.pem]')
  process.exit(2)
}

let privateKey
try {
  privateKey = createPrivateKey(readFileSync(keyFile))
} catch {
  console.error(`Clé privée introuvable ou illisible : ${keyFile}`)
  process.exit(1)
}

const size = statSync(file).size
const hash = createHash('sha512')
for await (const chunk of createReadStream(file)) hash.update(chunk)
const sha512 = hash.digest('base64')
const message = `fivem-pack-manager-update-v1\nversion=${version}\nsize=${size}\nsha512=${sha512}\n`
const signature = sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64')

// Contrôle avec la clé publique embarquée dans l'application.
const embedded = readFileSync(path.join(here, '..', 'src', 'main', 'core', 'releaseSignature.ts'), 'utf8').match(/RELEASE_PUBLIC_KEY = '([^']+)'/)?.[1]
const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64')
if (embedded && embedded !== publicKey) {
  console.error("Cette clé ne correspond pas à la clé publique de l'application (releaseSignature.ts) : signature refusée.")
  process.exit(1)
}
if (!verify(null, Buffer.from(message, 'utf8'), createPublicKey(privateKey), Buffer.from(signature, 'base64'))) {
  console.error('Vérification de la signature impossible.')
  process.exit(1)
}

writeFileSync(`${file}.sig`, signature + '\n')
console.log(`Fichier   : ${path.basename(file)}`)
console.log(`Version   : ${version}`)
console.log(`Taille    : ${size} octets`)
console.log(`SHA-512   : ${sha512}`)
console.log(`Signature : ${signature}`)
console.log(`\nSignature écrite dans ${file}.sig`)
