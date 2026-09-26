// port of braggsim.scan: the expected counting rate R̄(β) the GM counter sees (no noise).
//
// R̄ = dead_time( scale · Σ_n r_n [continuum_n + lines_n](θ) · rocking + tube · (leak + scatter) ),
// θ = |sensor| / 2; see the Python module docstring for the physics of each term. Every fitted value
// in DEFAULT is documented in model/PARAMETERS.md.
import { D_NACL_PM, MO_KA_COMPONENTS, MO_KB_COMPONENTS } from './constants'
import {
  dlambdaDthetaPmPerDeg,
  lambdaFromTheta,
  lorentzPolarization,
  structureFactorSqRel,
  thetaFromLambda,
} from './crystal'
import { deadTime } from './detector'
import { transmission } from './filters'
import { convolveSame, interp, pyMod, roundHalfEven, trapezoid } from './numpy'
import { continuum, lambdaMinPm, lineRates } from './source'
import { DEFAULT_PARAMS_JSON, MU_RHO_GRID_PM } from './tables'

// Air between anode and counter (18 cm assumed, 1.205 mg/cm³) and the fitted effective absorber.
export const AIR = 'Air, Dry (near sea level)'
export const AIR_PATH_CM = 18.0
export const AIR_MG_CM2 = 1.205 * AIR_PATH_CM
export const ABSORBER = 'Glass, Pyrex'
export const U_REF_KV = 35.0

// Sensor arm −10° … +170° (LD 554 800) → coupled target β = θ in −5° … +85°.
export const SENSOR_MIN_DEG = -10.0
export const SENSOR_MAX_DEG = 170.0
export const BETA_MIN_DEG = SENSOR_MIN_DEG / 2
export const BETA_MAX_DEG = SENSOR_MAX_DEG / 2
export const U_MAX_KV = 35.0
export const I_MAX_MA = 1.0
export const MAX_ORDER = Math.trunc(
  (2 * D_NACL_PM * Math.sin((BETA_MAX_DEG * Math.PI) / 180)) / lambdaMinPm(U_MAX_KV),
)
export const MAX_SCAN_STEPS = 100_000
export const THETA_STEP_DEG = 0.01
export const KERNEL_HALF_WIDTH_SIGMA = 6

/** port of braggsim.scan.ModelParams (field names as in the dataclass and the JSON artifacts). */
export type ModelParams = Readonly<{
  scale: number // counts/s per relative source unit
  line_to_cont: number // Kα line strength relative to the continuum (1/pm)
  debye_waller_pm2: number // effective B of exp(−2B s²)
  sigma_deg: number // Gaussian angular resolution
  tau_s: number // GM dead time
  leak_amp_per_s: number // direct-beam halo at 2θ = 0, 35 kV, 1 mA
  leak_width_deg: number // its Gaussian width in 2θ
  absorber_mg_cm2: number // effective absorber areal density
  scatter_per_s: number // flat scattered radiation at 35 kV, 1 mA
}>

const PARAM_KEYS = [
  'scale', 'line_to_cont', 'debye_waller_pm2', 'sigma_deg', 'tau_s',
  'leak_amp_per_s', 'leak_width_deg', 'absorber_mg_cm2', 'scatter_per_s',
] as const

const validated = new WeakSet<ModelParams>()

/** Validated, frozen ModelParams (port of ModelParams.__post_init__); scatter_per_s defaults to 0.
 * Only objects made here are accepted by expectedRate, as only the dataclass is in Python. */
export function modelParams(p: Omit<ModelParams, 'scatter_per_s'> & { scatter_per_s?: number }): ModelParams {
  const unknown = Object.keys(p).filter((k) => !(PARAM_KEYS as readonly string[]).includes(k))
  if (unknown.length) throw new TypeError(`unknown model parameters: ${unknown.join(', ')}`)
  const out = Object.freeze({ ...p, scatter_per_s: p.scatter_per_s ?? 0 }) as ModelParams
  for (const k of PARAM_KEYS) {
    if (!(Number.isFinite(out[k]) && out[k] >= 0)) throw new RangeError(`model parameters must be finite and ≥ 0: ${k}`)
  }
  if (out.sigma_deg === 0 || out.leak_width_deg === 0) throw new RangeError('sigma_deg and leak_width_deg must be > 0')
  validated.add(out)
  return out
}

export const DEFAULT = modelParams(DEFAULT_PARAMS_JSON)

/** port of ModelParams.order_reflectivity: r_n for n = 1 … MAX_ORDER (index n − 1). */
export function orderReflectivity(params: ModelParams): number[] {
  const s1Sq = (1 / (2 * D_NACL_PM)) ** 2
  return structureFactorSqRel(MAX_ORDER).map(
    (f, i) => f * Math.exp(-2 * params.debye_waller_pm2 * ((i + 1) * (i + 1) - 1) * s1Sq),
  )
}

/** port of braggsim.scan.coupled_betas: target angles from lo to at most hi in steps of step (°). */
export function coupledBetas(loDeg: number, hiDeg: number, stepDeg: number): Float64Array {
  if (!(Number.isFinite(loDeg) && Number.isFinite(hiDeg) && stepDeg > 0 && hiDeg >= loDeg))
    throw new RangeError('a scan needs Δβ > 0 and upper limit ≥ lower limit (LD 554 800)')
  const n = Math.floor((hiDeg - loDeg) / stepDeg + 1e-9) + 1 // 1e-9: 0.3/0.1 = 2.9999…
  if (n > MAX_SCAN_STEPS) throw new RangeError(`${n} steps: a scan has at most ${MAX_SCAN_STEPS}`)
  return Float64Array.from({ length: n }, (_, i) => Math.min(roundHalfEven(loDeg + stepDeg * i, 10), hiDeg))
}

function transmissionTotal(lambdaPm: number, params: ModelParams): number {
  return transmission(lambdaPm, AIR, AIR_MG_CM2) * transmission(lambdaPm, ABSORBER, params.absorber_mg_cm2)
}

function gaussian(xDeg: number, sigmaDeg: number): number {
  return Math.exp(-0.5 * (xDeg / sigmaDeg) ** 2) / (sigmaDeg * Math.sqrt(2 * Math.PI))
}

function moLines(UkV: number, ImA: number, params: ModelParams): [number, number][] {
  const [ka, kb] = lineRates(UkV, ImA, params.line_to_cont)
  return [
    ...MO_KA_COMPONENTS.map(([lam, f]): [number, number] => [lam, ka * f]),
    ...MO_KB_COMPONENTS.map(([lam, f]): [number, number] => [lam, kb * f]),
  ]
}

// Everything R̄ needs that depends on (U, I, params) but not on β, computed once. Python builds the
// convolution grid per query from βmin − half to βmax + half (clamped at node 1); every node a query
// interpolates between is then fully covered by the kernel, so the smoothed values equal those on
// this one grid over the whole range. That makes live single-β steps cheap (plan, Phase 5 notes).
type Tube = {
  params: ModelParams
  U: number
  I: number
  tube: number
  thetaGrid: Float64Array
  smoothed: Float64Array
  lines: { theta: number; weight: number }[]
}
let cache: Tube | undefined
const photonsOutRef = new WeakMap<ModelParams, number>()

function tubeState(UkV: number, ImA: number, params: ModelParams): Tube {
  if (cache && cache.params === params && cache.U === UkV && cache.I === ImA) return cache
  if (!validated.has(params)) throw new TypeError('params must come from modelParams()')
  const orders = orderReflectivity(params)
  const half = Math.ceil((KERNEL_HALF_WIDTH_SIGMA * params.sigma_deg) / THETA_STEP_DEG)
  const iHi = Math.ceil(BETA_MAX_DEG / THETA_STEP_DEG) + half
  const thetaGrid = Float64Array.from({ length: iHi }, (_, i) => THETA_STEP_DEG * (i + 1))
  const density = new Float64Array(iHi)
  if (ImA > 0 && UkV > 0) {
    orders.forEach((r, i) => {
      const n = i + 1
      for (let j = 0; j < iHi; j++) {
        const th = thetaGrid[j]
        const lam = lambdaFromTheta(th, n)
        const spec = continuum(lam, UkV, ImA)
        if (spec > 0)
          density[j] += r * spec * transmissionTotal(lam, params) * dlambdaDthetaPmPerDeg(th, n) * lorentzPolarization(th)
      }
    })
  }
  const kernel = Float64Array.from({ length: 2 * half + 1 }, (_, k) =>
    gaussian(THETA_STEP_DEG * (k - half), params.sigma_deg),
  )
  const kSum = kernel.reduce((a, b) => a + b, 0)
  const lines: Tube['lines'] = []
  const moLineList = moLines(UkV, ImA, params)
  orders.forEach((r, i) => {
    for (const [lam, rate] of moLineList) {
      const theta = thetaFromLambda(lam, i + 1)
      if (rate === 0 || Number.isNaN(theta)) continue
      lines.push({ theta, weight: r * rate * transmissionTotal(lam, params) * lorentzPolarization(theta) })
    }
  })
  cache = {
    params, U: UkV, I: ImA, tube: tubeFactor(UkV, ImA, params), thetaGrid,
    smoothed: convolveSame(density, kernel.map((k) => k / kSum)), lines,
  } // prettier-ignore
  return cache
}

function photonsOut(UkV: number, params: ModelParams): number {
  const lam = MU_RHO_GRID_PM
  let total = trapezoid(
    lam.map((l) => continuum(l, UkV, 1.0) * transmissionTotal(l, params)),
    lam,
  )
  const [ka, kb] = lineRates(UkV, 1.0, params.line_to_cont)
  for (const [rate, components] of [[ka, MO_KA_COMPONENTS], [kb, MO_KB_COMPONENTS]] as const) {
    for (const [lamPm, fraction] of components) total += rate * fraction * transmissionTotal(lamPm, params)
  }
  return total
}

/** port of braggsim.scan.tube_factor: I · S(U), how leak and scatter follow the tube (1 at 35 kV, 1 mA). */
export function tubeFactor(UkV: number, ImA: number, params: ModelParams = DEFAULT): number {
  if (ImA === 0 || UkV === 0) return 0
  let ref = photonsOutRef.get(params)
  if (ref === undefined) photonsOutRef.set(params, (ref = photonsOut(U_REF_KV, params)))
  return ImA * (photonsOut(UkV, params) / ref)
}

/** port of braggsim.scan.expected_rate: expected observed rate R̄ in counts/s (deterministic).
 * `betaDeg`: target angles; `sensorDeg`: sensor angles, same length, or null/undefined for the 2:1
 * coupled scan (sensor at 2β). Throws on the same invalid inputs as Python. */
export function expectedRate(
  betaDeg: ArrayLike<number>,
  UkV: number,
  ImA: number,
  params: ModelParams = DEFAULT,
  sensorDeg?: ArrayLike<number> | null,
): Float64Array {
  const beta = Float64Array.from(betaDeg)
  let sensor: Float64Array
  if (sensorDeg == null) {
    if (!beta.every((b) => b >= BETA_MIN_DEG && b <= BETA_MAX_DEG))
      throw new RangeError(`β outside the coupled range ${BETA_MIN_DEG}° … ${BETA_MAX_DEG}°`)
    sensor = beta.map((b) => 2 * b)
  } else {
    sensor = Float64Array.from(sensorDeg)
    if (sensor.length !== beta.length || !beta.every(Number.isFinite))
      throw new RangeError('target and sensor angles must be finite arrays of the same shape')
    if (!sensor.every((s) => s >= SENSOR_MIN_DEG && s <= SENSOR_MAX_DEG))
      throw new RangeError(`sensor outside its range ${SENSOR_MIN_DEG}° … ${SENSOR_MAX_DEG}°`)
    for (let i = 0; i < beta.length; i++) beta[i] = pyMod(beta[i] + 180, 360) - 180 // target turns without limit
  }
  if (!(UkV >= 0 && UkV <= U_MAX_KV && ImA >= 0 && ImA <= I_MAX_MA))
    throw new RangeError(`U_kV must be in 0 … ${U_MAX_KV}, I_mA in 0 … ${I_MAX_MA} (LD 554 800)`)
  const out = new Float64Array(beta.length)
  if (beta.length === 0) return out
  const t = tubeState(UkV, ImA, params)
  const on = ImA > 0 && UkV > 0
  for (let i = 0; i < beta.length; i++) {
    const s = sensor[i]
    let rate = t.tube * (params.scatter_per_s + params.leak_amp_per_s * Math.exp(-0.5 * (s / params.leak_width_deg) ** 2))
    if (on) {
      const theta = Math.abs(s) / 2
      const rocking = Math.exp(-0.5 * ((s / 2 - beta[i]) / params.sigma_deg) ** 2)
      let lines = 0
      for (const l of t.lines) lines += l.weight * gaussian(theta - l.theta, params.sigma_deg)
      rate = rate + params.scale * rocking * (interp(theta, t.thetaGrid, t.smoothed) + lines)
    }
    out[i] = deadTime(rate, params.tau_s)
  }
  return out
}
