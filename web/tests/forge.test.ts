// Materials Forge port: every artifacts/fixtures/forge/*.json entry, warning list and expected-rate scan must be
// reproduced by forgeEntry / forgeWarnings (relative 1e-9, 1e-12 absolute floor like the other fixtures).
import { beforeAll, describe, expect, test } from 'vitest'
import { ForgeInputError, forgeEntry, forgeWarnings, tableAtoms, type ForgeInput } from '../src/physics/forge'
import { interpNodes } from '../src/physics/crystal'
import { HC_KEV_PM } from '../src/physics/constants'
import { DEFAULT, expectedRate, modelParams } from '../src/physics/scan'
import { forgeElementsLoaded, loadCrystals, loadForgeElements } from '../src/physics/tables'

type Fixture = {
  name: string
  description: string
  input: ForgeInput
  entry: Record<string, any>
  warnings: string[]
  scan: { inputs: Record<string, any>; expected: { rate_per_s: number[] } }
}
const all = import.meta.glob<any>('../../artifacts/fixtures/forge/*.json', { eager: true, import: 'default' })
const byFunction = (fn: string) => Object.values(all).filter((f) => f.function === fn)
const files = Object.fromEntries(Object.entries(all).filter(([, f]) => f.function === 'forge.entry')) as Record<string, Fixture>

beforeAll(async () => {
  await loadForgeElements()
  await loadCrystals()
})

let worstRel = 0
let worstRate = 0
function close(actual: number, expected: number, what: string, track: (r: number) => void, floor = 1e-12) {
  const err = Math.abs(actual - expected)
  track(err / Math.max(Math.abs(expected), floor))
  if (!(err <= 1e-9 * Math.abs(expected) + floor)) expect.fail(`${what}: got ${actual}, expected ${expected}`)
}
function compare(actual: unknown, expected: unknown, what: string, track: (r: number) => void) {
  if (Array.isArray(expected)) {
    expect((actual as unknown[]).length, `${what} length`).toBe(expected.length)
    expected.forEach((e, i) => compare((actual as unknown[])[i], e, `${what}[${i}]`, track))
  } else if (typeof expected === 'number') close(actual as number, expected, what, track)
  else expect(actual, what).toEqual(expected)
}

describe('artifacts/fixtures/forge', () => {
  test('tables load lazily and idempotently; 9 crystals, warnings, invalid and atoms fixtures', async () => {
    expect(forgeElementsLoaded()).toBe(true)
    await loadForgeElements()
    expect(Object.keys(files).length).toBe(9)
    expect(Object.keys(all).length).toBe(12)
  })
  const times: [string, number][] = []
  for (const f of Object.values(files)) {
    test(`${f.name}: ${f.description}`, () => {
      const t0 = performance.now()
      const crystal = forgeEntry(f.input)
      times.push([f.name, performance.now() - t0])
      const perField: Record<string, number> = {}
      for (const [key, e] of Object.entries(f.entry)) {
        expect(key in crystal, `field ${key}`).toBe(true)
        compare((crystal as any)[key], e, key, (r) => (perField[key] = Math.max(perField[key] ?? 0, r)))
      }
      worstRel = Math.max(worstRel, ...Object.values(perField))
      expect(forgeWarnings(f.input)).toEqual(f.warnings)
      const x = f.scan.inputs
      const rate = expectedRate(x.beta_deg, x.U_kV, x.I_mA, x.params ? modelParams(x.params) : DEFAULT, undefined, undefined, crystal)
      compare(Array.from(rate), f.scan.expected.rate_per_s, 'rate', (r) => (worstRate = Math.max(worstRate, r)))
    })
  }
  test('build times and worst deviations (information)', () => {
    times.sort((a, b) => b[1] - a[1])
    console.log(`forge build: ${times.map(([n, t]) => `${n} ${t.toFixed(0)} ms`).join(', ')}; max rel entry ${worstRel.toExponential(2)}, max rel rate ${worstRate.toExponential(2)}`)
  })
})

test('invalid designs throw', () => {
  const lif = Object.values(files).find((f) => f.name === 'lif')!.input
  const bad = (patch: Partial<ForgeInput>) => expect(() => forgeEntry({ ...lif, ...patch })).toThrow(RangeError)
  const atom = (i: number, v: number[]) => [lif.basis[0].slice(0, 6).map((x, k) => (k === i ? v[0] : x))]
  bad({ basis: atom(0, [0]) }) // Z = 0
  bad({ basis: atom(5, [1.5]) }) // occupancy > 1
  bad({ basis: atom(4, [-1]) }) // B < 0
  bad({ cell: { ...lif.cell, alpha_deg: 150, beta_deg: 150, gamma_deg: 150 } }) // impossible cell
  bad({ basis: [...lif.basis, [9, 0, 0, 0, 0.65, 1]] }) // overfilled site (Li 1 + F 1)
  bad({ cut: [1, 0, 0] }) // absent (100) in the face-centred lattice
  bad({ cut: [0, 0, 0] })
})

type Invalid = { description: string; input: ForgeInput; code: string; hint: number[] | null }
test('every refusal at the trust boundary carries its stable code (and the cut hint)', () => {
  const cases: Invalid[] = byFunction('forge.invalid')[0].cases
  expect(cases.length).toBeGreaterThan(15)
  for (const c of cases) {
    let err: unknown
    try {
      forgeEntry(c.input)
    } catch (e) {
      err = e
    }
    expect(err, c.description).toBeInstanceOf(ForgeInputError)
    expect(err, c.description).toBeInstanceOf(RangeError)
    expect((err as ForgeInputError).code, c.description).toBe(c.code)
    expect((err as ForgeInputError).hint, c.description).toEqual(c.hint)
    expect(() => forgeWarnings(c.input), c.description).toThrow(ForgeInputError)
  }
})

test('NaN cut, NaN B and a non-integer cut are refused with their codes', () => {
  const lif = files[Object.keys(files).find((k) => k.endsWith('/lif.json'))!].input
  const code = (patch: Partial<ForgeInput>) => {
    try {
      forgeEntry({ ...lif, ...patch })
    } catch (e) {
      return (e as ForgeInputError).code
    }
    return 'accepted'
  }
  expect(code({ cut: [NaN, 1, 0] })).toBe('bad_cut')
  expect(code({ cut: [0.5, 0, 0] })).toBe('bad_cut')
  expect(code({ cut: [1, Infinity, 0] })).toBe('bad_cut')
  expect(code({ basis: [[3, 0, 0, 0, NaN, 1]] })).toBe('bad_atom')
})

describe('warnings.json', () => {
  for (const c of byFunction('forge.warnings')[0].cases as { description: string; input: ForgeInput; warnings?: string[]; error_code?: string }[])
    test(c.description, () => {
      if (c.error_code) {
        expect(() => forgeEntry(c.input)).toThrow(expect.objectContaining({ code: c.error_code }))
      } else expect(forgeWarnings(c.input)).toEqual(c.warnings)
    })
})

test('the largest accepted B (30 Å²) gives finite, positive rows and rates; 31 is refused', () => {
  const lif = files[Object.keys(files).find((k) => k.endsWith('/lif.json'))!].input
  for (const [model, eta] of [['darwin', null], ['mosaic_extinction', 0.2]] as const) {
    const input = { ...lif, cell: { ...lif.cell, a_pm: 450, b_pm: 450, c_pm: 450 }, basis: [[14, 0, 0, 0, 30, 1]], cut: [0, 0, 1], reflectivity_model: model, mosaic_fwhm_deg: eta }
    const c = forgeEntry(input)
    expect(c.extinction.every((r) => r.every((v) => Number.isFinite(v) && v > 0))).toBe(true)
    const beta = Array.from({ length: 30 }, (_, i) => 5 + i * 0.5)
    expect(Array.from(expectedRate(beta, 35, 1, DEFAULT, undefined, undefined, c)).every(Number.isFinite)).toBe(true)
    expect(() => forgeEntry({ ...input, basis: [[14, 0, 0, 0, 31, 1]] })).toThrow(expect.objectContaining({ code: 'b_too_large' }))
  }
})

test('TableAtoms: f0, f′, f″ and σ (edges, beyond the grid ends) of every element', () => {
  const t = byFunction('forge.atoms')[0]
  expect(t.elements.length).toBe(92)
  let worst = 0
  // σ is ~1e-23 cm²: no absolute floor, pure relative
  const check = (got: number, want: number, what: string, floor = 1e-12) => close(got, want, what, (r) => (worst = Math.max(worst, r)), floor)
  for (const el of t.elements) {
    t.s_inv_A.forEach((s: number, i: number) => check(tableAtoms.f0(el.z, s), el.f0[i], `Z${el.z} f0(${s})`))
    t.lambda_pm.forEach((l: number, i: number) => {
      check(tableAtoms.fPrime(el.z, HC_KEV_PM / l), el.f_prime[i], `Z${el.z} f'(${l})`)
      check(tableAtoms.fSecond(el.z, HC_KEV_PM / l), el.f_second[i], `Z${el.z} f''(${l})`)
    })
    el.sigma_lambda_pm.forEach((l: number, i: number) => check(tableAtoms.sigmaCm2(el.z, l), el.sigma_cm2[i], `Z${el.z} σ(${l})`, 0))
  }
  console.log(`atoms: max rel ${worst.toExponential(2)}`)
})

test('interpNodes: step at a repeated abscissa, exact hit, ends held, NaN', () => {
  const xs = [0, 1, 1, 2]
  const ys = [0, 10, 20, 40]
  expect(interpNodes(0.5, xs, ys)).toBe(5)
  expect(interpNodes(1.5, xs, ys)).toBe(30)
  expect(interpNodes(1, xs, ys)).toBe(20) // the value after the step
  expect(interpNodes(1 - 1e-12, xs, ys)).toBeCloseTo(10, 6)
  expect(interpNodes(-5, xs, ys)).toBe(0)
  expect(interpNodes(9, xs, ys)).toBe(40)
  expect(interpNodes(NaN, xs, ys)).toBeNaN()
})
