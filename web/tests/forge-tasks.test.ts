// F3.1: the four Forge guided tasks, on stored scans of forged crystals (and presets, where they must fail).
import { beforeAll, describe, expect, test } from 'vitest'
import { Apparatus, OK_S, SAFE_S } from '../src/apparatus/apparatus'
import { TASKS } from '../src/pedagogy/card'
import { en } from '../src/pedagogy/i18n/en'
import { es } from '../src/pedagogy/i18n/es'
import { applyInitial, lockedCrystal, setActiveTask, type GuidedTask } from '../src/pedagogy/task'
import { task as doublet } from '../src/pedagogy/tasks/forge-doublet'
import { task as k10 } from '../src/pedagogy/tasks/forge-kalpha-10deg'
import { task as kcl } from '../src/pedagogy/tasks/forge-kcl-111'
import { task as si } from '../src/pedagogy/tasks/forge-si-222'
import { forgeEntry } from '../src/physics/forge'
import { PRESETS } from '../src/physics/forge-lattices'
import { mulberry32 } from '../src/physics/detector'
import { loadCrystals, loadForgeElements } from '../src/physics/tables'
import { designFromPreset, registerForged, toInput } from '../src/views/forge'

beforeAll(async () => {
  await loadForgeElements()
  await loadCrystals()
})

const preset = (id: string, over: { cut?: number[]; a_pm?: number } = {}) => {
  const inp = toInput(designFromPreset(PRESETS.find((p) => p.id === id)!))
  const { a_pm = inp.cell.a_pm, cut = inp.cut } = over
  return registerForged(forgeEntry({ ...inp, cut, cell: { ...inp.cell, a_pm, b_pm: a_pm, c_pm: a_pm } }))
}

/** The task's bench with `crystal` mounted, then a COUPLED scan lo…hi (°) with Δβ, Δt (task defaults otherwise). */
function run(task: GuidedTask, crystal: string, lo: number, hi: number, dBeta = 0.2, dt?: number) {
  const a = new Apparatus(mulberry32(5))
  a.setDoors(false)
  expect(a.mount({ ...a.setup, holder: 'crystal', crystal })).toBe(true)
  a.setDoors(true)
  applyInitial(a, task.initial, task.crystal, task.holder, false, task.keepCrystal)
  expect(a.setup.crystal).toBe(crystal) // the Forge crystal survives the task setup
  ;[a.dBeta, a.limitLo, a.limitHi] = [Math.round(dBeta * 10), Math.round(lo * 10), Math.round(hi * 10)]
  if (dt) a.dt = dt
  a.timeScale = Infinity
  a.press('SCAN')
  a.tick(SAFE_S + OK_S)
  expect(a.busy).toBe(false)
  return a
}

describe('registration', () => {
  test('four Explore tasks after the existing ones, crystal free, Forge crystal kept', () => {
    const ids = ['forge-kalpha-10deg', 'forge-si-222', 'forge-kcl-111', 'forge-doublet']
    expect(TASKS.slice(-4).map((t) => t.id)).toEqual(ids)
    for (const t of TASKS.slice(-4)) {
      expect([t.mode, t.crystalLocked, t.keepCrystal, t.holder]).toEqual(['explore', false, true, 'crystal'])
      setActiveTask(t)
      expect(lockedCrystal()).toBeNull()
      for (const d of [es, en]) {
        const x = d.task[t.id as keyof typeof d.task]
        expect(x.title && x.concept && x.predict && x.act && x.observe && x.explain && x.teacher).toBeTruthy()
        if (t.predict.kind === 'choice') expect(x.options.length).toBe(3)
      }
    }
    setActiveTask(null)
  })
  test('the task setup does not mount NaCl over a forged crystal', () => {
    const key = preset('LiF')
    const a = new Apparatus()
    a.setDoors(false)
    a.mount({ ...a.setup, crystal: key })
    a.setDoors(true)
    applyInitial(a, k10.initial, 'NaCl', 'crystal', true, true)
    expect(a.setup.crystal).toBe(key)
  })
})

describe('forge-kalpha-10deg', () => {
  test('rock salt with a = 409.4 pm (d = 204.7): met', () => expect(k10.success(run(k10, preset('LiF', { a_pm: 409.4 }), 9, 11.5, 0.1))).toBe(true))
  test('d 2 % off: not met', () => expect(k10.success(run(k10, preset('LiF', { a_pm: 418 }), 9, 11.5, 0.1))).toBe(false))
  test('the preset NaCl or LiF, not forged: not met', async () => {
    expect(k10.success(run(k10, 'LiF', 9, 11.5, 0.1))).toBe(false)
  })
  test('too coarse, or a window that stops short: not met', () => {
    const k = preset('LiF', { a_pm: 409.4 })
    expect(k10.success(run(k10, k, 9, 11.5, 0.3))).toBe(false)
    expect(k10.success(run(k10, k, 9, 10.3, 0.1))).toBe(false)
  })
})

describe('forge-si-222', () => {
  test('Si (111) 5–21° at 5 s: met', () => expect(si.success(run(si, preset('Si'), 5, 21))).toBe(true))
  test('Δt = 1 s leaves n = 3 under 5 σ: not met', () => expect(si.success(run(si, preset('Si'), 5, 21, 0.2, 1))).toBe(false))
  test('stops before θ₃: not met', () => expect(si.success(run(si, preset('Si'), 5, 15))).toBe(false))
  test('rock salt (111) has order 2: not met', () => expect(si.success(run(si, preset('KCl', { cut: [1, 1, 1] }), 4.9, 21))).toBe(false))
  test('Si (111) as a preset, not forged: not met', () => expect(si.success(run(si, 'Si', 5, 21))).toBe(false))
})

describe('forge-kcl-111', () => {
  test('KCl (111) 4.8–18°: met', () => expect(kcl.success(run(kcl, preset('KCl', { cut: [1, 1, 1] }), 4.8, 18))).toBe(true))
  test('NaCl (111): odd orders only 9 % of the strongest, not met', () =>
    expect(kcl.success(run(kcl, preset('NaCl', { cut: [1, 1, 1] }), 4, 14))).toBe(false))
  test('KCl (200): not met', () => expect(kcl.success(run(kcl, preset('KCl'), 4, 14))).toBe(false))
  test('scan too short for θ₃: not met', () => expect(kcl.success(run(kcl, preset('KCl', { cut: [1, 1, 1] }), 4.9, 12))).toBe(false))
})

describe('forge-doublet', () => {
  test('LiF preset n = 5 (θ ≈ 61.7–62.4°), 100 s: met', () => expect(doublet.success(run(doublet, 'LiF', 61, 63, 0.1, 100))).toBe(true))
  test('LiF n = 4 (Δθ = 0.34°): met', () => expect(doublet.success(run(doublet, 'LiF', 44, 46, 0.1, 30))).toBe(true))
  test('LiF n = 5 at 10 s: the line is under 5 σ, not met', () => expect(doublet.success(run(doublet, 'LiF', 61, 63, 0.1, 10))).toBe(false))
  test('NaCl n = 1: not met', () => expect(doublet.success(run(doublet, 'NaCl', 6.5, 8.5, 0.1))).toBe(false))
  test('LiF n = 5 but Δβ = 0.2°: not met', () => expect(doublet.success(run(doublet, 'LiF', 61, 63, 0.2, 100))).toBe(false))
  test('a window that misses Kα₂ ± 3σ: not met', () => expect(doublet.success(run(doublet, 'LiF', 61, 62.5, 0.1, 100))).toBe(false))
})
