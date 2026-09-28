import { useState } from 'react'
import type { PackManifest, TaskProgress } from '@shared/types'
import { useStore } from '../store'
import { bytes, mediaUrl, packImages, q } from '../lib/format'

/** Explication d'un pack protégé (chiffré sur la Marketplace). */
export const PROTECTED_HINT =
  'Pack protégé : il reste chiffré dans votre bibliothèque. Ses fichiers ne sont lisibles que dans le jeu, pendant qu’il y est installé.'

const TASK_LABEL: Partial<Record<TaskProgress['kind'], string>> = {
  apply: 'Installation',
  remove: 'Retrait',
  delete: 'Suppression',
  stash: 'Rangement',
  clean: 'Nettoyage',
  cache: 'Vidage',
  screenshots: 'Déplacement',
  trash: 'Suppression',
  download: 'Téléchargement'
}

export function Progress({ task }: { task: TaskProgress }) {
  const pct = task.total > 0 ? Math.min(100, Math.round((task.current / task.total) * 100)) : null
  const label = TASK_LABEL[task.kind]
  return (
    <div className="progress" title={task.phase}>
      {label && <span className="progress-label">{label}</span>}
      <div className="track">
        <div className={`fill ${pct === null ? 'is-waiting' : ''}`} style={pct === null ? undefined : { width: `${pct}%` }} />
      </div>
      <span className="pct">{pct === null ? '' : `${pct} %`}</span>
    </div>
  )
}

export function packMeta(p: PackManifest): string {
  return [p.features.filter((f) => f !== 'ASI' && f !== 'RPF' && f !== 'Citizen').join(', '), bytes(p.contentSize)].filter(Boolean).join(' · ')
}

/** Image du pack, ou son nom sur fond neutre s'il n'en a pas. */
export function Cover({ pack, rel }: { pack: PackManifest; rel?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const src = rel ?? packImages(pack)[0]
  if (!src || failed === src) return <div className="cover-empty">{pack.name}</div>
  return <img className="cover-img" src={mediaUrl(pack.id, src)} alt="" draggable={false} onError={() => setFailed(src)} />
}

/** Menu natif d'un pack (clic droit ou ⋯). Retourne true si le renommage est demandé. */
export async function packMenuAction(pack: PackManifest, run: <T>(fn: () => Promise<T>) => Promise<T | undefined>): Promise<boolean> {
  const choice = await window.api.packMenu(pack.id)
  if (choice === 'rename') return true
  if (choice === 'image') await run(() => window.api.setCoverFromFile(pack.id))
  else if (choice === 'open') await run(() => window.api.openPackFolder(pack.id))
  else if (choice === 'delete') {
    const ok = await window.api.confirm(`Supprimer ${q(pack.name)} ?`, 'Le pack est retiré de la bibliothèque et ses fichiers sont effacés. Le jeu n’est pas modifié.', 'Supprimer')
    if (ok) await run(() => window.api.deletePack(pack.id))
  }
  return false
}

export function RenameInput({ pack, onDone, className = 'rename' }: { pack: PackManifest; onDone: () => void; className?: string }) {
  const { run } = useStore()
  const [name, setName] = useState(pack.name)
  const save = async (): Promise<void> => {
    onDone()
    const n = name.trim()
    if (n && n !== pack.name) await run(() => window.api.renamePack(pack.id, n))
  }
  return (
    <input
      className={className}
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void save()
        if (e.key === 'Escape') onDone()
      }}
    />
  )
}
