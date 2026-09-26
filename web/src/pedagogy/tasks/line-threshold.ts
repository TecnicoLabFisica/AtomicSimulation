// Below which voltage does Kα vanish? Confronts "the lines vanish at λ_min": they need U above the Mo K
// shell's binding energy, while the continuum still reaches the Kα angle a little below it.
import { MO_KA_PM, MO_K_EDGE_KEV } from '../../physics/constants'
import { thetaFromLambda } from '../../physics/crystal'
import { DEFAULT } from '../../physics/scan'
import { lambdaMinPm } from '../../physics/source'
import type { GuidedTask } from '../task'

export const task: GuidedTask = {
  id: 'line-threshold',
  mode: 'explore',
  level: 2,
  controls: ['U', 'SCAN'],
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED', dt_s: 1, dBeta_deg: 0.1, limits_deg: [5, 9] },
  predict: { kind: 'choice', answer: 1 },
  // A finished scan across the whole 1st-order Kα peak (±3σ), at one U with no K lines (U ≤ U_K, the
  // model's line_rates rule) but with λ_min still short of λ(Kα), and emission current on.
  success: (a) => {
    const s = a.lastScan
    const r = a.replay
    if (!s || s.mode !== 'COUPLED' || s.changed || a.busy || s.i === 0 || r.length < 2) return false
    const U = s.u / 10
    const theta = thetaFromLambda(MO_KA_PM)
    const margin = 3 * DEFAULT.sigma_deg
    return U <= MO_K_EDGE_KEV && lambdaMinPm(U) < MO_KA_PM &&
      r[0].angle / 10 <= theta - margin && r.at(-1)!.angle / 10 >= theta + margin
  },
}
