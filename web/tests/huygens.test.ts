import { describe, expect, it } from 'vitest'
import { MO_KA_PM, MO_KB_PM } from '../src/physics/constants'
import { thetaFromLambda } from '../src/physics/crystal'
import { nearestOrder } from '../src/views/huygens'

describe('nearestOrder', () => {
  it('picks the order whose Bragg angle is closest, never below 1', () => {
    for (const lam of [MO_KA_PM, MO_KB_PM])
      for (const n of [1, 2, 3]) expect(nearestOrder(thetaFromLambda(lam, n), lam)).toBe(n)
    expect(nearestOrder(10, MO_KA_PM)).toBe(1) // 2d sin 10° = 97.9 pm ≈ 1.38 λ
    expect(nearestOrder(0.5, MO_KA_PM)).toBe(1)
  })
})
