// Forge task 4: make the Kα₁/Kα₂ doublet resolvable. dθ/dλ = n/(2d cos θ): the doublet (Δλ = 0.43 pm) opens up with a small d or a high
// order. Resolving it in 1st order needs d ≈ 43 pm (θ ≈ 55.6°), below any usual atomic face; the realistic route is a high order, e.g. LiF
// (200) n = 5 (= first order of (10 0 0)). The check uses only the ported Bragg angle and the instrument's σ, plus the scan settings.
import { MO_KA_COMPONENTS } from '../../physics/constants'
import { thetaFromLambda } from '../../physics/crystal'
import { BETA_MAX_DEG, DEFAULT } from '../../physics/scan'
import type { GuidedTask } from '../task'
import { storedScan } from './forge-common'

// Two Gaussians weighted 0.656/0.344 at 4σ apart leave a valley ≈ 0.37 of Kα₂. LiF n = 4 (2.8σ) fails, n = 5 (5.3σ) passes.
const MIN_SEPARATION_SIGMA = 4
const STEP_DEG = 0.1 // the goniometer's finest Δβ
const SIGMAS_EITHER_SIDE = 3
// At n = 5 on LiF, Δt = 10 s gives a valley ≈ 4–5σ below Kα₂. A statistical valley check is deferred to a Python-first analysis function.
const MIN_DT_S = 10

export const task: GuidedTask = {
  id: 'forge-doublet',
  mode: 'explore',
  level: 3,
  crystal: 'NaCl',
  crystalLocked: false,
  keepCrystal: true,
  holder: 'crystal',
  controls: ['DT', 'DBETA', 'LIMITS', 'COUPLED', 'SCAN'],
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED', dt_s: 15, dBeta_deg: 0.1 },
  predict: { kind: 'choice', answer: 1 },
  // Any crystal (preset or forged): some allowed order n whose Kα₂ − Kα₁ gap is ≥ 4σ, both lines inside the scan ± 3 σ, Δβ ≤ 0.1°, Δt ≥ 10 s.
  success: (a) => {
    const st = storedScan(a, STEP_DEG)
    if (!st || a.lastScan!.dt < MIN_DT_S) return false
    const [l1, l2] = MO_KA_COMPONENTS.map(([l]) => l)
    const m = SIGMAS_EITHER_SIDE * DEFAULT.sigma_deg
    return st.crystal.allowed_orders.some((n) => {
      const [t1, t2] = [thetaFromLambda(l1, n, st.crystal.d_pm), thetaFromLambda(l2, n, st.crystal.d_pm)]
      return t2 <= BETA_MAX_DEG && t2 - t1 >= MIN_SEPARATION_SIGMA * DEFAULT.sigma_deg && st.lo <= t1 - m && st.hi >= t2 + m
    })
  },
}
