// Huygens / path-difference close-up: parallel rays reflected by neighbouring lattice planes at the
// current target angle θ. The ray from the plane below travels 2d sin θ further (the bracket); its wave
// crests line up with the one above when that equals a whole number of wavelengths. Drawn to scale in
// pm: plane spacing d, λ of the selected Mo line.
import { wrapTarget, type Apparatus } from '../apparatus/apparatus'
import { t } from '../i18n'
import { D_NACL_PM, MO_KA_PM, MO_KB_PM } from '../physics/constants'
import { lambdaFromTheta, thetaFromLambda } from '../physics/crystal'
import { DEFAULT } from '../physics/scan'
import { dpr, palette, paletteVersion, reducedMotion, scaledFont, watchSize } from './canvas'

const LINES = { ka: { label: 'Kα', lambdaPm: MO_KA_PM }, kb: { label: 'Kβ', lambdaPm: MO_KB_PM } }
type Line = keyof typeof LINES
const PLANES = 4
const CREST_PM_PER_S = 60 // how fast the drawn crests travel along the rays
const RAD = Math.PI / 180

/** Diffraction order n whose Bragg angle is closest to θ (n ≥ 1): n = round(2d sin θ / λ). */
export function nearestOrder(thetaDeg: number, lambdaPm: number): number {
  return Math.max(1, Math.round(lambdaFromTheta(thetaDeg) / lambdaPm))
}

export function mountHuygens(root: HTMLElement, a: Apparatus) {
  let line: Line = 'ka'
  let phasePm = 0
  let resized = true
  let drawn = ''
  let shownEq = ''

  root.innerHTML = `<div class="view-head" data-head></div>
    <canvas class="huygens-canvas" data-canvas role="img"></canvas>
    <p class="equation" data-eq></p>
    <p class="note" data-note></p>`
  const head = root.querySelector<HTMLElement>('[data-head]')!
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]')!
  const eq = root.querySelector<HTMLElement>('[data-eq]')!
  const note = root.querySelector<HTMLElement>('[data-note]')!
  const ctx = canvas.getContext('2d')!

  const build = () => {
    const s = t()
    head.innerHTML = `
      <h2>${s.huygens}</h2>
      <div class="seg" role="group" aria-label="${s.line}">
        ${(Object.keys(LINES) as Line[]).map((l) => `<button data-line="${l}" class="line-${l}" aria-pressed="${l === line}">${LINES[l].label}</button>`).join('')}
      </div>`
    canvas.setAttribute('aria-label', s.huygensNote)
    note.textContent = s.huygensNote
    shownEq = ''
  }

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-line]')
    if (!b || b.dataset.line === line) return
    line = b.dataset.line as Line
    build()
  })

  const draw = (thetaDeg: number, lambdaPm: number, met: boolean) => {
    const P = palette
    const S = t()
    const k = dpr()
    const W = canvas.width
    const H = canvas.height
    const d = 0.14 * H // plane spacing in px
    const px = d / D_NACL_PM // px per pm
    const cx = W / 2
    const y0 = 0.3 * H
    const th = thetaDeg * RAD
    const [c, s] = [Math.cos(th), Math.sin(th)]
    const lineColour = P[line === 'ka' ? 'phys-kalpha' : 'phys-kbeta']
    ctx.clearRect(0, 0, W, H)
    ctx.lineCap = 'round'

    // Lattice planes with alternating Na⁺ / Cl⁻ ions, one d apart along the plane as in NaCl (100).
    ctx.strokeStyle = ctx.fillStyle = P['phys-crystal']
    ctx.lineWidth = k
    for (let j = 0; j < PLANES; j++) {
      const y = y0 + j * d
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
      ctx.globalAlpha = 0.8
      for (let i = -Math.ceil(cx / d); i <= Math.ceil(cx / d); i++) {
        ctx.beginPath()
        ctx.arc(cx + i * d, y, ((i + j) % 2 ? 0.07 : 0.1) * d, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    if (!(thetaDeg > 0 && thetaDeg < 90)) return

    // Rays: in along (c, s), out along (c, −s), reflected at (cx, y0 + j d). Crests sit where the path
    // length u + j d sin θ (u: signed distance from the reflection point) is a whole number of λ.
    const R = Math.hypot(W, H)
    const half = 0.15 * d
    for (let j = 0; j < PLANES; j++) {
      const py = y0 + j * d
      ctx.strokeStyle = P['phys-beam']
      ctx.globalAlpha = 0.5
      ctx.lineWidth = k
      ctx.beginPath()
      ctx.moveTo(cx - R * c, py - R * s)
      ctx.lineTo(cx, py)
      ctx.lineTo(cx + R * c, py - R * s)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.strokeStyle = lineColour
      ctx.lineWidth = 1.5 * k
      ctx.beginPath()
      const lam = lambdaPm * px
      const shift = (phasePm - j * D_NACL_PM * s) * px
      for (let u = shift - Math.ceil((R + shift) / lam) * lam; u < R; u += lam) {
        const [dx, dy] = u < 0 ? [c, s] : [c, -s] // ray direction here
        const x = cx + u * dx
        const y = py + u * dy
        ctx.moveTo(x - half * dy, y + half * dx)
        ctx.lineTo(x + half * dy, y - half * dx)
      }
      ctx.stroke()
    }

    // Path difference on the second ray: d sin θ in and d sin θ out, cut off by the perpendiculars
    // from the first reflection point.
    const e = d * s
    const [xi, yi] = [cx - e * c, y0 + d - e * s]
    const [xo, yo] = [cx + e * c, yi]
    ctx.setLineDash([3 * k, 3 * k])
    ctx.strokeStyle = P['label-3']
    ctx.lineWidth = k
    ctx.beginPath()
    ctx.moveTo(xi, yi)
    ctx.lineTo(cx, y0)
    ctx.lineTo(xo, yo)
    ctx.stroke()
    ctx.setLineDash([])
    const bracket = met ? P['phys-constructive'] : P.label
    ctx.strokeStyle = bracket
    ctx.lineWidth = 4 * k
    ctx.beginPath()
    ctx.moveTo(xi, yi)
    ctx.lineTo(cx, y0 + d)
    ctx.lineTo(xo, yo)
    ctx.stroke()

    // Comparison below the planes: 2d sin θ against n λ, with a tick every λ, both at one scale that
    // makes the longer bar 60 % of the width.
    ctx.font = scaledFont(P.footnote, k)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    const n = nearestOrder(thetaDeg, lambdaPm)
    const x0 = 0.3 * W
    const bpx = (0.6 * W) / Math.max(2 * D_NACL_PM * s, n * lambdaPm)
    const bars: [number, number, string, string][] = [
      [0.84 * H, 2 * D_NACL_PM * s * bpx, bracket, S.pathDiff],
      [0.93 * H, n * lambdaPm * bpx, lineColour, `${n}λ`],
    ]
    for (const [y, len, colour, label] of bars) {
      ctx.fillStyle = P['label-2']
      ctx.fillText(label, x0 - 2 * half, y)
      ctx.strokeStyle = colour
      ctx.lineWidth = 4 * k
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x0 + len, y)
      ctx.stroke()
    }
    ctx.lineWidth = k
    ctx.beginPath()
    for (let m = 0; m <= n; m++) {
      const x = x0 + m * lambdaPm * bpx
      ctx.moveTo(x, 0.93 * H - 2 * half)
      ctx.lineTo(x, 0.93 * H + 2 * half)
    }
    ctx.stroke()
  }

  const render = (dtS: number) => {
    if (!canvas.width) return // hidden (closed sheet)
    const thetaDeg = wrapTarget(a.target) / 10
    const { lambdaPm } = LINES[line]
    const valid = thetaDeg > 0 && thetaDeg < 90
    const n = valid ? nearestOrder(thetaDeg, lambdaPm) : 0
    const met = valid && Math.abs(thetaDeg - thetaFromLambda(lambdaPm, n)) < DEFAULT.sigma_deg

    const s = t()
    const eqText = valid
      ? [
          `θ = β = ${thetaDeg.toFixed(1)}°`,
          `${s.pathDiff} = ${lambdaFromTheta(thetaDeg).toFixed(1)} pm ${met ? '≈' : '≠'} nλ = ${n} × ${lambdaPm.toFixed(1)} = ${(n * lambdaPm).toFixed(1)} pm`,
        ]
          .map((part) => `<span>${part.replaceAll(' ', '\u00a0')}</span>`)
          .join('')
      : `<span>θ = β = ${thetaDeg.toFixed(1)}°</span>`
    const eqKey = `${eqText} ${met}`
    if (eqKey !== shownEq) {
      eq.innerHTML = `${eqText} <strong class="met" data-met="${met}">${met ? s.braggMet(LINES[line].label, n) : s.braggNot(LINES[line].label)}</strong>`
      shownEq = eqKey
    }

    const animate = valid && !reducedMotion()
    if (animate) phasePm = (phasePm + CREST_PM_PER_S * dtS) % lambdaPm
    else phasePm = 0
    const key = `${thetaDeg} ${line} ${met} ${paletteVersion} ${s.pathDiff}`
    if (!resized && !animate && key === drawn) return
    ;[drawn, resized] = [key, false]
    draw(thetaDeg, lambdaPm, met)
  }

  watchSize(canvas, () => {
    resized = true
    render(0)
  })
  build()
  return { build, render }
}
