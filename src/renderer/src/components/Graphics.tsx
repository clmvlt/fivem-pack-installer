import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  GRAPHICS_GROUPS,
  GRAPHICS_PRESETS,
  GRAPHICS_SETTINGS,
  recommendationsFor,
  unmet,
  type GraphicsSettingDef,
  type GraphicsState,
  type GraphicsTarget
} from '@shared/graphics'
import { useStore } from '../store'
import { q } from '../lib/format'

function displayRange(def: GraphicsSettingDef, v: string): string {
  const n = Number(v)
  if ((def.max ?? 1) <= 1) return `${Math.round(n * 100)} %`
  return `× ${n.toFixed(1).replace('.', ',')}`
}

export function Graphics() {
  const { overview, run, setMessage } = useStore()
  const [state, setState] = useState<GraphicsState | null | undefined>(undefined)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(
    async (target?: GraphicsTarget['id']) => {
      const s = await run(() => window.api.getGraphics(target))
      setState(s ?? null)
      setDraft(s?.values ?? {})
    },
    [run]
  )

  useEffect(() => {
    void load()
  }, [load])

  const changes = useMemo(() => {
    if (!state) return {}
    // « 1.000000 » et « 1 » sont la même valeur : seules les vraies différences comptent.
    const same = (a: string, b: string): boolean => a === b || (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && Number(a) === Number(b))
    return Object.fromEntries(Object.entries(draft).filter(([k, v]) => state.values[k] !== undefined && !same(v, state.values[k])))
  }, [draft, state])
  const count = Object.keys(changes).length

  const active = overview?.state.active ?? null
  const activePack = active ? overview?.library.find((p) => p.id === active.packId) : null
  const recos = useMemo(() => unmet(recommendationsFor(activePack?.features ?? []), draft), [activePack, draft])
  const running = (overview?.games.runningProcesses.length ?? 0) > 0

  if (state === undefined) return <div className="page" />
  if (state === null)
    return (
      <div className="page">
        <header className="page-head">
          <h1>Graphismes</h1>
        </header>
        <p className="empty">Fichier de réglages introuvable. Lancez FiveM une première fois, puis revenez ici.</p>
        <FpsLimit />
      </div>
    )

  const set = (key: string, value: string): void => setDraft((d) => ({ ...d, [key]: value }))
  const applyValues = (values: Record<string, string>): void => setDraft((d) => ({ ...d, ...Object.fromEntries(Object.entries(values).filter(([k]) => d[k] !== undefined)) }))

  const save = async (): Promise<void> => {
    setSaving(true)
    const s = await run(() => window.api.saveGraphics(state.target.id, changes))
    setSaving(false)
    if (s) {
      setState(s)
      setDraft(s.values)
      setMessage({ kind: 'info', text: `Réglages enregistrés. Ils s’appliqueront au prochain lancement de ${state.target.label}.` })
    }
  }
  const restore = async (): Promise<void> => {
    const ok = await window.api.confirm('Restaurer les réglages d’origine ?', 'Vos réglages graphiques reviennent à ce qu’ils étaient avant la première modification faite ici.', 'Restaurer')
    if (!ok) return
    const s = await run(() => window.api.restoreGraphics(state.target.id))
    if (s) {
      setState(s)
      setDraft(s.values)
    }
  }

  return (
    <div className="page with-savebar">
      <header className="page-head">
        <h1>Graphismes</h1>
        <span className="page-note">{[state.videoCard, state.resolution].filter(Boolean).join(' · ')}</span>
        <div className="spacer" />
        {state.targets.length > 1 && (
          <select value={state.target.id} onChange={(e) => void load(e.target.value as GraphicsTarget['id'])} aria-label="Jeu">
            {state.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </header>

      {running && (
        <div className="bar bar-warning">
          <span className="bar-text">Fermez FiveM pour enregistrer : le jeu réécrit ces réglages en quittant.</span>
        </div>
      )}

      {activePack && recos.length > 0 && (
        <div className="bar">
          <span className="bar-text">
            {q(activePack.name)} rend mieux avec : {recos.map((r) => r.reason).join(', ')}.
          </span>
          <button onClick={() => applyValues(Object.fromEntries(recos.map((r) => [r.key, r.value])))}>Appliquer</button>
        </div>
      )}

      <div className="presets">
        <span className="muted">Préréglages</span>
        {GRAPHICS_PRESETS.map((p) => (
          <button key={p.id} onClick={() => applyValues(p.values)}>
            {p.label}
          </button>
        ))}
      </div>

      <FpsLimit />

      {GRAPHICS_GROUPS.map((group) => {
        const defs = GRAPHICS_SETTINGS.filter((d) => d.group === group && draft[d.key] !== undefined)
        if (!defs.length) return null
        return (
          <section key={group}>
            <div className="section-head">
              <h2>{group}</h2>
            </div>
            <ul className="list settings-list">
              {defs.map((d) => (
                <li key={d.key} className={`row ${d.key in changes ? 'is-changed' : ''}`}>
                  <span className="row-main">{d.label}</span>
                  <Control def={d} value={draft[d.key]} onChange={(v) => set(d.key, v)} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <div className="gfx-foot">
        <span className="meta path">{state.target.path}</span>
        {state.readOnly && <span className="meta">Fichier en lecture seule : il le reste après l’enregistrement.</span>}
        <div className="actions">
          <button onClick={() => void run(() => window.api.openPath(state.target.path.replace(/[\\/][^\\/]+$/, '')))}>Ouvrir le dossier</button>
          {state.hasBackup && <button onClick={() => void restore()}>Restaurer les réglages d’origine</button>}
        </div>
      </div>

      {count > 0 && (
        <div className="savebar">
          <span>
            {count} modification{count > 1 ? 's' : ''}
          </span>
          <div className="spacer" />
          <button onClick={() => setDraft(state.values)} disabled={saving}>
            Annuler
          </button>
          <button className="primary" onClick={() => void save()} disabled={saving || running}>
            Enregistrer
          </button>
        </div>
      )}
    </div>
  )
}

const FPS_CHOICES = [60, 90, 120, 144, 165, 240]

/**
 * Limite d'images par seconde : FiveM n'en a pas, elle passe par le limiteur de l'ENB du pack (enblocal.ini). Le choix
 * est retenu pour toutes les installations et appliqué tout de suite au pack installé.
 */
function FpsLimit() {
  const { overview, run, setMessage } = useStore()
  const [busy, setBusy] = useState(false)
  if (!overview) return null
  const limit = overview.settings.fpsLimit ?? null
  const active = overview.state.active
  const packName = active?.packName ?? null
  const hasEnb = !!active?.files.some((f) => /(^|\/)enblocal\.ini$/i.test(f.path))
  const value = limit === null ? 'pack' : String(limit)

  const change = async (v: string): Promise<void> => {
    const next = v === 'pack' ? null : Number(v)
    setBusy(true)
    const updated = await run(() => window.api.setFpsLimit(next))
    setBusy(false)
    if (updated === undefined) return
    const what = next === null ? 'la limite prévue par chaque pack' : next === 0 ? 'aucune limite' : `${next} images par seconde au maximum`
    setMessage({
      kind: 'info',
      text: updated && packName ? `${packName} : ${what}, dès le prochain lancement.` : `Choix enregistré : ${what}, pour les packs qui utilisent ENB.`
    })
  }

  const note = !active
    ? 'Appliquée à l’installation des packs qui utilisent ENB.'
    : hasEnb
      ? `Appliquée par l’ENB de ${q(packName ?? '')}.`
      : `${q(packName ?? '')} n’utilise pas ENB : la limite servira aux packs qui en ont. Pour celui-ci, réglez la limite dans le panneau NVIDIA ou AMD.`

  return (
    <section>
      <div className="section-head">
        <h2>Images par seconde</h2>
      </div>
      <ul className="list settings-list">
        <li className="row">
          <div className="row-main">
            <div>Limite d’images par seconde</div>
            <div className="meta meta-wrap">{note}</div>
          </div>
          <select value={value} onChange={(e) => void change(e.target.value)} disabled={busy} aria-label="Limite d’images par seconde">
            <option value="pack">Celle du pack</option>
            <option value="0">Aucune limite</option>
            {limit !== null && limit > 0 && !FPS_CHOICES.includes(limit) && <option value={String(limit)}>{limit} FPS</option>}
            {FPS_CHOICES.map((n) => (
              <option key={n} value={String(n)}>
                {n} FPS
              </option>
            ))}
          </select>
        </li>
      </ul>
    </section>
  )
}

function Control({ def, value, onChange }: { def: GraphicsSettingDef; value: string; onChange: (v: string) => void }) {
  if (def.kind === 'bool')
    return (
      <label className="switch">
        <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : 'false')} />
        <span className="switch-track" />
        <span className="switch-text">{value === 'true' ? 'Activé' : 'Désactivé'}</span>
      </label>
    )
  if (def.kind === 'range')
    return (
      <div className="range">
        <input type="range" min={def.min} max={def.max} step={def.step} value={Number(value)} onChange={(e) => onChange(e.target.value)} />
        <span className="range-value">{displayRange(def, value)}</span>
      </div>
    )
  const known = def.options?.some((o) => o.value === value)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value={value}>Personnalisé ({value})</option>}
      {def.options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
