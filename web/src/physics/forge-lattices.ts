// TS-only helpers for the Forge view (no physics, no Python counterpart): lattice templates that expand to the
// conventional-cell basis of a ForgeInput, and the share-link codec. forgeEntry does the physical validation.
import { ForgeInputError, type ForgeInput } from './forge'
import { NACL_THERMAL_B_A2 } from './constants'

/** UI/trust-boundary cap on basis rows. */
export const MAX_ATOMS = 64
/** UI default Debye-Waller B (Å²) when the caller gives none: a typical room-temperature value (fixtures use 0.3-1.4). Not physics. */
export const DEFAULT_B_A2 = 0.5

export type LatticeId = 'cubic_p' | 'cubic_i' | 'cubic_f' | 'rock_salt' | 'cscl' | 'diamond' | 'zincblende' | 'hexagonal' | 'general'
export type Cell = ForgeInput['cell']
export type Row = readonly number[] // [Z, x, y, z, B_A2, occupancy]

/** Per template: the free cell fields, the number of element slots, and whether the atoms are entered by hand. */
export const LATTICES: Record<LatticeId, { cellFields: readonly (keyof Cell)[]; elements: number; manualAtoms: boolean }> = {
  cubic_p: { cellFields: ['a_pm'], elements: 1, manualAtoms: false },
  cubic_i: { cellFields: ['a_pm'], elements: 1, manualAtoms: false },
  cubic_f: { cellFields: ['a_pm'], elements: 1, manualAtoms: false },
  rock_salt: { cellFields: ['a_pm'], elements: 2, manualAtoms: false },
  cscl: { cellFields: ['a_pm'], elements: 2, manualAtoms: false },
  diamond: { cellFields: ['a_pm'], elements: 1, manualAtoms: false },
  zincblende: { cellFields: ['a_pm'], elements: 2, manualAtoms: false },
  hexagonal: { cellFields: ['a_pm', 'c_pm'], elements: 1, manualAtoms: true },
  general: { cellFields: ['a_pm', 'b_pm', 'c_pm', 'alpha_deg', 'beta_deg', 'gamma_deg'], elements: 1, manualAtoms: true },
}

export type LatticeParams = {
  a_pm?: number; b_pm?: number; c_pm?: number; alpha_deg?: number; beta_deg?: number; gamma_deg?: number
  elements: readonly number[] // one Z per element slot
  B_A2?: readonly number[] // one per element slot, default DEFAULT_B_A2
  atoms?: readonly Row[] // hexagonal/general: the atoms entered by hand (replaces the 1-atom start)
}

/** The cell of a template; fields it does not free are fixed by its symmetry. */
export function expandCell(t: LatticeId, p: LatticeParams): Cell {
  const a = p.a_pm as number
  if (t === 'hexagonal') return { a_pm: a, b_pm: a, c_pm: p.c_pm as number, alpha_deg: 90, beta_deg: 90, gamma_deg: 120 }
  if (t === 'general')
    return { a_pm: a, b_pm: p.b_pm as number, c_pm: p.c_pm as number, alpha_deg: p.alpha_deg as number, beta_deg: p.beta_deg as number, gamma_deg: p.gamma_deg as number }
  return { a_pm: a, b_pm: a, c_pm: a, alpha_deg: 90, beta_deg: 90, gamma_deg: 90 }
}

const FCC = [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]]
const shift = (pts: number[][], s: number[]) => pts.map((q) => q.map((v, i) => (v + s[i]) % 1))

/** Atom positions (fractional) per element slot. */
const SITES: Partial<Record<LatticeId, number[][][]>> = {
  cubic_p: [[[0, 0, 0]]],
  cubic_i: [[[0, 0, 0], [0.5, 0.5, 0.5]]],
  cubic_f: [FCC],
  rock_salt: [FCC, shift(FCC, [0.5, 0, 0])],
  cscl: [[[0, 0, 0]], [[0.5, 0.5, 0.5]]],
  diamond: [[...FCC, ...shift(FCC, [0.25, 0.25, 0.25])]],
  zincblende: [FCC, shift(FCC, [0.25, 0.25, 0.25])],
}

/** Conventional-cell basis rows [Z, x, y, z, B_A2, occupancy] of a template. */
export function expandLattice(t: LatticeId, p: LatticeParams): number[][] {
  const B = (i: number) => p.B_A2?.[i] ?? DEFAULT_B_A2
  if (LATTICES[t].manualAtoms) return p.atoms ? p.atoms.map((r) => [...r]) : [[p.elements[0], 0, 0, 0, B(0), 1]]
  return (SITES[t] as number[][][]).flatMap((pts, i) => pts.map((q) => [p.elements[i], ...q, B(i), 1]))
}

// ---- presets of the Forge view -------------------------------------------------------------------------------------

export type Preset = {
  id: string; lattice: LatticeId; a_pm: number; elements: readonly number[]; B_A2: readonly number[]
  cut: readonly number[]; model: ForgeInput['reflectivity_model']; eta_deg: number | null
}
/** "Start from" designs. a, B, cut and model follow model/PARAMETERS.md (LiF B: assumption there; Si B: Heacock et al. 2021).
 * KCl's B is the UI default DEFAULT_B_A2 (assumption, no source read); its a = 629.3 pm and η = 0.2° are a rough rock-salt-like choice. */
export const PRESETS: readonly Preset[] = [
  { id: 'NaCl', lattice: 'rock_salt', a_pm: 564.02, elements: [11, 17], B_A2: [NACL_THERMAL_B_A2, NACL_THERMAL_B_A2], cut: [2, 0, 0], model: 'mosaic_extinction', eta_deg: 0.2 },
  { id: 'LiF', lattice: 'rock_salt', a_pm: 402.7, elements: [3, 9], B_A2: [1.0, 0.65], cut: [2, 0, 0], model: 'mosaic_extinction', eta_deg: 0.05 },
  { id: 'Si', lattice: 'diamond', a_pm: 543.102, elements: [14], B_A2: [0.476], cut: [1, 1, 1], model: 'darwin', eta_deg: null },
  { id: 'KCl', lattice: 'rock_salt', a_pm: 629.3, elements: [19, 17], B_A2: [DEFAULT_B_A2, DEFAULT_B_A2], cut: [2, 0, 0], model: 'mosaic_extinction', eta_deg: 0.2 },
]

// ---- share link ---------------------------------------------------------------------------------------------------

const MAX_LINK_CHARS = 8192 // 64 atoms of compact JSON are ≈ 3.5 kB, ≈ 4.7 kB in base64
const MODELS = ['darwin', 'mosaic_extinction', 'ideal_mosaic']

export function encodeForge(input: ForgeInput): string {
  const bytes = new TextEncoder().encode(JSON.stringify(input))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** TRUST BOUNDARY: the string comes from a URL. Shape and types only; physical validity is forgeEntry's job.
 * Throws ForgeInputError('bad_link') on anything wrong. */
export function decodeForge(s: string): ForgeInput {
  const bad = (why: string): never => {
    throw new ForgeInputError('bad_link', `bad share link: ${why}`)
  }
  if (typeof s !== 'string' || !s.length || s.length > MAX_LINK_CHARS || !/^[A-Za-z0-9_-]+$/.test(s)) bad('not a base64url string of reasonable size')
  let o: any
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    o = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
  } catch {
    return bad('cannot decode')
  }
  const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  if (!o || typeof o !== 'object' || Array.isArray(o)) bad('not an object')
  if (typeof o.name !== 'string' || o.name.length > 40) bad('name')
  const c = o.cell
  if (!c || typeof c !== 'object' || !(['a_pm', 'b_pm', 'c_pm', 'alpha_deg', 'beta_deg', 'gamma_deg'] as const).every((k) => fin(c[k]))) bad('cell')
  if (!Array.isArray(o.basis) || !o.basis.length || o.basis.length > MAX_ATOMS) bad('basis size')
  if (!o.basis.every((r: unknown) => Array.isArray(r) && r.length === 6 && r.every(fin))) bad('basis rows')
  if (!Array.isArray(o.cut) || o.cut.length !== 3 || !o.cut.every(Number.isInteger)) bad('cut')
  if (!MODELS.includes(o.reflectivity_model)) bad('reflectivity_model')
  if (o.mosaic_fwhm_deg !== null && !fin(o.mosaic_fwhm_deg)) bad('mosaic_fwhm_deg')
  if (o.source !== undefined && (typeof o.source !== 'string' || o.source.length > 200)) bad('source')
  const out: ForgeInput = {
    name: o.name,
    cell: Object.fromEntries((['a_pm', 'b_pm', 'c_pm', 'alpha_deg', 'beta_deg', 'gamma_deg'] as const).map((k) => [k, c[k]])) as Cell,
    basis: o.basis.map((r: number[]) => [...r]),
    cut: [...o.cut],
    reflectivity_model: o.reflectivity_model,
    mosaic_fwhm_deg: o.mosaic_fwhm_deg,
  }
  if (o.source !== undefined) out.source = o.source
  return out
}
