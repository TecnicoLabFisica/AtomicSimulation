// Golden cases of analysis.gauss_fit_fixed in artifacts/fixtures/xrf/fit/ at relative 1e-9 (1e-12 absolute floor).
import { describe, expect, test } from 'vitest'
import { evaluateLineFit, gaussFitFixed } from '../src/physics/analysis'
import { XRF, loadXrfSample } from '../src/physics/tables'

type Case = { description?: string; inputs: Record<string, any>; expected: Record<string, any> }
type Fixture = Case & { name: string; function: string; cases?: Case[] }

const files = import.meta.glob<Fixture>('../../artifacts/fixtures/xrf/fit/*.json', { eager: true, import: 'default' })

function expectClose(actual: ArrayLike<number>, expected: number[], what: string) {
  expect(actual.length, what).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    const err = Math.abs(actual[i] - expected[i])
    if (!(err <= 1e-9 * Math.abs(expected[i]) + 1e-12)) expect.fail(`${what}[${i}]: got ${actual[i]}, expected ${expected[i]}`)
  }
}

const fit = (x: Record<string, any>) => gaussFitFixed(x.channel_energy_keV, x.counts, x.centers_keV, x.sigma_keV, x.window_keV)

describe('artifacts/fixtures/xrf/fit', () => {
  test('fixtures exist', () => expect(Object.keys(files).length).toBe(4))
  for (const f of Object.values(files)) {
    test(`${f.name}: ${f.description ?? ''}`, () => {
      if (f.cases) {
        for (const c of f.cases) expect(() => fit(c.inputs), c.description).toThrow(RangeError)
        return
      }
      const r = fit(f.inputs)
      const x = f.expected
      expectClose(r.area, x.area, 'area')
      expectClose(r.areaErr, x.area_err, 'area_err')
      expectClose(r.areaCov.flat(), x.area_cov, 'area_cov')
      expectClose([r.chi2Dof, r.channelKeV], [x.chi2_dof, x.channel_keV], 'chi2_dof, channel_keV')
      expectClose(r.background, x.background, 'background')
      const curve = evaluateLineFit(r, f.inputs.channel_energy_keV)
      expect(curve.length).toBe(r.area.length)
      if (x.evaluate_sum) expectClose(f.inputs.channel_energy_keV.map((_: number, k: number) => curve.reduce((s, row) => s + row[k], 0)), x.evaluate_sum, 'evaluate_sum')
    })
  }
})

test('the XRF tables carry the reference lines a student may fit', async () => {
  await loadXrfSample('Cu')
  expect(Object.keys(XRF.reference_lines_keV).sort()).toEqual(['Cu Kα', 'Cu Kβ', 'Fe Kα', 'Fe Kβ', 'Pb Lα', 'Pb Lβ', 'Zn Kα', 'Zn Kβ'])
  expect(XRF.reference_lines_keV['Cu Kα']).toBeCloseTo(8.041, 3)
})
