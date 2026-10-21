// Kα with another crystal: the same Mo line sits at a larger angle on LiF (d = 201.4 pm) than on NaCl
// (282.0 pm), because sin θ = λ/2d. Confronts "the angle depends only on the X-ray tube". Explore mode, so the
// prompt may state d (the Huygens panel shows it). The app checks the scan, never the student's number.
import { MAX_STEP_DEG, MIN_PROMINENCE_SIGMA, PEAK_HALF_WINDOW_DEG } from '../../physics/analysis'
import { MO_KA_PM, MO_KB_PM } from '../../physics/constants'
import { crystalByName, dPm, thetaFromLambda } from '../../physics/crystal'
import { DEFAULT, expectedRate } from '../../physics/scan'
import type { GuidedTask } from '../task'

const CRYSTAL = 'LiF'
const W = PEAK_HALF_WINDOW_DEG

export const task: GuidedTask = {
  id: 'lif-kalpha-angle',
  mode: 'explore',
  level: 2,
  crystal: CRYSTAL,
  controls: ['U', 'I', 'DT', 'DBETA', 'LIMITS', 'COUPLED', 'SCAN'],
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED' },
  predict: { kind: 'number', unit: '°' },
  // A finished coupled scan on LiF, at steady U and I, that braggsim.analysis could work with: the 1st-order Kα
  // peak inside it with its marked window (±PEAK_HALF_WINDOW_DEG, cut at the midpoint to Kβ), a step no
  // coarser than MAX_STEP_DEG, and the line expected to stand MIN_PROMINENCE_SIGMA above its background.
  // The crystal is the stored scan's own (lastScan.setup), so a NaCl scan around 10° never counts.
  success: (a) => {
    const s = a.lastScan
    const r = a.replay
    if (!s || s.mode !== 'COUPLED' || s.changed || a.busy || r.length < 2) return false
    if (s.setup.holder !== 'crystal' || s.setup.crystal !== CRYSTAL) return false
    if ((r[1].angle - r[0].angle) / 10 > MAX_STEP_DEG) return false
    const crystal = crystalByName(CRYSTAL)
    const th = thetaFromLambda(MO_KA_PM, 1, dPm(crystal))
    const thB = thetaFromLambda(MO_KB_PM, 1, dPm(crystal))
    if (r[0].angle / 10 > th - W || r.at(-1)!.angle / 10 < th + W) return false
    const [peak, lo, hi] = expectedRate([th, Math.max(th - W, (th + thB) / 2), th + W], s.u / 10, s.i / 100, DEFAULT, null, [], crystal)
    return (peak - Math.max(lo, hi)) * s.dt >= MIN_PROMINENCE_SIGMA * Math.sqrt(Math.max(peak * s.dt, 1))
  },
}
