// Noise is tested statistically, never sample by sample against numpy (web-physics-port rule).
import { expect, test } from 'vitest'
import { deadTime, logGamma, mulberry32, poisson, sampleCounts } from '../src/physics/detector'

test.each([0.5, 5, 9.99, 10, 50, 1e5])('Poisson(%s): mean and variance match λ', (lam) => {
  const rng = mulberry32(42)
  const N = 200_000
  let s = 0
  let s2 = 0
  for (let i = 0; i < N; i++) {
    const k = poisson(lam, rng)
    expect(Number.isInteger(k) && k >= 0).toBe(true)
    s += k
    s2 += k * k
  }
  const mean = s / N
  const variance = s2 / N - mean * mean
  // Standard errors: √(λ/N) for the mean, ≈ λ √(2/N) for the variance; allow 5σ.
  expect(Math.abs(mean - lam)).toBeLessThan(5 * Math.sqrt(lam / N))
  expect(Math.abs(variance - lam)).toBeLessThan(5 * Math.sqrt((2 * lam * lam + lam) / N))
})

// χ² goodness of fit over bins with ≥ 20 expected counts (tails pooled into the end bins). Covers
// both samplers: the multiplication method (λ < 10) and PTRS (λ ≥ 10).
test.each([3, 10, 200])('Poisson(%s): the histogram follows the pmf (χ²)', (lam) => {
  const rng = mulberry32(7)
  const N = 400_000
  const counts = new Map<number, number>()
  for (let i = 0; i < N; i++) {
    const k = poisson(lam, rng)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const pmf = (k: number) => Math.exp(-lam + k * Math.log(lam) - logGamma(k + 1))
  const ks: number[] = []
  for (let k = 0; k < lam + 20 * Math.sqrt(lam) + 20; k++) if (N * pmf(k) >= 20) ks.push(k)
  const [lo, hi] = [ks[0], ks.at(-1)!]
  let chi2 = 0
  let pLo = 0
  let pHi = 1
  let nLo = 0
  let nHi = 0
  for (const [k, n] of counts) {
    if (k <= lo) nLo += n
    else if (k >= hi) nHi += n
  }
  for (let k = 0; k <= lo; k++) pLo += pmf(k)
  for (let k = 0; k < hi; k++) pHi -= pmf(k)
  for (let k = lo + 1; k < hi; k++) chi2 += ((counts.get(k) ?? 0) - N * pmf(k)) ** 2 / (N * pmf(k))
  chi2 += (nLo - N * pLo) ** 2 / (N * pLo) + (nHi - N * pHi) ** 2 / (N * pHi)
  const dof = hi - lo
  expect(chi2).toBeLessThan(dof + 5 * Math.sqrt(2 * dof))
})

test('logGamma(k + 1) = log k! exactly enough to catch a wrong Stirling coefficient', () => {
  let logFact = 0
  for (let k = 0; k <= 30; k++) {
    if (k > 0) logFact += Math.log(k)
    expect(Math.abs(logGamma(k + 1) - logFact)).toBeLessThan(1e-13 * Math.max(1, logFact))
  }
})

test('sampleCounts scales the rate by the gate time; zero rate gives zero', () => {
  const rng = mulberry32(1)
  expect(Array.from(sampleCounts([0, 0], 10, rng))).toEqual([0, 0])
  const counts = sampleCounts(new Array(20_000).fill(3), 10, rng)
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  expect(Math.abs(mean - 30)).toBeLessThan(5 * Math.sqrt(30 / counts.length))
  expect(() => poisson(-1, rng)).toThrow()
  expect(() => poisson(NaN, rng)).toThrow()
})

test('deadTime: non-paralyzable R/(1 + Rτ), saturating at 1/τ', () => {
  expect(deadTime(0, 1e-4)).toBe(0)
  expect(deadTime(1e4, 1e-4)).toBeCloseTo(5000, 9)
  expect(deadTime(1e12, 1e-4)).toBeLessThan(1e4)
})
