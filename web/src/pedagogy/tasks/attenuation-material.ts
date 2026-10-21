// Lab mode: six 0.4 mm plates and the open beam at 30 kV (EPN Práctica 1, run 2a). Misconception: "μ always
// grows with Z" (Zr, above Fe in Z, transmits more at Mo Kα because that line lies just under its K edge).
// The app checks the exposures taken, never the student's μ: each one unsaturated and standing above background.
import type { Apparatus, ExposureRecord } from '../../apparatus/apparatus'
import { MIN_PROMINENCE_SIGMA } from '../../physics/analysis'
import { DEFAULT } from '../../physics/scan'
import type { GuidedTask } from '../task'
import { expectedOf, isSaturated, plateRuns, variance } from './attenuation-common'

const U_DECI_KV = 300
const SLOTS = [0, 1, 2, 3, 4, 5, 6] // polystyrene, Al, Fe, Cu, Zr, Ag, open
const KEYS = ['polystyrene', 'Al', 'Fe', 'Cu', 'Zr', 'Ag', 'open']

/** An exposure that counts: 30 kV, no counter saturation, and (a plate) its net rate above the background. */
function good(r: ExposureRecord): boolean {
  const rate = expectedOf(r)
  if (r.u !== U_DECI_KV || rate === undefined || isSaturated(rate)) return false
  const b = DEFAULT.background_per_s
  return (rate - b) / Math.sqrt(variance(rate, r.dt) + variance(b, r.dt)) >= MIN_PROMINENCE_SIGMA
}

const filtersOf = (r: ExposureRecord) => `${r.setup.collimatorFilter ?? ''}|${r.setup.sensorFilter ?? ''}`

/** The slots covered by good exposures that share the filters of `last` (I may differ between slots). */
const covered = (a: Apparatus, last?: ExposureRecord) => {
  const runs = plateRuns(a.exposureLog, 'materialWheel')
  const ref = last ?? runs.at(-1)
  return new Set(runs.filter((r) => good(r) && ref && filtersOf(r) === filtersOf(ref)).map((r) => r.slot))
}

export const task: GuidedTask = {
  id: 'attenuation-material',
  mode: 'lab',
  level: 2,
  crystal: 'NaCl',
  controls: ['U', 'I', 'DT', 'DBETA', 'TARGET', 'SCAN', 'REPLAY'],
  initial: { U_kV: 30, I_mA: 0.01, dt_s: 30, dBeta_deg: 0 },
  predict: { kind: 'choice', answer: 1 },
  // All six plates and the open slot at 30 kV, each unchanged while counting, below the saturation threshold
  // of Apparatus.saturated, one common set of filters, and standing MIN_PROMINENCE_SIGMA above the GM background. I may differ per slot.
  success: (a) => plateRuns(a.exposureLog, 'materialWheel').some((last) => SLOTS.every((k) => covered(a, last).has(k))),
  progress: (a) => {
    const c = covered(a)
    return SLOTS.map((k) => ({ key: KEYS[k], done: c.has(k) }))
  },
}
