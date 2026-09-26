// Goniometer 554 831 seen from above (a schematic, not a photo): X-ray tube, collimator, the NaCl crystal
// on the target arm at β and the GM counter on the sensor arm. It draws the apparatus state. The beam
// brightness comes from the apparatus (the physics model), never from the view.
import { wrapTarget, type Apparatus } from '../apparatus/apparatus'
import { getMode, showHints } from '../pedagogy/mode'
import { MO_KA_PM, MO_KB_PM } from '../physics/constants'
import { thetaFromLambda } from '../physics/crystal'
import { dpr, palette, paletteVersion, reducedMotion, scaledFont, watchSize } from './canvas'

const S1_CM = 5 // collimator–crystal distance, LD P6.3.3.1
const S2_CM = 6 // crystal–counter distance
const SPRING_K = 300 // bragg-ui motion.md: the arms ease within an ADJUST step
const SPRING_C = 30
const DASH_PX_PER_S = 40 // the beam's dashes travel while the tube emits
const LABEL_MIN_GAP_PX = 40 // angle labels every 5°, 10°, 20° or 30°, whichever keeps them this far apart ("170°" is ~28 px)
const RAD = Math.PI / 180
const GRAB_CM = 2.2 // explore mode: a pointer this close to the axis turns the crystal
// Explore mode: where the counter meets each line, sensor angle 2θₙ (n = 1–3).
const EXPECTED = [1, 2, 3].flatMap((n) => [
  { deg: 2 * thetaFromLambda(MO_KA_PM, n), colour: 'phys-kalpha' as const },
  { deg: 2 * thetaFromLambda(MO_KB_PM, n), colour: 'phys-kbeta' as const },
])

/** Folded target angle in degrees (float), as the display shows it. */
const foldDeg = (tenths: number) => wrapTarget(tenths) / 10

/** Mounts the goniometer on `canvas`; returns the per-frame render function (dtS: frame time in s). */
export function mountGoniometer(canvas: HTMLCanvasElement, a: Apparatus): (dtS: number) => void {
  const ctx = canvas.getContext('2d')!
  // Displayed arm angles in 0.1°: eased toward the apparatus after an ADJUST jump, equal to it otherwise.
  let t = a.target
  let s = a.sensor
  let vt = 0
  let vs = 0
  let dash = 0
  // What the last frame drew, so a still picture costs nothing.
  let drawnT = NaN
  let drawnS = NaN
  let drawnGlow = NaN
  let drawnRate = NaN
  let drawnPalette = -1
  let drawnHints = showHints()
  let drawnTurn = false
  // Explore mode: the crystal can be dragged round (below) in TARGET or COUPLED, arms at rest, no program.
  const canTurn = () => getMode() === 'explore' && (a.mode === 'TARGET' || a.mode === 'COUPLED') && !a.busy && !a.moving
  let grab: { last: number; acc: number; t0: number } | null = null
  const handle = () => grab !== null || canTurn()
  // The specular rate changes only with the target, U, I or HV.
  let rate = 0
  let rateKey = ''

  const draw = (glow: number, emitting: boolean) => {
    const P = palette
    const k = dpr()
    const W = canvas.width
    const H = canvas.height
    const u = Math.min(W / 15.6, H / 10.4) // px per cm
    const cx = W / 2
    const cy = H / 2 + 2.6 * u
    const beta = foldDeg(t)
    const sensorDeg = s / 10
    ctx.clearRect(0, 0, W, H)
    ctx.lineCap = 'round'

    // Sensor angle scale: a tick every 1°, longer every 5°, labels spaced for the canvas size.
    const rT = 4.4 * u
    ctx.beginPath()
    for (let d = -10; d <= 170; d++) {
      const len = (d % 5 === 0 ? 0.35 : 0.18) * u
      const c = Math.cos(d * RAD)
      const n = Math.sin(d * RAD)
      ctx.moveTo(cx + rT * c, cy - rT * n)
      ctx.lineTo(cx + (rT - len) * c, cy - (rT - len) * n)
    }
    ctx.strokeStyle = P['label-3']
    ctx.lineWidth = k
    ctx.stroke()
    const rL = rT - 0.75 * u // label radius
    const step = [5, 10, 20, 30].find((st) => rL * st * RAD >= LABEL_MIN_GAP_PX * k) ?? 30
    ctx.font = scaledFont(P.caption, k)
    ctx.fillStyle = P['label-2']
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let d = 0; d <= 170; d += step) ctx.fillText(`${d}°`, cx + rL * Math.cos(d * RAD), cy - rL * Math.sin(d * RAD))
    if (showHints()) {
      // Kβ shorter, so the two lines differ by more than colour
      ctx.lineWidth = 2 * k
      for (const { deg, colour } of EXPECTED) {
        const len = (colour === 'phys-kbeta' ? 0.25 : 0.4) * u
        ctx.beginPath()
        ctx.moveTo(cx + rT * Math.cos(deg * RAD), cy - rT * Math.sin(deg * RAD))
        ctx.lineTo(cx + (rT + len) * Math.cos(deg * RAD), cy - (rT + len) * Math.sin(deg * RAD))
        ctx.strokeStyle = P[colour]
        ctx.stroke()
      }
      ctx.lineWidth = k
    }

    // Turntable
    ctx.beginPath()
    ctx.arc(cx, cy, 1.1 * u, 0, 2 * Math.PI)
    ctx.strokeStyle = P.separator
    ctx.stroke()

    // Beams: the incident one while the tube emits, the reflected one at 2β with log-rate opacity.
    const xTube = cx - (S1_CM + 0.5) * u
    if (emitting) {
      ctx.save()
      ctx.strokeStyle = P['phys-beam']
      ctx.lineWidth = 2 * k
      if (!reducedMotion()) {
        ctx.setLineDash([6 * k, 5 * k])
        ctx.lineDashOffset = -dash * k
      }
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.moveTo(xTube, cy)
      ctx.lineTo(cx, cy)
      ctx.stroke()
      ctx.globalAlpha = Math.min(1, Math.max(0.08, Math.log10(1 + rate) / 4))
      if (rate > 0) {
        const r = (S2_CM + 1.8) * u
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + r * Math.cos(2 * beta * RAD), cy - r * Math.sin(2 * beta * RAD))
        ctx.stroke()
      }
      ctx.restore()
    }

    // X-ray tube with its anode; the cathode glows while HV is on, brighter with the emission current.
    const x0 = cx - (S1_CM + 2.6) * u
    ctx.beginPath()
    ctx.roundRect(x0, cy - 0.65 * u, xTube - x0, 1.3 * u, 0.3 * u)
    ctx.fillStyle = P['surface-2']
    ctx.fill()
    ctx.strokeStyle = P['label-3']
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(xTube - 0.55 * u, cy - 0.35 * u)
    ctx.lineTo(xTube - 0.3 * u, cy + 0.35 * u)
    ctx.strokeStyle = P['label-2']
    ctx.lineWidth = 1.5 * k
    ctx.stroke()
    if (glow > 0) {
      ctx.fillStyle = P['led-on']
      ctx.globalAlpha = glow
      ctx.beginPath()
      ctx.arc(x0 + 0.55 * u, cy, 0.16 * u, 0, 2 * Math.PI)
      ctx.fill()
      ctx.globalAlpha = 0.25 * glow
      ctx.beginPath()
      ctx.arc(x0 + 0.55 * u, cy, 0.38 * u, 0, 2 * Math.PI)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // Collimator slit
    ctx.fillStyle = P['label-2']
    const xc = cx - S1_CM * u
    ctx.fillRect(xc - 0.12 * u, cy - 0.6 * u, 0.24 * u, 0.5 * u)
    ctx.fillRect(xc - 0.12 * u, cy + 0.1 * u, 0.24 * u, 0.5 * u)

    // Crystal on the target arm: its surface passes through the axis, lattice planes parallel to it.
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-beta * RAD)
    ctx.beginPath()
    ctx.rect(-0.9 * u, 0, 1.8 * u, 0.45 * u)
    ctx.fillStyle = P['surface-2']
    ctx.fill()
    ctx.strokeStyle = P['phys-crystal']
    ctx.lineWidth = k
    ctx.stroke()
    ctx.beginPath()
    for (const y of [0.12, 0.23, 0.34]) {
      ctx.moveTo(-0.85 * u, y * u)
      ctx.lineTo(0.85 * u, y * u)
    }
    ctx.globalAlpha = 0.5
    ctx.stroke()
    if (handle()) {
      // Explore: a grab handle at the crystal's end, the one accent on the canvas (touch has no hover cursor)
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(0.9 * u, 0, 0.15 * u, 0, 2 * Math.PI)
      ctx.fillStyle = P.accent
      ctx.fill()
    }
    ctx.restore()

    // Sensor arm with the GM counter tube, its window facing the crystal.
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-sensorDeg * RAD)
    ctx.beginPath()
    ctx.moveTo(1.1 * u, 0)
    ctx.lineTo(S2_CM * u, 0)
    ctx.strokeStyle = P['label-3']
    ctx.lineWidth = k
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(S2_CM * u, -0.35 * u, 1.8 * u, 0.7 * u, 0.35 * u)
    ctx.fillStyle = P['surface-2']
    ctx.fill()
    ctx.strokeStyle = P['label-2']
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(S2_CM * u, -0.25 * u)
    ctx.lineTo(S2_CM * u, 0.25 * u)
    ctx.strokeStyle = P.label
    ctx.lineWidth = 2 * k
    ctx.stroke()
    ctx.restore()

    // θ and 2θ arcs
    ctx.font = scaledFont(P.footnote, k)
    ctx.lineWidth = k
    ctx.strokeStyle = ctx.fillStyle = P['label-2']
    for (const [deg, r, label] of [[beta, 1.7, 'θ'], [sensorDeg, 2.5, '2θ']] as const) {
      if (Math.abs(deg) < 1) continue
      ctx.beginPath()
      ctx.arc(cx, cy, r * u, 0, -deg * RAD, deg > 0)
      ctx.stroke()
      const m = (deg / 2) * RAD
      ctx.fillText(label, cx + (r + 0.4) * u * Math.cos(m), cy - (r + 0.4) * u * Math.sin(m))
    }
  }

  let resized = true
  const render = (dtS: number) => {
    if (a.moving || reducedMotion()) {
      t = a.target
      s = a.sensor
      vt = vs = 0
    } else {
      const h = Math.min(dtS, 1 / 30) // semi-implicit Euler stays stable at this step
      vt += (SPRING_K * (a.target - t) - SPRING_C * vt) * h
      vs += (SPRING_K * (a.sensor - s) - SPRING_C * vs) * h
      t += vt * h
      s += vs * h
      if (Math.abs(a.target - t) < 0.01 && Math.abs(vt) < 0.01) [t, vt] = [a.target, 0]
      if (Math.abs(a.sensor - s) < 0.01 && Math.abs(vs) < 0.01) [s, vs] = [a.sensor, 0]
    }
    const key = `${a.target} ${a.u} ${a.i} ${a.hvOn}`
    if (key !== rateKey) [rate, rateKey] = [a.specularRate(), key]
    const glow = a.hvOn ? 0.3 + (0.7 * a.i) / 100 : 0
    const animate = a.emitting && !reducedMotion()
    if (animate) dash = (dash + DASH_PX_PER_S * dtS) % 1100
    const still = t === drawnT && s === drawnS && glow === drawnGlow && rate === drawnRate
    if (!resized && !animate && still && paletteVersion === drawnPalette && showHints() === drawnHints && handle() === drawnTurn) return
    ;[drawnT, drawnS, drawnGlow, drawnRate, drawnPalette, drawnHints, drawnTurn, resized] = [t, s, glow, rate, paletteVersion, showHints(), handle(), false]
    draw(glow, a.emitting)
  }
  // Explore mode: drag the crystal round the axis. It turns the arm through Apparatus.moveArm, so the 2:1
  // coupling and the "not while the motor drives or a program runs" rules stay in one place.
  const polar = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    const u = Math.min(r.width / 15.6, r.height / 10.4)
    const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2 + 2.6 * u]
    const [dx, dy] = [e.clientX - cx, cy - e.clientY]
    return { near: Math.hypot(dx, dy) < GRAB_CM * u, deg: Math.atan2(dy, dx) / RAD }
  }
  canvas.addEventListener('pointerdown', (e) => {
    const p = polar(e)
    if (e.button !== 0 || !p.near || !canTurn()) return
    grab = { last: p.deg, acc: 0, t0: a.target }
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    const p = polar(e)
    if (!grab) return void (canvas.style.cursor = p.near && canTurn() ? 'grab' : '')
    grab.acc += ((p.deg - grab.last + 540) % 360) - 180 // shortest way round
    grab.last = p.deg
    a.moveArm(grab.t0 + Math.round(10 * grab.acc) - a.target)
  })
  for (const ev of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(ev, () => (grab = null))

  watchSize(canvas, () => {
    resized = true
    render(0)
  })
  return render
}
