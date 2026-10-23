// port of braggsim.analysis: the scan-quality limits of the line finder (constants only; the peak
// fitting and the teacher key stay in Python).

import { MO_KA_PM, MO_KB_PM } from './constants'
import { NACL, allowedOrders, dPm, thetaFromLambda, type Crystal } from './crystal'
import type { Filters } from './filters'
import { DEFAULT, expectedRate, type ModelParams } from './scan'
import { lineRates } from './source'

/** port of braggsim.analysis.PEAK_HALF_WINDOW_DEG: half-width of a marked peak region, in °. */
export const PEAK_HALF_WINDOW_DEG = 0.7
/** port of braggsim.analysis.MIN_PROMINENCE_SIGMA: a line stands this many Poisson σ above its background. */
export const MIN_PROMINENCE_SIGMA = 5
/** port of braggsim.analysis.MAX_STEP_DEG: coarsest Δβ that still resolves a line, in °. */
export const MAX_STEP_DEG = 0.23
/** port of braggsim.analysis.EDGE_SPLIT_HALF_WINDOW_DEG: half-width of each side of the coarse K-edge split, in °. */
export const EDGE_SPLIT_HALF_WINDOW_DEG = 0.3
/** port of braggsim.analysis.MAX_EDGE_STEP_DEG: coarsest Δβ that k_edge_deg accepts (2 points per side), in °. */
export const MAX_EDGE_STEP_DEG = 0.15

/** port of braggsim.analysis.line_prominences: expected [θ in °, peak rate in 1/s, prominence in σ] of every Mo K line
 * (Kβ and Kα of each allowed order) with its Bragg angle in [betaLoDeg, betaHiDeg], ascending in θ. From R̄ alone: the peak is
 * R̄(θ); the background is the larger of R̄ at θ ± PEAK_HALF_WINDOW_DEG, each end cut at the midpoint to the neighbouring line
 * (every line of the crystal is a neighbour, scanned or not); prominence = (peak − background)·Δt / √max(peak·Δt, 1), negative for a
 * line below its own background. Empty below the Mo K threshold, where the tube emits no line (source.line_rates is zero). */
export function lineProminences(
  betaLoDeg: number,
  betaHiDeg: number,
  UkV: number,
  ImA: number,
  dtS: number,
  filters: Filters = [],
  crystal: Crystal = NACL,
  params: ModelParams = DEFAULT,
): [number, number, number][] {
  if (lineRates(UkV, ImA, params.line_to_cont).every((r) => r === 0)) return []
  const d = dPm(crystal)
  const lines = allowedOrders(crystal)
    .flatMap((n) => [thetaFromLambda(MO_KB_PM, n, d), thetaFromLambda(MO_KA_PM, n, d)])
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const w = PEAK_HALF_WINDOW_DEG
  const pts: number[] = []
  const kept: number[] = []
  lines.forEach((th, k) => {
    if (!(betaLoDeg <= th && th <= betaHiDeg)) return
    const lo = k > 0 ? Math.max(th - w, (th + lines[k - 1]) / 2) : th - w
    const hi = k + 1 < lines.length ? Math.min(th + w, (th + lines[k + 1]) / 2) : th + w
    pts.push(th, lo, hi)
    kept.push(th)
  })
  if (kept.length === 0) return []
  const rate = expectedRate(pts, UkV, ImA, params, null, filters, crystal)
  return kept.map((th, i) => {
    const [peak, lo, hi] = [rate[3 * i], rate[3 * i + 1], rate[3 * i + 2]]
    return [th, peak, ((peak - Math.max(lo, hi)) * dtS) / Math.sqrt(Math.max(peak * dtS, 1))]
  })
}

/** port of braggsim.analysis.line_prominence_sigma: the largest prominence (σ) in the window, clamped at 0 (0 when no line stands above its background). */
export const lineProminenceSigma = (...args: Parameters<typeof lineProminences>): number =>
  Math.max(0, ...lineProminences(...args).map((r) => r[2]))

/** port of braggsim.analysis.strongest_line_rate_per_s: expected peak rate (1/s) of the line with the largest prominence σ
 * (Δt = 1 s), not the largest R̄ (the direct-beam leak can out-shine a line yet sit below its background); 0 if no line. */
export function strongestLineRatePerS(
  betaLoDeg: number,
  betaHiDeg: number,
  UkV: number,
  ImA: number,
  filters: Filters = [],
  crystal: Crystal = NACL,
  params: ModelParams = DEFAULT,
): number {
  let best: [number, number, number] | undefined
  for (const r of lineProminences(betaLoDeg, betaHiDeg, UkV, ImA, 1, filters, crystal, params)) if (!best || r[2] > best[2]) best = r
  return best ? best[1] : 0
}

/** port of braggsim.analysis.two_point_calibration: E = kevPerChannel · ch + offsetKeV from two known lines. */
export function twoPointCalibration(ch1: number, E1KeV: number, ch2: number, E2KeV: number): { kevPerChannel: number; offsetKeV: number } {
  if (ch1 === ch2) throw new RangeError('the two channels must differ')
  const kevPerChannel = (E2KeV - E1KeV) / (ch2 - ch1)
  return { kevPerChannel, offsetKeV: E1KeV - kevPerChannel * ch1 }
}
