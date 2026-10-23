// Lab mode: a coin by XRF (EPN Práctica 6 extension): the Ecuador 1 centavo 2003, copper-plated steel.
// Misconception: "XRF measures the bulk" (it sees the top tens of µm). Checked: one usable run of the coin
// where Cu Kα and Fe Kα both stand, taken after the act step opened.
import type { GuidedTask } from '../task'
import { standsIn, usable } from './xrf-common'

export const task: GuidedTask = {
  id: 'xrf-coin',
  mode: 'lab',
  crystal: 'NaCl', // not used (the sample holder is mounted), but every task declares one
  level: 3,
  keepDetector: true,
  controls: ['SENSOR', 'TARGET', 'HV'],
  initial: { U_kV: 35, I_mA: 1 },
  countsMcaRuns: true,
  predict: { kind: 'choice', answer: 1 },
  success: (a, from = 0) => a.mcaLog.slice(from).some((r) => r.sample === 'centavo2003' && usable(r) && standsIn(r, 'Cu Kα') && standsIn(r, 'Fe Kα')),
}
