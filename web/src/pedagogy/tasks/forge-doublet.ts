// Forge task 4: make the Kα₁/Kα₂ doublet resolvable. dθ/dλ = n/(2d cos θ): the doublet (Δλ = 0.43 pm) opens up with a small d or a high
// order. Resolving it in 1st order needs d ≈ 55 pm (θ ≈ 40°), below any atomic spacing; the realistic route is a high order, e.g. LiF (200)
// n = 4–5. The check uses only the ported Bragg angle and the instrument's σ: separation > 2.35 σ (FWHM of the Gaussian), both lines in the scan.
import { MO_KA_COMPONENTS } from '../../physics/constants'
import { thetaFromLambda } from '../../physics/crystal'
import { BETA_MAX_DEG, DEFAULT } from '../../physics/scan'
import type { GuidedTask } from '../task'
import { seen, storedScan } from './forge-common'

const FWHM_PER_SIGMA = 2.35 // Gaussian FWHM = 2√(2 ln 2) σ
const STEP_DEG = 0.1 // the goniometer's finest Δβ
const SIGMAS_EITHER_SIDE = 3

export const task: GuidedTask = {
  id: 'forge-doublet',
  mode: 'explore',
  level: 3,
  crystal: 'NaCl',
  crystalLocked: false,
  keepCrystal: true,
  holder: 'crystal',
  controls: ['DT', 'DBETA', 'LIMITS', 'COUPLED', 'SCAN'],
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED', dt_s: 10, dBeta_deg: 0.1 },
  predict: { kind: 'choice', answer: 1 },
  // Any crystal (preset or forged): some allowed order n whose Kα₂ − Kα₁ gap exceeds 2.35 σ, both lines inside the scan ± 3 σ,
  // Δβ ≤ 0.1°, and that Kα line 5 σ above its background, so there is something to resolve.
  success: (a) => {
    const st = storedScan(a, STEP_DEG)
    if (!st) return false
    const [l1, l2] = MO_KA_COMPONENTS.map(([l]) => l)
    const m = SIGMAS_EITHER_SIDE * DEFAULT.sigma_deg
    return st.crystal.allowed_orders.some((n) => {
      const [t1, t2] = [thetaFromLambda(l1, n, st.crystal.d_pm), thetaFromLambda(l2, n, st.crystal.d_pm)]
      return t2 <= BETA_MAX_DEG && t2 - t1 > FWHM_PER_SIGMA * DEFAULT.sigma_deg && st.lo <= t1 - m && st.hi >= t2 + m && seen(st, n)
    })
  },
}
