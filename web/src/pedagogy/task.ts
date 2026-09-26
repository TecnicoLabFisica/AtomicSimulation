// A guided task: predict → act → observe → explain (write-guided-task skill). Its success condition asks
// the physics model or the apparatus, never a hand-tuned number.
import type { Apparatus, Key, Mode } from '../apparatus/apparatus'
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
}

/** Start from the device defaults (RESET: HV off, arms driven home), then the task's settings. */
export function applyInitial(a: Apparatus, init: GuidedTask['initial']): void {
  a.press('RESET')
  if (init.U_kV !== undefined) a.u = Math.round(init.U_kV * 10)
  if (init.I_mA !== undefined) a.i = Math.round(init.I_mA * 100)
  if (init.dt_s !== undefined) a.dt = init.dt_s
  if (init.dBeta_deg !== undefined) a.dBeta = Math.round(init.dBeta_deg * 10)
  if (init.mode) a.press(init.mode)
  if (init.limits_deg) [a.limitLo, a.limitHi] = init.limits_deg.map((d) => Math.round(d * 10))
}
