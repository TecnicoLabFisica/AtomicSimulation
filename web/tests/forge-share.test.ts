import { describe, expect, it } from 'vitest'
import { decodeForge, encodeForge } from '../src/physics/forge-lattices'
import { loadDesign, readForgeParam, saveDesign, shareUrl, withoutForgeParam } from '../src/views/forge-share'
import type { ForgeInput } from '../src/physics/forge'

const input: ForgeInput = {
  name: 'KCl <b>x</b>',
  cell: { a_pm: 629, b_pm: 629, c_pm: 629, alpha_deg: 90, beta_deg: 90, gamma_deg: 90 },
  basis: [[19, 0, 0, 0, 1, 1], [17, 0.5, 0.5, 0.5, 1, 1]],
  cut: [1, 0, 0],
  reflectivity_model: 'darwin',
  mosaic_fwhm_deg: null,
}
const fakeStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}

describe('share link', () => {
  it('round-trips and keeps other params', () => {
    const url = new URL(shareUrl(input, { origin: 'https://x.org', pathname: '/app/', search: '?lang=en' }))
    expect(url.origin + url.pathname).toBe('https://x.org/app/')
    expect(url.searchParams.get('lang')).toBe('en')
    expect(decodeForge(url.searchParams.get('forge')!)).toEqual(input)
  })
  it('readForgeParam: ok, absent, bad, empty, oversized', () => {
    expect(readForgeParam(`?forge=${encodeForge(input)}`)).toEqual({ input })
    expect(readForgeParam('?a=1')).toBeNull()
    expect(readForgeParam('?forge=garbage!!')).toEqual({ error: 'bad_link' })
    expect(readForgeParam('?forge=')).toEqual({ error: 'bad_link' })
    expect(readForgeParam(`?forge=${'A'.repeat(9000)}`)).toEqual({ error: 'bad_link' })
  })
  it('withoutForgeParam removes only forge', () => {
    expect(withoutForgeParam('https://x.org/app/?a=1&forge=abc&b=2#h')).toBe('/app/?a=1&b=2#h')
    expect(withoutForgeParam('https://x.org/app/?forge=abc')).toBe('/app/')
  })
})

describe('saved design', () => {
  it('saves and restores', () => {
    const s = fakeStore()
    saveDesign(input, s)
    expect(loadDesign(s)).toEqual(input)
  })
  it('removes a corrupt value', () => {
    const s = fakeStore({ 'forge-design': 'not a design!' })
    expect(loadDesign(s)).toBeNull()
    expect(s.m.size).toBe(0)
  })
  it('survives a throwing storage', () => {
    const boom = () => { throw new Error('denied') }
    const s = { getItem: boom, setItem: boom, removeItem: boom }
    expect(() => saveDesign(input, s)).not.toThrow()
    expect(loadDesign(s)).toBeNull()
    expect(loadDesign({ getItem: () => 'bad!', setItem: boom, removeItem: boom })).toBeNull()
  })
})
