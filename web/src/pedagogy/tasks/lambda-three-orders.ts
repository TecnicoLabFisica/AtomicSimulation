// Lab mode: measure one scan across three orders and export it, to find λ(Kα) and λ(Kβ) from each order
// (LD P6.3.3.1 Tables 3–5). The app checks the scan, never the student's wavelengths.
import { MO_KA_PM, MO_KB_PM } from '../../physics/constants'
import { MAX_STEP_DEG, MIN_PROMINENCE_SIGMA, PEAK_HALF_WINDOW_DEG } from '../../physics/analysis'
import { thetaFromLambda } from '../../physics/crystal'
import { expectedRate } from '../../physics/scan'
import { wasExported } from '../csv'
import type { GuidedTask } from '../task'

const THETAS = [1, 2, 3].flatMap((n) => [thetaFromLambda(MO_KB_PM, n), thetaFromLambda(MO_KA_PM, n)])
// Each line's background: the ends of its marked window, cut at the midpoint to its neighbours (as in
// braggsim.analysis.wavelength_table), so 1st-order Kα's window stops short of Kβ.
const W = PEAK_HALF_WINDOW_DEG
const WINDOWS = THETAS.map((th, k) => [
  Math.max(th - W, (th + (THETAS[k - 1] ?? -Infinity)) / 2),
  Math.min(th + W, (th + (THETAS[k + 1] ?? Infinity)) / 2),
])

export const task: GuidedTask = {
  id: 'lambda-three-orders',
  mode: 'lab',
  level: 2,
  controls: ['U', 'I', 'DT', 'DBETA', 'LIMITS', 'COUPLED', 'SCAN'],
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED' },
  predict: { kind: 'choice', answer: 0 },
  // A finished, exported coupled scan at steady U and I that braggsim.analysis could work with: every
  // Kβ and Kα peak of orders 1–3 inside it with its marked window (±PEAK_HALF_WINDOW_DEG), a step no
  // coarser than MAX_STEP_DEG, and each line expected to stand MIN_PROMINENCE_SIGMA above its background.
  success: (a) => {
    const s = a.lastScan
    const r = a.replay
    if (!s || s.mode !== 'COUPLED' || s.changed || a.busy || r.length < 2 || !wasExported(a)) return false
    if ((r[1].angle - r[0].angle) / 10 > MAX_STEP_DEG) return false
    if (r[0].angle / 10 > THETAS[0] - W || r.at(-1)!.angle / 10 < THETAS[5] + W) return false
    return THETAS.every((th, k) => {
      const [peak, lo, hi] = expectedRate([th, ...WINDOWS[k]], s.u / 10, s.i / 100)
      const signal = (peak - Math.max(lo, hi)) * s.dt
      return signal >= MIN_PROMINENCE_SIGMA * Math.sqrt(Math.max(peak * s.dt, 1))
    })
  },
}
