// Q1.8: the weak-signal notice. With hints shown it comes from the expected rate R̄ alone; with hints hidden only from the stored points.
import { beforeAll, describe, expect, it } from 'vitest'
import type { Setup } from '../src/apparatus/apparatus'
import { loadAbsorbers, loadCrystals } from '../src/physics/tables'
import { dataNotice, joinOr, modelNotice } from '../src/views/spectrum'

beforeAll(async () => {
  await loadAbsorbers()
  await loadCrystals()
})

const setup = (over: Partial<Setup> = {}): Setup => ({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, ...over })
const scan = (over: Partial<Parameters<typeof modelNotice>[0]> = {}) => ({ mode: 'COUPLED' as const, first: 10, last: 300, u: 350, i: 100, dt: 1, changed: false, setup: setup(), ...over })

describe('joinOr', () => {
  it('joins with commas and the language’s "or" before the last', () => {
    expect(joinOr([], 'o')).toBe('')
    expect(joinOr(['a'], 'o')).toBe('a')
    expect(joinOr(['a', 'b'], 'o')).toBe('a o b')
    expect(joinOr(['a', 'b', 'c'], 'or')).toBe('a, b or c')
  })
})

describe('modelNotice (hints shown)', () => {
  it('is silent for a strong NaCl scan, with no line in the window and with an empty holder', () => {
    expect(modelNotice(scan(), 1, 30, 1000)).toBeNull()
    expect(modelNotice(scan({ u: 150 }), 1, 6, 1000)).toBeNull() // U < U_K: no line
    expect(modelNotice(scan({ setup: setup({ holder: 'empty' }) }), 1, 30, 1000)).toBeNull() // no Bragg signal: never falls back to NaCl
  })
  it('buried: lists the levers that still apply, no zoom', () => {
    const w = modelNotice(scan({ crystal: undefined, setup: setup({ crystal: 'Si' }), i: 5, u: 350, dt: 1 } as never), 1, 30, 10, false)
    expect(w).toMatchObject({ kind: 'buried', zoom: 0 })
    expect(w!.levers).toEqual(['dt', 'i'])
    const f = modelNotice(scan({ setup: setup({ crystal: 'Si', collimatorFilter: 'Zr' }), i: 1, u: 300, dt: 1 }), 1, 30, 10, false)
    expect(f).toMatchObject({ kind: 'buried' })
    expect(f!.levers).toEqual(['dt', 'i', 'u', 'filter'])
    expect(modelNotice(scan({ setup: setup({ crystal: 'Si', collimatorFilter: 'Zr' }), i: 1, u: 300, dt: 1 }), 1, 30, 10, true)!.levers).not.toContain('filter') // a task owns the filters
  })
  it('small: a clear peak under 5 % of the plot offers a ×10 or ×100 zoom that centres it', () => {
    const w = modelNotice(scan(), 1, 30, 1e6)
    expect(w).toMatchObject({ kind: 'small' })
    expect([10, 100]).toContain(w!.zoom)
  })
})

describe('dataNotice (hints hidden)', () => {
  it('few counts per point: the 1/√N figure, the levers not at their maximum, no zoom', () => {
    const w = dataNotice(Array(50).fill(2), 4, 100)
    expect(w).toEqual({ kind: 'sparse', zoom: 0, n: 8, pct: 35, levers: ['dt', 'i'] })
    expect(dataNotice(Array(50).fill(2), 4, 100, true, false)).toMatchObject({ levers: ['dt'] })
    expect(dataNotice(Array(50).fill(2), 4, 100, true, true)).toMatchObject({ levers: [] })
  })
  it('squashed: most of the scan under 5 % of yMax, the largest zoom that keeps 90 % of the points on scale', () => {
    const rates = [...Array(95).fill(5), ...Array(5).fill(900)] // N = 5·100 ≥ 100; yMax 1000
    expect(dataNotice(rates, 100, 1000)).toEqual({ kind: 'squashed', zoom: 100, levers: [] })
    expect(dataNotice([...Array(80).fill(50), ...Array(20).fill(60)], 10, 4000)).toMatchObject({ zoom: 10 }) // ×100 would put every point off scale (yMax/100 = 40 < 50): the ×10 fallback
  })
  it('is silent for a healthy scan and ignores where lines are', () => {
    expect(dataNotice(Array(40).fill(500), 10, 800)).toBeNull()
    expect(dataNotice([], 10, 800)).toBeNull()
  })
})
