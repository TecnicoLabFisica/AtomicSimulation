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

describe('crystal d (C2.3)', () => {
  it('nearestOrder follows d', () => {
    for (const d of [201.4, 998.52]) expect(nearestOrder(thetaFromLambda(MO_KA_PM, 2, d), MO_KA_PM, d)).toBe(2)
  })
})

describe('Lab mode shows the crystal name, never d', () => {
  it('names carry no spacing; the only d string is used by the Explore-only Huygens panel', async () => {
    // @ts-expect-error node types are not installed; Vitest runs in Node
    const { readdirSync, readFileSync } = (await import('node:fs')) as any
    ;(globalThis as any).document ??= { documentElement: {} } // setLang writes <html lang>
    const { setLang, t } = await import('../src/i18n')
    for (const l of ['es', 'en'] as const) {
      setLang(l)
      for (const n of Object.values(t().crystals)) expect(n).not.toMatch(/\d|pm/)
    }
    const dir = new URL('../src/views/', import.meta.url)
    const users = readdirSync(dir).filter((f: string) => readFileSync(new URL(f, dir), 'utf8').includes('crystalDExplore'))
    expect(users).toEqual(['huygens.ts'])
  })
})
