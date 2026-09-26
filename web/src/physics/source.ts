// port of braggsim.source: bremsstrahlung continuum and Mo K lines of the tube, in relative units.
import { HC_KEV_PM, KB_KA_RATIO, MO_K_EDGE_KEV } from './constants'

// Exponent m of I_K ∝ I (U/U_K − 1)^m, from the literature (Green & Cosslett 1968); model/PARAMETERS.md.
export const LINE_EXPONENT_M = 1.67

/** port of braggsim.source.lambda_min_pm: Duane–Hunt limit hc / (e U) in pm (Infinity at U = 0). */
export function lambdaMinPm(UkV: number): number {
  return HC_KEV_PM / UkV
}

/** port of braggsim.source.continuum: Kramers photon rate per pm, I (λ/λ_min − 1) / λ², 0 for λ ≤ λ_min. */
export function continuum(lambdaPm: number, UkV: number, ImA: number): number {
  const lamMin = lambdaMinPm(UkV)
  return lambdaPm > lamMin ? (ImA * (lambdaPm / lamMin - 1)) / lambdaPm ** 2 : 0
}

/** port of braggsim.source.line_rates: [Kα, Kβ] photon rates, zero unless U > U_K. */
export function lineRates(UkV: number, ImA: number, lineToCont: number): [number, number] {
  if (UkV <= MO_K_EDGE_KEV) return [0, 0]
  const ka = lineToCont * ImA * (UkV / MO_K_EDGE_KEV - 1) ** LINE_EXPONENT_M
  return [ka, KB_KA_RATIO * ka]
}
