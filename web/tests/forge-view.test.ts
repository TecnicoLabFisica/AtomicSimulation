// Forge view, pure parts (no DOM): design → ForgeInput, presets, the orders table, and the i18n coverage of every code.
import { beforeAll, describe, expect, test } from 'vitest'
import { forgeEntry, forgeWarnings, type ForgeInput } from '../src/physics/forge'
import { handleForge } from '../src/physics/forge-client'
import { PRESETS } from '../src/physics/forge-lattices'
import { loadCrystals, loadForgeElements } from '../src/physics/tables'
import { ELEMENTS, classifyReach, designFromInput, designFromPreset, orderRows, switchLattice, toInput } from '../src/views/forge'
import { FORGE_I18N, errorText } from '../src/views/forge-i18n'

const all = import.meta.glob<any>('../../artifacts/fixtures/forge/*.json', { eager: true, import: 'default' })
const invalid = (all['../../artifacts/fixtures/forge/invalid.json'] as any).cases as { code: string; hint: number[] | null; input: ForgeInput }[]

beforeAll(async () => {
  await loadForgeElements()
  await loadCrystals()
})

describe('presets', () => {
  test('92 element symbols', () => expect(ELEMENTS.length).toBe(92))
  test.each(PRESETS.map((p) => p.id))('%s builds with no warnings', (id) => {
    const input = toInput(designFromPreset(PRESETS.find((p) => p.id === id)!))
    const r = handleForge(input)
    expect('entry' in r && r.warnings).toEqual([])
    expect(forgeEntry(input).cut).toEqual(input.cut)
  })
  test('NaCl preset: d = 282.01 pm, order 2 of the (2 0 0) series is (4 0 0)', () => {
    const c = forgeEntry(toInput(designFromPreset(PRESETS[0])))
    expect(c.d_pm).toBeCloseTo(282.01, 2)
    expect(orderRows(c)[1].hkl).toEqual([4, 0, 0])
  })
  test('mosaic width only goes to mosaic_extinction', () => {
    const d = designFromPreset(PRESETS[2]) // Si, darwin
    expect(toInput(d).mosaic_fwhm_deg).toBeNull()
    expect(toInput({ ...d, model: 'mosaic_extinction' }).mosaic_fwhm_deg).toBe(0.2)
  })
})

describe('design conversion', () => {
  test('a ForgeInput opens as the general lattice and converts back unchanged', () => {
    const input = toInput(designFromPreset(PRESETS[1]))
    const back = toInput(designFromInput(input))
    expect(back).toEqual(input)
  })
  test.each(PRESETS.map((p) => p.id))('%s is recognised as its own template after the round trip', (id) => {
    const p = PRESETS.find((q) => q.id === id)!
    const back = designFromInput(toInput(designFromPreset(p)))
    expect(back.lattice).toBe(p.lattice)
    expect(back.elements).toEqual([...p.elements])
    expect(back.atoms).toEqual([])
  })
  test('a perturbed basis falls back to the general lattice', () => {
    const input = toInput(designFromPreset(PRESETS[0]))
    const basis = input.basis.map((r, k) => (k === 3 ? r.map((v, i) => (i === 1 ? v + 0.01 : v)) : r))
    expect(designFromInput({ ...input, basis }).lattice).toBe('general')
  })
  test('a hexagonal cell is recognised, atoms by hand', () => {
    const d = switchLattice(designFromPreset(PRESETS[0]), 'hexagonal')
    const back = designFromInput(toInput(d))
    expect(back.lattice).toBe('hexagonal')
    expect(back.atoms).toHaveLength(1)
  })
  test('rock salt → general keeps the same crystal', () => {
    const d = designFromPreset(PRESETS[0])
    expect(toInput(switchLattice(d, 'general'))).toEqual(toInput(d))
  })
  test('template → hexagonal starts with one atom and the 120° cell', () => {
    const i = toInput(switchLattice(designFromPreset(PRESETS[0]), 'hexagonal'))
    expect(i.basis).toHaveLength(1)
    expect(i.cell.gamma_deg).toBe(120)
  })
  test('switching to a template with more slots pads the elements', () => {
    expect(switchLattice(designFromPreset(PRESETS[2]), 'cscl').elements).toHaveLength(2)
  })
})

describe('orders table', () => {
  test('Si (1 1 1): n = 1 reachable, forbidden orders flagged, θ null beyond the goniometer', () => {
    const rows = orderRows(forgeEntry(toInput(designFromPreset(PRESETS[2]))))
    expect(rows[0]).toMatchObject({ n: 1, allowed: true })
    expect(rows[0].thetaDeg).toBeCloseTo(6.51, 2)
    expect(rows[0].fRel).toBeCloseTo(1, 2)
    expect(rows.some((r) => !r.allowed)).toBe(true)
    expect(rows.every((r) => r.allowed || r.n >= 1)).toBe(true)
  })
  test('KCl (1 1 1): the odd order is weak next to n = 2, which is the maximum', () => {
    const rows = orderRows(forgeEntry(toInput({ ...designFromPreset(PRESETS[3]), cut: [1, 1, 1] })))
    expect(rows[0].fRel).toBeLessThan(0.01)
    expect(rows[1].fRel).toBeCloseTo(1, 10)
  })
  test('LiF (2 0 0): order 6 has no Bragg solution; the classifier splits "none" from "too far"', () => {
    const rows = orderRows(forgeEntry(toInput(designFromPreset(PRESETS[1]))))
    expect(rows[5].reach).toBe('none')
    expect(rows[0].reach).toBe('ok')
    expect(classifyReach(Number.NaN)).toBe('none')
    expect(classifyReach(85.5)).toBe('far')
    expect(classifyReach(30)).toBe('ok')
  })
  test('cut_absent hint reaches the text', () => {
    const d = designFromPreset(PRESETS[2])
    const r = handleForge(toInput({ ...d, cut: [1, 0, 0] }))
    expect('error' in r && r.error.code).toBe('cut_absent')
    expect(errorText('cut_absent', 'error' in r ? r.error.hint : null, undefined, [1, 0, 0])).toContain('(4 0 0)')
    expect(errorText('cut_absent', [4, 0, 0], FORGE_I18N.en, [1, 0, 0])).toContain('(1 0 0) has F = 0')
  })
})

describe('i18n coverage', () => {
  const codes = [...new Set([...invalid.map((c) => c.code), 'internal', 'bad_link'])]
  test.each(['es', 'en'] as const)('%s has a text for every error and warning code', (lang) => {
    const d = FORGE_I18N[lang]
    for (const c of codes) expect(typeof d.errors[c], c).toMatch(/string|function/)
    for (const w of ['atoms_too_close', 'no_line_reflects', 'many_orders']) expect(d.warnings[w], w).toBeTruthy()
    expect(Object.keys(d.errors).sort()).toEqual(Object.keys(FORGE_I18N.es.errors).sort())
  })
  test('every warning code the engine can emit has a text', () => {
    const w = forgeWarnings(toInput({ ...designFromPreset(PRESETS[0]), cell: { a_pm: 150, b_pm: 150, c_pm: 150, alpha_deg: 90, beta_deg: 90, gamma_deg: 90 } }))
    for (const code of w) expect(FORGE_I18N.es.warnings[code]).toBeTruthy()
  })
})
