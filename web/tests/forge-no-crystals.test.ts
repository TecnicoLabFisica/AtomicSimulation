// The Forge builds a bench entry from the element tables alone: the crystal table is not needed (run in isolation).
import { beforeAll, describe, expect, test } from 'vitest'
import { forgeEntry } from '../src/physics/forge'
import { crystalsLoaded, loadForgeElements } from '../src/physics/tables'
import { designFromPreset, toInput } from '../src/views/forge'
import { PRESETS } from '../src/physics/forge-lattices'

describe('forgeEntry without loadCrystals', () => {
  beforeAll(async () => {
    await loadForgeElements()
  })
  test('works and leaves the crystal table unloaded', () => {
    expect(crystalsLoaded()).toBe(false)
    const c = forgeEntry(toInput(designFromPreset(PRESETS[3])))
    expect(c.d_pm).toBeCloseTo(314.65, 2)
    expect(crystalsLoaded()).toBe(false)
  })
})
