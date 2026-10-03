import { useEffect, useState } from 'react'
import { useStore } from './store'
import { Library } from './components/Library'
import { PackDetail } from './components/PackDetail'
import { Cleanup } from './components/Cleanup'
import { SettingsView } from './components/SettingsView'
import { Graphics } from './components/Graphics'
import { Marketplace, type MarketView } from './components/Marketplace'
import { AccountView } from './components/AccountView'
import { Avatar } from './components/common'
import { UpdatePanel } from './components/UpdatePanel'
import icon from './assets/icon.png'

type Page = 'library' | 'market' | 'graphics' | 'cleanup' | 'account' | 'settings'

const NAV: { id: Page; label: string }[] = [
  { id: 'library', label: 'Bibliothèque' },
  { id: 'market', label: 'Marketplace' },
  { id: 'graphics', label: 'Graphismes' },
  { id: 'cleanup', label: 'Nettoyage' },
  { id: 'settings', label: 'Réglages' }
]

export function App() {
  const { overview, account, message, setMessage, run } = useStore()
  const [page, setPage] = useState<Page>('library')
  const [openPack, setOpenPack] = useState<string | null>(null)
  // Vues ouvertes dans la Marketplace (fiche, auteur...), la dernière affichée.
  const [marketStack, setMarketStack] = useState<MarketView[]>([])
  const [dragging, setDragging] = useState(false)

  // Glisser-déposer d'archives (ou de dossiers) n'importe où dans la fenêtre.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const onOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const paths = Array.from(e.dataTransfer?.files ?? [])
        .map((f) => window.api.getPathForFile(f))
        .filter(Boolean)
      if (paths.length) {
        setPage('library')
        setOpenPack(null)
        void run(() => window.api.importPacks(paths))
      }
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [run])

  if (!overview) return <div className="app" />
  const detail = openPack ? overview.library.find((p) => p.id === openPack) : null
  const { games } = overview
  const gameProblem = !games.fivem.valid ? 'FiveM introuvable' : !games.gta.valid ? 'GTA V introuvable' : games.gta.edition === 'enhanced' ? 'GTA V Enhanced' : null
  const go = (p: Page): void => {
    setPage(p)
    setOpenPack(null)
    setMarketStack([])
  }
  const openLocal = (id: string): void => {
    setPage('library')
    setOpenPack(id)
  }
  const openAuthor = (slug: string): void => {
    setPage('market')
    setMarketStack([{ kind: 'author', slug }])
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src={icon} alt="" />
          <span>FiveM Pack Manager</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={`nav ${page === n.id ? 'is-selected' : ''}`} onClick={() => go(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <UpdatePanel />
          {gameProblem && (
            <button className="side-status" onClick={() => go('settings')}>
              {gameProblem}
            </button>
          )}
          {/* Compte : tout en bas de la barre latérale. */}
          <button className={`nav side-account ${page === 'account' ? 'is-selected' : ''}`} onClick={() => go('account')}>
            <span className="nav-account">
              {account ? (
                <Avatar url={account.avatarUrl} name={account.displayName} size={24} />
              ) : (
                <span className="avatar" style={{ width: 24, height: 24 }} aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="5" r="3" />
                    <path d="M2 14.5c0-3 2.7-5 6-5s6 2 6 5z" />
                  </svg>
                </span>
              )}
              <span className="ellipsis">{account ? account.displayName : 'Compte'}</span>
              {account?.mustChangePassword && <span className="nav-dot" title="Mot de passe à changer" />}
            </span>
          </button>
        </div>
      </aside>

      <main className="layer">
        {page === 'library' && (detail ? <PackDetail pack={detail} onBack={() => setOpenPack(null)} /> : <Library onOpen={setOpenPack} />)}
        {page === 'market' && (
          <Marketplace
            view={marketStack[marketStack.length - 1] ?? null}
            depth={marketStack.length}
            onOpen={(v) => setMarketStack((s) => [...s, v])}
            onBack={() => setMarketStack((s) => s.slice(0, -1))}
            onOpenLocal={openLocal}
          />
        )}
        {page === 'graphics' && <Graphics />}
        {page === 'cleanup' && <Cleanup />}
        {page === 'account' && <AccountView onOpenAuthor={openAuthor} />}
        {page === 'settings' && <SettingsView />}

        {message && (
          <div className={`bar bar-${message.kind} floating`} role="status">
            <span className="bar-text">{message.text}</span>
            <button className="close" onClick={() => setMessage(null)} aria-label="Fermer">
              ×
            </button>
          </div>
        )}
      </main>
      {dragging && <div className="drop">Déposez pour ajouter à la bibliothèque</div>}
    </div>
  )
}
