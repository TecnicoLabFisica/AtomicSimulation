// Lab mode: the GM background with the tube off (EPN Práctica 1: at least 100 s at 0 kV / 0 mA).
// Misconception: "no X-rays means zero counts". The app checks the exposure, never the student's reading.
import type { GuidedTask } from '../task'

/** Minimum exposure time of the background run in the EPN Práctica 1 guide, in s. */
export const BACKGROUND_MIN_DT_S = 100

export const task: GuidedTask = {
  id: 'background',
  mode: 'lab',
  level: 1,
  crystal: 'NaCl',
  controls: ['U', 'I', 'DT', 'DBETA', 'SCAN', 'REPLAY'],
  initial: { U_kV: 0, I_mA: 0, dt_s: 100, dBeta_deg: 0 },
  predict: { kind: 'choice', answer: 1 },
  // A finished exposure with the tube off (U = 0 or I = 0), steady, of at least the guide's 100 s, taken since the act step opened.
  countsExposures: true,
  success: (a, from = 0) => a.exposureLog.slice(from).some((r) => (r.u === 0 || r.i === 0) && !r.changed && r.dt >= BACKGROUND_MIN_DT_S),
}
