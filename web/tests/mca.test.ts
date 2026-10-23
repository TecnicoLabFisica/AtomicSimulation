// The MCA device (Mca) and the energy-detector mode of the apparatus (L3.6/L3.7).
import { beforeAll, describe, expect, test } from 'vitest'
import { applyInitial } from '../src/pedagogy/task'
import { Apparatus, ENERGY_SENSOR, SAFE_S, OK_S, type Key } from '../src/apparatus/apparatus'
import { Mca } from '../src/apparatus/mca'
import { kevPerChannel, mulberry32 } from '../src/physics/detector'
import { mcaSpectrum } from '../src/physics/fluorescence'
import { loadXrfSample } from '../src/physics/tables'

beforeAll(() => loadXrfSample('Cu'))

describe('Mca', () => {
  test('mean counts per channel = expected · t over seeded runs', () => {
    const rng = mulberry32(7)
    const expected = new Float64Array(256)
    expected.set([0.5, 2, 30])
    const m = new Mca()
    m.set({ nChannels: 256, gain: -2.5, presetS: 1e6 })
    const sum = [0, 0, 0]
    const runs = 400
    for (let r = 0; r < runs; r++) {
      m.clear()
      m.start()
      m.tick(10, expected, 1, rng)
      for (let i = 0; i < 3; i++) sum[i] += m.counts[i]
    }
    for (let i = 0; i < 3; i++) expect(sum[i] / runs).toBeCloseTo(expected[i] * 10, -1) // within ±5 counts of 5/20/300
    expect(m.counts[200]).toBe(0)
  })

  test('stops at the preset real time and live time follows the dead-time fraction', () => {
    const m = new Mca()
    m.set({ presetS: 5 })
    m.start()
    m.tick(Infinity, new Float64Array(512).fill(1), 0.9, mulberry32(1))
    expect(m.running).toBe(false)
    expect(m.realS).toBe(5)
    expect(m.liveS).toBeCloseTo(4.5, 12)
    expect(m.counts.reduce((s, c) => s + c, 0)).toBeGreaterThan(2000) // 512 · 5 expected
    m.start() // already at the preset: stays stopped
    expect(m.running).toBe(false)
  })

  test('a NaN or negative step never reaches the sampler; a shorter preset stops the run', () => {
    const m = new Mca()
    m.start()
    m.tick(NaN, new Float64Array(512).fill(1), 1, mulberry32(1))
    m.tick(-3, new Float64Array(512).fill(1), 1, mulberry32(1))
    expect(m.counts.every((c) => c === 0) && m.realS === 0 && m.running).toBe(true)
    m.tick(10, null, 1, mulberry32(1))
    m.set({ presetS: 5 })
    expect(m.running).toBe(false)
  })

  test('changing channels or gain clears counts and calibration; the preset alone does not; refused combinations throw', () => {
    const m = new Mca()
    m.start()
    m.tick(1, new Float64Array(512).fill(5), 1, mulberry32(1))
    m.calibration = { kevPerChannel: 0.08, offsetKeV: 0 }
    m.set({ presetS: 60 })
    expect(m.calibration).not.toBeNull()
    expect(m.counts.some((c) => c > 0)).toBe(true)
    m.set({ gain: -3 })
    expect(m.calibration).toBeNull()
    expect(m.counts.every((c) => c === 0) && m.running === false && m.realS === 0).toBe(true)
    m.set({ nChannels: 1024 })
    expect(m.counts.length).toBe(1024)
    expect(() => m.set({ nChannels: 256, gain: -1 })).toThrow(RangeError)
    expect(m.counts.length).toBe(1024) // a refused set changes nothing
  })
})

describe('energy detector on the apparatus', () => {
  const SETTLE_S = SAFE_S + OK_S + 0.1

  /** Sensor at 90° in SENSOR mode, then the energy detector and a Cu sample mounted, as the guide says. */
  function bench(sensorTenths = ENERGY_SENSOR) {
    const a = new Apparatus(mulberry32(5))
    a.press('SENSOR')
    a.adjust(sensorTenths)
    a.setDoors(false)
    const ok = a.mount({ holder: 'sample', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'energy', sample: 'Cu' })
    a.setDoors(true)
    return { a, ok }
  }
  const emit = (a: Apparatus) => {
    a.press('U')
    a.adjust(350 - a.u)
    a.press('I')
    a.adjust(100)
    a.press('HV')
    a.tick(SETTLE_S)
  }

  test('mount refused off 90° with alert detector; accepted at 90°', () => {
    const off = bench(800)
    expect(off.ok).toBe(false)
    expect(off.a.setup.detector).toBe('gm')
    expect(off.a.alert).toBe('detector')
    expect(bench().ok).toBe(true)
  })

  test('sensor moves are refused with alert detector; TARGET moves are allowed', () => {
    const { a } = bench()
    for (const key of ['SENSOR', 'COUPLED', 'ZERO'] as Key[]) {
      a.press(key)
      expect(a.alert, key).toBe('detector')
      expect(a.sensor).toBe(ENERGY_SENSOR)
    }
    a.press('TARGET')
    expect(a.alert).toBeNull()
    a.adjust(450)
    expect(a.target).toBe(450)
    expect(a.sensor).toBe(ENERGY_SENSOR)
    // the mode left over from before the mount: ADJUST and an auto-scan on the sensor arm are refused too
    const b = bench().a
    b.press('DBETA')
    b.adjust(5)
    b.press('SCAN')
    expect(b.alert).toBe('detector')
    b.moveArm(10)
    expect(b.sensor).toBe(ENERGY_SENSOR)
    b.press('RESET')
    expect(b.alert).toBe('detectorReset')
    b.tick(30)
    expect(b.sensor).toBe(ENERGY_SENSOR) // RESET does not drive the detector arm home
  })

  test('every auto-scan is refused with the energy detector, TARGET included; the exposure timer is allowed', () => {
    const { a } = bench()
    a.press('TARGET')
    a.press('DBETA')
    a.adjust(5 - a.dBeta)
    a.press('SCAN')
    expect(a.alert).toBe('detector')
    expect(a.phase).toBe('idle')
    a.press('DBETA')
    a.adjust(-a.dBeta)
    a.press('SCAN')
    expect(a.alert).toBeNull()
    expect(a.phase).toBe('safety')
  })

  test('mount is refused while the motor drives, and a stale detector alert does not outlive the call', () => {
    const a = new Apparatus(mulberry32(5))
    a.press('SENSOR')
    a.adjust(ENERGY_SENSOR)
    a.press('RESET') // the motor drives the arm home
    a.setDoors(false)
    const energy = { holder: 'sample', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'energy', sample: 'Cu' } as const
    expect(a.mount(energy)).toBe(false)
    expect(a.alert).toBe('detector')
    a.tick(60)
    a.press('SENSOR')
    a.adjust(ENERGY_SENSOR)
    a.alert = 'detector'
    expect(a.mount(energy)).toBe(true)
    expect(a.alert).toBeNull()
  })

  test('the MCA clock runs through the self-test, and leaving the energy detector stops the run', () => {
    const { a } = bench()
    a.mca.start()
    a.press('HV')
    a.tick(1)
    expect(a.phase).toBe('safety')
    expect(a.mca.realS).toBeCloseTo(1, 12)
    a.tick(SETTLE_S)
    expect(a.mca.realS).toBeCloseTo(1 + SETTLE_S, 9) // not fed twice
    a.press('HV')
    a.setDoors(false)
    expect(a.mount({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'gm' })).toBe(true)
    expect(a.mca.running).toBe(false)
  })

  test('applyInitial from an energy-detector bench ends with the GM and the arms at 0', () => {
    const { a } = bench()
    applyInitial(a, {})
    expect(a.setup.detector).toBe('gm')
    expect(a.alert).toBeNull()
    a.tick(60)
    expect([a.target, a.sensor]).toEqual([0, 0])
  })

  test('the rate display idles at 0 with the energy detector', () => {
    const { a } = bench()
    emit(a)
    expect(a.emitting).toBe(true)
    a.tick(3)
    expect(a.expectedRate()).toBe(0)
    expect(a.lastSecondCounts).toBe(0)
  })

  test('the MCA counts only with detector energy, sample holder and tube emitting', () => {
    const { a } = bench()
    a.mca.start()
    a.tick(10) // tube off
    expect(a.mca.realS).toBe(10)
    expect(a.mca.counts.every((c) => c === 0)).toBe(true)
    emit(a)
    a.tick(20)
    const total = a.mca.counts.reduce((s, c) => s + c, 0)
    const expected = mcaSpectrum('Cu', 35, 1, 20).counts.reduce((s, c) => s + c, 0)
    expect(total).toBeGreaterThan(0.9 * expected)
    expect(total).toBeLessThan(1.1 * expected)
    const e = a.mca.settings
    expect(kevPerChannel(e.nChannels, e.gain)).toBeCloseTo(0.0781, 3)
  })

  test('instant mode runs the MCA to its preset', () => {
    const { a } = bench()
    emit(a)
    a.timeScale = Infinity
    a.mca.start()
    a.tick(0.1)
    expect(a.mca.running).toBe(false)
    expect(a.mca.realS).toBe(a.mca.settings.presetS)
    expect(a.mca.counts.reduce((s, c) => s + c, 0)).toBeGreaterThan(5e3) // ≈ 13 000 for Cu at 35 kV, 1 mA, 180 s
  })

  test('the MCA does not count with the GM mounted or a crystal on the holder', () => {
    const a = new Apparatus(mulberry32(3))
    emit(a)
    a.mca.start()
    a.tick(5)
    expect(a.mca.counts.every((c) => c === 0)).toBe(true)
  })
})
