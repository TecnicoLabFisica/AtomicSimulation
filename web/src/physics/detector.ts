// port of braggsim.detector: Geiger–Müller end-window counter (LD 559 01), dead time and noise.

/** port of braggsim.detector.dead_time: non-paralyzable counter, R_obs = R / (1 + R τ), counts/s. */
export function deadTime(ratePerS: number, tauS: number): number {
  return ratePerS / (1 + ratePerS * tauS)
}

/** Uniform random numbers in [0, 1). */
export type Rng = () => number

/** port of braggsim.detector.sample_counts: Poisson counts in a gate of `dtS` seconds for expected
 * rates `RBar` (1/s). The only source of randomness; divide by dtS for the displayed rate. */
export function sampleCounts(RBar: ArrayLike<number>, dtS: number, rng: Rng): Float64Array {
  return Float64Array.from(RBar, (r) => poisson(r * dtS, rng))
}

/** Poisson deviate with mean `lam`, the algorithms numpy uses: multiplication of uniforms below 10,
 * PTRS above (Hörmann, Insurance Math. Econom. 12, 39 (1993)). Streams differ from numpy's; only
 * the statistics match (web-physics-port rule). */
export function poisson(lam: number, rng: Rng): number {
  if (!(lam >= 0 && Number.isFinite(lam))) throw new RangeError(`Poisson mean must be finite and ≥ 0: ${lam}`)
  if (lam === 0) return 0
  if (lam < 10) {
    const enlam = Math.exp(-lam)
    let x = 0
    let prod = rng()
    while (prod > enlam) {
      x++
      prod *= rng()
    }
    return x
  }
  const slam = Math.sqrt(lam)
  const loglam = Math.log(lam)
  const b = 0.931 + 2.53 * slam
  const a = -0.059 + 0.02483 * b
  const invalpha = 1.1239 + 1.1328 / (b - 3.4)
  const vr = 0.9277 - 3.6224 / (b - 2)
  for (;;) {
    const U = rng() - 0.5
    const V = rng()
    const us = 0.5 - Math.abs(U)
    const k = Math.floor(((2 * a) / us + b) * U + lam + 0.43)
    if (us >= 0.07 && V <= vr) return k
    if (k < 0 || (us < 0.013 && V > us)) continue
    if (Math.log(V) + Math.log(invalpha) - Math.log(a / (us * us) + b) <= -lam + k * loglam - logGamma(k + 1))
      return k
  }
}

// log Γ(x) for x ≥ 1 by the Stirling series, as numpy's random_loggam.
const LOGGAM_A = [
  8.333333333333333e-2, -2.777777777777778e-3, 7.936507936507937e-4, -5.952380952380952e-4, 8.417508417508418e-4,
  -1.917526917526918e-3, 6.41025641025641e-3, -2.955065359477124e-2, 1.796443723688307e-1, -1.3924322169059,
]
export function logGamma(x: number): number {
  if (x === 1 || x === 2) return 0
  const n = x < 7 ? Math.floor(7 - x) : 0
  let x0 = x + n
  const x2 = (1 / x0) * (1 / x0)
  let gl0 = LOGGAM_A[9]
  for (let k = 8; k >= 0; k--) gl0 = gl0 * x2 + LOGGAM_A[k]
  let gl = gl0 / x0 + 0.5 * 1.8378770664093453 + (x0 - 0.5) * Math.log(x0) - x0
  for (let k = 1; k <= n; k++) {
    gl -= Math.log(x0 - 1)
    x0 -= 1
  }
  return gl
}

/** Seeded uniform generator (mulberry32), the TS stand-in for numpy.random.Generator. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// LD 559 938 Si-PIN energy detector, port of braggsim.detector (model/PARAMETERS.md, 2026-10-22).
export const PIN_SIGMA_EL_KEV = 0.16
export const PIN_FANO = 0.15
export const PIN_EPS_KEV = 0.0038
export const PIN_DEAD_TIME_S = 250e-6
const FWHM_PER_SIGMA = 2 * Math.sqrt(2 * Math.log(2))
export const MCA_FULL_SCALE_KEV_AT_REF_GAIN = 40.0
export const MCA_REF_GAIN = 2.5

/** port of braggsim.detector.pin_fwhm_keV: FWHM in keV of the Gaussian line response. */
export function pinFwhmKeV(EkeV: number): number {
  return FWHM_PER_SIGMA * Math.sqrt(PIN_SIGMA_EL_KEV ** 2 + PIN_FANO * PIN_EPS_KEV * EkeV)
}

/** port of braggsim.detector.kev_per_channel: channel width in keV; throws for gain 0, n not an integer ≥ 1 or a channel wider than σ_el. */
export function kevPerChannel(nChannels = 512, gain = -2.5): number {
  if (!(Math.abs(gain) > 0 && Number.isInteger(nChannels) && nChannels >= 1))
    throw new RangeError('gain must be non-zero and n_channels an integer >= 1')
  const kpc = (MCA_FULL_SCALE_KEV_AT_REF_GAIN * (MCA_REF_GAIN / Math.abs(gain))) / nChannels
  if (kpc > PIN_SIGMA_EL_KEV) throw new RangeError(`channel width ${kpc.toFixed(3)} keV exceeds the line σ ${PIN_SIGMA_EL_KEV} keV`)
  return kpc
}

/** port of braggsim.detector.mca_live_time: t_s / (1 + R τ) of a non-paralyzable counter. */
export function mcaLiveTime(totalRatePerS: number, tS: number): number {
  return tS / (1 + totalRatePerS * PIN_DEAD_TIME_S)
}

/** Add `weight` × a unit-area Gaussian (port of detector._gauss_per_channel) at `e0` sampled at the channel centres. */
function addGauss(pulses: Float64Array, eCh: Float64Array, e0: number, fwhm: number, weight: number, kpc: number): void {
  const sig = fwhm / FWHM_PER_SIGMA
  const norm = sig * Math.sqrt(2 * Math.PI)
  for (let i = 0; i < pulses.length; i++) pulses[i] += weight * (Math.exp(-0.5 * ((eCh[i] - e0) / sig) ** 2) / norm) * kpc
}

/** A scatter continuum for mcaCounts: ascending energies, rate per keV, and `pin_efficiency` at the interval midpoints. */
export type McaContinuum = { eKeV: ArrayLike<number>; ratePerS_perKeV: ArrayLike<number>; pinEffMid: ArrayLike<number> }

/** port of braggsim.detector.mca_counts: expected counts per channel over `tS` of real time. `lines` are
 * [energy_keV, rate_per_s, pin_efficiency(energy)] (the efficiency comes from the exported table, not xraylib).
 * Returns the counts, the live time and the channel energies. */
export function mcaCounts(
  lines: readonly (readonly [number, number, number])[],
  continuum: readonly McaContinuum[],
  tS: number,
  nChannels = 512,
  gain = -2.5,
): { counts: Float64Array; liveTimeS: number; channelEnergyKeV: Float64Array } {
  if (!(tS >= 0)) throw new RangeError('t_s must be >= 0')
  const kpc = kevPerChannel(nChannels, gain)
  const eCh = Float64Array.from({ length: nChannels }, (_, i) => i * kpc)
  const pulses = new Float64Array(nChannels)
  let total = 0
  for (const [e0, rate, eff] of lines) {
    const r = rate * eff
    total += r
    addGauss(pulses, eCh, e0, pinFwhmKeV(e0), r, kpc)
  }
  for (const { eKeV: e, ratePerS_perKeV: dens, pinEffMid } of continuum) {
    let sum = 0
    for (let i = 0; i + 1 < e.length; i++) {
      const em = 0.5 * (e[i + 1] + e[i])
      const rm = 0.5 * (dens[i + 1] + dens[i]) * (e[i + 1] - e[i]) * pinEffMid[i]
      sum += rm
      if (rm > 0 && em < eCh[nChannels - 1] + 5) addGauss(pulses, eCh, em, pinFwhmKeV(em), rm, kpc)
    }
    total += sum
  }
  const live = mcaLiveTime(total, tS)
  for (let i = 0; i < nChannels; i++) pulses[i] *= live
  return { counts: pulses, liveTimeS: live, channelEnergyKeV: eCh }
}
