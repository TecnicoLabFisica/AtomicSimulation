// Own file: Vitest isolates modules per file, so CRYSTALS is still empty here.
import { expect, test } from 'vitest'
import { Apparatus } from '../src/apparatus/apparatus'
import { crystalByName } from '../src/physics/crystal'
import { DEFAULT, expectedRate } from '../src/physics/scan'
import { CRYSTALS, crystalsLoaded } from '../src/physics/tables'

test('before loadCrystals: NaCl works, other crystals throw instead of falling back to NaCl', () => {
  expect(crystalsLoaded()).toBe(false)
  expect(expectedRate([7], 35, 1)[0]).toBeGreaterThan(0) // default path needs no table
  expect(() => crystalByName('LiF')).toThrow(RangeError)
  const lifLike = { ...crystalByName('NaCl'), name: 'LiF', d_pm: 201.4, fitted_debye_waller: false }
  expect(() => expectedRate([10], 35, 1, DEFAULT, null, [], lifLike)).toThrow(/not loaded/)
  expect(CRYSTALS.LiF).toBeUndefined()
  const a = new Apparatus()
  a.setDoors(false)
  expect(() => a.mount({ holder: 'crystal', crystal: 'LiF', collimatorFilter: null, sensorFilter: null })).toThrow(RangeError)
  expect(a.mount({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null })).toBe(true)
})
