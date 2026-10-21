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
})
