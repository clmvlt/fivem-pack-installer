import type { ReactNode } from 'react'
import type { Check, GameCandidate, HistoryEntry, RootId, UpdateState } from '@shared/types'
import { bytes } from '../lib/format'
import { useStore } from '../store'

const STORE_LABEL: Record<string, string> = { rockstar: 'Rockstar Games Launcher', steam: 'Steam', epic: 'Epic Games' }

const ACTION_LABEL: Record<HistoryEntry['action'], string> = {
  apply: 'Installation',
  remove: 'Retrait',
  capture: 'Rangement',
  clean: 'Nettoyage',
  restore: 'Restauration',
  import: 'Ajout',
  delete: 'Suppression',
  cache: 'Cache FiveM',
  graphics: 'Graphismes',
  download: 'Marketplace'
}

export function SettingsView() {
  const { overview, task, update, run } = useStore()
  if (!overview) return null
  const { games, settings, state } = overview

  const choose = async (which: RootId): Promise<void> => {
    const current = which === 'fivem' ? games.fivem.path : games.gta.path
    const p = await window.api.pickFolder(which === 'fivem' ? 'Dossier FiveM.app' : 'Dossier de GTA V', current ?? undefined)
    if (p) await run(() => window.api.setGamePath(which, p))
  }
  const moveLibrary = async (): Promise<void> => {
    const p = await window.api.pickFolder('Dossier des packs', settings.libraryDir)
    if (p) await run(() => window.api.moveLibrary(p))
  }

  const admin = (writable: boolean, p: string | null): string | null => (p && !writable ? 'droits administrateur demandés à l’installation' : null)
  const fivemInfo = [games.fivem.source, games.fivem.buildNumber && `build ${games.fivem.buildNumber}`, admin(games.fivem.writable, games.fivem.path)]
    .filter(Boolean)
    .join(' · ')
  const gtaInfo = [
    games.gta.source,
    games.gta.edition === 'legacy' ? 'Legacy' : games.gta.edition === 'enhanced' ? 'Enhanced' : null,
    STORE_LABEL[games.gta.store],
    games.gta.version && `version ${games.gta.version}`,
    admin(games.gta.writable, games.gta.path)
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="page">
      <header className="page-head">
        <h1>Réglages</h1>
      </header>
      <div className="section-head first">
        <h2>Emplacements</h2>
        <button onClick={() => void run(() => window.api.refreshGames())} disabled={!!task} title="F5">
          Détecter à nouveau
        </button>
      </div>
      <ul className="list">
        <Row
          label="FiveM"
          path={games.fivem.path}
          info={fivemInfo}
          checks={games.fivem.checks}
          candidates={games.fivemCandidates}
          onUse={(c) => void run(() => window.api.setGamePath('fivem', c.path))}
          actions={
            <>
              {settings.fivemPath && <button onClick={() => void run(() => window.api.setGamePath('fivem', null))}>Détection automatique</button>}
              {games.fivem.path && <button onClick={() => void run(() => window.api.openPath(games.fivem.path!))}>Ouvrir</button>}
              <button onClick={() => void choose('fivem')}>Modifier…</button>
            </>
          }
        />
        <Row
          label="GTA V"
          path={games.gta.path}
          info={gtaInfo}
          checks={games.gta.checks}
          candidates={games.gtaCandidates}
          onUse={(c) => void run(() => window.api.setGamePath('gta', c.path))}
          actions={
            <>
              {settings.gtaPath && <button onClick={() => void run(() => window.api.setGamePath('gta', null))}>Détection automatique</button>}
              {games.gta.path && <button onClick={() => void run(() => window.api.openPath(games.gta.path!))}>Ouvrir</button>}
              <button onClick={() => void choose('gta')}>Modifier…</button>
            </>
          }
        />
        <Row
          label="Dossier des packs"
          path={settings.libraryDir}
          info=""
          checks={[]}
          candidates={[]}
          actions={
            <>
              <button onClick={() => void run(() => window.api.openPath(settings.libraryDir))}>Ouvrir</button>
              <button
                onClick={() => void moveLibrary()}
                disabled={!!task || !!state.active}
                title={state.active ? 'Retirez d’abord le pack installé.' : undefined}
              >
                Modifier…
              </button>
            </>
          }
        />
      </ul>

      {state.history.length > 0 && (
        <>
          <div className="section-head">
            <h2>Dernières opérations</h2>
          </div>
          <ul className="list compact">
            {state.history.slice(0, 10).map((h, i) => (
              <li key={i} className="row">
                <span className="hist-date">{new Date(h.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="hist-action">{ACTION_LABEL[h.action] ?? h.action}</span>
                <span className={`hist-text ${h.ok ? '' : 'is-bad'}`}>{[h.packName, h.summary].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="section-head">
        <h2>Application</h2>
        {update?.status !== 'unsupported' && (
          <button
            onClick={() => void run(() => window.api.checkForUpdates())}
            disabled={['checking', 'downloading', 'verifying', 'ready'].includes(update?.status ?? '')}
          >
            Rechercher une mise à jour
          </button>
        )}
      </div>
      <ul className="list">
        <li className="row">
          <div className="row-main">
            <div className="name">Version {overview.version}</div>
            <div className="meta">{updateText(update)}</div>
            <div className="meta">{MODE_TEXT[update?.mode ?? 'installer']}</div>
          </div>
          <div className="actions">
            <button onClick={() => void run(() => window.api.openPath(overview.dataDir))}>Données de l’application</button>
          </div>
        </li>
        <li className="row">
          <div className="row-main">
            <div className="name">Marketplace</div>
            <div className="meta path">{overview.apiUrl.replace(/\/api$/, '')}</div>
          </div>
          <div className="actions">
            <button onClick={() => void run(() => window.api.openSite('/'))}>Ouvrir le site</button>
          </div>
        </li>
      </ul>
    </div>
  )
}

const MODE_TEXT: Record<NonNullable<UpdateState['mode']>, string> = {
  installer: 'Mises à jour automatiques : vérifiées toutes les heures, téléchargées puis installées à la fermeture.',
  portable: 'Version portable : les mises à jour sont vérifiées toutes les heures et mises en place à la fermeture.',
  source: 'Lancée depuis ses sources : les nouvelles versions sont signalées, à télécharger sur le site.'
}

function updateText(update: UpdateState | null): string {
  if (!update) return ''
  switch (update.status) {
    case 'unsupported':
      return 'Mises à jour désactivées.'
    case 'checking':
      return 'Recherche d’une mise à jour…'
    case 'available':
      return update.manual ? `Version ${update.version} disponible sur le site.` : `Version ${update.version} disponible.`
    case 'downloading':
      return update.total
        ? `Téléchargement de la version ${update.version} : ${bytes(update.transferred ?? 0)} sur ${bytes(update.total)} (${update.percent ?? 0} %).`
        : `Téléchargement de la version ${update.version} (${update.percent ?? 0} %).`
    case 'verifying':
      return `Vérification de la version ${update.version}…`
    case 'ready':
      return `Version ${update.version} prête : installée à la fermeture de l’application.`
    case 'error':
      return update.error ?? 'Mise à jour impossible.'
    case 'none':
      return update.checkedAt ? `À jour (vérifié à ${new Date(update.checkedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}).` : 'À jour.'
    default:
      return ''
  }
}

function Row({
  label,
  path,
  info,
  checks,
  candidates,
  onUse,
  actions
}: {
  label: string
  path: string | null
  info: string
  checks: Check[]
  candidates: GameCandidate[]
  onUse?: (c: GameCandidate) => void
  actions: ReactNode
}) {
  // Le manque de droits d'écriture n'est pas une erreur : Windows demandera l'autorisation.
  const failed = checks.filter((c) => !c.ok && c.label !== 'Accès en écriture' && c.label !== 'Dossier existant')
  const others = candidates.filter((c) => c.path.toLowerCase() !== (path ?? '').toLowerCase())
  return (
    <li className="row top">
      <div className="row-main">
        <div className="name">{label}</div>
        <div className="meta path">{path ?? 'Introuvable'}</div>
        {info && <div className="meta">{info}</div>}
        {failed.map((c, i) => (
          <div key={i} className="meta is-bad">
            {c.detail ?? c.label}
          </div>
        ))}
        {others.map((c) => (
          <div key={c.path} className="meta other">
            Autre installation : <span className="path">{c.path}</span>{' '}
            <button className="link" onClick={() => onUse?.(c)}>
              Utiliser
            </button>
          </div>
        ))}
      </div>
      <div className="actions">{actions}</div>
    </li>
  )
}
