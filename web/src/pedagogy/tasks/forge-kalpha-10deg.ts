// Forge task 1: design d so that Mo Kα (n = 1) falls at 10°. Confronts "the angle belongs to the X-ray line": the crystal
// sets it, sin θ = λ/(2d). Explore mode, so the prompt may state the angle. The app checks the scanned crystal's d, not the number typed.
import { MAX_STEP_DEG } from '../../physics/analysis'
import { MO_KA_PM } from '../../physics/constants'
import type { GuidedTask } from '../task'
import { seen, spans, storedScan } from './forge-common'

const TARGET_DEG = 10
const D_TOL = 0.01 // 1 %
// d that puts Kα (n = 1) at 10°: Bragg's law solved for d, d = λ / (2 sin θ) (≈ 204.7 pm).
const D_TARGET_PM = MO_KA_PM / (2 * Math.sin((TARGET_DEG * Math.PI) / 180))

export const task: GuidedTask = {
  id: 'forge-kalpha-10deg',
  mode: 'explore',
  level: 2,
  crystal: 'NaCl',
  crystalLocked: false,
  keepCrystal: true,
  holder: 'crystal',
  controls: ['DT', 'DBETA', 'LIMITS', 'COUPLED', 'SCAN'],
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED', dt_s: 1, dBeta_deg: 0.1 },
  predict: { kind: 'number', unit: 'pm' },
  // The forged crystal on the stored scan has d within 1 % of the target and its Kα n = 1 line sits inside the scan (±window) 5σ above its background.
  success: (a) => {
    const st = storedScan(a, MAX_STEP_DEG)
    if (!st || !st.forged) return false
    return Math.abs(st.crystal.d_pm / D_TARGET_PM - 1) <= D_TOL && spans(st, 1, 1) && seen(st, 1)
  },
}
