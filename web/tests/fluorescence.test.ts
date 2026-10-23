// XRF golden cases in artifacts/fixtures/xrf/: expected rates and MCA counts at relative 1e-9 (R̄ only, no noise).
import { beforeAll, describe, expect, test } from 'vitest'
import { lineRates, mcaSpectrum } from '../src/physics/fluorescence'
import { XRF_SAMPLE_NAMES, loadAbsorbers, loadXrfSample } from '../src/physics/tables'

type Case = { description?: string; inputs: Record<string, any>; expected: Record<string, any> }
type Fixture = Case & { name: string; cases?: Case[] }

beforeAll(() => Promise.all([loadAbsorbers(), ...XRF_SAMPLE_NAMES.map(loadXrfSample)]))

const files = import.meta.glob<Fixture>('../../artifacts/fixtures/xrf/*.json', { eager: true, import: 'default' })

function expectClose(actual: ArrayLike<number>, expected: number[], what: string) {
  expect(actual.length, what).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    const err = Math.abs(actual[i] - expected[i])
    if (!(err <= 1e-9 * Math.abs(expected[i]) + 1e-12)) expect.fail(`${what}[${i}]: got ${actual[i]}, expected ${expected[i]}`)
  }
}

const run = (x: Record<string, any>) =>
  mcaSpectrum(x.sample, x.U_kV, x.I_mA, x.t_s, x.n_channels, x.gain, x.collimator_filters ?? [], x.sensor_filters ?? [])

describe('artifacts/fixtures/xrf', () => {
  test('fixtures exist', () => expect(Object.keys(files).length).toBe(18))
  for (const f of Object.values(files)) {
    test(`${f.name}: ${f.description ?? ''}`, () => {
      for (const c of f.cases ?? [f]) {
        const x = c.inputs
        if (f.cases) {
          expect(() => run(x), c.description).toThrow(RangeError)
          continue
        }
        const rates = lineRates(x.sample, x.U_kV, x.I_mA, x.collimator_filters ?? [], x.sensor_filters ?? [])
        const want = c.expected.line_rates as { label: string; energy_keV: number; rate_per_s: number }[]
        expect(rates.map((l) => l.label)).toEqual(want.map((l) => l.label))
        expectClose(rates.map((l) => l.energy_keV), want.map((l) => l.energy_keV), 'energy_keV')
        expectClose(rates.map((l) => l.rate_per_s), want.map((l) => l.rate_per_s), 'rate_per_s')
        const mca = run(x)
        expectClose(mca.counts, c.expected.mca_counts, 'counts')
        expectClose([mca.liveTimeS], [c.expected.live_time_s], 'live_time_s')
        expectClose(mca.channelEnergyKeV, c.expected.channel_energy_keV, 'channel_energy_keV')
      }
    })
  }
})
