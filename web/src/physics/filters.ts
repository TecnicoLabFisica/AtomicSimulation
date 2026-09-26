// port of braggsim.filters: transmission through absorbers, μ/ρ from artifacts/tables/mu_rho.json
// (xraylib CS_Total_CP in Python), interpolated log–log with the end values held.
import { interp } from './numpy'
import { LOG_MU_RHO, LOG_MU_RHO_GRID } from './tables'

/** port of braggsim.filters.transmission: T = exp(−μ/ρ · ρx) through `arealDensityMgCm2` of `material`. */
export function transmission(lambdaPm: number, material: string, arealDensityMgCm2: number): number {
  const table = LOG_MU_RHO[material]
  if (!table) throw new RangeError(`no μ/ρ table for ${material}`)
  const logMu = interp(Math.log(lambdaPm), LOG_MU_RHO_GRID, table)
  return Math.exp((-Math.exp(logMu) * arealDensityMgCm2) / 1000)
}
