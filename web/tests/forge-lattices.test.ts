// TS-only Forge helpers: lattice templates, share-link codec, worker handler.
import { beforeAll, describe, expect, test } from 'vitest'
import { ForgeInputError, forgeEntry, type ForgeInput } from '../src/physics/forge'
import { DEFAULT_B_A2, MAX_ATOMS, decodeForge, encodeForge, expandCell, expandLattice, type LatticeId } from '../src/physics/forge-lattices'
import { handleForge } from '../src/physics/forge-client'
import { loadCrystals, loadForgeElements } from '../src/physics/tables'

const all = import.meta.glob<any>('../../artifacts/fixtures/forge/*.json', { eager: true, import: 'default' })
const fixtures = Object.values(all).filter((f) => f.function === 'forge.entry') as { name: string; input: ForgeInput }[]
const input = (n: string) => fixtures.find((f) => f.name === n)!.input
const invalid = (all['../../artifacts/fixtures/forge/invalid.json'] as any).cases as { code: string; hint: number[] | null; input: ForgeInput }[]

beforeAll(async () => {
  await loadForgeElements()
  await loadCrystals()
})

const key = (r: readonly number[]) => r.slice(0, 4).map((v, i) => (i ? (((v % 1) + 1) % 1).toFixed(9) : String(v))).join()
const atomSet = (rows: readonly (readonly number[])[]) => rows.map(key).sort()

describe('lattice templates', () => {
  test('rock salt (Li, F) and diamond (Si) match the fixtures; B and occupancy set', () => {
    const lif = input('lif')
    const rs = expandLattice('rock_salt', { elements: [3, 9], B_A2: [1.0, 0.65] })
    expect(atomSet(rs)).toEqual(atomSet(lif.basis))
    expect(rs.map((r) => r[4]).sort()).toEqual(lif.basis.map((r) => r[4]).sort())
    const si = input('si')
    const d = expandLattice('diamond', { elements: [14], B_A2: [0.476] })
    expect(atomSet(d)).toEqual(atomSet(si.basis))
  })
  test('NaCl rock salt keeps the same sites as LiF; default B', () => {
    const rs = expandLattice('rock_salt', { elements: [11, 17] })
    expect(atomSet(rs).map((s) => s.split(',').slice(1).join())).toEqual(atomSet(input('lif').basis).map((s) => s.split(',').slice(1).join()))
    expect(rs.every((r) => r[4] === DEFAULT_B_A2 && r[5] === 1)).toBe(true)
  })
  const cases: [LatticeId, any, number[]][] = [
    ['cubic_p', { a_pm: 300, elements: [29] }, [1, 0, 0]],
    ['cubic_i', { a_pm: 287, elements: [26] }, [1, 1, 0]],
    ['cubic_f', { a_pm: 361, elements: [29] }, [1, 1, 1]],
    ['rock_salt', { a_pm: 564.02, elements: [11, 17] }, [2, 0, 0]],
    ['cscl', { a_pm: 412, elements: [55, 17] }, [1, 0, 0]],
    ['diamond', { a_pm: 543, elements: [14] }, [1, 1, 1]],
    ['zincblende', { a_pm: 565, elements: [31, 33] }, [1, 1, 1]],
    ['hexagonal', { a_pm: 320, c_pm: 520, elements: [30] }, [0, 0, 1]],
    ['general', { a_pm: 500, b_pm: 600, c_pm: 700, alpha_deg: 80, beta_deg: 85, gamma_deg: 95, elements: [14] }, [0, 0, 1]],
  ]
  test.each(cases)('%s builds', (t, p, cut) => {
    const e = forgeEntry({
      name: t, cell: expandCell(t, p), basis: expandLattice(t, p), cut, reflectivity_model: 'darwin', mosaic_fwhm_deg: null,
    })
    expect(e.d_pm).toBeGreaterThan(0)
  })
  test('cap is 64', () => expect(MAX_ATOMS).toBe(64))
})

describe('share codec', () => {
  test.each(fixtures.map((f) => [f.name, f.input] as const))('round trip %s', (_n, inp) => {
    expect(decodeForge(encodeForge(inp))).toEqual(inp)
  })
  test('unicode name survives', () => {
    const inp = { ...input('si'), name: 'Cristal ñ α' }
    expect(decodeForge(encodeForge(inp)).name).toBe('Cristal ñ α')
  })
  const enc = (o: unknown) => encodeForge(o as ForgeInput)
  const si = input('si')
  const rejects = (s: string) => {
    try {
      decodeForge(s)
    } catch (e) {
      expect(e).toBeInstanceOf(ForgeInputError)
      expect((e as ForgeInputError).code).toBe('bad_link')
      return
    }
    expect.fail('decode accepted ' + s.slice(0, 40))
  }
  test('rejects garbage', () => {
    rejects('')
    rejects('not base64!!')
    rejects('A'.repeat(9000))
    rejects('AAAA') // decodes, not JSON
    rejects(enc(null))
    rejects(enc([1]))
    rejects(enc({ ...si, name: 7 }))
    rejects(enc({ ...si, name: 'x'.repeat(41) }))
    rejects(enc({ ...si, cell: { ...si.cell, a_pm: 'x' } }))
    rejects(enc({ ...si, basis: Array(MAX_ATOMS + 1).fill(si.basis[0]) }))
    rejects(enc({ ...si, basis: [[14, 0, 0, 0, 0.5]] }))
    rejects(enc({ ...si, basis: [[14, 0, 0, 0, 0.5, '1']] }))
    rejects(encodeForge({ ...si, cut: [1.5, 0, 0] }))
    rejects(enc({ ...si, cut: [1, 0] }))
    rejects(enc({ ...si, reflectivity_model: 'magic' }))
    rejects(enc({ ...si, mosaic_fwhm_deg: 'a' }))
    // NaN and Infinity serialise as null in JSON
    rejects(enc({ ...si, cell: { ...si.cell, a_pm: NaN } }))
    rejects(enc({ ...si, basis: [[14, 0, 0, 0, Infinity, 1]] }))
  })
  test('accepts exactly 64 atoms', () => {
    expect(decodeForge(encodeForge({ ...si, basis: Array(MAX_ATOMS).fill(si.basis[0]) })).basis.length).toBe(MAX_ATOMS)
  })
})

describe('handleForge', () => {
  test('valid input gives entry and warnings', () => {
    const r = handleForge(input('si')) as any
    expect(r.entry.d_pm).toBeGreaterThan(0)
    expect(Array.isArray(r.warnings)).toBe(true)
  })
  test('invalid inputs give their code; cut_absent carries the hint', () => {
    for (const c of invalid) {
      const r = handleForge(c.input) as any
      expect(r.error?.code, c.code).toBe(c.code)
      if (c.code === 'cut_absent') expect(r.error.hint).toEqual(c.hint)
    }
  })
  test('non-ForgeInputError becomes internal', () => {
    expect((handleForge(null as any) as any).error.code).toBe('internal')
  })
})
