// Live spectrum: the stored scan points (angle, mean rate over Δt) as they arrive, drawn with uPlot.
// Linear or log y. The axes are fixed for a scan: x spans the limits, the linear y range only steps up
// when a point exceeds it, and log y is fixed. Data never makes the axes jump point by point.
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { Apparatus } from '../apparatus/apparatus'
import { t } from '../i18n'
import { downloadCsv } from '../pedagogy/csv'
import { showHints } from '../pedagogy/mode'
import { MO_KA_PM, MO_KB_PM } from '../physics/constants'
import { lambdaFromTheta, thetaFromLambda } from '../physics/crystal'
import { lambdaMinPm } from '../physics/source'
import { palette, paletteVersion, scaledFont } from './canvas'

const LOG_RANGE = { min: 1, max: 1e5 } // 1/s
const EMPTY_RANGE = { min: 0, max: 30 } // °, before the first scan
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
// Explore mode: Bragg angles θₙ of the Mo K lines, n = 1–3 (Kα reflects up to n = 7; the leaflet's scan
// shows three orders).
const LINES = [1, 2, 3].flatMap((n) => [
  { label: `${n}·Kα`, theta: thetaFromLambda(MO_KA_PM, n), colour: 'phys-kalpha-text' as const },
  { label: `${n}·Kβ`, theta: thetaFromLambda(MO_KB_PM, n), colour: 'phys-kbeta' as const },
])

/** Smallest 1-2-5 × 10ⁿ at or above x (at least 10). */
function niceCeil(x: number): number {
  for (let p = 10; ; p *= 10) for (const m of [1, 2, 5]) if (m * p >= x) return m * p
}

export function mountSpectrum(root: HTMLElement, a: Apparatus) {
  let log = false
  let plot: uPlot | null = null
  let builtPalette = -1
  let scan = a.lastScan
  let shown = 0
  let yMax = 10
  let builtHints = showHints()
  let version = 0 // bumped after every uPlot draw (it draws in a microtask): the 3D monitor copies the canvas then
  const xs: number[] = []
  const ys: number[] = []
  const data = (): uPlot.AlignedData => [xs, log ? ys.map((y) => (y > 0 ? y : null)) : ys] // log: no zeros

  root.innerHTML = `<div class="view-head" data-head></div>
    <div class="plot" data-plot><p class="empty" data-empty><span></span></p></div>`
  const head = root.querySelector<HTMLElement>('[data-head]')!
  const box = root.querySelector<HTMLElement>('[data-plot]')!
  const empty = root.querySelector<HTMLElement>('[data-empty]')!

  const xRange = () => {
    if (!scan) return EMPTY_RANGE
    const [lo, hi] = [scan.first / 10, scan.last / 10]
    return lo === hi ? { min: lo - 1, max: hi + 1 } : { min: lo, max: hi }
  }
  const setY = () => plot?.setScale('y', log ? LOG_RANGE : { min: 0, max: yMax })

  const build = () => {
    const s = t()
    head.innerHTML = `
      <h2>${s.spectrum}</h2>
      <output class="readout" data-readout></output>
      <div class="seg" role="group" aria-label="${s.scale}">
        <button data-log="0" aria-pressed="${!log}">${s.linear}</button>
        <button data-log="1" aria-pressed="${log}">${s.log}</button>
      </div>
      <button class="tool csv" data-csv aria-label="${s.csvLabel}" title="${s.csvLabel}" disabled>${s.csv}</button>`
    empty.firstElementChild!.textContent = s.spectrumEmpty
    const readout = head.querySelector<HTMLElement>('[data-readout]')!
    const explore = showHints()
    empty.hidden = xs.length > 0
    const P = palette
    const font = scaledFont(P.caption, 1)
    const labelFont = scaledFont(P.footnote, 1)
    const axis = { stroke: P['label-2'], font, labelFont, ticks: { stroke: P.separator, width: 1, size: 4 } }
    plot?.destroy()
    plot = new uPlot(
      {
        width: box.clientWidth,
        height: box.clientHeight,
        legend: { show: false },
        scales: { x: { time: false, auto: false }, y: { auto: false, distr: log ? 3 : 1, log: 10 } },
        axes: [
          { ...axis, grid: { show: false }, label: scan?.mode === 'SENSOR' ? s.axisSensor : s.axisTarget, labelSize: 22 },
          {
            ...axis,
            grid: { stroke: P.separator, width: 1 },
            ticks: { show: false },
            label: s.axisRate,
            labelSize: 22,
            size: 48,
            // log: label the decades only, as 10ⁿ
            values: log
              ? (_, splits) => splits.map((v) => {
                  const n = Math.log10(v)
                  return Number.isInteger(n) ? `10${[...String(n)].map((d) => SUP[+d]).join('')}` : ''
                })
              : undefined,
          },
        ],
        series: [{}, { stroke: P.label, width: 1.5, points: { size: 4, stroke: P.label, fill: P.label } }],
        cursor: {
          drag: { x: true, y: false },
          points: { size: 7, fill: P.accent, stroke: P.accent },
          // double click/tap: back to the whole scan
          bind: { dblclick: (u) => () => (u.setScale('x', xRange()), null) },
        },
        hooks: {
          draw: [() => void version++],
          // Explore overlays, under the data: the band the tube cannot reach (λ < λmin at the present U)
          // and the expected line angles. The x axis is β (θ) for TARGET/COUPLED scans, 2θ for SENSOR scans.
          drawClear: [
            (u) => {
              if (!explore || !scan || scan.mode === 'TARGET') return // none on the empty axis
              const f = scan.mode === 'SENSOR' ? 2 : 1
              const { ctx, bbox } = u
              const k = uPlot.pxRatio
              const [left, right] = [bbox.left, bbox.left + bbox.width]
              ctx.save()
              ctx.font = scaledFont(P.caption, k)
              ctx.textBaseline = 'top'
              const m = ctx.measureText('Kα')
              const row = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent
              // |angle| < f·θ(λmin): the tube emits nothing that short at the scan's U.
              const th = thetaFromLambda(lambdaMinPm(scan.u / 10))
              const edge = f * (Number.isNaN(th) ? 90 : th)
              const [x0, x1] = [Math.max(u.valToPos(-edge, 'x', true), left), Math.min(u.valToPos(edge, 'x', true), right)]
              if (x1 > x0) {
                ctx.fillStyle = P.fill
                ctx.fillRect(x0, bbox.top, x1 - x0, bbox.height)
                ctx.fillStyle = P['label-2']
                ctx.textAlign = 'left'
                const band = t().lambdaMinBand
                if (empty.hidden && ctx.measureText(band).width < x1 - x0) ctx.fillText(band, x0 + 4 * k, bbox.top + bbox.height - row - 4 * k)
              }
              ctx.textAlign = 'center'
              for (const [i, l] of LINES.entries()) {
                const x = Math.round(u.valToPos(f * l.theta, 'x', true))
                if (!(x >= left && x <= right)) continue
                const y = bbox.top + (i % 2) * row // Kα and Kβ labels on alternate rows
                const kb = l.colour === 'phys-kbeta'
                ctx.fillStyle = P[l.colour]
                ctx.fillText(l.label, x, y)
                // Kβ dashed, so the two lines differ by more than colour
                ctx.strokeStyle = P[kb ? 'phys-kbeta' : 'phys-kalpha']
                ctx.lineWidth = k
                ctx.setLineDash(kb ? [2 * k, 2 * k] : [])
                ctx.beginPath()
                ctx.moveTo(x + k / 2, y + row)
                ctx.lineTo(x + k / 2, bbox.top + bbox.height)
                ctx.stroke()
              }
              ctx.restore()
            },
          ],
          setCursor: [
            (u) => {
              const i = u.cursor.idx
              if (i == null || i >= xs.length) return void (readout.textContent = '')
              const [x, y] = [xs[i], ys[i]]
              const lam = explore && scan?.mode === 'COUPLED' ? ` · ${t().pathDiff} = ${lambdaFromTheta(x).toFixed(1)} pm (= nλ)` : ''
              readout.textContent = `${x.toFixed(1)}° · ${y.toFixed(1)} 1/s${lam}`
            },
          ],
        },
      },
      data(),
      box,
    )
    plot.setScale('x', xRange())
    setY()
    builtPalette = paletteVersion
    builtHints = explore
  }

  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-csv]')) return downloadCsv(a)
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-log]')
    if (!b || (b.dataset.log === '1') === log) return
    log = !log
    build()
  })
  new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect
    plot?.setSize({ width, height })
  }).observe(box)

  const render = () => {
    if (paletteVersion !== builtPalette || showHints() !== builtHints) build()
    if (a.lastScan !== scan) {
      // A new scan (or none): start over with its range.
      scan = a.lastScan
      xs.length = ys.length = shown = 0
      yMax = 10
      build()
    }
    const n = scan ? a.replay.length : 0
    const csv = head.querySelector<HTMLButtonElement>('[data-csv]')!
    if (csv.disabled !== (n === 0)) csv.disabled = n === 0
    if (n === shown) return
    if (n < shown) xs.length = ys.length = shown = 0
    for (; shown < n; shown++) {
      const p = a.replay[shown]
      xs.push(p.angle / 10)
      ys.push(p.rate)
      if (p.rate > yMax) yMax = niceCeil(p.rate * 1.05)
    }
    empty.hidden = n > 0 // before the redraw: the band caption shows only without it
    plot!.setData(data(), false)
    setY()
  }

  build()
  return { build, render, canvas: () => plot!.ctx.canvas, version: () => version, empty: () => xs.length === 0 }
}
