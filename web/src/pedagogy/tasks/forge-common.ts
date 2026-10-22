// Shared checks of the Materials Forge tasks. Each reads the STORED coupled scan (what braggsim.analysis could work with),
// never the student's typed answer: a finished COUPLED scan on the crystal holder, not changed while it ran.
import type { Apparatus } from '../../apparatus/apparatus'
import { isForgeKey } from '../../i18n'
import { MIN_PROMINENCE_SIGMA, PEAK_HALF_WINDOW_DEG, lineProminences } from '../../physics/analysis'
import { MO_KA_PM } from '../../physics/constants'
import { crystalByName, dPm, thetaFromLambda, type Crystal } from '../../physics/crystal'
import { foilsOf } from '../task'

export const W = PEAK_HALF_WINDOW_DEG

export type Stored = { crystal: Crystal; forged: boolean; lo: number; hi: number; prom: (th: number) => number }

/** The finished coupled scan, its crystal (the stored scan's own), its angular range in ° and the prominence (σ) of a line at θ; null if none counts. */
export function storedScan(a: Apparatus, maxStepDeg: number): Stored | null {
  const s = a.lastScan
  const r = a.replay
  if (!s || s.mode !== 'COUPLED' || s.changed || a.busy || r.length < 2 || s.setup.holder !== 'crystal') return null
  if ((r[1].angle - r[0].angle) / 10 > maxStepDeg) return null
  const crystal = crystalByName(s.setup.crystal)
  const [lo, hi] = [r[0].angle / 10, r.at(-1)!.angle / 10]
  const lines = lineProminences(lo, hi, s.u / 10, s.i / 100, s.dt, foilsOf(s.setup), crystal)
  return { crystal, forged: isForgeKey(s.setup.crystal), lo, hi, prom: (th) => lines.find(([t]) => t === th)?.[2] ?? -Infinity }
}

/** θ of Mo Kα (weighted line) in order n on this crystal. */
export const thKa = (c: Crystal, n: number): number => thetaFromLambda(MO_KA_PM, n, dPm(c))

/** The scan spans the Kα windows (±PEAK_HALF_WINDOW_DEG) of orders `from`…`to`. */
export const spans = (st: Stored, from: number, to: number): boolean => st.lo <= thKa(st.crystal, from) - W && st.hi >= thKa(st.crystal, to) + W

/** Kα of order n stands MIN_PROMINENCE_SIGMA above its background in the scan. */
export const seen = (st: Stored, n: number): boolean => st.prom(thKa(st.crystal, n)) >= MIN_PROMINENCE_SIGMA
