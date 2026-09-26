// Every golden case in artifacts/fixtures/ must be reproduced by the port: relative 1e-9 with a
// 1e-12/s absolute floor (web-physics-port rule). A failure means the port is wrong or the artifacts are stale.
import { describe, expect, test } from 'vitest'
import { transmission } from '../src/physics/filters'
import { DEFAULT, coupledBetas, expectedRate, modelParams, type ModelParams } from '../src/physics/scan'
import { MODEL_VERSION } from '../src/physics/tables'

type Case = { description?: string; function?: string; inputs: Record<string, any>; expected: Record<string, any> }
type Fixture = Case & { name: string; function: string; model_version: string; cases?: Case[] }

const files = import.meta.glob<Fixture>('../../artifacts/fixtures/*.json', { eager: true, import: 'default' })

function expectClose(actual: ArrayLike<number>, expected: number[]) {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    const err = Math.abs(actual[i] - expected[i])
    if (!(err <= 1e-9 * Math.abs(expected[i]) + 1e-12))
      expect.fail(`index ${i}: got ${actual[i]}, expected ${expected[i]} (rel ${err / Math.abs(expected[i])})`)
  }
}

function run(fn: string, c: Case) {
  const x = c.inputs
  switch (fn) {
    case 'scan.expected_rate': {
      const params: ModelParams = x.params ? modelParams(x.params) : DEFAULT
      const rate = expectedRate(x.beta_deg, x.U_kV, x.I_mA, params, x.sensor_deg)
      expectClose(rate, c.expected.rate_per_s)
      // The live apparatus asks for one β at a time: it must give the batch values.
      const n = x.beta_deg.length
      for (const i of [0, 1, n >> 2, n >> 1, (3 * n) >> 2, n - 2, n - 1].filter((i) => i >= 0 && i < n)) {
        const one = expectedRate([x.beta_deg[i]], x.U_kV, x.I_mA, params, x.sensor_deg && [x.sensor_deg[i]])
        expectClose(one, [c.expected.rate_per_s[i]])
      }
      return
    }
    case 'scan.coupled_betas':
      return expectClose(coupledBetas(x.lo_deg, x.hi_deg, x.step_deg), c.expected.beta_deg)
    case 'filters.transmission':
      return expectClose(
        x.lambda_pm.map((l: number) => transmission(l, x.material, x.areal_density_mg_cm2)),
        c.expected.transmission,
      )
    case 'rejected': // Python raised ValueError: the port must throw too
      return expect(() => run(c.function!, { ...c, expected: {} }), c.description).toThrow(RangeError)
    default:
      expect.fail(`fixture for unknown function ${fn}`)
  }
}

describe('artifacts/fixtures', () => {
  test('fixtures exist and share the tables’ model version', () => {
    expect(Object.keys(files).length).toBeGreaterThan(10)
    for (const f of Object.values(files)) expect(f.model_version).toBe(MODEL_VERSION)
  })
  for (const f of Object.values(files)) {
    test(`${f.name}: ${f.description ?? ''}`, () => {
      for (const c of f.cases ?? [f]) run(f.function, c)
    })
  }
  test('tube off gives exactly zero', () => {
    for (const f of Object.values(files).filter((f) => f.name.startsWith('tube_off')))
      expect(Array.from(expectedRate(f.inputs.beta_deg, f.inputs.U_kV, f.inputs.I_mA, modelParams(f.inputs.params))).every((r) => r === 0)).toBe(true)
  })
})

test('params must be validated: unknown keys and hand-made objects are refused', () => {
  const p = { ...modelParams(files['../../artifacts/fixtures/leaflet_35kV_1mA.json'].inputs.params) }
  expect(() => modelParams({ ...p, bogus: 1 } as ModelParams)).toThrow(TypeError)
  expect(() => expectedRate([7.2], 35, 1, { ...p, sigma_deg: 0 })).toThrow(TypeError)
  expect(expectedRate([7.2], 35, 1, undefined, null)[0]).toBe(expectedRate([7.2], 35, 1)[0])
})
