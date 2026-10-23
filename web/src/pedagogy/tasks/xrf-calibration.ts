// Lab mode: the first XRF measurement (EPN Práctica 6): spectra of Cu and Pb with the energy detector and the
// two-point energy calibration of the MCA. Misconception: "a channel number is an energy" (the scale is fixed).
// The app checks the runs and the calibration against the MCA's own resolution, never a tuned tolerance.
import type { Apparatus, McaRecord } from '../../apparatus/apparatus'
import { kevPerChannel } from '../../physics/detector'
import { XRF } from '../../physics/tables'
import type { GuidedTask } from '../task'
import { standsIn, usable } from './xrf-common'

/** A usable run of `sample`, logged at or after `from`, at the MCA's current channels and gain where `line` stands. */
function measured(a: Apparatus, sample: string, line: string, from: number): boolean {
  const { nChannels, gain } = a.mca.settings
  return a.mcaLog.slice(from).some((r: McaRecord) => r.sample === sample && r.nChannels === nChannels && r.gain === gain && usable(r) && standsIn(r, line))
}

/** The calibration sends the true channels of Cu Kα and Pb Lα (E / channel width, offset 0 in the model) to their
 * reference energies within one channel width: the MCA's own resolution. */
function calibrated(a: Apparatus): boolean {
  const cal = a.mca.calibration
  if (!cal) return false
  try {
    const { nChannels, gain } = a.mca.settings
    const w = kevPerChannel(nChannels, gain)
    return ['Cu Kα', 'Pb Lα'].every((l) => {
      const E = XRF.reference_lines_keV[l]
      return E !== undefined && Math.abs(cal.kevPerChannel * (E / w) + cal.offsetKeV - E) <= w
    })
  } catch {
    return false
  }
}

export const task: GuidedTask = {
  id: 'xrf-calibration',
  mode: 'lab',
  crystal: 'NaCl', // not used (the sample holder is mounted), but every task declares one
  level: 1,
  controls: ['SENSOR', 'TARGET', 'HV'],
  initial: { U_kV: 35, I_mA: 1 },
  countsMcaRuns: true,
  predict: { kind: 'number', unit: '' },
  success: (a, from = 0) => measured(a, 'Cu', 'Cu Kα', from) && measured(a, 'Pb', 'Pb Lα', from) && calibrated(a),
  progress: (a, from = 0) => [
    { key: 'xrfCu', done: measured(a, 'Cu', 'Cu Kα', from) },
    { key: 'xrfPb', done: measured(a, 'Pb', 'Pb Lα', from) },
    { key: 'xrfCal', done: calibrated(a) },
  ],
}
