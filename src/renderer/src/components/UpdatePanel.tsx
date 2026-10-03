import type { UpdateState } from '@shared/types'
import { bytes } from '../lib/format'
import { useStore } from '../store'

/**
 * Mise à jour de l'application, en bas de la barre latérale. Tout se fait seul (téléchargement, vérification,
 * installation à la fermeture) : le panneau informe et propose seulement de redémarrer tout de suite.
 */
export function UpdatePanel() {
  const { update, run } = useStore()
  if (!update) return null
  const { status, version } = update

  if (status === 'downloading' || status === 'verifying') {
    const verifying = status === 'verifying'
    const percent = Math.min(100, update.percent ?? 0)
    return (
      <div className="update-panel" role="status" aria-live="polite">
        <div className="update-head">
          <span className="update-title">Mise à jour {version}</span>
          {!verifying && <span className="pct">{percent} %</span>}
        </div>
        <div
          className="track"
          role="progressbar"
          aria-label={verifying ? 'Vérification de la mise à jour' : 'Téléchargement de la mise à jour'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={verifying ? undefined : percent}
        >
          <div className={`fill ${verifying ? 'is-waiting' : ''}`} style={verifying ? undefined : { width: `${percent}%` }} />
        </div>
        <span className="update-sub">{verifying ? 'Vérification de la signature…' : downloadText(update)}</span>
      </div>
    )
  }
  if (status === 'ready')
    return (
      <div className="update-panel">
        <span>Version {version} prête. Elle s’installera à la fermeture de l’application.</span>
        <button className="primary" onClick={() => void run(() => window.api.installUpdate())}>
          Redémarrer maintenant
        </button>
      </div>
    )
  if (status === 'available' && update.manual)
    return (
      <div className="update-panel">
        <span>Version {version} disponible sur le site.</span>
        <button onClick={() => void run(() => window.api.openSite('/application/'))}>Télécharger</button>
      </div>
    )
  if (status === 'error')
    return (
      <div className="update-panel">
        <span className="is-bad">{update.error ?? 'Mise à jour impossible.'}</span>
        <button onClick={() => void run(() => window.api.checkForUpdates())}>Réessayer</button>
      </div>
    )
  return null
}

/** « 12 Mo sur 85 Mo », ou seulement « Téléchargement… » tant que la taille est inconnue. */
function downloadText(update: UpdateState): string {
  if (!update.total) return 'Téléchargement…'
  return `${bytes(update.transferred ?? 0)} sur ${bytes(update.total)}`
}
