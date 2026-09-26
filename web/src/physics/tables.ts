// Lookup data exported by model/scripts/export_artifacts.py. The browser never recomputes it.
import muRho from '../../../artifacts/tables/mu_rho.json'
import modelParams from '../../../artifacts/tables/model_params.json'
import structureFactor from '../../../artifacts/tables/structure_factor.json'

export const MU_RHO_GRID_PM: readonly number[] = muRho.lambda_pm
// The logs are taken once at load: transmission() interpolates log μ/ρ over log λ.
export const LOG_MU_RHO_GRID = Float64Array.from(muRho.lambda_pm, Math.log)
export const LOG_MU_RHO: Readonly<Record<string, Float64Array>> = Object.fromEntries(
  Object.entries(muRho.mu_rho_cm2_g).map(([m, t]) => [m, Float64Array.from(t, Math.log)]),
)
export const STRUCTURE_FACTOR_SQ_REL: readonly number[] = structureFactor.f_sq_rel
export const DEFAULT_PARAMS_JSON = modelParams.params
export const MODEL_VERSION = modelParams.model_version
