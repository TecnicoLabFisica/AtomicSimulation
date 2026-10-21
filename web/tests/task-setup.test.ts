// Q1.7: the bench a task starts from, the setup checks of the Bragg tasks, the card's locks, and the
// retry of a failed table load. The card is driven through a stub root (the tests run without a DOM).
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { Apparatus, OK_S, SAFE_S } from '../src/apparatus/apparatus'
import { markExported } from '../src/pedagogy/csv'
import { mountLearn } from '../src/pedagogy/card'
import { applyInitial, lockedCrystal, setActiveTask } from '../src/pedagogy/task'
import { task as background } from '../src/pedagogy/tasks/background'
import { task as kalpha } from '../src/pedagogy/tasks/kalpha-third-order'
import { task as lambda3 } from '../src/pedagogy/tasks/lambda-three-orders'
import { task as threshold } from '../src/pedagogy/tasks/line-threshold'
import { task as moseley } from '../src/pedagogy/tasks/moseley-k-edges'
import { mulberry32 } from '../src/physics/detector'
import { loadAbsorbers, loadCrystals, retryableOnce } from '../src/physics/tables'
import type { Key } from '../src/apparatus/apparatus'

const SAFETY_S = SAFE_S + OK_S
beforeAll(async () => {
  await loadAbsorbers()
  await loadCrystals()
})

/** Mount `setup` on the open-door bench and close the doors again. */
function mounted(a: Apparatus, set: Partial<Apparatus['setup']>) {
  a.setDoors(false)
  expect(a.mount({ ...a.setup, ...set })).toBe(true)
  a.setDoors(true)
}
function scan(a: Apparatus) {
  a.timeScale = Infinity
  a.press('SCAN')
  a.tick(SAFETY_S)
  a.tick(1e6)
}

describe('applyInitial mounts a known setup', () => {
  test('a leftover foil does not survive into the next task', () => {
    const a = new Apparatus(mulberry32(1))
    mounted(a, { sensorFilter: 'In', collimatorFilter: 'Ag' })
    applyInitial(a, background.initial, background.crystal)
    expect(a.setup.sensorFilter).toBeNull()
    expect(a.setup.collimatorFilter).toBeNull()
    expect(a.doorsClosed).toBe(true)
  })

  test('a task that names no holder keeps the wheel; one that names it mounts it', () => {
    const a = new Apparatus(mulberry32(1))
    mounted(a, { holder: 'materialWheel', sensorFilter: 'Zr' })
    applyInitial(a, background.initial, background.crystal)
    expect(a.setup).toMatchObject({ holder: 'materialWheel', sensorFilter: null })
    applyInitial(a, kalpha.initial, kalpha.crystal, kalpha.holder)
    expect(a.setup.holder).toBe('crystal')
  })

  test('a task with a free crystal picker keeps the crystal on the holder (Start over on LiF)', () => {
    const a = new Apparatus(mulberry32(1))
    mounted(a, { crystal: 'LiF' })
    applyInitial(a, moseley.initial, moseley.crystal, moseley.holder, moseley.crystalLocked !== false)
    expect(a.setup.crystal).toBe('LiF')
    applyInitial(a, kalpha.initial, kalpha.crystal, kalpha.holder, true)
    expect(a.setup.crystal).toBe('NaCl')
  })
})

describe('the Bragg tasks check the setup of the scan', () => {
  test('lambda-three-orders: a scan with the holder empty or on LiF does not count', () => {
    const run = (set: Partial<Apparatus['setup']>) => {
      const a = new Apparatus(mulberry32(1234))
      applyInitial(a, lambda3.initial)
      mounted(a, set)
      ;[a.limitLo, a.limitHi, a.dt] = [20, 250, 10]
      scan(a)
      markExported(a)
      return lambda3.success(a)
    }
    expect(run({})).toBe(true)
    expect(run({ holder: 'empty' })).toBe(false)
    expect(run({ crystal: 'LiF' })).toBe(false)
    expect(() => run({ sensorFilter: 'Zr' })).not.toThrow() // the scan's filter goes into the expected rate
  })

  test('line-threshold and kalpha-third-order need the NaCl crystal on the holder', () => {
    const a = new Apparatus(mulberry32(1234))
    applyInitial(a, threshold.initial)
    mounted(a, { holder: 'empty' })
    scan(a)
    expect(threshold.success(a)).toBe(false)
    const b = new Apparatus(mulberry32(1234))
    applyInitial(b, kalpha.initial)
    b.press('HV')
    b.tick(SAFETY_S + 0.1)
    b.moveArm(222)
    expect(kalpha.success(b)).toBe(true)
    const c = new Apparatus(mulberry32(1234))
    applyInitial(c, kalpha.initial)
    mounted(c, { holder: 'empty' })
    c.press('HV')
    c.tick(SAFETY_S + 0.1)
    c.moveArm(222)
    expect(kalpha.success(c)).toBe(false)
  })
})

describe('the task card', () => {
  const stubRoot = () => {
    const h: Record<string, (e: unknown) => void> = {}
    const root = { innerHTML: '', addEventListener: (k: string, f: (e: unknown) => void) => void (h[k] = f), querySelector: () => ({ disabled: false, focus() {} }) }
    const click = (data: Record<string, string>) => h.click({ target: { closest: () => ({ dataset: data }) } })
    return { root: root as unknown as HTMLElement, h, click }
  }
  vi.stubGlobal('location', { search: '' })

  test('starting keeps the exposure log; the locks hold until the act step succeeds', () => {
    const a = new Apparatus(mulberry32(1234))
    const clear = vi.spyOn(a, 'clearExposureLog')
    const focus: (Key[] | null)[] = []
    const { root, h, click } = stubRoot()
    const learn = mountLearn(root, a, { onMode() {}, onFocus: (k) => focus.push(k), onAct() {} })
    click({ task: 'kalpha-third-order' })
    expect(clear).not.toHaveBeenCalled()
    expect(lockedCrystal()).toBe('NaCl')
    expect(focus.at(-1)).toEqual(kalpha.controls)
    h.input({ target: { dataset: { predict: '' }, value: '22.2' } })
    click({ commit: '' })
    learn.sheetClosed() // mid-act: nothing is released
    expect(lockedCrystal()).toBe('NaCl')
    a.press('HV')
    a.tick(SAFETY_S + 0.1)
    a.moveArm(222)
    expect(learn.render()).toBe(true)
    expect(lockedCrystal()).toBeNull()
    expect(focus.at(-1)).toBeNull()
    click({ restart: '' })
    expect(clear).not.toHaveBeenCalled()
    expect(lockedCrystal()).toBe('NaCl') // a restart takes the locks up again
    learn.sheetClosed() // at predict: released
    expect(lockedCrystal()).toBeNull()
    setActiveTask(null)
  })
})

describe('retryableOnce', () => {
  test('a rejected load is forgotten so a retry runs again; a success runs once', async () => {
    let calls = 0
    const load = retryableOnce(async () => {
      if (++calls === 1) throw new Error('offline')
    })
    await expect(load()).rejects.toThrow('offline')
    await load()
    await load()
    expect(calls).toBe(2)
  })
})
