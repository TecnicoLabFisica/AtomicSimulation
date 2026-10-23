// Multichannel analyser of the LD 559 938 energy detector (EPN Práctica 6). Pure device state, no DOM and no
// physics: the expected counts per second come from fluorescence.mcaSpectrum, and the only thing done here is
// the last step of the pipeline, the Poisson sampling (expectation ≠ noise), plus the bookkeeping of the run.
import { kevPerChannel, poisson, type Rng } from '../physics/detector'

export type McaSettings = Readonly<{ nChannels: number; gain: number; presetS: number }>
/** E = kevPerChannel · channel + offsetKeV, from analysis.twoPointCalibration. */
export type McaCalibration = Readonly<{ kevPerChannel: number; offsetKeV: number }>

/** The guide's settings (EPN Práctica 6). */
export const MCA_DEFAULTS: McaSettings = { nChannels: 512, gain: -2.5, presetS: 180 }
export const MCA_CHANNELS = [256, 512, 1024] as const
export const MCA_GAINS = [-1, -1.5, -2, -2.5, -3, -4, -5] as const

export class Mca {
  settings: McaSettings = MCA_DEFAULTS
  running = false
  realS = 0 // elapsed real time of the run
  liveS = 0 // of which the detector was not dead
  counts = new Float64Array(MCA_DEFAULTS.nChannels)
  calibration: McaCalibration | null = null
  /** Bumped on every change a view must redraw for. */
  version = 0

  /** Start (or resume) counting; a finished run (real time at the preset) restarts only after clear() or a longer preset. */
  start(): void {
    this.running = this.realS < this.settings.presetS
    this.version++
  }

  stop(): void {
    this.running = false
    this.version++
  }

  /** Empty the spectrum and the clocks; the calibration stays (the channel map is unchanged). */
  clear(): void {
    this.counts.fill(0)
    this.realS = this.liveS = 0
    this.version++
  }

  /** A new channel count or gain changes the channel ↔ energy map, so counts and calibration go; the run stops.
   * Throws RangeError for a combination the detector refuses (kevPerChannel). The preset alone only needs a longer wait. */
  set(s: Partial<McaSettings>): void {
    const next = { ...this.settings, ...s }
    if (!(next.presetS > 0)) throw new RangeError('preset time must be > 0')
    if (next.nChannels !== this.settings.nChannels || next.gain !== this.settings.gain) {
      kevPerChannel(next.nChannels, next.gain)
      this.counts = new Float64Array(next.nChannels)
      this.calibration = null
      this.running = false
      this.realS = this.liveS = 0
    }
    this.settings = next
    if (this.realS >= next.presetS) this.running = false
    this.version++
  }

  /** Advance `dtS` of simulated time (stops at the preset real time; Infinity runs to it). `expectedPerS`: the expected
   * counts/s per channel (null: nothing reaches the detector) and `liveFraction` the live-time share of real time. */
  tick(dtS: number, expectedPerS: ArrayLike<number> | null, liveFraction: number, rng: Rng): void {
    if (!this.running) return
    const dt = Math.min(dtS, this.settings.presetS - this.realS)
    if (!(dt > 0)) {
      if (this.realS >= this.settings.presetS) this.stop()
      return
    }
    if (expectedPerS) for (let i = 0; i < this.counts.length; i++) this.counts[i] += poisson(expectedPerS[i] * dt, rng)
    this.liveS += dt * (expectedPerS ? liveFraction : 1)
    this.realS += dt
    if (this.realS >= this.settings.presetS) this.running = false
    this.version++
  }
}
