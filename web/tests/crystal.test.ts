import { beforeAll, expect, test } from 'vitest'
import { NACL, dPm, lambdaFromTheta, muFactor, thetaFromLambda } from '../src/physics/crystal'
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

test('LiF: d = 201.4 pm, first-order Kα at θ = asin(λ/2d)', () => {
  const lif = CRYSTALS.LiF
  expect(dPm(lif)).toBeCloseTo(201.4, 9)
  expect(maxOrder(lif)).toBe(lif.max_order)
  const theta = thetaFromLambda(71.08, 1, dPm(lif))
  expect(theta).toBeCloseTo((Math.asin(71.08 / (2 * 201.4)) * 180) / Math.PI, 12)
  expect(lambdaFromTheta(theta, 1, dPm(lif))).toBeCloseTo(71.08, 9)
  expect(muFactor(lif, 71.08)).toBeGreaterThan(1) // LiF absorbs far less than NaCl
})

test('the built-in NACL matches the loaded table entry (no drift)', () => {
  expect({ ...NACL, mu_per_cm: [], source: '' }).toEqual({ ...CRYSTALS.NaCl, mu_per_cm: [], source: '' }) // source text differs on purpose
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
