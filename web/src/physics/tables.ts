// Lookup data exported by model/scripts/export_artifacts.py. The browser never recomputes it.
import muRho from '../../../artifacts/tables/mu_rho.json'
import modelParams from '../../../artifacts/tables/model_params.json'
import structureFactor from '../../../artifacts/tables/structure_factor.json'

export const MU_RHO_GRID_PM: readonly number[] = muRho.lambda_pm
// The logs are taken once at load: transmission() interpolates log μ/ρ over log λ.
export const LOG_MU_RHO_GRID = Float64Array.from(muRho.lambda_pm, Math.log)
const logMuRho: Record<string, Float64Array> = Object.fromEntries(
  Object.entries(muRho.mu_rho_cm2_g).map(([m, t]) => [m, Float64Array.from(t, Math.log)]),
)
export const LOG_MU_RHO: Readonly<Record<string, Float64Array>> = logMuRho

/** Merge the absorber tables (Polystyrene … In, ~78 kB gzip) into LOG_MU_RHO. A separate chunk, fetched
 * only by the views that use filters; idempotent. Same λ grid as mu_rho.json. */
export async function loadAbsorbers(): Promise<void> {
  if ('Zr' in logMuRho) return
  const { default: absorbers } = await import('../../../artifacts/tables/mu_rho_absorbers.json')
  for (const [m, t] of Object.entries(absorbers.mu_rho_cm2_g as Record<string, number[]>)) logMuRho[m] = Float64Array.from(t, Math.log)
}
export const STRUCTURE_FACTOR_SQ_REL: readonly number[] = structureFactor.f_sq_rel
export const DEFAULT_PARAMS_JSON = modelParams.params
export const MODEL_VERSION = modelParams.model_version
