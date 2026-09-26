import { useEffect, useState } from 'react'
import { useStore } from './store'
import { Library } from './components/Library'
import { PackDetail } from './components/PackDetail'
import { Cleanup } from './components/Cleanup'
import { SettingsView } from './components/SettingsView'
import { Graphics } from './components/Graphics'
import { Marketplace } from './components/Marketplace'
import { UpdatePanel } from './components/UpdatePanel'
import icon from './assets/icon.png'

type Page = 'library' | 'market' | 'graphics' | 'cleanup' | 'settings'

const NAV: { id: Page; label: string }[] = [
  { id: 'library', label: 'Bibliothèque' },
  { id: 'market', label: 'Marketplace' },
  { id: 'graphics', label: 'Graphismes' },
  { id: 'cleanup', label: 'Nettoyage' },
  { id: 'settings', label: 'Réglages' }
]

export function App() {
  const { overview, message, setMessage, run } = useStore()
  const [page, setPage] = useState<Page>('library')
  const [openPack, setOpenPack] = useState<string | null>(null)
  const [openMarket, setOpenMarket] = useState<string | null>(null)
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
    setOpenMarket(null)
  }
  const openLocal = (id: string): void => {
    setPage('library')
    setOpenPack(id)
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
        </div>
      </aside>

      <main className="layer">
        {page === 'library' && (detail ? <PackDetail pack={detail} onBack={() => setOpenPack(null)} /> : <Library onOpen={setOpenPack} />)}
        {page === 'market' && <Marketplace openId={openMarket} onOpen={setOpenMarket} onOpenLocal={openLocal} />}
        {page === 'graphics' && <Graphics />}
        {page === 'cleanup' && <Cleanup />}
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
