// port of braggsim.fluorescence (XRF of a flat sample, EPN Práctica 6): rates and expected MCA spectrum
// from the exported kernels (artifacts/tables/xrf/<sample>.json), no xraylib. Await loadXrfSample(name) first.
// Always the DEFAULT model parameters: the exported scale_per_source_unit is _scale(scan.DEFAULT), so other params
// would only half-apply.
import { MO_KA_COMPONENTS, MO_KB_COMPONENTS, HC_KEV_PM } from './constants'
import { mcaCounts, type McaContinuum } from './detector'
import { transmission } from './filters'
import { ABSORBER, AIR, DEFAULT, checkTube } from './scan'
import { continuum, lineRates as sourceLineRates } from './source'
import { XRF, XRF_SAMPLE_NAMES, type XrfSample } from './tables'
import { trapezoid } from './numpy'

const MO_COMPONENTS = [...MO_KA_COMPONENTS, ...MO_KB_COMPONENTS] // Kα1, Kα2, Kβ1,3, Kβ2
const MO_LAMBDA_PM = MO_COMPONENTS.map(([lam]) => lam)
const N_MO = MO_COMPONENTS.length

/** port of braggsim.fluorescence.Line. */
export type Line = { label: string; energy_keV: number; rate_per_s: number }

function resolve(sample: string): XrfSample {
  if (!XRF_SAMPLE_NAMES.includes(sample))
    throw new RangeError(`unknown XRF sample ${JSON.stringify(sample)}: use one of ${XRF_SAMPLE_NAMES}`)
  const s = XRF.samples[sample]
  if (!s) throw new Error(`XRF sample ${sample} not loaded: await loadXrfSample(${JSON.stringify(sample)})`)
  return s
}

/** port of braggsim.fluorescence._t_in: Pyrex window × 12 cm of air. */
const tIn = (lamPm: number): number =>
  transmission(lamPm, ABSORBER, DEFAULT.absorber_mg_cm2) * transmission(lamPm, AIR, XRF.air_in_mg_cm2)

/** port of braggsim.fluorescence._flux: Φ̃ per mA on the kernel grid, then the four Mo line rates. */
function flux(kern: XrfSample, UkV: number): Float64Array {
  const n = kern.lam_pm.length
  const [ka, kb] = sourceLineRates(UkV, 1.0, DEFAULT.line_to_cont)
  const phi = new Float64Array(n + N_MO)
  for (let i = 0; i < n; i++) phi[i] = continuum(kern.lam_pm[i], UkV, 1.0) * tIn(kern.lam_pm[i])
  for (let j = 0; j < N_MO; j++) {
    const rate = j < MO_KA_COMPONENTS.length ? ka : kb
    phi[n + j] = rate * MO_COMPONENTS[j][1] * tIn(MO_LAMBDA_PM[j])
  }
  return phi
}

/** port of braggsim.fluorescence._integral: trapezoid on the grid + the dot over the Mo components. */
function integral(lam: readonly number[], phi: Float64Array, k: readonly number[]): number {
  const n = lam.length
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) y[i] = phi[i] * k[i]
  let dot = 0
  for (let j = n; j < n + N_MO; j++) dot += phi[j] * k[j]
  return trapezoid(y, lam) + dot
}

/** port of braggsim.fluorescence.line_rates: photon rates at the detector window, the sample's fluorescence lines
 * then the Mo Kα/Kβ Rayleigh and Compton lines. Throws on the same invalid inputs as Python. */
export function lineRates(sample: string, UkV: number, ImA: number): Line[] {
  const kern = resolve(sample)
  checkTube(UkV, ImA)
  const n = kern.lam_pm.length
  const phi = flux(kern, UkV)
  const amp = ImA * XRF.scale_per_source_unit
  const out: Line[] = kern.lines.map((lk) => ({ label: lk.label, energy_keV: lk.energy_keV, rate_per_s: amp * integral(kern.lam_pm, phi, lk.k) }))
  for (const [label, i0] of [['Mo Kα', 0], ['Mo Kβ', 2]] as const) {
    for (const [kind, k, shift] of [['Rayleigh', kern.rayleigh, 0], ['Compton', kern.compton, XRF.compton_shift_pm]] as const) {
      let energy = 0
      let rate = 0
      for (let j = 0; j < 2; j++) {
        energy += MO_COMPONENTS[i0 + j][1] * (HC_KEV_PM / (MO_LAMBDA_PM[i0 + j] + shift))
        rate += amp * phi[n + i0 + j] * k[n + i0 + j]
      }
      out.push({ label: `${label} ${kind}`, energy_keV: energy, rate_per_s: rate })
    }
  }
  return out
}

/** port of braggsim.fluorescence.scattered_continuum: Rayleigh and Compton scatter of the continuum at the window,
 * energies ascending (keV), rate per keV, with the exported detector efficiency at the interval midpoints. */
export function scatteredContinuum(sample: string, UkV: number, ImA: number): { rayleigh: McaContinuum; compton: McaContinuum } {
  const kern = resolve(sample)
  checkTube(UkV, ImA)
  const n = kern.lam_pm.length
  const phi = flux(kern, UkV)
  const amp = ImA * XRF.scale_per_source_unit
  const make = (k: readonly number[], shift: number, pinEffMid: readonly number[]): McaContinuum => {
    const eKeV = new Float64Array(n)
    const dens = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const lamD = kern.lam_pm[i] + shift
      eKeV[n - 1 - i] = HC_KEV_PM / lamD
      dens[n - 1 - i] = (amp * phi[i] * k[i] * lamD ** 2) / HC_KEV_PM
    }
    return { eKeV, ratePerS_perKeV: dens, pinEffMid }
  }
  return {
    rayleigh: make(kern.rayleigh, 0, kern.pin_eff_mid_rayleigh),
    compton: make(kern.compton, XRF.compton_shift_pm, kern.pin_eff_mid_compton),
  }
}

/** port of braggsim.fluorescence.mca_spectrum: expected MCA spectrum of the LD 559 938 over `tS` of real time. */
export function mcaSpectrum(sample: string, UkV: number, ImA: number, tS: number, nChannels = 512, gain = -2.5) {
  const kern = resolve(sample)
  const effByLabel = new Map(kern.lines.map((lk) => [lk.label, lk.pin_eff]))
  const lines = lineRates(sample, UkV, ImA).map((ln) => [ln.energy_keV, ln.rate_per_s, effByLabel.get(ln.label) ?? XRF.pin_eff_mo_lines[ln.label]] as const)
  const cont = scatteredContinuum(sample, UkV, ImA)
  return mcaCounts(lines, [cont.rayleigh, cont.compton], tS, nChannels, gain)
}
