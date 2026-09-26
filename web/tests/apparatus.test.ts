// The procedures of LD instruction sheet 554 800 §11, key by key, plus the panel's guard rails.
import { describe, expect, test } from 'vitest'
import { Apparatus, OK_S, SAFE_S, adjustMultiplier, wrapTarget, type Key } from '../src/apparatus/apparatus'
import { mulberry32 } from '../src/physics/detector'
import { expectedRate } from '../src/physics/scan'

const SAFETY_S = SAFE_S + OK_S

function device() {
  return new Apparatus(mulberry32(1234))
}

function set(a: Apparatus, key: Key, value: number) {
  a.press(key)
  a.adjust(value) // from 0, or relative for arms
}

describe('§11 a) switch on', () => {
  test('U, I, doors closed, HV ON: SAFE → OK → HV on, lamp flashes, counts appear', () => {
    const a = device()
    a.press('U')
    expect(a.display()).toMatchObject({ bottom: '5.0', bottomUnit: 'kV' }) // default 5.0 kV
    a.adjust(150)
    expect(a.display().bottom).toBe('20.0')
    set(a, 'I', 100)
    expect(a.display()).toMatchObject({ bottom: '1.00', bottomUnit: 'mA' })
    a.press('HV')
    expect(a.display()).toMatchObject({ top: 'SAFE', bottom: '', hvLamp: false })
    a.tick(SAFE_S + 0.1)
    expect(a.display()).toMatchObject({ top: 'SAFE', bottom: 'OK' })
    a.tick(OK_S)
    expect(a.hvOn && a.emitting && a.display().hvLamp).toBe(true)
    expect(a.setDoors(false)).toBe(false) // locked while X-rays can be produced
    a.press('ZERO')
    a.tick(1)
    expect(a.lastSecondCounts).toBeGreaterThan(1000) // direct beam at 2θ = 0
    a.press('I')
    a.adjust(-50) // changing I while HV is on changes the rate
    expect(a.expectedRate()).toBeCloseTo(expectedRate([0], 20, 0.5)[0], 9)
    a.press('HV')
    expect(a.hvOn).toBe(false)
    expect(a.setDoors(false)).toBe(true)
  })

  test('a door open: self-test fails, HV stays off, top display blinks', () => {
    const a = device()
    a.setDoors(false)
    a.press('HV')
    a.tick(5)
    expect(a.hvOn).toBe(false)
    expect(a.display().blinkTop).toBe(true)
    a.setDoors(true)
    expect(a.display().blinkTop).toBe(false)
  })
})

describe('§11 b) parameters', () => {
  test('ranges, steps and clamping; any key ends the edit', () => {
    const a = device()
    set(a, 'U', 10_000)
    expect(a.u).toBe(350)
    set(a, 'DT', 10_000)
    expect(a.display().bottom).toBe('9999')
    a.adjust(-20_000)
    expect(a.dt).toBe(1)
    set(a, 'DBETA', -5)
    expect(a.display()).toMatchObject({ bottom: '0.0', symbol: 'exposure' })
    a.press('SENSOR') // ends the edit: ADJUST now moves the sensor
    a.adjust(3)
    expect(a.dBeta).toBe(0)
    expect(a.sensor).toBe(3)
  })

  test('I stays exact: 100 steps of 0.01 mA are 1.00 mA and the model accepts them', () => {
    const a = device()
    a.press('I')
    for (let k = 0; k < 100; k++) a.adjust(1)
    expect(a.i).toBe(100)
    a.press('HV')
    a.tick(SAFETY_S)
    expect(() => a.expectedRate()).not.toThrow()
  })

  test('LIMITS: first press lower, second press upper; upper < lower flashes and refuses SCAN', () => {
    const a = device()
    a.press('COUPLED')
    a.press('LIMITS')
    expect(a.display().symbol).toBe('lower')
    a.adjust(100)
    a.press('LIMITS')
    expect(a.display().symbol).toBe('upper')
    a.adjust(50)
    expect(a.display().flashBottom).toBe(true)
    a.press('SCAN')
    a.tick(5)
    expect(a.phase).toBe('idle')
    expect(a.hvOn).toBe(false)
    a.press('LIMITS')
    a.press('LIMITS')
    a.adjust(100)
    expect(a.display().flashBottom).toBe(false)
  })

  test('ADJUST responds dynamically', () => {
    expect([1, 10, 40].map(adjustMultiplier)).toEqual([1, 5, 20])
  })
})

describe('§11 c) manual positioning', () => {
  test('COUPLED: the sensor follows at twice the step from the arms at the moment of pressing', () => {
    const a = device()
    set(a, 'SENSOR', 30) // sensor 3.0°, target 0: not 2:1
    a.press('COUPLED')
    a.adjust(10)
    expect([a.target, a.sensor]).toEqual([10, 50]) // 1.0°, 5.0° — relative, as the manual warns
    a.press('ZERO')
    a.adjust(72)
    expect([a.target, a.sensor]).toEqual([72, 144])
    a.adjust(10_000)
    expect(a.sensor).toBe(1700) // sensor arm limit +170°
    expect(a.target).toBe(850)
    a.press('COUPLED') // second press: top display shows the sensor angle
    expect(a.display()).toMatchObject({ top: '170.0', topUnit: '°', bottom: '85.0' })
  })

  test('the display follows ADJUST; COUPLED again toggles the top line and back', () => {
    const a = device()
    a.press('SENSOR')
    a.press('I')
    a.press('HV') // ends the I edit: ADJUST moves the sensor again
    a.tick(SAFETY_S)
    a.adjust(5)
    expect(a.display()).toMatchObject({ bottom: '0.5', bottomUnit: '°' })
    a.press('COUPLED')
    a.press('U')
    a.press('COUPLED') // back from U: shows COUPLED again, top still the rate
    expect(a.display()).toMatchObject({ topUnit: '1/s', bottomUnit: '°' })
    a.press('COUPLED')
    expect(a.display().topUnit).toBe('°')
    a.press('COUPLED')
    expect(a.display().topUnit).toBe('1/s')
  })

  test('the target arm turns without limit; the display folds it into −180° … 180°', () => {
    const a = device()
    set(a, 'TARGET', 4000)
    expect(a.target).toBe(4000)
    expect(a.display().bottom).toBe('40.0')
    a.adjust(-4050)
    expect(a.display().bottom).toBe('-5.0')
    expect([1799, 1800, -1800, -1801].map(wrapTarget)).toEqual([1799, -1800, -1800, 1799])
  })

  test('limits set for another arm are clamped when a mode is selected', () => {
    const a = device()
    a.press('TARGET')
    a.press('LIMITS')
    a.adjust(900)
    a.press('LIMITS')
    a.adjust(1000)
    a.press('COUPLED')
    expect([a.limitLo, a.limitHi]).toEqual([850, 850]) // 90°/100° → the coupled maximum 85°
  })
})

describe('§11 e) exposure timer', () => {
  test('Δβ = 0, SCAN counts Δt down with arms still; REPLAY gives the mean rate', () => {
    const a = device()
    a.press('COUPLED')
    a.adjust(72) // 1st-order Kα
    set(a, 'U', 300)
    set(a, 'I', 100)
    set(a, 'DT', 9) // 10 s
    set(a, 'DBETA', -1)
    a.press('SCAN')
    a.tick(SAFETY_S)
    expect(a.phase).toBe('exposure')
    a.tick(4)
    expect(a.display()).toMatchObject({ bottom: '6', bottomUnit: 's', symbol: 'exposure' })
    a.tick(6)
    expect(a.phase).toBe('idle')
    expect(a.hvOn).toBe(false)
    expect(a.display()).toMatchObject({ bottom: '0', bottomUnit: 's', symbol: 'exposure' }) // "when it reaches zero"
    expect([a.target, a.sensor]).toEqual([72, 144])
    a.press('REPLAY')
    const rBar = expectedRate([7.2], 35, 1)[0]
    const rate = Number(a.display().top)
    expect(Math.abs(rate - rBar)).toBeLessThan(5 * Math.sqrt(rBar / 10) + 1)
  })

  test('the program waits while no emission current flows', () => {
    const a = device()
    set(a, 'DBETA', -1)
    a.press('SCAN')
    a.tick(SAFETY_S + 5)
    expect(a.phase).toBe('exposure')
    expect(a.display().bottom).toBe('1') // Δt = 1 s still to go
    set(a, 'I', 10)
    a.tick(1)
    expect(a.phase).toBe('idle')
    expect(a.replay).toHaveLength(1)
  })
})

describe('§11 f, h) auto-scan: Bragg reflection at NaCl (leaflet settings)', () => {
  function leafletScan(timeScale: number) {
    const a = device()
    a.timeScale = timeScale
    a.press('ZERO')
    set(a, 'U', 300)
    set(a, 'I', 100)
    set(a, 'DT', 9)
    a.press('COUPLED')
    a.press('LIMITS')
    a.adjust(20)
    a.press('LIMITS')
    a.adjust(250)
    a.press('SCAN')
    return a
  }

  test('instant: 231 points 2.0° → 25.0°, means within 5σ of R̄, then REPLAY browses them', () => {
    const a = leafletScan(Infinity)
    a.tick(0.016)
    expect(a.phase).toBe('safety') // the self-test runs in real time even in instant mode
    a.tick(SAFETY_S)
    expect(a.phase).toBe('idle')
    expect(a.hvOn).toBe(false)
    expect(a.replay).toHaveLength(231)
    expect(a.replay[0].angle).toBe(20)
    expect(a.replay.at(-1)!.angle).toBe(250)
    const rBar = expectedRate(a.replay.map((p) => p.angle / 10), 35, 1)
    a.replay.forEach((p, k) => expect(Math.abs(p.rate - rBar[k])).toBeLessThan(5 * Math.sqrt(rBar[k] / 10) + 0.5))
    a.press('REPLAY')
    a.adjust(52)
    expect(a.display()).toMatchObject({ bottom: '7.2', bottomUnit: '°' })
    expect(Number(a.display().top)).toBeGreaterThan(1000) // 1st-order Kα peak
    expect([a.target, a.sensor]).toEqual([250, 500]) // REPLAY does not move the arms
    a.press('RESET')
    expect(a.replay).toHaveLength(0)
    expect([a.u, a.i, a.dt, a.dBeta, a.target, a.sensor, a.mode]).toEqual([50, 0, 1, 1, 0, 0, null])
  })

  test('real time ×100: steps every Δt, rate shown every second; SCAN again stops', () => {
    const a = leafletScan(100)
    a.tick(SAFETY_S)
    expect(a.phase).toBe('scan')
    expect([a.target, a.sensor]).toEqual([20, 40]) // arms at the lower limit
    a.tick(0.25) // 25 s → 2 steps done
    expect(a.replay).toHaveLength(2)
    expect(a.display().bottom).toBe('2.2')
    a.press('SCAN')
    expect(a.phase).toBe('idle')
    expect(a.hvOn).toBe(false)
    expect(a.replay).toHaveLength(2) // kept for REPLAY
  })

  test('after a COUPLED auto-scan, manual moves keep 2:1 about zero', () => {
    const a = device()
    set(a, 'SENSOR', 30) // arms off 2:1 when COUPLED is pressed
    a.press('COUPLED')
    a.press('LIMITS')
    a.adjust(40)
    a.press('LIMITS')
    a.adjust(50)
    set(a, 'I', 100)
    a.timeScale = Infinity
    a.press('SCAN')
    a.tick(SAFETY_S)
    expect([a.target, a.sensor]).toEqual([50, 100])
    a.press('COUPLED') // selects COUPLED again: ADJUST moves the arms
    a.adjust(1)
    expect([a.target, a.sensor]).toEqual([51, 102])
  })

  test('HV OFF stops a running scan and keeps the data; U/I edits show during the program', () => {
    const a = leafletScan(100)
    a.tick(SAFETY_S)
    a.tick(0.25)
    a.press('I')
    expect(a.display()).toMatchObject({ bottom: '1.00', bottomUnit: 'mA' })
    a.press('HV')
    expect([a.phase, a.hvOn]).toEqual(['idle', false])
    expect(a.replay).toHaveLength(2)
  })

  test('upper < lower: SCAN refused, ADJUST corrects the flashing upper limit', () => {
    const a = device()
    a.press('COUPLED')
    a.press('LIMITS')
    a.adjust(100)
    a.press('SCAN')
    expect(a.display()).toMatchObject({ symbol: 'upper', flashBottom: true })
    a.adjust(150)
    expect([a.limitHi, a.target, a.display().flashBottom]).toEqual([150, 0, false])
  })

  test('auto-scan needs a scan mode; SENSOR scans move only the sensor', () => {
    const a = device()
    set(a, 'I', 100)
    a.press('SCAN')
    a.tick(5)
    expect(a.phase).toBe('idle')
    a.press('SENSOR')
    a.press('LIMITS')
    a.adjust(100)
    a.press('LIMITS')
    a.adjust(120)
    set(a, 'DBETA', 9) // 1.0°
    a.timeScale = Infinity
    a.press('SCAN')
    a.tick(SAFETY_S)
    expect(a.replay.map((p) => p.angle)).toEqual([100, 110, 120])
    expect([a.target, a.sensor]).toEqual([0, 120])
  })
})

test('display caps at 9999 while the counter runs', () => {
  const a = device()
  set(a, 'U', 300)
  set(a, 'I', 100)
  a.press('HV')
  a.tick(SAFETY_S)
  a.tick(1) // arms at zero: direct beam ≈ 9200/s after dead time; force a larger count
  a.lastSecondCounts = 20_000
  expect(a.display().top).toBe('9999')
})
