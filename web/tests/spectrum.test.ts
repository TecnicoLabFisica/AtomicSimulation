import { describe, expect, it } from 'vitest'
import type { Setup } from '../src/apparatus/apparatus'
import { edgeMarkers } from '../src/views/spectrum'

const setup = (collimatorFilter: string | null, sensorFilter: string | null) => ({ holder: 'crystal', collimatorFilter, sensorFilter }) satisfies Setup

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
