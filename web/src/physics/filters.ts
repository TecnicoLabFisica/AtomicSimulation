// port of braggsim.filters: transmission through absorbers, μ/ρ from artifacts/tables/mu_rho.json
// (xraylib CS_Total_CP in Python), interpolated log–log with the end values held
// and each absorption edge kept sharp (see logMuRho).
import { interp } from './numpy'
import { EDGES_PM, LOG_MU_RHO, LOG_MU_RHO_GRID, MU_RHO_GRID_PM } from './tables'

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

const EMPTY: readonly number[] = []
type EdgeInterval = readonly [number, number] // [grid interval i, edge λ_e]
const intervalCache = new WeakMap<readonly number[], readonly EdgeInterval[]>()

/** port of braggsim.filters.edge_intervals: each edge paired with its grid interval i (g_i ≤ λ_e < g_{i+1});
 * edges outside the grid are skipped; throws when two edges share or neighbour an interval. */
function edgeIntervals(edgesPm: readonly number[]): readonly EdgeInterval[] {
  let out = intervalCache.get(edgesPm)
  if (!out) {
    const list: EdgeInterval[] = []
    const n = MU_RHO_GRID_PM.length
    for (const e of edgesPm) {
      if (!(e >= MU_RHO_GRID_PM[0] && e < MU_RHO_GRID_PM[n - 1])) continue
      let i = 0
      while (MU_RHO_GRID_PM[i + 1] <= e) i++
      if (list.length && i - list[list.length - 1][0] <= 1) throw new RangeError(`edges ${list[list.length - 1][1]} and ${e} pm share or neighbour a grid interval`)
      list.push([i, e])
    }
    intervalCache.set(edgesPm, (out = list))
  }
  return out
}

/** port of braggsim.filters.interp_log_mu: log of a quantity tabulated on MU_RHO_GRID_PM (`logTable` = its logs) at
 * λ, log–log interpolated with the end values held and each absorption edge sharp: in the grid interval holding an
 * edge, extrapolated from the two nodes on λ's side of it (λ < λ_e: i−1, i; λ ≥ λ_e: i+1, i+2); at a grid end the
 * end value is held. */
export function interpLogMu(lambdaPm: number, logTable: ArrayLike<number>, edgesPm: readonly number[] = EMPTY): number {
  const x = Math.log(lambdaPm)
  let logMu = interp(x, LOG_MU_RHO_GRID, logTable)
  const g = LOG_MU_RHO_GRID
  const n = g.length
  for (const [i, e] of edgeIntervals(edgesPm)) {
    if (!(lambdaPm >= MU_RHO_GRID_PM[i] && lambdaPm <= MU_RHO_GRID_PM[i + 1])) continue
    if (lambdaPm < e) {
      logMu = i >= 1 ? logTable[i] + ((logTable[i] - logTable[i - 1]) / (g[i] - g[i - 1])) * (x - g[i]) : logTable[0]
    } else {
      logMu = i + 2 < n ? logTable[i + 1] + ((logTable[i + 2] - logTable[i + 1]) / (g[i + 2] - g[i + 1])) * (x - g[i + 1]) : logTable[n - 1]
    }
  }
  return logMu
}

/** port of braggsim.filters.log_mu_rho: log μ/ρ at λ, edges kept sharp. */
export function logMuRho(lambdaPm: number, material: string): number {
  const tab = LOG_MU_RHO[material]
  if (!tab) throw new RangeError(`no μ/ρ table for ${material}`)
  return interpLogMu(lambdaPm, tab, EDGES_PM[material] ?? EMPTY)
}

/** port of braggsim.filters.transmission: T = exp(−μ/ρ · ρx) through `arealDensityMgCm2` of `material`. */
export function transmission(lambdaPm: number, material: string, arealDensityMgCm2: number): number {
  return Math.exp((-Math.exp(logMuRho(lambdaPm, material)) * arealDensityMgCm2) / 1000)
}

/** The absorption edges (pm, ascending, unique) of the materials of `filters` with a positive areal density. */
export function filterEdgesPm(filters: Filters): number[] {
  const edges = new Set<number>()
  for (const [m, d] of filters) if (d > 0) for (const e of EDGES_PM[m] ?? EMPTY) edges.add(e)
  return [...edges].sort((a, b) => a - b)
}
