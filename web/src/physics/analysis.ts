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

/** Result of gaussFitFixed (port of braggsim.analysis.LineFit for a fixed-centre fit); sigmaKeV is one per line. */
export type LineFit = {
  area: number[]
  areaErr: number[]
  areaCov: number[][]
  centerKeV: number[]
  sigmaKeV: number[]
  chi2Dof: number
  channelKeV: number
  background: [number, number, number] // b0 + b1 (E − eRef), counts/channel
}

/** Solve M x = b for a symmetric positive-definite M by Gauss-Jordan with partial pivoting; returns [x, M⁻¹]. */
function solveInverse(M: number[][], b: number[]): [number[], number[][]] {
  const n = M.length
  const a = M.map((row, i) => [...row, ...b.slice(i, i + 1), ...row.map((_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r
    ;[a[c], a[p]] = [a[p], a[c]]
    const piv = a[c][c]
    if (!Number.isFinite(piv) || piv === 0) throw new RangeError('singular matrix')
    for (let j = c; j < a[c].length; j++) a[c][j] /= piv
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = a[r][c]
      if (f !== 0) for (let j = c; j < a[r].length; j++) a[r][j] -= f * a[c][j]
    }
  }
  return [a.map((row) => row[n]), a.map((row) => row.slice(n + 1))]
}

/** port of braggsim.analysis.gauss_fit_fixed: N Gaussians of fixed centre and σ (keV) plus a linear background,
 * weighted linear least squares (Neyman pass, then three Pearson passes). Default window: [min(c − 3σ), max(c + 3σ)].
 * Negative areas are returned as they are. The covariance is absolute (never scaled by χ²/dof), so area/areaErr on
 * expected counts is the expected significance; the fixed σ is exact on model spectra, check χ²/ν on real ones.
 * Throws RangeError where Python raises ValueError. */
export function gaussFitFixed(
  EKeV: ArrayLike<number>,
  counts: ArrayLike<number>,
  centersKeV: readonly number[],
  sigmaKeV: number | readonly number[],
  windowKeV?: readonly [number, number] | null,
): LineFit {
  const n = centersKeV.length
  if (n === 0) throw new RangeError('need at least one line')
  if (typeof sigmaKeV !== 'number' && sigmaKeV.length !== n) throw new RangeError('one sigma per centre')
  const sig = centersKeV.map((_, i) => (typeof sigmaKeV === 'number' ? sigmaKeV : sigmaKeV[i]))
  if (!centersKeV.every(Number.isFinite) || !sig.every(Number.isFinite)) throw new RangeError('centres and sigma must be finite')
  if (sig.some((s) => !(s > 0))) throw new RangeError('sigma must be positive')
  const sorted = [...centersKeV].sort((a, b) => a - b)
  const minSig = Math.min(...sig)
  if (sorted.some((c, i) => i > 0 && c - sorted[i - 1] < 0.5 * minSig)) throw new RangeError('centres too close')
  const lo = windowKeV ? windowKeV[0] : Math.min(...centersKeV.map((c, i) => c - 3 * sig[i]))
  const hi = windowKeV ? windowKeV[1] : Math.max(...centersKeV.map((c, i) => c + 3 * sig[i]))
  if (Math.min(...centersKeV) < lo || Math.max(...centersKeV) > hi) throw new RangeError('centre outside the window')
  const e: number[] = []
  const y: number[] = []
  for (let i = 0; i < EKeV.length; i++) if (EKeV[i] >= lo && EKeV[i] <= hi) (e.push(EKeV[i]), y.push(counts[i]))
  if (e.length < n + 3) throw new RangeError('too few channels in the window')
  const d = e.slice(1).map((v, i) => v - e[i]).sort((a, b) => a - b) // numpy median of the diffs
  const h = d.length >> 1
  const w = d.length % 2 ? d[h] : (d[h - 1] + d[h]) / 2
  const m = n + 2
  const A = e.map((x) => [1, x - e[0], ...centersKeV.map((c, i) => (w * Math.exp(-0.5 * ((x - c) / sig[i]) ** 2)) / (sig[i] * Math.sqrt(2 * Math.PI)))])
  let varr = y.map((v) => Math.max(v, 1))
  let p: number[] = []
  let cov: number[][] = []
  for (let pass = 0; pass < 4; pass++) {
    const M = Array.from({ length: m }, () => new Array<number>(m).fill(0))
    const v = new Array<number>(m).fill(0)
    for (let k = 0; k < e.length; k++) {
      const r = A[k]
      for (let i = 0; i < m; i++) {
        v[i] += (r[i] * y[k]) / varr[k]
        for (let j = 0; j < m; j++) M[i][j] += (r[i] * r[j]) / varr[k]
      }
    }
    ;[p, cov] = solveInverse(M, v)
    varr = A.map((r) => Math.max(r.reduce((s, a, i) => s + a * p[i], 0), 0.5))
  }
  let chi2 = 0
  A.forEach((r, k) => (chi2 += (y[k] - r.reduce((s, a, i) => s + a * p[i], 0)) ** 2 / varr[k]))
  const areaCov = Array.from({ length: n }, (_, i) => cov.slice(2)[i].slice(2))
  return {
    area: p.slice(2),
    areaErr: areaCov.map((row, i) => Math.sqrt(row[i])),
    areaCov,
    centerKeV: [...centersKeV],
    sigmaKeV: sig,
    chi2Dof: chi2 / Math.max(e.length - m, 1),
    channelKeV: w,
    background: [p[0], p[1], e[0]],
  }
}

/** port of braggsim.analysis.LineFit.evaluate: fitted Gaussians (no background) per line, counts/channel at each E. */
export function evaluateLineFit(fit: LineFit, EKeV: ArrayLike<number>): number[][] {
  return fit.area.map((a, i) => {
    const s = fit.sigmaKeV[i]
    return Array.from(EKeV, (x) => (a * fit.channelKeV * Math.exp(-0.5 * ((x - fit.centerKeV[i]) / s) ** 2)) / (s * Math.sqrt(2 * Math.PI)))
  })
}
