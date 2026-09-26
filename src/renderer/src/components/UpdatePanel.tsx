import { useStore } from '../store'

/**
 * Mise à jour de l'application, en bas de la barre latérale. Tout se fait seul (téléchargement, vérification,
 * installation à la fermeture) : le panneau informe et propose seulement de redémarrer tout de suite.
 */
export function UpdatePanel() {
  const { update, run } = useStore()
  if (!update) return null
  const { status, version } = update

  if (status === 'downloading' || status === 'verifying')
    return (
      <div className="update-panel">
        <span>{status === 'verifying' ? `Vérification de la version ${version}…` : `Téléchargement de la version ${version}`}</span>
        <div className="track">
          <div className={`fill ${status === 'verifying' ? 'is-waiting' : ''}`} style={status === 'verifying' ? undefined : { width: `${update.percent ?? 0}%` }} />
        </div>
      </div>
    )
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
        <button onClick={() => void run(() => window.api.openSite('/application'))}>Télécharger</button>
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
