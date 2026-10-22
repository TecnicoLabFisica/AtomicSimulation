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
/** K, L1–L3 absorption edges (pm) of each material inside the grid, exported by Python and only read here. */
const edgesPm: Record<string, readonly number[]> = { ...muRho.edge_lambda_pm }
export const EDGES_PM: Readonly<Record<string, readonly number[]>> = edgesPm

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
  Object.assign(edgesPm, absorbers.edge_lambda_pm)
  Object.assign(FOILS_MG_CM2, absorbers.foils_mg_cm2)
  Object.assign(WHEELS_MG_CM2, absorbers.wheels_mg_cm2)
}
/** Crystal presets by name (LiF, NaCl, Si, calcite, muscovite); empty until loadCrystals() resolves. The NaCl
 * default path never needs it: it uses STRUCTURE_FACTOR_SQ_REL and D_NACL_PM. */
export const CRYSTALS: Record<string, Crystal> = {}
export const crystalsLoaded = (): boolean => 'NaCl' in CRYSTALS

export const deepFreeze = <T extends object>(o: T): T => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v)
  return Object.freeze(o)
}
/** Run `load` once however often the result is asked for; a rejection is forgotten so a retry runs it again. */
export function retryableOnce(load: () => Promise<void>): () => Promise<void> {
  let p: Promise<void> | undefined
  return () => (p ??= load().catch((e) => {
    p = undefined
    throw e
  }))
}

/** Fill CRYSTALS from crystals.json (~52 kB gzip). A separate chunk, fetched only when a non-NaCl crystal is
 * chosen; idempotent, one import however often it is called (a failed fetch can be retried). Entries are
 * deep-frozen: the tube cache and the μ cache key on object identity. */
export const loadCrystals = retryableOnce(async () => {
  const { default: t } = await import('../../../artifacts/tables/crystals.json')
  const rows = Object.entries(t.crystals as unknown as Record<string, Omit<Crystal, 'name'>>)
  for (const [name, c] of rows) CRYSTALS[name] = deepFreeze({ name, ...structuredClone(c) })
})
export const STRUCTURE_FACTOR_SQ_REL: readonly number[] = structureFactor.f_sq_rel
export const DEFAULT_PARAMS_JSON = modelParams.params
export const MODEL_VERSION = modelParams.model_version

/** One row of forge_elements.json (port of the dict braggsim.forge.element_tables builds for one Z). */
export type ForgeElement = {
  symbol: string
  atomic_weight: number // g/mol
  f0: readonly number[] // Rayleigh form factor, uniform in s = sin θ/λ (Å⁻¹) with step f0_step_A
  idx: readonly number[] // nodes of MU_RHO_GRID_PM kept for this element
  sigma_cm2: readonly number[] // atomic cross-section on those nodes
  f_prime: readonly number[]
  f_second: readonly number[] // xraylib sign: negative
  edges_pm: readonly number[]
  edge_sigma_cm2: readonly (readonly [number, number])[] // σ on the short-λ and long-λ side of each edge
}
/** Per-element tables of the Materials Forge (Z = 1 … 92, index Z − 1); empty until loadForgeElements() resolves. */
/** The limits Python exports with the tables (braggsim.forge.CONSTANTS): one source for both languages. */
export type ForgeConstants = {
  min_atom_distance_pm: number
  many_orders: number
  max_orders: number
  n_points: number // extinction quadrature of a forged crystal (presets: 2001)
  max_b_A2: number
}
export const FORGE: { f0_step_A: number; elements: readonly ForgeElement[]; constants: ForgeConstants } = {
  f0_step_A: 0,
  elements: [],
  constants: { min_atom_distance_pm: 0, many_orders: 0, max_orders: 0, n_points: 0, max_b_A2: 0 },
}
export const forgeElementsLoaded = (): boolean => FORGE.elements.length > 0

/** Fill FORGE from forge_elements.json (~148 kB gzip, 150.6 kB as built). A separate chunk, fetched only by the Forge; idempotent,
 * one import however often it is called (a failed fetch can be retried). */
export const loadForgeElements = retryableOnce(async () => {
  const { default: t } = await import('../../../artifacts/tables/forge_elements.json')
  FORGE.f0_step_A = t.f0_step_A
  FORGE.constants = t.constants
  FORGE.elements = deepFreeze(structuredClone(t.elements) as unknown as ForgeElement[])
})
