// Lookup data exported by model/scripts/export_artifacts.py. The browser never recomputes it.
import muRho from '../../../artifacts/tables/mu_rho.json'
import modelParams from '../../../artifacts/tables/model_params.json'
import type { Crystal } from './crystal'
import structureFactor from '../../../artifacts/tables/structure_factor.json'

export const MU_RHO_GRID_PM: readonly number[] = muRho.lambda_pm
// The logs are taken once at load: transmission() interpolates log μ/ρ over log λ.
export const LOG_MU_RHO_GRID = Float64Array.from(muRho.lambda_pm, Math.log)
const logMuRho: Record<string, Float64Array> = Object.fromEntries(
  Object.entries(muRho.mu_rho_cm2_g).map(([m, t]) => [m, Float64Array.from(t, Math.log)]),
)
export const LOG_MU_RHO: Readonly<Record<string, Float64Array>> = logMuRho

/** Foil set 554 832 (name → mg/cm²) and the two plates of the absorption accessory 554 834 (7 slots,
 * `null` = open); empty until loadAbsorbers() resolves. */
export const FOILS_MG_CM2: Record<string, number> = {}
export type Slot = readonly [string, number] | null
export const WHEELS_MG_CM2: Record<'al' | 'material', readonly Slot[]> = { al: [], material: [] }

export const absorbersLoaded = (): boolean => 'Zr' in logMuRho

/** Merge the absorber tables (Polystyrene … In, ~78 kB gzip) into LOG_MU_RHO. A separate chunk, fetched
 * only by the views that use filters; idempotent. Same λ grid as mu_rho.json. */
export async function loadAbsorbers(): Promise<void> {
  if (absorbersLoaded()) return
  const { default: absorbers } = await import('../../../artifacts/tables/mu_rho_absorbers.json')
  for (const [m, t] of Object.entries(absorbers.mu_rho_cm2_g as Record<string, number[]>)) logMuRho[m] = Float64Array.from(t, Math.log)
  Object.assign(FOILS_MG_CM2, absorbers.foils_mg_cm2)
  Object.assign(WHEELS_MG_CM2, absorbers.wheels_mg_cm2)
}
/** Crystal presets by name (LiF, NaCl, Si, calcite, muscovite); empty until loadCrystals() resolves. The NaCl
 * default path never needs it: it uses STRUCTURE_FACTOR_SQ_REL and D_NACL_PM. */
export const CRYSTALS: Record<string, Crystal> = {}
export const crystalsLoaded = (): boolean => 'NaCl' in CRYSTALS

/** Fill CRYSTALS from crystals.json (~52 kB gzip). A separate chunk, fetched only when a non-NaCl crystal is
 * chosen; idempotent. */
export async function loadCrystals(): Promise<void> {
  if (crystalsLoaded()) return
  const { default: t } = await import('../../../artifacts/tables/crystals.json')
  for (const [name, c] of Object.entries(t.crystals as unknown as Record<string, Omit<Crystal, 'name'>>)) CRYSTALS[name] = { name, ...c }
}
export const STRUCTURE_FACTOR_SQ_REL: readonly number[] = structureFactor.f_sq_rel
export const DEFAULT_PARAMS_JSON = modelParams.params
export const MODEL_VERSION = modelParams.model_version
