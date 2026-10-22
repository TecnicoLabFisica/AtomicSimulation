// Forge task 3: cut KCl along (111): where did the odd orders go? Rock salt, (111) family: odd orders ∝ (f_K − f_Cl)², even
// orders ∝ (f_K + f_Cl)². Real K⁺ and Cl⁻ are isoelectronic (18 e⁻ each), so real KCl's odd orders nearly vanish; the Forge uses
// neutral atoms (19 against 17 e⁻), so they stay WEAK, not zero. The check reads that from the entry's own |F|² table.
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
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED', dt_s: 2, dBeta_deg: 0.2 },
  predict: { kind: 'choice', answer: 2 },
  success: (a) => {
    const st = storedScan(a, MAX_STEP_DEG)
    if (!st || !st.forged) return false
    const { cut, f_sq_rel: f } = st.crystal
    return cut.join() === '1,1,1' && f[0] < WEAK_ODD * Math.max(...f) && spans(st, 1, 3) && seen(st, 2)
  },
}
