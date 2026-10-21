import { describe, expect, it } from 'vitest'
import type { Setup } from '../src/apparatus/apparatus'
import { edgeMarkers } from '../src/views/spectrum'

const setup = (collimatorFilter: string | null, sensorFilter: string | null) => ({ holder: 'crystal', crystal: 'NaCl', collimatorFilter, sensorFilter }) satisfies Setup

describe('edgeMarkers', () => {
  it('puts the Zr and In K edges at the known angles', () => {
    expect(edgeMarkers(setup('Zr', null))[0].theta).toBeCloseTo(7.02, 2)
    expect(edgeMarkers(setup(null, 'In'))[0].theta).toBeCloseTo(4.51, 2)
  })
  it('gives one marker per distinct foil', () => {
    expect(edgeMarkers(setup('Zr', 'Ag')).map((m) => m.el)).toEqual(['Zr', 'Ag'])
    expect(edgeMarkers(setup('Zr', 'Zr'))).toHaveLength(1)
  })
  it('ignores unknown foils and no foil', () => {
    expect(edgeMarkers(setup('Cu', null))).toEqual([])
    expect(edgeMarkers(setup(null, null))).toEqual([])
  })
})

describe('crystal-aware overlays (C2.3)', () => {
  it('line markers and edges follow d', async () => {
    const { lineMarkers, scanD } = await import('../src/views/spectrum')
    const { thetaFromLambda } = await import('../src/physics/crystal')
    const { MO_KA_PM } = await import('../src/physics/constants')
    const li = lineMarkers(201.4)[0]
    expect(li.theta).toBeCloseTo(thetaFromLambda(MO_KA_PM, 1, 201.4), 12)
    expect(li.theta).toBeGreaterThan(lineMarkers(282.01)[0].theta)
    expect(edgeMarkers(setup('Zr', null), 201.4)[0].theta).toBeGreaterThan(edgeMarkers(setup('Zr', null))[0].theta)
    expect(scanD({ ...setup(null, null), holder: 'empty' })).toBeCloseTo(282.01, 2)
  })

  it('line markers cover every order the crystal reaches, capped at 10, Kα on row 0 and Kβ on row 1', async () => {
    const { lineMarkers } = await import('../src/views/spectrum')
    const nacl = lineMarkers(282.01)
    expect(nacl.filter((m) => m.row === 0).map((m) => m.label)).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `${n}·Kα`))
    expect(nacl.filter((m) => m.row === 1)).toHaveLength(8)
    expect(nacl.slice(0, 6).map((m) => m.label)).toEqual(['1·Kα', '1·Kβ', '2·Kα', '2·Kβ', '3·Kα', '3·Kβ'])
    expect(lineMarkers(996).filter((m) => m.row === 0)).toHaveLength(10)
    expect(lineMarkers(996).every((m) => m.theta > 0 && m.theta <= 90)).toBe(true)
  })
})
