// Shared by the three XRF tasks (EPN Práctica 6): which MCA runs count, and whether a line stands in a run.
// "Stands" uses the students' own tool: the fixed-centre Gaussian fit of the fit panel on the expected spectrum,
// and the same MIN_PROMINENCE_SIGMA as every other task. Expectation only, never the noisy counts.
import type { McaRecord } from '../../apparatus/apparatus'
import { gaussFitFixed, MIN_PROMINENCE_SIGMA } from '../../physics/analysis'
import { kevPerChannel, pinFwhmKeV } from '../../physics/detector'
import { mcaSpectrum } from '../../physics/fluorescence'
import { XRF, foilOf } from '../../physics/tables'

/** The guide's target angle (0.1°). The physics model fixes ψ1 = ψ2 = 45° and ignores the target angle, so this
 * check is the only place where the guide's 45° step is enforced. */
export const GUIDE_TARGET = 450

/** A run that counts: the detector saw the sample with the tube emitting, nothing changed while it ran, target at 45.0°. */
export const usable = (r: McaRecord): boolean => r.seen && !r.changed && r.target === GUIDE_TARGET

/** Same beam (tube, collimator and sensor foils) and same analyser settings (the runs of one comparison). */
export const sameBeam = (a: McaRecord, b: McaRecord): boolean => a.u === b.u && a.i === b.i && a.nChannels === b.nChannels && a.gain === b.gain && a.collimatorFilter === b.collimatorFilter && a.sensorFilter === b.sensorFilter

/** Lines fitted together per sample (neighbours must be fitted at once: Cu Kβ sits on Zn Kα). */
const SETS: Record<string, string[][]> = {
  Cu: [['Cu Kα', 'Cu Kβ']],
  Zn: [['Zn Kα', 'Zn Kβ']],
  Pb: [['Pb Lα']],
  CuZn39Pb3: [['Cu Kα', 'Zn Kα', 'Cu Kβ', 'Zn Kβ'], ['Pb Lα']],
  centavo2003: [['Fe Kα', 'Fe Kβ', 'Cu Kα', 'Cu Kβ']],
}
const FWHM_TO_SIGMA = 2 * Math.sqrt(2 * Math.log(2))

// The card asks every frame and a fit on a spectrum is not free: once per record.
const memo = new WeakMap<McaRecord, Map<string, boolean>>()

/** Does `line` (e.g. 'Cu Kα') stand at least MIN_PROMINENCE_SIGMA above its error in the expected spectrum of run `r`? */
export function standsIn(r: McaRecord, line: string): boolean {
  let cache = memo.get(r)
  if (!cache) memo.set(r, (cache = new Map()))
  const hit = cache.get(line)
  if (hit !== undefined) return hit
  let ok = false
  try {
    const set = (SETS[r.sample] ?? []).find((s) => s.includes(line))
    if (set) {
      const counts = mcaSpectrum(r.sample, r.u / 10, r.i / 100, r.realS, r.nChannels, r.gain, foilOf(r.collimatorFilter), foilOf(r.sensorFilter)).counts
      const kpc = kevPerChannel(r.nChannels, r.gain)
      const E = Array.from(counts, (_, ch) => ch * kpc)
      const centres = set.map((l) => XRF.reference_lines_keV[l])
      const fit = gaussFitFixed(E, counts, centres, centres.map((c) => pinFwhmKeV(c) / FWHM_TO_SIGMA))
      const k = set.indexOf(line)
      ok = fit.area[k] / fit.areaErr[k] >= MIN_PROMINENCE_SIGMA
    }
  } catch {
    return false // the sample table is not loaded (yet: not cached), or the window holds too few channels
  }
  cache.set(line, ok)
  return ok
}
