// A guided task: predict → act → observe → explain (write-guided-task skill). Its success condition asks
// the physics model or the apparatus, never a hand-tuned number.
import type { Apparatus, Holder, Key, Mode } from '../apparatus/apparatus'
import type { AppMode } from './mode'

export type GuidedTask = {
  id: string // also the key of its strings in pedagogy/i18n
  mode: AppMode
  level: 1 | 2 | 3 // 1 intro · 2 core · 3 challenge
  /** Panel keys the task needs; the others are dimmed, not disabled. 'U' and 'I' also cover the sliders. */
  controls: Key[]
  initial: { U_kV?: number; I_mA?: number; mode?: Mode; dt_s?: number; dBeta_deg?: number; limits_deg?: [number, number] }
  /** A number with a unit, or one of the task's `options` strings (by index). */
  predict: { kind: 'number'; unit: string } | { kind: 'choice'; answer: number }
  success: (a: Apparatus) => boolean
  /** Crystal preset the teacher puts on the crystal holder at the start (default 'NaCl'). */
  crystal?: string
  /** The setup tray's crystal picker stays on `crystal` while the task is active (default true). */
  crystalLocked?: boolean
  /** What the teacher puts on the target holder at the start; undefined leaves it (the attenuation tasks keep their wheel). */
  holder?: Holder
  /** Optional checklist shown under the act text: what the task has collected so far, by label key. */
  progress?: (a: Apparatus) => { key: string; done: boolean }[]
}

/** Start from the device defaults (RESET: HV off, arms driven home), then the task's settings. */
export function applyInitial(a: Apparatus, init: GuidedTask['initial'], crystal = 'NaCl', holder?: Holder): void {
  a.press('RESET')
  // The task setup is the teacher preparing the bench: the doors are opened through the guarded API (RESET left
  // the HV off and the arms idle) and put back as they were. A non-NaCl preset must be loaded first (loadCrystals()).
  // The holder is left alone unless the task names one: the attenuation tasks have a plate wheel there.
  if (a.setup.crystal !== crystal || (holder && a.setup.holder !== holder)) {
    const closed = a.doorsClosed
    if (!a.setDoors(false)) throw new Error('bench not safe to prepare')
    try {
      a.mount({ ...a.setup, crystal, ...(holder && { holder }) })
    } finally {
      a.setDoors(closed)
    }
  }
  if (init.U_kV !== undefined) a.u = Math.round(init.U_kV * 10)
  if (init.I_mA !== undefined) a.i = Math.round(init.I_mA * 100)
  if (init.dt_s !== undefined) a.dt = init.dt_s
  if (init.dBeta_deg !== undefined) a.dBeta = Math.round(init.dBeta_deg * 10)
  if (init.mode) a.press(init.mode)
  if (init.limits_deg) [a.limitLo, a.limitHi] = init.limits_deg.map((d) => Math.round(d * 10))
}

// The task on the card, so the setup tray can lock its crystal picker without importing the card.
let active: GuidedTask | null = null
export const setActiveTask = (k: GuidedTask | null): void => void (active = k)
/** The crystal the active task fixes on the picker, or null when none is active or the task allows a choice. */
export const lockedCrystal = (): string | null => (active && active.crystalLocked !== false ? (active.crystal ?? 'NaCl') : null)
