// Compte reflect-fivem.com (facultatif) : connexion par jeton, profil public de l'auteur.
//
// Le jeton (en-tête « Authorization: Bearer ») est gardé chiffré par Windows (safeStorage, DPAPI) dans le dossier de
// données, avec le dernier état connu du compte pour l'afficher sans réseau. Il reste valable 180 jours après sa
// dernière utilisation ; un 401 « token-invalid » (expiré, révoqué, compte désactivé) l'efface. Il n'est jamais journalisé.
//
// Connexion Google : flux « application de bureau » avec PKCE. La page Google s'ouvre dans le navigateur et revient sur
// un petit serveur http://127.0.0.1:<port>/callback ouvert le temps de la connexion ; le code reçu est échangé par
// l'API, qui garde le secret du client.
//
// Aucune dépendance à Electron ici (testé avec vitest) : le service fournit fetch, l'ouverture du navigateur et le
// chiffrement du système.

import { createHash, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import type { AccountMe, AccountProfile, AuthorRef, ProfileInput, ProfileLink } from '@shared/types'
import type { SystemProtection } from './keys'
import { log } from '../util/log'

const TIMEOUT = 20_000
const GOOGLE_TIMEOUT = 5 * 60_000
export const AVATAR_MAX = 8 * 1024 * 1024

const AVATAR_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
}
export const AVATAR_EXTENSIONS = Object.keys(AVATAR_TYPES).map((e) => e.slice(1))

/** Erreur renvoyée par l'API : `detail` (message à afficher) et `code` facultatif. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
  }
}

// ------------------------------------------------------------------ fonctions pures (testées)

/** code_challenge S256 d'un code_verifier PKCE (RFC 7636). */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

/** code_verifier aléatoire (43 caractères, alphabet base64url) et son challenge S256. */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: pkceChallenge(verifier) }
}

export interface GoogleConfig {
  clientId: string
  authorizationEndpoint: string
  scope: string
}

/** Adresse de la page de connexion Google. */
export function googleAuthUrl(config: GoogleConfig, p: { redirectUri: string; challenge: string; state: string }): string {
  const url = new URL(config.authorizationEndpoint)
  if (url.protocol !== 'https:') throw new Error('Connexion Google indisponible (adresse invalide).')
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: config.scope,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
    prompt: 'select_account'
  }).toString()
  return url.toString()
}

export type LoopbackResult =
  | { type: 'code'; code: string }
  | { type: 'error'; error: string }
  /** Retour sur /callback mal formé ou d'une autre connexion (state différent) : ignoré. */
  | { type: 'invalid' }
  /** Autre adresse (favicon.ico...). */
  | { type: 'ignore' }

/** Lit la redirection reçue par le serveur local (« /callback?code=…&state=… » ou « ?error=… »). */
export function parseLoopbackCallback(requestUrl: string | undefined, state: string): LoopbackResult {
  let url: URL
  try {
    url = new URL(requestUrl ?? '/', 'http://127.0.0.1')
  } catch {
    return { type: 'invalid' }
  }
  if (url.pathname !== '/callback') return { type: 'ignore' }
  const p = url.searchParams
  if (!state || p.get('state') !== state) return { type: 'invalid' }
  const error = p.get('error')
  if (error) return { type: 'error', error }
  const code = p.get('code')
  return code ? { type: 'code', code } : { type: 'invalid' }
}

/** Photo d'un compte : « /users/12/avatar?v=… » (adresse relative à l'API) → pm-media://avatar/12/…, mise en cache. */
export function avatarMediaUrl(apiPath: string | null | undefined): string | null {
  const m = /^\/users\/(\d{1,18})\/avatar\?v=([A-Za-z0-9_-]{1,64})$/.exec(apiPath ?? '')
  return m ? `pm-media://avatar/${m[1]}/${m[2]}` : null
}

export function deviceName(): string {
  return `Reflect FiveM — ${os.hostname()}`.slice(0, 80)
}

// ------------------------------------------------------------------ réponses de l'API

interface RemoteMe {
  authenticated?: boolean
  id: number
  username: string | null
  email: string | null
  displayName: string | null
  slug: string | null
  avatarUrl: string | null
  role: string | null
  admin: boolean
  canPublish: boolean
  mustChangePassword?: boolean
  hasPassword: boolean
  googleLinked: boolean
}

interface RemoteProfile extends RemoteMe {
  bio: string | null
  links: ProfileLink[] | null
  createdAt: string | null
}

interface TokenResponse {
  token: string
  expiresAt: string | null
  me: RemoteMe
}

function toMe(r: RemoteMe): AccountMe {
  return {
    id: r.id,
    username: r.username ?? null,
    email: r.email ?? null,
    displayName: r.displayName ?? '',
    slug: r.slug ?? '',
    avatarUrl: avatarMediaUrl(r.avatarUrl),
    role: r.role === 'admin' ? 'admin' : 'user',
    admin: !!r.admin,
    canPublish: !!r.canPublish,
    mustChangePassword: !!r.mustChangePassword,
    hasPassword: !!r.hasPassword,
    googleLinked: !!r.googleLinked
  }
}

function toProfile(r: RemoteProfile): AccountProfile {
  const { mustChangePassword: _ignored, ...me } = toMe(r)
  return { ...me, bio: r.bio ?? '', links: (r.links ?? []).map((l) => ({ label: l.label, url: l.url })), createdAt: r.createdAt ?? null }
}

/** Auteur d'un pack ou d'une liste d'auteurs, avec sa photo servie par pm-media. */
export function toAuthorRef(r: { id: number; slug: string; displayName: string; avatarUrl: string | null }): AuthorRef {
  return { id: r.id, slug: r.slug, displayName: r.displayName, avatarUrl: avatarMediaUrl(r.avatarUrl) }
}

// ------------------------------------------------------------------ jeton chiffré

export interface Session {
  token: string
  expiresAt: string | null
  me: AccountMe
}

/** Jeton et dernier état connu du compte, chiffrés par le système. Sans chiffrement disponible : gardés en mémoire. */
export class TokenFile {
  private memory: Session | null = null

  constructor(
    private file: string,
    private system: SystemProtection
  ) {}

  async load(): Promise<Session | null> {
    if (!this.system.available()) return this.memory
    const saved = await fs.readFile(this.file).catch(() => null)
    if (!saved) return null
    try {
      const s = JSON.parse(this.system.unprotect(saved).toString('utf8')) as Session
      if (typeof s.token === 'string' && s.token && s.me && typeof s.me.id === 'number') return s
    } catch {
      /* autre compte Windows, fichier abîmé */
    }
    log.warn('Connexion enregistrée illisible : reconnectez-vous')
    await this.clear()
    return null
  }

  async save(session: Session): Promise<void> {
    if (!this.system.available()) {
      log.warn('Chiffrement du système indisponible : connexion gardée pour cette session seulement')
      this.memory = session
      return
    }
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    await fs.writeFile(tmp, this.system.protect(Buffer.from(JSON.stringify(session), 'utf8')))
    await fs.rename(tmp, this.file)
  }

  async clear(): Promise<void> {
    this.memory = null
    await fs.rm(this.file, { force: true })
  }
}

// ------------------------------------------------------------------ compte

export interface AccountDeps {
  apiUrl: string
  store: TokenFile
  fetch: (url: string, init: RequestInit) => Promise<Response>
  /** Ouvre une adresse dans le navigateur. */
  openExternal: (url: string) => Promise<void>
  /** Connexion, déconnexion, profil modifié, connexion expirée. */
  onChange: (me: AccountMe | null) => void
}

interface RequestOptions {
  json?: unknown
  raw?: { data: Buffer; type: string }
  auth?: boolean
  timeout?: number
}

export class Account {
  private session: Session | null = null
  private google: AbortController | null = null

  constructor(private deps: AccountDeps) {}

  async init(): Promise<void> {
    this.session = await this.deps.store.load().catch(() => null)
  }

  /** Compte connecté (dernier état connu, sans réseau). */
  current(): AccountMe | null {
    return this.session?.me ?? null
  }

  /** Relit le compte (GET /auth/me). Hors ligne : l'état enregistré est gardé. */
  async refresh(): Promise<AccountMe | null> {
    if (!this.session) return null
    const me = await this.request<RemoteMe>('GET', '/auth/me', { auth: true })
    if (!me.authenticated) {
      await this.forget()
      return null
    }
    await this.updateMe(toMe(me))
    return this.current()
  }

  async login(login: string, password: string): Promise<AccountMe> {
    if (!login.trim() || !password) throw new Error('Saisissez votre adresse e-mail et votre mot de passe.')
    return this.signIn(await this.request<TokenResponse>('POST', '/auth/token', { json: { login: login.trim(), password, deviceName: deviceName() } }))
  }

  async register(email: string, password: string, displayName: string): Promise<AccountMe> {
    const body = { email: email.trim(), password, displayName: displayName.trim(), deviceName: deviceName() }
    return this.signIn(await this.request<TokenResponse>('POST', '/auth/token/register', { json: body }))
  }

  /** Connexion Google dans le navigateur (une seule à la fois : un nouvel essai abandonne le précédent). */
  async loginWithGoogle(): Promise<AccountMe> {
    this.google?.abort()
    const abort = new AbortController()
    this.google = abort
    try {
      const config = await this.request<GoogleConfig>('GET', '/auth/token/google/config')
      const { verifier, challenge } = createPkce()
      const state = randomBytes(24).toString('base64url')
      const { code, redirectUri } = await waitForLoopback(state, abort.signal, (redirectUri) =>
        this.deps.openExternal(googleAuthUrl(config, { redirectUri, challenge, state }))
      )
      const body = { code, codeVerifier: verifier, redirectUri, deviceName: deviceName() }
      return this.signIn(await this.request<TokenResponse>('POST', '/auth/token/google', { json: body }))
    } finally {
      if (this.google === abort) this.google = null
    }
  }

  cancelGoogle(): void {
    this.google?.abort()
  }

  /** Déconnexion : le jeton est supprimé sur le serveur (si possible) et sur ce PC dans tous les cas. */
  async logout(): Promise<void> {
    if (!this.session) return
    try {
      await this.request('DELETE', '/auth/token', { auth: true })
    } catch (err) {
      log.info(`Déconnexion : jeton non révoqué sur le serveur (${(err as Error).message})`)
    }
    await this.forget()
    log.info('Compte : déconnecté')
  }

  async profile(): Promise<AccountProfile> {
    return this.withProfile(await this.request<RemoteProfile>('GET', '/me', { auth: true }))
  }

  async saveProfile(input: ProfileInput): Promise<AccountProfile> {
    const body: ProfileInput = {
      displayName: input.displayName.trim(),
      bio: input.bio.trim(),
      links: input.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.label || l.url)
    }
    return this.withProfile(await this.request<RemoteProfile>('PUT', '/me', { auth: true, json: body }))
  }

  /** Envoie la photo d'un fichier image (PNG, JPEG, GIF, BMP ; 8 Mo au plus). */
  async setAvatarFile(file: string): Promise<AccountProfile> {
    const type = AVATAR_TYPES[path.extname(file).toLowerCase()]
    if (!type) throw new Error('Format non pris en charge : choisissez une image PNG, JPEG, GIF ou BMP.')
    const st = await fs.stat(file)
    if (st.size > AVATAR_MAX) throw new Error('Photo trop lourde (8 Mo au plus).')
    const data = await fs.readFile(file)
    return this.withProfile(await this.request<RemoteProfile>('PUT', '/me/avatar', { auth: true, raw: { data, type }, timeout: 60_000 }))
  }

  async removeAvatar(): Promise<AccountProfile> {
    return this.withProfile(await this.request<RemoteProfile>('DELETE', '/me/avatar', { auth: true }))
  }

  /** Les autres appareils sont déconnectés ; celui-ci reste connecté. */
  async changePassword(currentPassword: string | null, newPassword: string): Promise<AccountMe> {
    const body = currentPassword === null ? { newPassword } : { currentPassword, newPassword }
    await this.updateMe(toMe(await this.request<RemoteMe>('POST', '/auth/password', { auth: true, json: body })))
    return this.current()!
  }

  // ----------------------------------------------------------------

  private async signIn(r: TokenResponse): Promise<AccountMe> {
    if (typeof r?.token !== 'string' || !r.token || !r.me) throw new Error('Le serveur ne répond pas correctement.')
    this.session = { token: r.token, expiresAt: r.expiresAt ?? null, me: toMe(r.me) }
    await this.deps.store.save(this.session)
    log.info(`Compte : connecté (compte ${this.session.me.id})`)
    this.deps.onChange(this.session.me)
    return this.session.me
  }

  private async forget(): Promise<void> {
    this.session = null
    await this.deps.store.clear().catch((err: unknown) => log.warn(`Connexion enregistrée non effacée : ${(err as Error).message}`))
    this.deps.onChange(null)
  }

  private async updateMe(me: AccountMe): Promise<void> {
    if (!this.session) return
    const changed = JSON.stringify(me) !== JSON.stringify(this.session.me)
    this.session = { ...this.session, me }
    if (!changed) return
    await this.deps.store.save(this.session).catch((err: unknown) => log.warn(`Compte non enregistré : ${(err as Error).message}`))
    this.deps.onChange(me)
  }

  /** Un profil reçu met aussi à jour le compte affiché (nom, photo...). */
  private async withProfile(r: RemoteProfile): Promise<AccountProfile> {
    const profile = toProfile(r)
    if (this.session) {
      const { bio: _b, links: _l, createdAt: _c, ...me } = profile
      await this.updateMe({ ...this.session.me, ...me })
    }
    return profile
  }

  private async request<T>(method: string, pathname: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    let body: RequestInit['body']
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(opts.json)
    } else if (opts.raw) {
      headers['Content-Type'] = opts.raw.type
      body = new Uint8Array(opts.raw.data)
    }
    const session = this.session
    if (opts.auth) {
      if (!session) throw new ApiError('Vous n’êtes pas connecté.', 401, 'signed-out')
      headers.Authorization = `Bearer ${session.token}`
    }

    let response: Response
    try {
      response = await this.deps.fetch(`${this.deps.apiUrl}${pathname}`, { method, headers, body, signal: AbortSignal.timeout(opts.timeout ?? TIMEOUT) })
    } catch {
      throw new Error('Serveur injoignable. Vérifiez votre connexion à Internet.')
    }
    if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T

    const problem = (await response.json().catch(() => null)) as { detail?: unknown; code?: unknown; retryAfter?: unknown } | null
    const code = typeof problem?.code === 'string' ? problem.code : undefined
    // Jeton expiré ou révoqué (seulement s'il s'agit toujours de celui de la session : une connexion a pu avoir lieu entre-temps).
    if (opts.auth && response.status === 401 && code === 'token-invalid' && this.session === session) await this.forget()
    if (response.status === 403 && code === 'password-change-required' && this.session && !this.session.me.mustChangePassword)
      await this.updateMe({ ...this.session.me, mustChangePassword: true })
    throw new ApiError(problemMessage(response.status, problem), response.status, code)
  }
}

function problemMessage(status: number, problem: { detail?: unknown; retryAfter?: unknown } | null): string {
  if (typeof problem?.detail === 'string' && problem.detail.trim()) return problem.detail
  if (status === 429) {
    const s = typeof problem?.retryAfter === 'number' ? problem.retryAfter : null
    return s ? `Trop d’essais. Réessayez dans ${s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`}.` : 'Trop d’essais. Réessayez plus tard.'
  }
  return `Le serveur ne répond pas correctement (erreur ${status}).`
}

// ------------------------------------------------------------------ retour de la connexion Google

const PAGE = (title: string, text: string): string =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>` +
  'html{color-scheme:light dark}body{margin:0;display:grid;place-items:center;height:100vh;font:15px/1.5 "Segoe UI",system-ui,sans-serif;' +
  'background:Canvas;color:CanvasText}main{text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}p{margin:0;opacity:.75}</style>' +
  `</head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`

/**
 * Ouvre http://127.0.0.1:<port libre>/callback, appelle `open` avec cette adresse, puis attend la redirection de Google
 * (5 minutes au plus). Le serveur est fermé dans tous les cas.
 */
export function waitForLoopback(
  state: string,
  signal: AbortSignal,
  open: (redirectUri: string) => Promise<void>,
  timeoutMs = GOOGLE_TIMEOUT
): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let redirectUri = ''
    let settled = false
    const finish = (err: Error | null, code?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      server.close()
      // Connexions gardées ouvertes par le navigateur : fermées après l'envoi de la page.
      setTimeout(() => server.closeAllConnections(), 500)
      if (err) reject(err)
      else resolve({ code: code!, redirectUri })
    }
    const reply = (res: http.ServerResponse, status: number, html: string): void => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' })
      res.end(html)
    }

    const server = http.createServer((req, res) => {
      const result = parseLoopbackCallback(req.url, state)
      switch (result.type) {
        case 'code':
          reply(res, 200, PAGE('Connexion réussie', 'Vous pouvez fermer cet onglet et revenir à Reflect FiveM.'))
          finish(null, result.code)
          break
        case 'error':
          reply(res, 200, PAGE('Connexion annulée', 'Vous pouvez fermer cet onglet.'))
          finish(new Error('Connexion annulée.'))
          break
        case 'invalid':
          reply(res, 400, PAGE('Requête invalide', 'Relancez la connexion depuis Reflect FiveM.'))
          break
        default:
          res.writeHead(404, { Connection: 'close' })
          res.end()
      }
    })
    const onAbort = (): void => finish(new Error('Connexion annulée.'))
    const timer = setTimeout(() => finish(new Error('Connexion Google expirée : réessayez.')), timeoutMs)
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort)
    server.on('error', (err) => finish(new Error(`Connexion Google impossible : ${err.message}`)))
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`
      open(redirectUri).catch((err: unknown) => finish(new Error(`Navigateur introuvable : ${(err as Error).message}`)))
    })
  })
}
