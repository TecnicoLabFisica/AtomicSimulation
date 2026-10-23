// Lab mode: brass composition by XRF (EPN Práctica 6): the pure standards Cu, Zn, Pb and the brass CuZn39Pb3 at
// one beam. Misconception: "one element, one isolated peak" (Cu Kβ sits almost on Zn Kα, so a fit is needed).
// The app checks the runs, never the student's composition in %. The standards may predate the act step (the
// guide reuses them); the brass must be measured after it.
import type { Apparatus, McaRecord } from '../../apparatus/apparatus'
import type { GuidedTask } from '../task'
import { sameBeam, standsIn, usable } from './xrf-common'

const BRASS = 'CuZn39Pb3'
// [sample, lines that must stand]: each standard's main line; in the brass the three main lines.
const NEED: [string, string[]][] = [['Cu', ['Cu Kα']], ['Zn', ['Zn Kα']], ['Pb', ['Pb Lα']], [BRASS, ['Cu Kα', 'Zn Kα', 'Pb Lα']]]
const KEYS = ['xrfCu', 'xrfZn', 'xrfPb', 'xrfBrass']

const good = (r: McaRecord, sample: string, lines: string[]) => r.sample === sample && usable(r) && lines.every((l) => standsIn(r, l))

type Run = { r: McaRecord; i: number }

/** The same-beam group of every usable run (with its log index), oldest first. */
const memo = new WeakMap<readonly McaRecord[], Run[][]>()
function groups(a: Apparatus): Run[][] {
  const log = a.mcaLog
  let out = memo.get(log)
  if (!out) {
    const all = log.map((r, i) => ({ r, i })).filter((x) => usable(x.r))
    out = all.map((x) => all.filter((y) => sameBeam(y.r, x.r)))
    memo.set(log, out)
  }
  return out
}

/** What a group holds: the standards from any time, the brass only from a run at or after `from`. */
const held = (g: Run[], from: number): boolean[] =>
  NEED.map(([s, lines], k) => g.some((x) => good(x.r, s, lines) && (k < 3 || x.i >= from)))

export const task: GuidedTask = {
  id: 'xrf-brass',
  mode: 'lab',
  crystal: 'NaCl', // not used (the sample holder is mounted), but every task declares one
  level: 2,
  keepDetector: true,
  controls: ['SENSOR', 'TARGET', 'HV'],
  initial: { U_kV: 35, I_mA: 1 },
  countsMcaRuns: true,
  predict: { kind: 'choice', answer: 2 },
  success: (a, from = 0) => groups(a).some((g) => held(g, from).every(Boolean)),
  progress: (a, from = 0) => {
    const g = groups(a).at(-1)
    const h = g ? held(g, from) : []
    return KEYS.map((key, k) => ({ key, done: h[k] === true }))
  },
}
