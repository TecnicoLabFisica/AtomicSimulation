// Share link and persistence of the Forge design. Pure functions (no DOM) so Vitest covers them.
import { decodeForge, encodeForge } from '../physics/forge-lattices'
import type { ForgeInput } from '../physics/forge'

const KEY = 'forge-design'
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** A link that opens `input` in the Forge; other query params are kept. */
export function shareUrl(input: ForgeInput, loc: { origin: string; pathname: string; search: string }): string {
  const p = new URLSearchParams(loc.search)
  p.set('forge', encodeForge(input))
  return `${loc.origin}${loc.pathname}?${p}`
}

/** The `forge` param of a query string: null when absent, {error} when it is not a valid design. Never throws. */
export function readForgeParam(search: string): { input: ForgeInput } | { error: 'bad_link' } | null {
  const v = new URLSearchParams(search).get('forge')
  if (v === null) return null
  try {
    return { input: decodeForge(v) }
  } catch {
    return { error: 'bad_link' }
  }
}

/** The same URL without the `forge` param (path + query + hash, for history.replaceState). */
export function withoutForgeParam(href: string): string {
  const u = new URL(href)
  u.searchParams.delete('forge')
  return u.pathname + u.search + u.hash
}

// Storage can throw (private mode, sandboxed LMS iframes): the design then just isn't remembered.
export function saveDesign(input: ForgeInput, store?: Store): void {
  try {
    ;(store ?? localStorage).setItem(KEY, encodeForge(input))
  } catch {}
}

/** The saved design, or null; a corrupt value is removed. */
export function loadDesign(store?: Store): ForgeInput | null {
  try {
    const s = store ?? localStorage
    const v = s.getItem(KEY)
    if (v === null) return null
    try {
      return decodeForge(v)
    } catch {
      s.removeItem(KEY)
    }
  } catch {}
  return null
}
