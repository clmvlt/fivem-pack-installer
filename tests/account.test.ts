// Compte : PKCE de la connexion Google, retour sur le serveur local, jeton chiffré et son effacement.
import { createHash } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  Account,
  avatarMediaUrl,
  createPkce,
  googleAuthUrl,
  parseLoopbackCallback,
  pkceChallenge,
  TokenFile,
  waitForLoopback,
  type Session
} from '../src/main/core/account'
import type { SystemProtection } from '../src/main/core/keys'
import type { AccountMe } from '../src/shared/types'

/** Faux chiffrement du système (inversion des octets) : le fichier ne doit jamais contenir le jeton en clair. */
const fakeSystem = (available = true): SystemProtection => ({
  available: () => available,
  protect: (data) => Buffer.from(data.map((b) => b ^ 0xa5)),
  unprotect: (data) => Buffer.from(data.map((b) => b ^ 0xa5))
})

const remoteMe = {
  authenticated: true,
  id: 12,
  username: null,
  email: 'joueur@example.com',
  displayName: 'Joueur',
  slug: 'joueur',
  avatarUrl: '/users/12/avatar?v=3f2a9c1e-77aa-4b1b-8a7e-0c2d8a9b1f00',
  role: 'user',
  admin: false,
  canPublish: true,
  mustChangePassword: false,
  hasPassword: true,
  googleLinked: false
}

const json = (status: number, body: unknown, type = 'application/json'): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': type } })

let dir: string
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-account-'))
})
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('PKCE', () => {
  it('calcule le challenge S256 de l’exemple de la RFC 7636', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('génère un verifier de 43 à 128 caractères base64url et son challenge', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const { verifier, challenge } = createPkce()
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
      expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
      seen.add(verifier)
    }
    expect(seen.size).toBe(20)
  })

  it('construit l’adresse de connexion Google', () => {
    const url = new URL(
      googleAuthUrl(
        { clientId: 'client.apps.googleusercontent.com', authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth', scope: 'openid email profile' },
        { redirectUri: 'http://127.0.0.1:51234/callback', challenge: 'abc', state: 'xyz' }
      )
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client.apps.googleusercontent.com',
      redirect_uri: 'http://127.0.0.1:51234/callback',
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge: 'abc',
      code_challenge_method: 'S256',
      state: 'xyz',
      prompt: 'select_account'
    })
  })

  it('refuse une page de connexion qui n’est pas en https', () => {
    expect(() =>
      googleAuthUrl({ clientId: 'c', authorizationEndpoint: 'http://exemple.test/auth', scope: 's' }, { redirectUri: 'r', challenge: 'c', state: 's' })
    ).toThrow()
  })
})

describe('retour de la connexion Google', () => {
  it('lit le code quand le state correspond', () => {
    expect(parseLoopbackCallback('/callback?state=s1&code=4%2F0Ab_xyz&scope=email', 's1')).toEqual({ type: 'code', code: '4/0Ab_xyz' })
  })

  it('signale un refus (error=)', () => {
    expect(parseLoopbackCallback('/callback?error=access_denied&state=s1', 's1')).toEqual({ type: 'error', error: 'access_denied' })
  })

  it('ignore un retour d’une autre connexion ou sans code', () => {
    expect(parseLoopbackCallback('/callback?state=autre&code=abc', 's1')).toEqual({ type: 'invalid' })
    expect(parseLoopbackCallback('/callback?code=abc', 's1')).toEqual({ type: 'invalid' })
    expect(parseLoopbackCallback('/callback?error=access_denied&state=autre', 's1')).toEqual({ type: 'invalid' })
    expect(parseLoopbackCallback('/callback?state=s1', 's1')).toEqual({ type: 'invalid' })
    expect(parseLoopbackCallback('/callback?state=&code=abc', '')).toEqual({ type: 'invalid' })
  })

  it('ignore les autres adresses', () => {
    expect(parseLoopbackCallback('/favicon.ico', 's1')).toEqual({ type: 'ignore' })
    expect(parseLoopbackCallback('/', 's1')).toEqual({ type: 'ignore' })
  })

  it('attend la redirection sur 127.0.0.1 puis ferme le serveur', async () => {
    let redirect = ''
    const done = waitForLoopback('etat', new AbortController().signal, async (uri) => {
      redirect = uri
    })
    await expect.poll(() => redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    // Mauvais state : refusé, l'attente continue.
    expect((await fetch(`${redirect}?state=autre&code=pirate`)).status).toBe(400)
    const page = await fetch(`${redirect}?state=etat&code=le-code`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Connexion réussie')
    await expect(done).resolves.toEqual({ code: 'le-code', redirectUri: redirect })
    await expect(fetch(`${redirect}?state=etat&code=encore`)).rejects.toThrow()
  })

  it('« Connexion annulée » quand l’utilisateur refuse', async () => {
    let redirect = ''
    const done = waitForLoopback('etat', new AbortController().signal, async (uri) => {
      redirect = uri
    })
    const outcome = expect(done).rejects.toThrow('Connexion annulée.')
    await expect.poll(() => redirect).not.toBe('')
    const page = await fetch(`${redirect}?state=etat&error=access_denied`)
    expect(await page.text()).toContain('Connexion annulée')
    await outcome
  })

  it('abandon et délai dépassé', async () => {
    const abort = new AbortController()
    const cancelled = waitForLoopback('etat', abort.signal, async () => abort.abort())
    await expect(cancelled).rejects.toThrow('Connexion annulée.')
    await expect(waitForLoopback('etat', new AbortController().signal, async () => undefined, 50)).rejects.toThrow('expirée')
  })
})

describe('photo des comptes', () => {
  it('sert la photo par pm-media', () => {
    expect(avatarMediaUrl('/users/12/avatar?v=3f2a-9c')).toBe('pm-media://avatar/12/3f2a-9c')
    expect(avatarMediaUrl(null)).toBeNull()
    expect(avatarMediaUrl('https://exemple.test/a.jpg')).toBeNull()
    expect(avatarMediaUrl('/users/12/avatar?v=../../x')).toBeNull()
  })
})

describe('jeton chiffré', () => {
  const me = { id: 12, displayName: 'Joueur' } as AccountMe
  const session: Session = { token: 'pm_secret-du-jeton', expiresAt: '2027-04-01T00:00:00Z', me }

  it('enregistre le jeton chiffré, le relit, puis l’efface', async () => {
    const file = path.join(dir, 'a', 'account.dat')
    const store = new TokenFile(file, fakeSystem())
    expect(await store.load()).toBeNull()
    await store.save(session)
    expect((await fs.readFile(file)).toString('latin1')).not.toContain('pm_secret')
    expect(await new TokenFile(file, fakeSystem()).load()).toEqual(session)
    await store.clear()
    expect(existsSync(file)).toBe(false)
    expect(await store.load()).toBeNull()
  })

  it('oublie un fichier illisible (autre compte Windows)', async () => {
    const file = path.join(dir, 'b.dat')
    await fs.writeFile(file, 'abîmé')
    expect(await new TokenFile(file, fakeSystem()).load()).toBeNull()
    expect(existsSync(file)).toBe(false)
  })

  it('sans chiffrement du système : rien sur le disque, gardé pour la session', async () => {
    const file = path.join(dir, 'c.dat')
    const store = new TokenFile(file, fakeSystem(false))
    await store.save(session)
    expect(existsSync(file)).toBe(false)
    expect(await store.load()).toEqual(session)
    await store.clear()
    expect(await store.load()).toBeNull()
  })
})

describe('compte', () => {
  const setup = async (
    name: string,
    handler: (url: string, init: RequestInit) => Response | Promise<Response>
  ): Promise<{ account: Account; file: string; changes: (AccountMe | null)[]; calls: { url: string; init: RequestInit }[] }> => {
    const file = path.join(dir, `${name}.dat`)
    const changes: (AccountMe | null)[] = []
    const calls: { url: string; init: RequestInit }[] = []
    const account = new Account({
      apiUrl: 'https://api.test/api',
      store: new TokenFile(file, fakeSystem()),
      fetch: async (url, init) => {
        calls.push({ url, init })
        return handler(url, init)
      },
      openExternal: async () => undefined,
      onChange: (me) => changes.push(me)
    })
    await account.init()
    return { account, file, changes, calls }
  }

  it('connexion : jeton enregistré, puis envoyé dans l’en-tête Authorization', async () => {
    const { account, file, changes, calls } = await setup('login', (url) =>
      url.endsWith('/auth/token') ? json(200, { token: 'pm_abc', expiresAt: null, me: remoteMe }) : json(200, { ...remoteMe, bio: null, links: [], createdAt: null })
    )
    const me = await account.login(' joueur@example.com ', 'motdepasse')
    expect(me.avatarUrl).toBe('pm-media://avatar/12/3f2a9c1e-77aa-4b1b-8a7e-0c2d8a9b1f00')
    expect(changes).toEqual([me])
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ login: 'joueur@example.com', password: 'motdepasse', deviceName: expect.stringMatching(/^Reflect FiveM — /) })
    expect(existsSync(file)).toBe(true)

    await account.profile()
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer pm_abc')

    // Relu au lancement suivant.
    const next = new Account({ apiUrl: '', store: new TokenFile(file, fakeSystem()), fetch, openExternal: async () => undefined, onChange: () => undefined })
    await next.init()
    expect(next.current()?.id).toBe(12)
  })

  it('401 « token-invalid » : jeton effacé, retour à l’état déconnecté', async () => {
    let expired = false
    const { account, file, changes } = await setup('expired', (url) =>
      url.endsWith('/auth/token')
        ? json(200, { token: 'pm_abc', expiresAt: null, me: remoteMe })
        : expired
          ? json(401, { detail: 'Connexion expirée : reconnectez-vous.', code: 'token-invalid' }, 'application/problem+json')
          : json(200, remoteMe)
    )
    await account.login('joueur@example.com', 'motdepasse')
    await account.refresh()
    expect(account.current()).not.toBeNull()
    expired = true
    await expect(account.refresh()).rejects.toThrow('Connexion expirée : reconnectez-vous.')
    expect(account.current()).toBeNull()
    expect(existsSync(file)).toBe(false)
    expect(changes.at(-1)).toBeNull()
  })

  it('les erreurs affichent le `detail` de l’API', async () => {
    const { account, changes } = await setup('errors', () =>
      json(429, { detail: 'Trop d’essais. Réessayez dans 30 s.', retryAfter: 30 }, 'application/problem+json')
    )
    await expect(account.login('joueur@example.com', 'faux')).rejects.toThrow('Trop d’essais. Réessayez dans 30 s.')
    expect(account.current()).toBeNull()
    expect(changes).toEqual([])
  })

  it('déconnexion : jeton effacé même si le serveur est injoignable', async () => {
    let offline = false
    const { account, file } = await setup('logout', () => {
      if (offline) throw new Error('réseau')
      return json(200, { token: 'pm_abc', expiresAt: null, me: remoteMe })
    })
    await account.login('joueur@example.com', 'motdepasse')
    offline = true
    await account.logout()
    expect(account.current()).toBeNull()
    expect(existsSync(file)).toBe(false)
  })
})
