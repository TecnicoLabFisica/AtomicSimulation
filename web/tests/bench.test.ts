// The logic the 2D goniometer, the HTML panel and the 3D bench share: arm easing and the key LEDs.
import { beforeAll, describe, expect, test } from 'vitest'
import { Apparatus, OK_S, SAFE_S } from '../src/apparatus/apparatus'
import { mulberry32 } from '../src/physics/detector'
import { armEaser } from '../src/views/canvas'
import { keySelected } from '../src/views/panel'

beforeAll(() => {
  // No browser here: no reduced-motion preference.
  globalThis.matchMedia ??= (() => ({ matches: false })) as unknown as typeof matchMedia
})

describe('armEaser', () => {
  test('eases an ADJUST jump and settles exactly on the device angles', () => {
    const a = new Apparatus(mulberry32(1))
    a.press('COUPLED')
    const arms = armEaser(a)
    a.adjust(100) // target +10.0°, sensor +20.0° at once
    arms.step(1 / 60)
    expect(arms.t).toBeGreaterThan(0)
    expect(arms.t).toBeLessThan(a.target) // on its way, not jumped
    for (let i = 0; i < 120; i++) arms.step(1 / 60)
    expect([arms.t, arms.s]).toEqual([a.target, a.sensor])
  })

  test('follows the motor exactly while it drives (no easing on top of it)', () => {
    const a = new Apparatus(mulberry32(1))
    a.press('COUPLED')
    a.press('LIMITS')
    a.adjust(40)
    a.press('LIMITS')
    a.adjust(80)
    a.press('SCAN')
    a.tick(SAFE_S + OK_S + 0.1)
    const arms = armEaser(a)
    for (let i = 0; i < 20 && !a.moving; i++) a.tick(0.1)
    expect(a.moving).toBe(true)
    a.tick(0.1)
    arms.step(0.1)
    expect([arms.t, arms.s]).toEqual([a.target, a.sensor])
  })
})

describe('keySelected', () => {
  test('lights the parameter shown, the scan mode, and HV while on', () => {
    const a = new Apparatus(mulberry32(1))
    expect(keySelected(a, 'U')).toBe(true) // the bottom display shows U at power-up
    a.press('COUPLED')
    expect(keySelected(a, 'COUPLED')).toBe(true)
    expect(keySelected(a, 'HV')).toBe(false)
    a.press('HV')
    a.tick(SAFE_S + OK_S + 0.1)
    expect(a.hvOn).toBe(true)
    expect(keySelected(a, 'HV')).toBe(true)
    a.press('LIMITS')
    expect(keySelected(a, 'LIMITS')).toBe(true)
    expect(keySelected(a, 'U')).toBe(false)
  })
})
