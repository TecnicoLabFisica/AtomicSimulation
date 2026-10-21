import { beforeAll, expect, test } from 'vitest'
import { NACL, allowedOrders, dPm, extinctionFactor, extinctionRatio, lambdaFromTheta, muFactor, thetaFromLambda } from '../src/physics/crystal'
import { DEFAULT, expectedRate, maxOrder, orderReflectivity, orderStrengths } from '../src/physics/scan'
import { CRYSTALS, crystalsLoaded, loadCrystals } from '../src/physics/tables'

beforeAll(loadCrystals)

test('crystals load lazily and idempotently', async () => {
  expect(crystalsLoaded()).toBe(true)
  await loadCrystals()
  expect(Object.keys(CRYSTALS).sort()).toEqual(['LiF', 'NaCl', 'Si', 'calcite', 'muscovite'])
})

test('NaCl is the anchor: μ factor 1, same d, same r_n and rates as the loaded NaCl entry', () => {
  expect(muFactor(NACL, 71.08)).toBe(1)
  expect(muFactor(CRYSTALS.NaCl, 71.08)).toBe(1)
  expect(dPm(NACL)).toBe(dPm(CRYSTALS.NaCl))
  expect(maxOrder(NACL)).toBe(15)
  expect(orderStrengths(DEFAULT, CRYSTALS.NaCl)).toEqual(orderReflectivity(DEFAULT))
  const b = [3.5, 7.2, 10.8]
  expect(Array.from(expectedRate(b, 35, 1, DEFAULT, null, [], CRYSTALS.NaCl))).toEqual(Array.from(expectedRate(b, 35, 1)))
})

test('LiF: d = 201.35 pm, first-order Kα at θ = asin(λ/2d)', () => {
  const lif = CRYSTALS.LiF
  expect(dPm(lif)).toBeCloseTo(201.35, 9)
  expect(maxOrder(lif)).toBe(lif.max_order)
  const theta = thetaFromLambda(71.08, 1, dPm(lif))
  expect(theta).toBeCloseTo((Math.asin(71.08 / (2 * 201.35)) * 180) / Math.PI, 12)
  expect(lambdaFromTheta(theta, 1, dPm(lif))).toBeCloseTo(71.08, 9)
  expect(muFactor(lif, 71.08)).toBeGreaterThan(1) // LiF absorbs far less than NaCl
})

test('the built-in NACL matches the loaded table entry (no drift)', () => {
  expect({ ...NACL, mu_per_cm: [], extinction: [], source: '' }).toEqual({ ...CRYSTALS.NaCl, mu_per_cm: [], extinction: [], source: '' }) // source text differs on purpose; NACL carries no tables
})

test('isNacl is identity: a look-alike named NaCl still gets muFactor (needs its own μ table)', async () => {
  const { isNacl } = await import('../src/physics/crystal')
  expect(isNacl(NACL) && isNacl(CRYSTALS.NaCl)).toBe(true)
  expect(isNacl({ ...CRYSTALS.LiF, name: 'NaCl' })).toBe(false)
})

test('crystalByName throws on unknown names, NaCl needs no table', async () => {
  const { crystalByName } = await import('../src/physics/crystal')
  expect(crystalByName('NaCl')).toBe(NACL)
  expect(crystalByName('LiF')).toBe(CRYSTALS.LiF)
  expect(() => crystalByName('lif')).toThrow(RangeError)
  expect(Object.isFrozen(CRYSTALS.LiF.f_sq_rel)).toBe(true)
})

test('extinctionFactor reads the exported y table: Mo Kα, order 1 (reference values of the Python model)', () => {
  // Spec values at 71.08 pm (Darwin–Prins for Si, calcite, muscovite; secondary extinction for LiF, NaCl).
  const y = (name: string, n = 1) => extinctionFactor(CRYSTALS[name], n, 71.08)
  expect(y('Si')).toBeCloseTo(0.035, 3)
  expect(y('calcite')).toBeCloseTo(0.0472, 3)
  expect(y('muscovite')).toBeCloseTo(0.165, 2)
  expect(y('LiF')).toBeCloseTo(0.31, 2)
  expect(y('NaCl')).toBeCloseTo(0.81, 2)
  expect(y('LiF', 2)).toBeGreaterThan(y('LiF', 1)) // higher orders are weaker, so less extinguished
})

test('extinctionRatio: 1 for NaCl, y_X,n / y_NaCl,1 otherwise; every tabulated y is in (0, 1]', () => {
  expect(extinctionRatio(NACL, 1, 71.08)).toBe(1)
  expect(extinctionRatio(CRYSTALS.Si, 1, 71.08)).toBeCloseTo(extinctionFactor(CRYSTALS.Si, 1, 71.08) / extinctionFactor(CRYSTALS.NaCl, 1, 71.08), 14)
  for (const c of Object.values(CRYSTALS)) for (const row of c.extinction) for (const v of row) expect(v > 0 && v <= 1).toBe(true)
})

test('allowedOrders drops the extinct orders of Si (111): 2, 6, 10 …', () => {
  const orders = allowedOrders(CRYSTALS.Si)
  expect(orders.slice(0, 6)).toEqual([1, 3, 4, 5, 7, 8])
  expect(orders.some((n) => n % 4 === 2)).toBe(false)
})

test('allowedOrders keeps the Debye–Waller-damped LiF order 11', () => {
  expect(allowedOrders(CRYSTALS.LiF)).toContain(11)
})

test('allowedOrders keeps every order of NaCl', () => {
  expect(allowedOrders(NACL)).toHaveLength(NACL.max_order)
})
