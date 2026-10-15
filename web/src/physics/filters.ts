// port of braggsim.filters: transmission through absorbers, μ/ρ from artifacts/tables/mu_rho.json
// (xraylib CS_Total_CP in Python), interpolated log–log with the end values held.
import { interp } from './numpy'
import { LOG_MU_RHO, LOG_MU_RHO_GRID } from './tables'

/** Absorbers in the beam: `[material, areal density in mg/cm²]` each. */
export type Filters = readonly (readonly [string, number])[]

/** port of braggsim.filters.ABSORBERS: the materials with a table in mu_rho_absorbers.json. */
export const ABSORBERS = ['Polystyrene', 'Al', 'Fe', 'Cu', 'Zr', 'Mo', 'Ag', 'In'] as const

/** port of braggsim.filters.check_filters: a known absorber, areal density finite and ≥ 0. */
export function checkFilters(filters: Filters): void {
  for (const [m, d] of filters) {
    if (!(ABSORBERS as readonly string[]).includes(m)) throw new RangeError(`no μ/ρ table for filter ${m}`)
    if (!(Number.isFinite(d) && d >= 0)) throw new RangeError(`filter areal density must be finite and ≥ 0: ${d}`)
  }
}

/** port of braggsim.filters.transmission: T = exp(−μ/ρ · ρx) through `arealDensityMgCm2` of `material`. */
export function transmission(lambdaPm: number, material: string, arealDensityMgCm2: number): number {
  const table = LOG_MU_RHO[material]
  if (!table) throw new RangeError(`no μ/ρ table for ${material}`)
  const logMu = interp(Math.log(lambdaPm), LOG_MU_RHO_GRID, table)
  return Math.exp((-Math.exp(logMu) * arealDensityMgCm2) / 1000)
}
