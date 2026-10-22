// Forge task 2: why is Si (222) missing? Diamond structure: the ¼¼¼ basis cancels the (222) reflection (F = 0), while
// orders 1 and 3 of the (111) face stay. Uses the (111) face because the Forge refuses a cut whose first order is absent.
// Si is a Darwin (perfect) crystal: weak signal, hence 35 kV, 1 mA and Δt = 5 s (n = 3 reaches ≈ 7.7 σ).
import { MAX_STEP_DEG } from '../../physics/analysis'
import type { GuidedTask } from '../task'
import { seen, spans, storedScan } from './forge-common'

export const task: GuidedTask = {
  id: 'forge-si-222',
  mode: 'explore',
  level: 3,
  crystal: 'NaCl',
  crystalLocked: false,
  keepCrystal: true,
  holder: 'crystal',
  controls: ['DT', 'DBETA', 'LIMITS', 'COUPLED', 'SCAN'],
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED', dt_s: 5, dBeta_deg: 0.2 },
  predict: { kind: 'choice', answer: 1 },
  // A forged (111) crystal without order 2 (diamond-like), scanned from before θ₁ to after θ₃ of Kα: orders 1 and 3 stand out, so
  // the gap at θ₂ is a real absence, not a window that missed it.
  success: (a) => {
    const st = storedScan(a, MAX_STEP_DEG)
    if (!st || !st.forged) return false
    const { cut, allowed_orders: orders } = st.crystal
    return cut.join() === '1,1,1' && !orders.includes(2) && spans(st, 1, 3) && seen(st, 1) && seen(st, 3)
  },
}
