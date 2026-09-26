// port of braggsim.crystal: Bragg geometry at the NaCl monocrystal, n λ = 2 d sin θ
// (LD P6.3.3.1, Eq. I). θ is the glancing angle in degrees. Scalar functions: map them over arrays.
import { D_NACL_PM } from './constants'
import { STRUCTURE_FACTOR_SQ_REL } from './tables'

const DEG = 180 / Math.PI
const RAD = Math.PI / 180

/** port of braggsim.crystal.theta_from_lambda: θ in degrees, NaN where n λ > 2 d, λ ≤ 0 or n < 1. */
export function thetaFromLambda(lambdaPm: number, n = 1, dPm = D_NACL_PM): number {
  const s = (n * lambdaPm) / (2 * dPm)
  return s > 0 && s <= 1 && n >= 1 ? Math.asin(s) * DEG : NaN
}

/** port of braggsim.crystal.lambda_from_theta: λ in pm (NaN outside 0° … 90°). */
export function lambdaFromTheta(thetaDeg: number, n = 1, dPm = D_NACL_PM): number {
  const lam = (2 * dPm * Math.sin(thetaDeg * RAD)) / n
  return thetaDeg >= 0 && thetaDeg <= 90 ? lam : NaN
}

/** port of braggsim.crystal.dlambda_dtheta_pm_per_deg: (2 d / n) cos θ in pm per degree. */
export function dlambdaDthetaPmPerDeg(thetaDeg: number, n = 1, dPm = D_NACL_PM): number {
  return (((2 * dPm) / n) * Math.cos(thetaDeg * RAD) * Math.PI) / 180
}

/** port of braggsim.crystal.lorentz_polarization: (1 + cos² 2θ) / (2 sin 2θ), unpolarized beam. */
export function lorentzPolarization(thetaDeg: number): number {
  const twoTheta = 2 * thetaDeg * RAD
  return (1 + Math.cos(twoTheta) ** 2) / (2 * Math.sin(twoTheta))
}

/** port of braggsim.crystal.structure_factor_sq_rel: |F_n|²/|F_1|² for n = 1 … nMax, from the
 * exported table (xraylib FF_Rayl in Python). */
export function structureFactorSqRel(nMax: number): readonly number[] {
  if (nMax > STRUCTURE_FACTOR_SQ_REL.length) throw new RangeError(`table stops at n = ${STRUCTURE_FACTOR_SQ_REL.length}`)
  return STRUCTURE_FACTOR_SQ_REL.slice(0, nMax)
}
