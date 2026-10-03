import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { AccountMe, AccountProfile, ProfileInput, ProfileLink } from '@shared/types'
import { cleanError, useStore } from '../store'
import { Avatar } from './common'

const BIO_MAX = 2000
const LINKS_MAX = 8

/** Compte packs.dimzou.fr : connexion, puis profil public, mot de passe et déconnexion. */
export function AccountView({ onOpenAuthor }: { onOpenAuthor: (slug: string) => void }) {
  const { account } = useStore()
  return (
    <div className="page">
      <header className="page-head">
        <h1>Compte</h1>
      </header>
      {account === undefined ? null : !account ? (
        <SignIn />
      ) : account.mustChangePassword ? (
        <ForcedPassword me={account} />
      ) : (
        <Profile me={account} onOpenAuthor={onOpenAuthor} />
      )}
    </div>
  )
}

/** Erreur d'un formulaire (message de l'API). */
function FormError({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="bar bar-error form-error" role="alert">
      <span className="bar-text">{text}</span>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

// ------------------------------------------------------------------ connexion

function SignIn() {
  const { setAccount } = useStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState<'form' | 'google' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy('form')
    setError(null)
    try {
      setAccount(mode === 'login' ? await window.api.accountLogin(email, password) : await window.api.accountRegister(email, password, displayName))
    } catch (err) {
      setError(cleanError(err))
      setBusy(null)
    }
  }
  const google = async (): Promise<void> => {
    setBusy('google')
    setError(null)
    try {
      setAccount(await window.api.accountLoginGoogle())
    } catch (err) {
      setError(cleanError(err))
      setBusy(null)
    }
  }
  const switchMode = (m: 'login' | 'register'): void => {
    setMode(m)
    setError(null)
  }

  return (
    <div className="auth">
      <p className="muted auth-intro">
        Le compte est facultatif : la bibliothèque et la Marketplace fonctionnent sans. Il vous donne une page d’auteur (photo, nom public, description, liens)
        affichée avec vos packs.
      </p>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-selected' : ''} onClick={() => switchMode('login')}>
          Se connecter
        </button>
        <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-selected' : ''} onClick={() => switchMode('register')}>
          Créer un compte
        </button>
      </div>

      <form className="auth-form" onSubmit={(e) => void submit(e)}>
        <Field label="Adresse e-mail">
          <input className="input" type={mode === 'login' ? 'text' : 'email'} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        {mode === 'register' && (
          <Field label="Nom public" hint="Affiché avec vos packs, de 2 à 40 caractères.">
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} maxLength={40} required />
          </Field>
        )}
        <Field label="Mot de passe" hint={mode === 'register' ? '8 caractères au moins.' : undefined}>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === 'register' ? 8 : undefined}
            maxLength={128}
            required
          />
        </Field>
        <FormError text={error} />
        <button type="submit" className="primary wide" disabled={!!busy}>
          {busy === 'form' ? (mode === 'login' ? 'Connexion…' : 'Création du compte…') : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </button>
      </form>

      <div className="divider">ou</div>

      {busy === 'google' ? (
        <div className="google-wait">
          <span>Terminez la connexion dans votre navigateur…</span>
          <button className="link" onClick={() => void window.api.accountCancelGoogle()}>
            Annuler
          </button>
        </div>
      ) : (
        <button className="wide google" onClick={() => void google()} disabled={!!busy}>
          <GoogleLogo />
          Continuer avec Google
        </button>
      )}
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

// ------------------------------------------------------------------ mot de passe

function PasswordForm({ me, onDone }: { me: AccountMe; onDone?: () => void }) {
  const { setMessage } = useStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (next !== confirm) return setError('Les deux mots de passe ne correspondent pas.')
    setBusy(true)
    setError(null)
    try {
      await window.api.accountChangePassword(me.hasPassword ? current : null, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setMessage({ kind: 'info', text: me.hasPassword ? 'Mot de passe modifié. Vos autres appareils sont déconnectés.' : 'Mot de passe ajouté.' })
      onDone?.()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-panel" onSubmit={(e) => void submit(e)}>
      {!me.hasPassword && <p className="muted">Compte créé avec Google : ajoutez un mot de passe pour vous connecter aussi avec votre adresse e-mail.</p>}
      {me.hasPassword && (
        <Field label="Mot de passe actuel">
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
      )}
      <div className="field-pair">
        <Field label="Nouveau mot de passe" hint="8 caractères au moins.">
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} maxLength={128} required />
        </Field>
        <Field label="Confirmation">
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={128} required />
        </Field>
      </div>
      <FormError text={error} />
      <div className="form-actions">
        {me.hasPassword && <span className="hint">Vos autres appareils seront déconnectés.</span>}
        <div className="spacer" />
        <button type="submit" className="primary" disabled={busy}>
          {me.hasPassword ? 'Changer le mot de passe' : 'Ajouter un mot de passe'}
        </button>
      </div>
    </form>
  )
}

function LogoutButton() {
  const { run } = useStore()
  return <button onClick={() => void run(() => window.api.accountLogout())}>Se déconnecter</button>
}

/** Mot de passe imposé (initial ou fixé par l'administrateur) : à changer avant tout le reste. */
function ForcedPassword({ me }: { me: AccountMe }) {
  return (
    <div className="account">
      <AccountHead me={me} actions={<LogoutButton />} />
      <div className="bar bar-warning form-error">
        <span className="bar-text">Un nouveau mot de passe est demandé pour ce compte. Choisissez-en un pour continuer.</span>
      </div>
      <PasswordForm me={me} />
    </div>
  )
}

// ------------------------------------------------------------------ profil

function AccountHead({ me, actions }: { me: AccountMe; actions?: ReactNode }) {
  const badges = [me.admin && 'Administrateur', me.canPublish && 'Auteur', me.googleLinked && 'Google'].filter(Boolean) as string[]
  return (
    <div className="profile-head">
      <Avatar url={me.avatarUrl} name={me.displayName} size={72} />
      <div className="profile-id">
        <div className="profile-name">{me.displayName}</div>
        <div className="muted ellipsis">{me.email ?? me.username}</div>
        {badges.length > 0 && (
          <div className="badges">
            {badges.map((b) => (
              <span key={b} className="badge">
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  )
}

const toInput = (p: AccountProfile): ProfileInput => ({ displayName: p.displayName, bio: p.bio, links: p.links.map((l) => ({ ...l })) })

function Profile({ me, onOpenAuthor }: { me: AccountMe; onOpenAuthor: (slug: string) => void }) {
  const { setMessage } = useStore()
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [draft, setDraft] = useState<ProfileInput | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'avatar' | null>(null)

  const load = useCallback(async () => {
    try {
      const p = await window.api.accountProfile()
      setProfile(p)
      setDraft(toInput(p))
      setLoadError(null)
    } catch (err) {
      setLoadError(cleanError(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const avatar = async (fn: () => Promise<AccountProfile | null>): Promise<void> => {
    setBusy('avatar')
    try {
      const p = await fn()
      if (p) setProfile(p)
    } catch (err) {
      setMessage({ kind: 'error', text: cleanError(err) })
    } finally {
      setBusy(null)
    }
  }

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!draft) return
    setBusy('save')
    setError(null)
    try {
      const p = await window.api.accountSaveProfile(draft)
      setProfile(p)
      setDraft(toInput(p))
      setMessage({ kind: 'info', text: 'Profil enregistré.' })
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(null)
    }
  }

  const setLink = (i: number, patch: Partial<ProfileLink>): void =>
    setDraft((d) => (d ? { ...d, links: d.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : d))
  const dirty = !!profile && !!draft && JSON.stringify(toInput(profile)) !== JSON.stringify(draft)
  const hasAvatar = !!(profile?.avatarUrl ?? me.avatarUrl)

  return (
    <div className="account">
      <AccountHead
        me={me}
        actions={
          <>
            <button onClick={() => void avatar(() => window.api.accountPickAvatar())} disabled={!!busy}>
              {busy === 'avatar' ? 'Envoi…' : hasAvatar ? 'Changer la photo…' : 'Ajouter une photo…'}
            </button>
            {hasAvatar && (
              <button onClick={() => void avatar(() => window.api.accountRemoveAvatar())} disabled={!!busy}>
                Retirer la photo
              </button>
            )}
          </>
        }
      />

      <div className="section-head">
        <h2>Profil public</h2>
        {me.canPublish && me.slug && <button onClick={() => onOpenAuthor(me.slug)}>Voir ma page d’auteur</button>}
      </div>
      {loadError ? (
        <div className="form-panel">
          <p className="muted">{loadError}</p>
          <div>
            <button onClick={() => void load()}>Réessayer</button>
          </div>
        </div>
      ) : !draft ? (
        <p className="muted">Chargement…</p>
      ) : (
        <form className="form-panel" onSubmit={(e) => void save(e)}>
          <Field label="Nom public" hint="Affiché avec vos packs, de 2 à 40 caractères.">
            <input className="input" value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} minLength={2} maxLength={40} required />
          </Field>
          <Field label="Description" hint={`${draft.bio.length.toLocaleString('fr-FR')} / ${BIO_MAX.toLocaleString('fr-FR')}`}>
            <textarea className="input" rows={5} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} maxLength={BIO_MAX} />
          </Field>
          <div className="field">
            <span className="field-label">Liens</span>
            {draft.links.map((l, i) => (
              <div key={i} className="link-row">
                <input className="input" placeholder="Nom (ex. YouTube)" aria-label="Nom du lien" value={l.label} maxLength={40} onChange={(e) => setLink(i, { label: e.target.value })} />
                <input className="input" placeholder="https://…" aria-label="Adresse du lien" value={l.url} maxLength={300} onChange={(e) => setLink(i, { url: e.target.value })} />
                <button
                  type="button"
                  className="close"
                  aria-label="Retirer ce lien"
                  title="Retirer ce lien"
                  onClick={() => setDraft({ ...draft, links: draft.links.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
            ))}
            <div>
              <button type="button" onClick={() => setDraft({ ...draft, links: [...draft.links, { label: '', url: '' }] })} disabled={draft.links.length >= LINKS_MAX}>
                Ajouter un lien
              </button>
              {draft.links.length >= LINKS_MAX && <span className="hint inline">{LINKS_MAX} liens au plus.</span>}
            </div>
          </div>
          <FormError text={error} />
          <div className="form-actions">
            <div className="spacer" />
            {dirty && (
              <button type="button" onClick={() => profile && setDraft(toInput(profile))}>
                Annuler les modifications
              </button>
            )}
            <button type="submit" className="primary" disabled={!dirty || busy === 'save'}>
              Enregistrer
            </button>
          </div>
        </form>
      )}

      <div className="section-head">
        <h2>Mot de passe</h2>
      </div>
      <PasswordForm me={me} />

      <div className="section-head">
        <h2>Connexion</h2>
      </div>
      <ul className="list">
        <li className="row">
          <div className="row-main">
            <div className="name">Connecté sur cet appareil</div>
            <div className="meta">La connexion est gardée chiffrée sur ce PC et expire après 180 jours sans utilisation.</div>
          </div>
          <div className="actions">
            <LogoutButton />
          </div>
        </li>
      </ul>
    </div>
  )
}
