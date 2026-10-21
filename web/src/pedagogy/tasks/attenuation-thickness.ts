// Lab mode: the Al plate wheel at one (U, I), an exposure per slot (EPN Práctica 1, run 1a). Misconception:
// "Lambert's law always gives a straight ln T vs d line": the beam is polychromatic and hardens with depth.
// The app checks the exposures taken, never the student's μ: beam hardening must be resolvable from their dt.
import type { Apparatus, ExposureRecord } from '../../apparatus/apparatus'
import { MIN_PROMINENCE_SIGMA } from '../../physics/analysis'
import { WHEELS_MG_CM2 } from '../../physics/tables'
import type { GuidedTask } from '../task'
import { expectedOf, isSaturated, plateRuns, variance } from './attenuation-common'

const SLOTS = [0, 1, 2, 3, 4, 5, 6] // 0 = open (R0), 1…6 = 0.5 … 3.0 mm
const KEYS = ['open', '0.5 mm', '1.0 mm', '1.5 mm', '2.0 mm', '2.5 mm', '3.0 mm']

const sameBeam = (a: ExposureRecord, b: ExposureRecord) =>
  a.u === b.u && a.i === b.i && a.setup.collimatorFilter === b.setup.collimatorFilter && a.setup.sensorFilter === b.setup.sensorFilter

/** One exposure per slot of a (U, I, filters) group: the longest one. */
function bySlot(group: ExposureRecord[]): Map<number, ExposureRecord> {
  const m = new Map<number, ExposureRecord>()
  for (const r of group) if (r.slot !== null && r.dt > (m.get(r.slot)?.dt ?? 0)) m.set(r.slot, r)
  return m
}

/** μ_eff(d) = −ln(R/R0)/d from the expected rates, its Poisson variance from the student's dt (d in mg/cm²). */
function muEff(k: number, m: Map<number, ExposureRecord>): { mu: number; var: number } | null {
  const [open, r] = [m.get(0)!, m.get(k)!]
  const [r0, rk] = [expectedOf(open), expectedOf(r)]
  const d = WHEELS_MG_CM2.al[k]?.[1]
  if (r0 === undefined || rk === undefined || d === undefined) return null
  const [v0, vk] = [variance(r0, open.dt) / r0 ** 2, variance(rk, r.dt) / rk ** 2]
  return { mu: -Math.log(rk / r0) / d, var: (v0 + vk) / d ** 2 }
}

/** The thinnest and thickest plates differ in μ_eff by MIN_PROMINENCE_SIGMA of their joint Poisson error. */
function hardeningStands(m: Map<number, ExposureRecord>): boolean {
  const [thin, thick] = [muEff(1, m), muEff(6, m)]
  return !!thin && !!thick && (thin.mu - thick.mu) / Math.sqrt(thin.var + thick.var) >= MIN_PROMINENCE_SIGMA
}

const groupOf = (a: Apparatus, last: ExposureRecord) => bySlot(plateRuns(a.exposureLog, 'alWheel').filter((r) => sameBeam(r, last) && !isSaturated(expectedOf(r) ?? 0)))

export const task: GuidedTask = {
  id: 'attenuation-thickness',
  mode: 'lab',
  level: 2,
  crystal: 'NaCl',
  controls: ['U', 'I', 'DT', 'DBETA', 'TARGET', 'SCAN', 'REPLAY'],
  initial: { U_kV: 21, I_mA: 0.05, dt_s: 30, dBeta_deg: 0 },
  predict: { kind: 'choice', answer: 1 },
  // At one (U, I) and filters, steady, unsaturated exposures on all seven slots, and with their Δt the fall of μ_eff from the
  // thinnest to the thickest plate stands MIN_PROMINENCE_SIGMA in the expected rates.
  success: (a) => plateRuns(a.exposureLog, 'alWheel').some((last) => {
    const m = groupOf(a, last)
    return SLOTS.every((k) => m.has(k)) && hardeningStands(m)
  }),
  progress: (a) => {
    const last = plateRuns(a.exposureLog, 'alWheel').at(-1)
    const m = last ? groupOf(a, last) : new Map<number, ExposureRecord>()
    return SLOTS.map((k) => ({ key: KEYS[k], done: m.has(k) }))
  },
}
