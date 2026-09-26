// The numpy semantics the Python model relies on, mirrored exactly: parity with the fixtures
// (1e-9 relative) depends on the same end-value, tie-breaking and centring rules.

/** np.interp for one x: linear between the bracketing nodes, end values held outside xp. */
export function interp(x: number, xp: ArrayLike<number>, fp: ArrayLike<number>): number {
  const last = xp.length - 1
  if (!(x > xp[0])) return x === x ? fp[0] : NaN
  if (x >= xp[last]) return fp[last]
  let lo = 0
  let hi = last // invariant: xp[lo] <= x < xp[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xp[mid] <= x) lo = mid
    else hi = mid
  }
  const slope = (fp[hi] - fp[lo]) / (xp[hi] - xp[lo])
  return slope * (x - xp[lo]) + fp[lo]
}

/** np.trapezoid(y, x): Σ Δx_i (y_i + y_{i+1}) / 2. */
export function trapezoid(y: ArrayLike<number>, x: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i + 1 < x.length; i++) sum += ((x[i + 1] - x[i]) * (y[i + 1] + y[i])) / 2
  return sum
}

/** np.convolve(a, kernel, mode="same") for an odd-length kernel no longer than a. */
export function convolveSame(a: ArrayLike<number>, kernel: ArrayLike<number>): Float64Array {
  const half = (kernel.length - 1) / 2
  const out = new Float64Array(a.length)
  for (let i = 0; i < a.length; i++) {
    let s = 0
    const kLo = Math.max(0, i + half - (a.length - 1))
    const kHi = Math.min(kernel.length - 1, i + half)
    for (let k = kLo; k <= kHi; k++) s += a[i + half - k] * kernel[k]
    out[i] = s
  }
  return out
}

/** np.round(x, decimals): rint(x · 10^d) / 10^d, ties to even (JS Math.round rounds half up). */
export function roundHalfEven(x: number, decimals: number): number {
  const scale = 10 ** decimals
  const y = x * scale
  const f = Math.floor(y)
  const d = y - f
  const r = d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1
  return r / scale
}

/** Python's float `%`: the result takes the sign of the divisor (JS `%` keeps the dividend's). */
export function pyMod(x: number, m: number): number {
  const r = x % m
  return r !== 0 && r < 0 !== m < 0 ? r + m : r
}
