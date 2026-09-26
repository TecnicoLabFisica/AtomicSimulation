// Guided tasks: their success conditions on real apparatus runs, the CSV export, and the lab-mode leak guard.
import { describe, expect, test } from 'vitest'
import { Apparatus, OK_S, SAFE_S } from '../src/apparatus/apparatus'
import { markExported, replayCsv } from '../src/pedagogy/csv'
import { en } from '../src/pedagogy/i18n/en'
import { es } from '../src/pedagogy/i18n/es'
import { applyInitial, type GuidedTask } from '../src/pedagogy/task'
import { task as kalpha } from '../src/pedagogy/tasks/kalpha-third-order'
import { task as lambda3 } from '../src/pedagogy/tasks/lambda-three-orders'
import { task as threshold } from '../src/pedagogy/tasks/line-threshold'
import { mulberry32 } from '../src/physics/detector'

const SAFETY_S = SAFE_S + OK_S

function started(task: GuidedTask) {
  const a = new Apparatus(mulberry32(1234))
  applyInitial(a, task.initial)
  return a
}

/** Run a whole auto-scan at once. */
function scan(a: Apparatus) {
  a.timeScale = Infinity
  a.press('SCAN')
  a.tick(SAFETY_S)
  expect(a.busy).toBe(false)
}

describe('kalpha-third-order', () => {
  test.each([
    [222, true], // θ₃ = 22.21°
    [217, false], // 3 × 7.24°: the misconception
    [221, false],
  ])('crystal at %i × 0.1° with HV on: %s', (target, met) => {
    const a = started(kalpha)
    expect(kalpha.success(a)).toBe(false)
    a.press('HV')
    a.tick(SAFETY_S + 0.1) // and RESET's drive home
    a.moveArm(target) // COUPLED from zero: the sensor follows at 2β
    expect(a.sensor).toBe(2 * target)
    expect(kalpha.success(a)).toBe(met)
  })

  test('HV off: not met, even on the angle', () => {
    const a = started(kalpha)
    a.tick(0.1)
    a.moveArm(222)
    expect(kalpha.success(a)).toBe(false)
  })
})

describe('line-threshold', () => {
  test.each([
    [350, false], // lines on
    [190, true], // no lines, λmin = 65.3 pm < λ(Kα): continuum still at the Kα angle
    [170, false], // λmin = 72.9 pm > λ(Kα): nothing at all reaches the Kα angle
  ])('scan 5–9° at U = %i × 0.1 kV: %s', (u, met) => {
    const a = started(threshold)
    a.u = u
    scan(a)
    expect(threshold.success(a)).toBe(met)
  })

  test('no emission current: the scan waits, not met', () => {
    const a = started(threshold)
    ;[a.u, a.i, a.timeScale] = [190, 0, Infinity]
    a.press('SCAN')
    a.tick(SAFETY_S)
    expect(threshold.success(a)).toBe(false)
  })

  test('Δt = 1 s at 35 kV is not enough for 3rd-order Kβ', () => {
    const a = started(lambda3)
    ;[a.limitLo, a.limitHi] = [20, 250]
    scan(a)
    markExported(a)
    expect(lambda3.success(a)).toBe(false)
  })

  test('U lowered only mid-scan: not met', () => {
    const a = started(threshold)
    a.timeScale = Infinity
    a.press('SCAN')
    a.tick(SAFETY_S + 3) // a few points counted at 35 kV
    expect(a.replay.length).toBeGreaterThan(0)
    a.u = 190
    a.tick(SAFETY_S)
    expect(a.busy).toBe(false)
    expect(threshold.success(a)).toBe(false)
  })

  test('scan still positioning: not met, no stored points needed', () => {
    const a = started(threshold)
    a.press('SCAN')
    a.tick(0.1)
    expect(a.replay).toHaveLength(0)
    expect(threshold.success(a)).toBe(false)
  })
})

describe('lambda-three-orders', () => {
  // Δt = 10 s as in the leaflet: at 1 s, 3rd-order Kβ stands only 4.6σ above its background.
  const leaflet = (lo: number) => {
    const a = started(lambda3)
    ;[a.limitLo, a.limitHi, a.dt] = [lo, 250, 10]
    scan(a)
    return a
  }

  test('2–25° at Δβ = 0.1°, Δt = 10 s: met only once the CSV is exported', () => {
    const a = leaflet(20)
    expect(lambda3.success(a)).toBe(false)
    markExported(a)
    expect(lambda3.success(a)).toBe(true)
  })

  test.each([60, 65])('%i × 0.1° to 25° cuts the window of 1st-order Kβ', (lo) => {
    const a = leaflet(lo)
    markExported(a)
    expect(lambda3.success(a)).toBe(false)
  })

  test.each([
    [2, true],
    [3, false], // coarser than braggsim.analysis.MAX_STEP_DEG
  ])('Δβ = %i × 0.1°: %s', (dBeta, met) => {
    const a = started(lambda3)
    ;[a.limitLo, a.limitHi, a.dt, a.dBeta] = [20, 250, 10, dBeta]
    scan(a)
    markExported(a)
    expect(lambda3.success(a)).toBe(met)
  })

  test('21 kV: 3rd-order lines too weak to find', () => {
    const a = started(lambda3)
    ;[a.limitLo, a.limitHi, a.dt, a.u] = [20, 250, 10, 210]
    scan(a)
    markExported(a)
    expect(lambda3.success(a)).toBe(false)
  })
})

test('replayCsv: header with the scan settings, one row per stored value', () => {
  const a = started(threshold)
  expect(replayCsv(a)).toBeNull()
  scan(a)
  const lines = replayCsv(a, new Date(0))!.trimEnd().split('\n')
  expect(lines.slice(0, 4)).toEqual([
    '# Bragg reflection, simulated LD X-ray apparatus 554 800 (not measured data)',
    '# 1970-01-01T00:00:00.000Z',
    '# mode COUPLED; at the start: U = 35.0 kV, I = 1.00 mA, dt = 1 s',
    'beta_deg,rate_per_s',
  ])
  expect(lines).toHaveLength(4 + 41) // 5.0 … 9.0° in 0.1° steps
  expect(lines[4]).toMatch(/^5\.0,\d+(\.\d+)?$/)
  expect(lines.at(-1)).toMatch(/^9\.0,/)
})

test('lab tasks never state an expected angle or wavelength (teacher notes aside)', () => {
  const LEAKS = ['7.2', '14.6', '22.2', '71', '63', '6.4', '12.9', '19.6']
  for (const dict of [es, en]) {
    for (const t of [lambda3]) {
      const { teacher: _, ...student } = dict.task[t.id as keyof typeof dict.task]
      const text = JSON.stringify(student)
      for (const leak of LEAKS) expect(text, `${t.id}: "${leak}"`).not.toContain(leak)
    }
  }
})
