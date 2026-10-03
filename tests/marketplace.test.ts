// Marketplace : packs du moment (champ `featured` et GET /packs/featured), y compris avec une API plus ancienne.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn<(url: string) => Promise<Response>>()
vi.mock('electron', () => ({ net: { fetch: (url: string) => fetchMock(url) } }))

const { Marketplace, toMarketPack } = await import('../src/main/core/marketplace')
type RemoteSummary = import('../src/main/core/marketplace').RemoteSummary
type Library = import('../src/main/core/library').Library

const remote = (extra: Partial<RemoteSummary> = {}): RemoteSummary => ({
  id: 'aa665074-b72c-498a-b3b5-f90f78957a65',
  slug: 'bh-1960',
  name: "BH' 1960",
  summary: 'Ambiance années 60.',
  author: '',
  version: '1.0',
  tags: ['ENB'],
  archiveName: "BH' 1960.zip",
  archiveSize: 1000,
  sha256: 'b46a',
  downloadCount: 4,
  publishedAt: null,
  updatedAt: '2026-09-26T20:59:13Z',
  archiveUpdatedAt: null,
  cover: null,
  ...extra
})

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('pack du moment', () => {
  it('reprend `featured` quand l’API le donne', () => {
    expect(toMarketPack(remote({ featured: true }), undefined).featured).toBe(true)
    expect(toMarketPack(remote({ featured: false }), undefined).featured).toBe(false)
  })

  it('vaut false quand le champ est absent (API plus ancienne)', () => {
    const pack = toMarketPack(remote(), undefined)
    expect(pack.featured).toBe(false)
    expect(pack.localId).toBeNull()
  })

  describe('GET /packs/featured', () => {
    const market = new Marketplace('https://api.test/api', 'cache', () => ({ list: async () => [] }) as unknown as Library)
    beforeEach(() => fetchMock.mockReset())

    it('liste les packs mis en avant dans l’ordre de l’API', async () => {
      fetchMock.mockResolvedValue(json(200, [remote({ featured: true, slug: 'b' }), remote({ id: 'x', featured: true, slug: 'a' })]))
      const items = await market.featured()
      expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/packs/featured')
      expect(items.map((p) => [p.slug, p.featured])).toEqual([
        ['b', true],
        ['a', true]
      ])
    })

    it('liste vide : rien à afficher', async () => {
      fetchMock.mockResolvedValue(json(200, []))
      expect(await market.featured()).toEqual([])
    })

    it('404 (API plus ancienne), erreur ou réponse inattendue : liste vide', async () => {
      fetchMock.mockResolvedValue(json(404, { detail: "Ce pack n'existe pas ou n'est plus disponible." }))
      expect(await market.featured()).toEqual([])
      fetchMock.mockResolvedValue(json(500, {}))
      expect(await market.featured()).toEqual([])
      fetchMock.mockRejectedValue(new Error('réseau'))
      expect(await market.featured()).toEqual([])
      fetchMock.mockResolvedValue(json(200, { items: [] }))
      expect(await market.featured()).toEqual([])
    })
  })
})
