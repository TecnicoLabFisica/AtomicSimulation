// Forge task 3: cut KCl along (111): where did the odd orders go? Rock salt, (111) family: odd orders ∝ (f_K − f_Cl)², even
// orders ∝ (f_K + f_Cl)². K and Cl have nearly equal f at every angle (equal only at θ = 0), so the odd orders are WEAK, not zero.
// Initial U = 30 kV: at 35 kV the 2nd-order continuum (λ/2 > λmin) starts at 5.60°, right under θ₁ = 5.61°, and buries order 1 under a ramp.
// The check reads that from the entry's own |F|² table.
import { MAX_STEP_DEG } from '../../physics/analysis'
import type { GuidedTask } from '../task'
import { seen, spans, storedScan } from './forge-common'

// Order 1 against the strongest order, |F|² (the entry's f_sq_rel is relative to order 1). KCl (111) gives ≈ 0.007, NaCl (111) ≈ 0.09.
const WEAK_ODD = 0.02

export const task: GuidedTask = {
  id: 'forge-kcl-111',
  mode: 'explore',
  level: 3,
  crystal: 'NaCl',
  crystalLocked: false,
  keepCrystal: true,
  holder: 'crystal',
  controls: ['DT', 'DBETA', 'LIMITS', 'COUPLED', 'SCAN'],
  initial: { U_kV: 30, I_mA: 1, mode: 'COUPLED', dt_s: 2, dBeta_deg: 0.2 },
  predict: { kind: 'choice', answer: 1 },
  success: (a) => {
    const st = storedScan(a, MAX_STEP_DEG)
    if (!st || !st.forged) return false
    const { cut, f_sq_rel: f } = st.crystal
    return cut.join() === '1,1,1' && f[0] < WEAK_ODD * Math.max(...f) && spans(st, 1, 3) && seen(st, 2)
  },
}
