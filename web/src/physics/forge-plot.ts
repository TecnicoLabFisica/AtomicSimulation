// TS-only (not physics): the would-be spectrum of a forged crystal beside NaCl, for the Forge view. It only calls
// expectedRate (the expected rate R̄, no noise) at the reference tube state; it is computed in the worker because a large
// cell costs ~0.6 s on first call (NaCl ~50 ms), too long for the main thread.
import { NACL, type Crystal } from './crystal'
import { BETA_MAX_DEG, DEFAULT, coupledBetas, expectedRate } from './scan'

export const PLOT_U_KV = 35
export const PLOT_I_MA = 1
export const PLOT_LO_DEG = 2.5
export const PLOT_STEP_DEG = 0.1

export type WouldBeSpectrum = { beta_deg: Float64Array; crystal: Float64Array; nacl: Float64Array }

let naclRate: Float64Array | undefined // the comparison never changes
const rate = (b: Float64Array, c: Crystal) => expectedRate(b, PLOT_U_KV, PLOT_I_MA, DEFAULT, undefined, [], c)

/** R̄(β) in counts/s of the coupled scan at 35 kV, 1 mA, no filters, for `crystal` and for NaCl. Needs loadCrystals(). */
export function wouldBeSpectrum(crystal: Crystal): WouldBeSpectrum {
  const b = coupledBetas(PLOT_LO_DEG, BETA_MAX_DEG, PLOT_STEP_DEG)
  naclRate ??= rate(b, NACL)
  return { beta_deg: b, crystal: rate(b, crystal), nacl: naclRate }
}
