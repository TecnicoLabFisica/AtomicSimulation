// port of braggsim.crystal: Bragg geometry at the NaCl monocrystal, n λ = 2 d sin θ
// (LD P6.3.3.1, Eq. I). θ is the glancing angle in degrees. Scalar functions: map them over arrays.
import { D_NACL_PM } from './constants'
import { interp } from './numpy'
import { CRYSTALS, LOG_MU_RHO_GRID, STRUCTURE_FACTOR_SQ_REL } from './tables'

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

/** port of braggsim.crystal.Crystal, as exported to artifacts/tables/crystals.json (the atom basis stays in
 * Python; the derived tables are what the browser needs). */
export type Crystal = Readonly<{
  name: string
  a_pm: number
  b_pm: number
  c_pm: number
  alpha_deg: number
  beta_deg: number
  gamma_deg: number
  cut: readonly number[] // (h, k, l) of the first reflection of the series
  d_pm: number // spacing of that first reflection
  density_g_cm3: number
  max_order: number // at 35 kV
  cell_scale: number // (|F_1|²/V²) / (|F_1|²/V²)_NaCl
  f_sq_rel: readonly number[] // |F_n|²/|F_1|², n = 1 … max_order
  mu_per_cm: readonly number[] // linear attenuation on MU_RHO_GRID_PM; empty for the built-in NACL
  fitted_debye_waller: boolean // true only for the NaCl anchor
  reflectivity_model: string
  source: string
}>

/** port of braggsim.crystal.NACL: the calibrated anchor, available without crystals.json. Its mu_per_cm table
 * lives in CRYSTALS.NaCl once loadCrystals() has run (only non-NaCl crystals need it). */
export const NACL: Crystal = Object.freeze({
  name: 'NaCl', a_pm: 564.02, b_pm: 564.02, c_pm: 564.02, alpha_deg: 90, beta_deg: 90, gamma_deg: 90,
  cut: [2, 0, 0], d_pm: D_NACL_PM, density_g_cm3: 2.1641351917042018, max_order: 15, cell_scale: 1,
  f_sq_rel: STRUCTURE_FACTOR_SQ_REL.slice(0, 15), mu_per_cm: [], fitted_debye_waller: true,
  reflectivity_model: 'ideal_mosaic', source: 'LD P6.3.3.1 (a0 = 564.02 pm, d = 282.01 pm)',
}) // prettier-ignore

/** Python tests `crystal is NACL`: the built-in constant, or the loaded table's NaCl entry (same data, other object). */
export const isNacl = (crystal: Crystal): boolean => crystal === NACL || crystal === CRYSTALS.NaCl

/** A preset by name. NaCl is the built-in NACL (no table needed); anything else needs loadCrystals() and a known
 * name, else it throws, so a typo or a missing load never falls back to NaCl silently. (Lives here, not in tables.ts,
 * because NACL is built from tables.ts at module load: the reverse import would be circular.) */
export function crystalByName(name: string): Crystal {
  if (name === NACL.name) return NACL
  if (!Object.hasOwn(CRYSTALS, name)) throw new RangeError(`crystal ${name}: unknown or not loaded (await loadCrystals())`)
  return CRYSTALS[name]
}

/** port of braggsim.crystal.d_pm: spacing in pm of the first reflection of the cut series. */
export const dPm = (crystal: Crystal): number => crystal.d_pm

const logMuCache = new WeakMap<Crystal, Float64Array>()
function logMuPerCm(crystal: Crystal): Float64Array {
  let t = logMuCache.get(crystal)
  if (!t) {
    if (crystal.mu_per_cm.length === 0) throw new Error(`${crystal.name}: no μ table (await loadCrystals())`)
    logMuCache.set(crystal, (t = Float64Array.from(crystal.mu_per_cm, Math.log)))
  }
  return t
}

/** port of braggsim.crystal.linear_attenuation_per_cm: μ(λ) in 1/cm, log–log, end values held. */
export function linearAttenuationPerCm(crystal: Crystal, lambdaPm: number): number {
  return Math.exp(interp(Math.log(lambdaPm), LOG_MU_RHO_GRID, logMuPerCm(crystal)))
}

/** port of braggsim.crystal.mu_factor: μ_NaCl(λ) / μ_crystal(λ), 1 for NaCl. Needs loadCrystals(). */
export function muFactor(crystal: Crystal, lambdaPm: number): number {
  if (isNacl(crystal)) return 1
  const nacl = CRYSTALS.NaCl
  if (!nacl) throw new Error('crystals not loaded (await loadCrystals())')
  return linearAttenuationPerCm(nacl, lambdaPm) / linearAttenuationPerCm(crystal, lambdaPm)
}
