// Emulator of the LD X-ray apparatus 554 800 with goniometer 554 831 (LD instruction sheet 554 800,
// §6–§8, §11). Pure state machine: no DOM, driven by press(), adjust(), setDoors() and tick().
//
// Settings are integers in device steps (U in 0.1 kV, I in 0.01 mA, angles in 0.1°) and become floats
// only when the physics is called: 100 × 0.01 mA summed in floats is 1.0000000000000007 mA > 1 mA.
import { mulberry32, poisson, type Rng } from '../physics/detector'
import { BETA_MAX_DEG, BETA_MIN_DEG, DEFAULT, directRate, expectedRate, type ModelParams } from '../physics/scan'
import { FOILS_MG_CM2, WHEELS_MG_CM2, absorbersLoaded } from '../physics/tables'

export type Key =
  | 'U' | 'I' | 'DT' | 'DBETA' | 'LIMITS' // parameter keys (§7 b3)
  | 'SENSOR' | 'TARGET' | 'COUPLED' | 'ZERO' // scan-mode keys (§7 b4)
  | 'RESET' | 'REPLAY' | 'SCAN' | 'HV' | 'SPEAKER' // operational keys (§7 b5)
export type Mode = 'SENSOR' | 'TARGET' | 'COUPLED'
type Param = 'U' | 'I' | 'DT' | 'DBETA' | 'LIMIT_LO' | 'LIMIT_HI'
/** What sits in the beam path: the crystal, one of the two 554 834 absorber plates, or nothing. */
export type Holder = 'crystal' | 'alWheel' | 'materialWheel' | 'empty'
/** Accessories mounted with the door open; filter values are FOILS_MG_CM2 names (e.g. 'Zr'). */
export type Setup = Readonly<{ holder: Holder; collimatorFilter: string | null; sensorFilter: string | null }>
export type Phase = 'idle' | 'safety' | 'positioning' | 'scan' | 'exposure'
type Arms = { target: number; sensor: number } // 0.1°

// [min, max, default] in device steps, LD 554 800 §7 b3.
export const RANGES: Record<'U' | 'I' | 'DT' | 'DBETA', readonly [number, number, number]> = {
  U: [0, 350, 50], // 0.1 kV
  I: [0, 100, 0], // 0.01 mA
  DT: [1, 9999, 1], // s
  DBETA: [0, 200, 1], // 0.1°; 0 = exposure-timer mode
}
// Arm and limit ranges in 0.1°: sensor −10 … +170° (§4); coupled target β = sensor/2. The target arm
// turns without limit; the physics wraps it, and its limits are kept to one turn either way.
const ARM_RANGE: Record<Mode, readonly [number, number]> = {
  SENSOR: [-100, 1700],
  TARGET: [-3600, 3600],
  COUPLED: [-50, 850],
}
// ponytail: a binary window, no angular profile: an assumption to be confirmed by the lab staff and
// upgraded to a Python profile if L2 needs it. A target turned ≈180° is treated as blocked, though a real
// plate might put an absorber on the tube side.
export const WHEEL_WINDOW_DEG = 3 // target within ±3° of a slot centre: the slot is in the beam
const COUNTER_MAX_PER_S = 65_535 // internal rate limit (§4)
const DISPLAY_MAX = 9999 // 4-digit display

// Emulator assumptions: the manual gives no number for these.
export const SAFE_S = 1.0 // "SAFE" alone during the self-test (§6)
export const OK_S = 0.5 // then "SAFE" + "OK" before HV comes on
/** Stepper-motor speed of the faster arm in °/s. Both arms of a move arrive together, so a coupled
 * move stays 2:1 the whole way. An assumption: to be timed on the lab's goniometer 554 831. */
export const MOTOR_DEG_PER_S = 20
// Motor moves: ZERO, RESET, auto-scan positioning and scan steps. ADJUST moves the arm directly (a hand
// turns slower than the motor). Motion runs on the physics clock, like the Δt countdown, and pauses
// during the 1.5 s self-test (ponytail: arms still travelling from a ZERO wait for it). Default limits
// are 0.0° / 0.0°. The tube switches off when a scan or exposure program ends.

/** Dynamic ADJUST response (§7 b2): turning faster gives bigger increments. */
export function adjustMultiplier(detentsPerSecond: number): number {
  return detentsPerSecond < 5 ? 1 : detentsPerSecond < 15 ? 5 : 20
}

export type ReplayPoint = { angle: number; rate: number } // angle in 0.1°, mean rate in 1/s over Δt

export type Display = {
  top: string
  topUnit: '1/s' | '°' | ''
  bottom: string
  bottomUnit: 'kV' | 'mA' | 's' | '°' | ''
  symbol: 'lower' | 'upper' | 'exposure' | null // dot-matrix symbols of the LIMITS and Δβ keys
  blinkTop: boolean // self-test failed: a door is open (§6)
  flashBottom: boolean // upper limit < lower limit: no scan can start (§7 b3)
  hvLamp: boolean // flashes while HV is on (§7 b6)
  alert: Alert | null // why the last SCAN/HV was refused; the view explains it (simulation aid)
}
export type Alert = 'mode' | 'limits' | 'doors'

type Program = {
  steps: number[] // scan-arm angles in 0.1° (one entry for the exposure timer)
  index: number
  elapsedS: number // whole seconds counted at the current step
  counts: number
}

export class Apparatus {
  // Settings (device steps)
  u = RANGES.U[2]
  i = RANGES.I[2]
  dt = RANGES.DT[2]
  dBeta = RANGES.DBETA[2]
  limitLo = 0
  limitHi = 0
  // Goniometer (0.1°; fractional only while the motor drives)
  target = 0
  sensor = 0
  mode: Mode | null = null
  private coupleRef: Arms = { target: 0, sensor: 0 }
  private path: Arms[] = [] // motor waypoints still to reach
  // Panel
  edit: Param | null = null
  bottomShows: Param | Mode = 'U'
  topShowsSensor = false
  exposureDone = false // "0 s" stays on show after an exposure until the next key or turn
  speaker = false
  doorsClosed = true
  private _setup: Setup = { holder: 'crystal', collimatorFilter: null, sensorFilter: null }
  hvOn = false
  alert: Alert | null = null // cleared by the next key
  // Program
  phase: Phase = 'idle'
  private safetyLeftS = 0
  private next: 'hv' | 'scan' | 'exposure' = 'hv'
  private program: Program | null = null
  replay: ReplayPoint[] = []
  replayIndex: number | null = null
  /** The auto-scan that filled `replay`: its arm, limits in 0.1°, and U, I, Δt at its start in device
   * steps (null after an exposure). `changed`: U or I differed from those while it counted (the device
   * allows it). */
  lastScan: { mode: Mode; first: number; last: number; u: number; i: number; dt: number; changed: boolean } | null = null
  /** Counts in the last whole simulated second; the rate display and speaker clicks use it. */
  lastSecondCounts = 0
  secondsCounted = 0 // increments with every whole simulated second
  timeScale = 1 // 1, 10, 100 or Infinity (instant); simulation-only, not a feature of the real device
  private clockS = 0

  private rng: Rng
  private params: ModelParams

  constructor(rng: Rng = mulberry32(Date.now()), params: ModelParams = DEFAULT) {
    this.rng = rng
    this.params = params
  }

  get busy(): boolean {
    return this.phase !== 'idle'
  }

  /** A program may count: the exposure timer needs HV only (a background run is at 0 kV), auto-scan also U and I. */
  private get ready(): boolean {
    return this.phase === 'exposure' ? this.hvOn : this.emitting
  }

  /** The motor is driving the arms. */
  get moving(): boolean {
    return this.path.length > 0
  }

  /** The tube is emitting: HV on with voltage and emission current set. */
  get emitting(): boolean {
    return this.hvOn && this.u > 0 && this.i > 0
  }
  /** The quantity on the bottom display (its key is lit): the scan arm while a scan runs, unless a key is being edited. */
  get bottomKey(): Param | Mode {
    return (this.phase === 'scan' || this.phase === 'positioning') && this.edit === null ? this.mode! : this.bottomShows
  }
  /** SCAN was accepted: its self-test, positioning, or the program itself is running. */
  get programOn(): boolean {
    return this.phase === 'scan' || this.phase === 'exposure' || this.phase === 'positioning' || (this.phase === 'safety' && this.next !== 'hv')
  }

  get setup(): Setup {
    return this._setup
  }

  /** Expected rate R̄ at the current arm positions, in counts/s. With HV off the counter still sees the
   * natural GM background. */
  expectedRate(): number {
    const { u, i, sensor, target, params } = this
    if (!this.hvOn) return directRate(0, 0, [], params)
    const filters = this.foils()
    if (this._setup.holder === 'crystal') return expectedRate([target / 10], u / 10, i / 100, params, [sensor / 10], filters)[0]
    // No crystal: the counter sees the direct beam through the wheel slot in the beam, else the frame blocks it.
    const slot = this._setup.holder === 'empty' ? null : this.wheelSlot()
    if (slot === undefined) return directRate(0, 0, [], params)
    return directRate(u / 10, i / 100, slot ? [...filters, slot] : filters, params, sensor / 10)
  }

  /** Expected rate a counter at the specular angle 2β would see, in counts/s: the reflected beam the
   * goniometer view draws. 0 with HV off, without the crystal, and where 2β lies outside the sensor range. */
  specularRate(): number {
    const beta = wrapTarget(this.target) / 10
    if (!this.hvOn || this._setup.holder !== 'crystal' || beta < BETA_MIN_DEG || beta > BETA_MAX_DEG) return 0
    return expectedRate([beta], this.u / 10, this.i / 100, this.params, undefined, this.foils())[0]
  }

  /** The true rate R is past Rτ = 0.3: dead-time losses exceed 23 % and the choice of dead-time model
   * starts to matter (simulation aid, not a device feature). */
  get saturated(): boolean {
    return this.expectedRate() * this.params.tau_s > 0.3 / 1.3 // observed m = R/(1+Rτ)
  }

  /** Change the accessories; only with the door open (§6). Refused (false) with doors closed. */
  mount(setup: Setup): boolean {
    if (this.doorsClosed) return false
    const names = [setup.collimatorFilter, setup.sensorFilter].filter((n) => n !== null)
    if ((setup.holder.endsWith('Wheel') || names.length > 0) && !absorbersLoaded()) throw new RangeError('absorber tables not loaded')
    for (const n of names) if (!Object.hasOwn(FOILS_MG_CM2, n)) throw new RangeError(`unknown filter ${n}`)
    this._setup = Object.freeze({ ...setup })
    return true
  }

  private foils(): [string, number][] {
    return [this._setup.collimatorFilter, this._setup.sensorFilter].filter((n) => n !== null).map((n) => [n, FOILS_MG_CM2[n]])
  }

  /** The wheel slot in the beam (null = open slot), or undefined when the wheel frame blocks it. */
  private wheelSlot(): readonly [string, number] | null | undefined {
    const t = wrapTarget(this.target)
    const k = Math.round(t / 100)
    if (k < 0 || k > 6 || Math.abs(t - 100 * k) > WHEEL_WINDOW_DEG * 10) return undefined
    return WHEELS_MG_CM2[this._setup.holder === 'alWheel' ? 'al' : 'material'][k]
  }

  press(key: Key): void {
    this.alert = null
    this.exposureDone = false
    if (key !== 'REPLAY') this.replayIndex = null
    const prevEdit = this.edit
    this.edit = null // any key ends a parameter edit (§7 b2)
    // During a program only these keys act.
    if (this.busy && !['U', 'I', 'COUPLED', 'SCAN', 'HV', 'RESET', 'SPEAKER'].includes(key)) return
    switch (key) {
      case 'U':
      case 'I':
      case 'DT':
      case 'DBETA':
        this.edit = this.bottomShows = key
        return
      case 'LIMITS':
        this.edit = this.bottomShows = prevEdit === 'LIMIT_LO' ? 'LIMIT_HI' : 'LIMIT_LO'
        return
      case 'SENSOR':
      case 'TARGET':
        this.selectMode(key)
        return
      case 'COUPLED':
        // Pressed again while COUPLED is on show: the top display toggles rate ↔ sensor angle.
        if (this.mode === 'COUPLED' && (this.bottomShows === 'COUPLED' || this.busy))
          this.topShowsSensor = !this.topShowsSensor
        else if (!this.busy) {
          this.selectMode('COUPLED')
          this.coupleRef = this.restingArms()
          this.topShowsSensor = false
        }
        return
      case 'ZERO':
        this.path = [{ target: 0, sensor: 0 }]
        this.coupleRef = { target: 0, sensor: 0 }
        return
      case 'RESET': // defaults, HV off, arms driven home (§7 b5)
        Object.assign(this, new Apparatus(this.rng, this.params), {
          doorsClosed: this.doorsClosed,
          speaker: this.speaker,
          timeScale: this.timeScale,
          secondsCounted: this.secondsCounted,
          target: this.target,
          sensor: this.sensor,
          _setup: this._setup,
          path: [{ target: 0, sensor: 0 }],
        })
        return
      case 'REPLAY':
        if (this.replay.length > 0) this.replayIndex = 0
        return
      case 'SPEAKER':
        this.speaker = !this.speaker
        return
      case 'HV':
        if (this.hvOn || this.busy) this.stop()
        else this.startSafety('hv')
        return
      case 'SCAN':
        if (this.busy) return this.stop()
        if (this.dBeta === 0) return this.startSafety('exposure')
        if (this.mode === null) {
          this.alert = 'mode' // auto-scan needs SENSOR, TARGET or COUPLED (§7 b5)
          return
        }
        if (this.limitHi < this.limitLo) {
          this.alert = 'limits'
          this.edit = this.bottomShows = 'LIMIT_HI' // show the flashing limit, ready to correct
          return
        }
        return this.startSafety('scan')
    }
  }

  /** Turn ADJUST by `detents` (negative: counter-clockwise), already multiplied by adjustMultiplier. */
  adjust(detents: number): void {
    detents = Math.trunc(detents)
    this.exposureDone = false
    if (this.replayIndex !== null) {
      this.replayIndex = clamp(this.replayIndex + detents, 0, this.replay.length - 1)
      return
    }
    if (this.edit !== null) {
      if (this.busy && this.edit !== 'U' && this.edit !== 'I') return
      if (this.edit === 'LIMIT_LO' || this.edit === 'LIMIT_HI') {
        const [lo, hi] = ARM_RANGE[this.mode ?? 'COUPLED']
        if (this.edit === 'LIMIT_LO') this.limitLo = clamp(this.limitLo + detents, lo, hi)
        else this.limitHi = clamp(this.limitHi + detents, lo, hi)
        return
      }
      const [lo, hi] = RANGES[this.edit]
      const key = ({ U: 'u', I: 'i', DT: 'dt', DBETA: 'dBeta' } as const)[this.edit]
      this[key] = clamp(this[key] + detents, lo, hi)
      return
    }
    this.moveArm(detents)
  }

  /** Turn the selected arm by `detents` × 0.1° by hand (ADJUST, or dragging the crystal in the view),
   * keeping the 2:1 coupling in COUPLED mode. Ignored while a program runs or the motor drives. */
  moveArm(detents: number): void {
    if (this.busy || this.mode === null || this.moving) return
    this.edit = this.replayIndex = null // a hand on the arm ends an edit, as a key would
    this.bottomShows = this.mode // the display shows the arm being moved
    if (this.mode === 'TARGET') this.target += detents
    else if (this.mode === 'SENSOR') this.sensor = clamp(this.sensor + detents, ...ARM_RANGE.SENSOR)
    else {
      // Manual 2:1 coupling relative to the arms when COUPLED was pressed (§7 b4, §11 c).
      const [sMin, sMax] = ARM_RANGE.SENSOR
      const { target: t0, sensor: s0 } = this.coupleRef
      const t = this.target + detents
      const tMin = t0 + Math.ceil((sMin - s0) / 2)
      const tMax = t0 + Math.floor((sMax - s0) / 2)
      this.target = clamp(t, Math.min(tMin, this.target), Math.max(tMax, this.target))
      this.sensor = clamp(s0 + 2 * (this.target - t0), sMin, sMax)
    }
  }

  /** Open or close the lead-glass doors; they are locked while X-rays can be produced (§6). */
  setDoors(closed: boolean): boolean {
    if (!closed && (this.hvOn || this.busy)) return false
    this.doorsClosed = closed
    if (closed && this.alert === 'doors') this.alert = null
    return true
  }

  /** Advance by `realS` seconds of wall time, scaled by timeScale (Infinity: finish the program now).
   * The self-test always runs in real time: time acceleration is a simulation feature, not a device one. */
  tick(realS: number): void {
    if (this.phase === 'safety') {
      this.safetyLeftS -= realS
      if (this.safetyLeftS > 0) return
      realS = -this.safetyLeftS // only the time after the self-test counts
      this.passSafety()
    }
    // Instant: finish the program now; the rate meter keeps counting in real time.
    let simS = realS * this.timeScale
    if (this.timeScale === Infinity) {
      this.finish()
      simS = realS
    }
    // Advance event by event: the next whole second of the counter or the end of a motor leg.
    for (let n = 0; simS > 0 && n < 1_000_000; n++) {
      const leg = this.path[0]
      const legS = leg ? Math.max(Math.abs(leg.target - this.target), Math.abs(leg.sensor - this.sensor)) / (10 * MOTOR_DEG_PER_S) : Infinity
      const toSecond = 1 - this.clockS
      const dt = Math.min(simS, toSecond, legS)
      simS -= dt
      if (dt === toSecond) {
        this.clockS = 0
        this.countSecond() // a program step only ends while no leg runs, so `leg` stays current
      } else this.clockS += dt
      if (!leg) continue
      if (dt === legS) this.reach()
      else {
        this.target += ((leg.target - this.target) * dt) / legS
        this.sensor += ((leg.sensor - this.sensor) * dt) / legS
      }
    }
  }

  display(): Display {
    const d: Display = {
      top: '', topUnit: '', bottom: '', bottomUnit: '', symbol: null,
      blinkTop: this.alert === 'doors', flashBottom: this.limitHi < this.limitLo, hvLamp: this.hvOn,
      alert: this.alert,
    } // prettier-ignore
    if (this.phase === 'safety') {
      d.top = 'SAFE'
      d.bottom = this.safetyLeftS <= OK_S ? 'OK' : ''
      return d
    }
    if (this.replayIndex !== null) {
      const p = this.replay[this.replayIndex]
      return { ...d, top: fmtMean(p.rate), topUnit: '1/s', bottom: fmtAngle(p.angle), bottomUnit: '°' }
    }
    if (this.mode === 'COUPLED' && this.topShowsSensor) Object.assign(d, { top: fmtAngle(this.sensor), topUnit: '°' })
    else Object.assign(d, { top: fmtRate(this.lastSecondCounts), topUnit: '1/s' })
    if (this.phase === 'exposure' && this.program && this.edit === null) {
      return { ...d, bottom: String(this.dt - this.program.elapsedS), bottomUnit: 's', symbol: 'exposure' }
    }
    if (this.exposureDone) return { ...d, bottom: '0', bottomUnit: 's', symbol: 'exposure' }
    switch (this.bottomKey) {
      case 'U':
        return { ...d, bottom: (this.u / 10).toFixed(1), bottomUnit: 'kV' }
      case 'I':
        return { ...d, bottom: (this.i / 100).toFixed(2), bottomUnit: 'mA' }
      case 'DT':
        return { ...d, bottom: String(this.dt), bottomUnit: 's' }
      case 'DBETA':
        return { ...d, bottom: fmtAngle(this.dBeta), bottomUnit: '°', symbol: this.dBeta === 0 ? 'exposure' : null }
      case 'LIMIT_LO':
        return { ...d, bottom: fmtAngle(this.limitLo), bottomUnit: '°', symbol: 'lower' }
      case 'LIMIT_HI':
        return { ...d, bottom: fmtAngle(this.limitHi), bottomUnit: '°', symbol: 'upper' }
      case 'SENSOR':
        return { ...d, bottom: fmtAngle(this.sensor), bottomUnit: '°' }
      default: // TARGET, COUPLED
        return { ...d, bottom: fmtAngle(wrapTarget(this.target)), bottomUnit: '°' }
    }
  }

  private startSafety(next: 'hv' | 'scan' | 'exposure'): void {
    if (!this.doorsClosed) {
      this.alert = 'doors' // self-test fails, HV stays off, top display blinks (§6)
      return
    }
    this.phase = 'safety'
    this.next = next
    this.safetyLeftS = SAFE_S + OK_S
  }

  private passSafety(): void {
    this.phase = 'idle'
    this.hvOn = true
    if (this.next === 'hv') return
    this.replay = []
    this.clockS = 0
    if (this.next === 'exposure') {
      this.phase = 'exposure'
      this.lastScan = null
      const arms = this.restingArms()
      this.program = { steps: [this.mode === 'SENSOR' ? arms.sensor : wrapTarget(arms.target)], index: 0, elapsedS: 0, counts: 0 }
      return
    }
    // Auto-scan: both arms to zero (in every mode, confirmed by the lab staff), then the scan arm to the
    // lower limit, and only then HV on (§7 b5).
    this.hvOn = false
    const mode = this.mode!
    const [lo, hi] = ARM_RANGE[mode]
    const first = clamp(this.limitLo, lo, hi)
    const last = clamp(this.limitHi, lo, hi)
    const n = Math.floor((last - first) / this.dBeta) + 1
    this.lastScan = { mode, first, last, u: this.u, i: this.i, dt: this.dt, changed: false }
    this.path = [{ target: 0, sensor: 0 }]
    this.coupleRef = { target: 0, sensor: 0 } // auto-scan couples to the zero of the measuring system
    this.phase = 'positioning'
    this.program = { steps: Array.from({ length: n }, (_, k) => first + k * this.dBeta), index: 0, elapsedS: 0, counts: 0 }
    this.moveTo(this.program.steps[0])
  }

  /** Select a scan mode; limits set for another arm are clamped into this one's range, so the
   * display never shows limits the scan would not use. */
  private selectMode(mode: Mode): void {
    const [lo, hi] = ARM_RANGE[mode]
    this.mode = this.bottomShows = mode
    this.limitLo = clamp(this.limitLo, lo, hi)
    this.limitHi = clamp(this.limitHi, lo, hi)
  }

  /** Where the arms come to rest: the last motor waypoint, or where they are. */
  private restingArms(): Arms {
    return this.path.at(-1) ?? { target: this.target, sensor: this.sensor }
  }

  /** Queue a motor move of the scan arm to `angle` (0.1°). */
  private moveTo(angle: number): void {
    const at = this.restingArms()
    if (this.mode === 'SENSOR') this.path.push({ ...at, sensor: angle })
    else if (this.mode === 'TARGET') this.path.push({ ...at, target: angle })
    else this.path.push({ target: angle, sensor: 2 * angle }) // auto-scan couples to zero (§7 b4)
  }

  /** The arms reach the next waypoint. After the last one, positioning ends in HV on, and a program's
   * Δt starts now. */
  private reach(): void {
    Object.assign(this, this.path.shift())
    if (this.moving) return
    if (this.phase === 'positioning') {
      this.phase = 'scan'
      this.hvOn = true
    }
    if (this.program) this.clockS = 0
  }

  private land(): void {
    while (this.moving) this.reach()
  }

  /** One whole simulated second: sample the counter, feed the running program. */
  private countSecond(): void {
    const c = Math.min(poisson(this.expectedRate(), this.rng), COUNTER_MAX_PER_S)
    this.lastSecondCounts = c
    this.secondsCounted++
    const p = this.program
    if (!p || !this.ready || this.moving) return // a program waits for HV, emission current and the arms (§7 b5)
    p.counts += c
    const s = this.lastScan // null for an exposure
    if (s && (this.u !== s.u || this.i !== s.i)) s.changed = true
    if (++p.elapsedS === this.dt) this.endStep()
  }

  private endStep(): void {
    const p = this.program!
    this.replay.push({ angle: p.steps[p.index], rate: p.counts / this.dt })
    p.index++
    p.elapsedS = p.counts = 0
    if (p.index === p.steps.length) {
      this.exposureDone = this.phase === 'exposure'
      this.stop()
    }
    else this.moveTo(p.steps[p.index])
  }

  /** Instant mode: finish the program in one go, Poisson(R̄ · remaining time) per step.
   * A sum of Poisson counts is Poisson, so the stored means have the same statistics as in real time. */
  private finish(): void {
    this.land()
    while (this.program && this.ready) {
      const p = this.program
      const left = this.dt - p.elapsedS
      p.counts += Math.min(poisson(this.expectedRate() * left, this.rng), COUNTER_MAX_PER_S * left)
      p.elapsedS = this.dt
      this.endStep()
      this.land()
    }
  }

  /** End any program and switch the high voltage off; stored values stay for REPLAY. The arms finish
   * their current leg, so they always rest on whole 0.1° steps. */
  private stop(): void {
    this.phase = 'idle'
    this.program = null
    this.hvOn = false
    this.path.length = Math.min(this.path.length, 1)
    if (this.replay.length === 0) this.lastScan = null // stopped before the first point
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi)
}

/** Target angle in 0.1° folded into −180.0° … 179.9°, as the physics wraps it; the arm itself turns freely. */
export function wrapTarget(tenths: number): number {
  return ((((tenths + 1800) % 3600) + 3600) % 3600) - 1800
}

function fmtAngle(tenths: number): string {
  return (Math.round(tenths) / 10).toFixed(1) // "-0.0" never shows: Math.round(-0.4) is -0, and (-0).toFixed is "0.0"
}

/** A stored mean rate (REPLAY) with as many decimals as fit the 4 digits: 5.810, 58.10, 581.0, 5810. */
export function fmtMean(rate: number): string {
  for (let decimals = 3; decimals > 0; decimals--) {
    const s = rate.toFixed(decimals)
    if (s.replace('.', '').length <= 4) return s // 9.9996 → "10.000" is 5 digits: one decimal fewer
  }
  return fmtRate(rate)
}

function fmtRate(rate: number): string {
  return String(Math.min(Math.round(rate), DISPLAY_MAX))
}
