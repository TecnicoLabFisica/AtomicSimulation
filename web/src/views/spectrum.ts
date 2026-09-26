// Live spectrum: the stored scan points (angle, mean rate over Δt) as they arrive, drawn with uPlot.
// Linear or log y. The axes are fixed for a scan: x spans the limits, the linear y range only steps up
// when a point exceeds it, and log y is fixed. Data never makes the axes jump point by point.
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { Apparatus } from '../apparatus/apparatus'
import { t } from '../i18n'
import { lambdaFromTheta } from '../physics/crystal'
import { palette, paletteVersion, scaledFont } from './canvas'

const LOG_RANGE = { min: 1, max: 1e5 } // 1/s
const EMPTY_RANGE = { min: 0, max: 30 } // °, before the first scan
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'

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
      </div>`
    empty.firstElementChild!.textContent = s.spectrumEmpty
    const readout = head.querySelector<HTMLElement>('[data-readout]')!
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
          setCursor: [
            (u) => {
              const i = u.cursor.idx
              if (i == null || i >= xs.length) return void (readout.textContent = '')
              const [x, y] = [xs[i], ys[i]]
              // ponytail: reveals λ; gate it off in Phase 9 lab mode
              const lam = scan?.mode === 'COUPLED' ? ` · ${t().pathDiff} = ${lambdaFromTheta(x).toFixed(1)} pm (= nλ)` : ''
              readout.textContent = `${x.toFixed(1)}° · ${y.toFixed(1)} /s${lam}`
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
    empty.hidden = xs.length > 0
  }

  root.addEventListener('click', (e) => {
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
    if (paletteVersion !== builtPalette) build()
    if (a.lastScan !== scan) {
      // A new scan (or none): start over with its range.
      scan = a.lastScan
      xs.length = ys.length = shown = 0
      yMax = 10
      build()
    }
    const n = scan ? a.replay.length : 0
    if (n === shown) return
    if (n < shown) xs.length = ys.length = shown = 0
    for (; shown < n; shown++) {
      const p = a.replay[shown]
      xs.push(p.angle / 10)
      ys.push(p.rate)
      if (p.rate > yMax) yMax = niceCeil(p.rate * 1.05)
    }
    plot!.setData(data(), false)
    setY()
    empty.hidden = n > 0
  }

  build()
  return { build, render }
}
