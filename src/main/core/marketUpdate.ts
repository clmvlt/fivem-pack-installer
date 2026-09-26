// Mise à jour d'un pack de la Marketplace : que faut-il télécharger ?
//
// En ligne, un pack a une archive (sha256) et, parfois, des « fichiers mis à jour » (ex. nouvelle version de
// QuantV.addon) qui remplacent dans le pack les fichiers du même nom. Sa révision combine les deux. Le pack local
// retient l'empreinte de son archive et les fichiers mis à jour qui lui ont été appliqués.

import path from 'node:path'
import type { MarketplaceLink, PackFileEntry } from '@shared/types'

export interface RemoteFile {
  id: string
  fileName: string
  size: number
  sha256: string
}

export interface RemoteContent {
  sha256: string | null
  revision?: string | null
  files?: RemoteFile[]
}

export type UpdatePlan =
  /** Rien à faire : même révision, ou fichiers mis à jour qui ne concernent pas ce pack. */
  | { kind: 'none' }
  /** Nouvelle archive (ou fichier mis à jour retiré en ligne) : tout retélécharger. */
  | { kind: 'full' }
  /** Même archive : seuls ces fichiers sont à télécharger et à remplacer. */
  | { kind: 'files'; files: RemoteFile[] }

const lower = (s: string): string => s.toLowerCase()

/** Révision du pack local (les packs téléchargés avant les fichiers mis à jour n'ont que l'empreinte de l'archive). */
export function localRevision(link: MarketplaceLink): string {
  return link.revision ?? link.sha256
}

export function remoteRevision(remote: RemoteContent): string | null {
  return remote.revision ?? remote.sha256
}

/** Fichiers mis à jour qui remplacent au moins un fichier du pack (même nom, casse ignorée). */
export function matchingFiles(files: PackFileEntry[], remoteFiles: RemoteFile[]): RemoteFile[] {
  const names = new Set(files.map((f) => lower(path.posix.basename(f.rel))))
  return remoteFiles.filter((f) => names.has(lower(f.fileName)))
}

export function planUpdate(local: { marketplace: MarketplaceLink; files: PackFileEntry[] }, remote: RemoteContent): UpdatePlan {
  const link = local.marketplace
  const revision = remoteRevision(remote)
  if (!remote.sha256 || !revision || localRevision(link) === revision) return { kind: 'none' }
  if (remote.sha256 !== link.sha256) return { kind: 'full' }

  const remoteFiles = remote.files ?? []
  const byName = new Map(remoteFiles.map((f) => [lower(f.fileName), f]))
  const applied = new Map((link.files ?? []).map((f) => [lower(f.name), f.sha256]))
  // Un fichier déjà appliqué a été retiré en ligne : la version de l'archive n'est plus sur le disque.
  for (const name of applied.keys()) if (!byName.has(name)) return { kind: 'full' }

  const needed = matchingFiles(local.files, remoteFiles).filter((f) => applied.get(lower(f.fileName)) !== f.sha256)
  return needed.length ? { kind: 'files', files: needed } : { kind: 'none' }
}
