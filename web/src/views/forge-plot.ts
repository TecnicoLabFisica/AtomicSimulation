// The Forge's would-be spectrum: the expected coupled-scan rate R̄(β) of the forged crystal and of NaCl, with the forged
// crystal's Mo Kα/Kβ angles marked. Data comes from the worker (forge-plot.ts); this file only draws. The forged name is
// written with textContent only.
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { t } from '../i18n'
import { allowedOrders } from '../physics/crystal'
import type { Crystal } from '../physics/crystal'
import type { WouldBeSpectrum } from '../physics/forge-plot'
import { palette, scaledFont } from './canvas'
import { ft } from './forge-i18n'
import { LOG_RANGE, SUP, decades, lineMarkers, niceCeil } from './spectrum'

export function mountForgePlot(slot: HTMLElement) {
  let log = false
  let plot: uPlot | null = null
  let last: { data: WouldBeSpectrum; crystal: Crystal } | null = null
  let labels: { text: string; x: number; y: number; colour: string }[] = []
  let box: HTMLElement
  let forgedName: HTMLElement

  const build = () => {
    const s = ft()
    const g = t()
    slot.innerHTML = `<div class="forge-plot-head"><h3>${s.plotTitle}</h3>
        <div class="seg" role="group" aria-label="${g.scale}"><button type="button" data-log="0" aria-pressed="${!log}">${g.linear}</button><button type="button" data-log="1" aria-pressed="${log}">${g.log}</button></div></div>
      <ul class="forge-legend"><li><i class="solid"></i><span data-forged></span></li><li><i class="dash"></i><span>${s.legendNacl}</span></li></ul>
      <div class="forge-plot-box" role="img" aria-label="${s.plotAlt}"></div>
      <p class="hint">${s.plotNote}</p>`
    box = slot.querySelector<HTMLElement>('.forge-plot-box')!
    forgedName = slot.querySelector<HTMLElement>('[data-forged]')!
    plot = null
    ro.disconnect()
    ro.observe(box)
    draw()
  }
  const ro = new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect
    if (plot && width > 0 && height > 0) plot.setSize({ width, height })
    else if (!plot && last && width > 0) draw() // data arrived while the sheet was hidden
  })

  function draw() {
    plot?.destroy()
    plot = null
    if (!last) return
    const { data, crystal } = last
    forgedName.textContent = ft().legendForged(crystal.name)
    const P = palette
    const font = scaledFont(P.caption, 1)
    const axis = { stroke: P['label-2'], font, labelFont: scaledFont(P.footnote, 1), ticks: { stroke: P.separator, width: 1, size: 4 } }
    const yMax = niceCeil(1.05 * Math.max(...data.crystal, ...data.nacl))
    const pos = (a: Float64Array) => (log ? Array.from(a, (y) => (y > 0 ? y : null)) : a)
    const markers = lineMarkers(crystal.d_pm, allowedOrders(crystal))
    plot = new uPlot(
      {
        width: box.clientWidth || 320,
        height: box.clientHeight || 260,
        legend: { show: false },
        cursor: { show: false },
        select: { show: false, left: 0, top: 0, width: 0, height: 0 },
        scales: { x: { time: false, range: [data.beta_deg[0], data.beta_deg.at(-1)!] }, y: { auto: false, distr: log ? 3 : 1, log: 10, range: log ? [LOG_RANGE.min, LOG_RANGE.max] : [0, yMax] } },
        axes: [
          { ...axis, grid: { show: false }, label: t().axisTarget, labelSize: 22 },
          {
            ...axis, grid: { stroke: P.separator, width: 1 }, ticks: { show: false }, label: t().axisRate, labelSize: 22, size: 48,
            splits: log ? (_u, _i, min, max) => decades(min, max) : undefined,
            values: log
              ? (_, splits) => splits.map((v) => `10${[...String(Math.round(Math.log10(v)))].map((d) => SUP[d]).join('')}`)
              : (_, splits) => splits.map((v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))),
          },
        ],
        // forged: solid and heavier; NaCl: thin and dashed, so the two differ by more than colour
        series: [{}, { stroke: P.label, width: 2, points: { show: false } }, { stroke: P['label-2'], width: 1.5, dash: [6, 4], points: { show: false } }],
        hooks: {
          drawClear: [
            (u) => {
              labels = []
              const { ctx, bbox } = u
              const k = uPlot.pxRatio
              const [left, right] = [bbox.left, bbox.left + bbox.width]
              ctx.save()
              ctx.font = scaledFont(P.caption, k)
              const m = ctx.measureText('Kα')
              const row = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent
              const minGap = ctx.measureText('10·Kα').width + 4 * k
              const lastLabel = [-Infinity, -Infinity]
              for (const l of markers) {
                const x = Math.round(u.valToPos(l.theta, 'x', true))
                if (!(x >= left && x <= right)) continue
                const y = bbox.top + l.row * row
                const kb = l.colour === 'phys-kbeta'
                if (x - lastLabel[l.row] >= minGap) {
                  labels.push({ text: l.label, x, y, colour: P[l.colour] })
                  lastLabel[l.row] = x
                }
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
          draw: [
            (u) => {
              const { ctx } = u
              const k = uPlot.pxRatio
              ctx.save()
              ctx.font = scaledFont(P.caption, k)
              ctx.textBaseline = 'top'
              ctx.textAlign = 'center'
              ctx.lineJoin = 'round'
              ctx.lineWidth = 3 * k
              ctx.strokeStyle = P.surface
              for (const l of labels) {
                ctx.fillStyle = l.colour
                ctx.strokeText(l.text, l.x, l.y)
                ctx.fillText(l.text, l.x, l.y)
              }
              ctx.restore()
            },
          ],
        },
      },
      [data.beta_deg, pos(data.crystal), pos(data.nacl)] as uPlot.AlignedData,
      box,
    )
  }

  slot.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-log]')
    if (!b || (b.dataset.log === '1') === log) return
    log = !log
    build()
    slot.querySelector<HTMLElement>(`[data-log="${b.dataset.log}"]`)?.focus()
  })
  build()
  return {
    /** A successful build: draw it, undimmed. */
    update(data: WouldBeSpectrum, crystal: Crystal) {
      last = { data, crystal }
      slot.dataset.stale = 'false'
      draw()
    },
    /** An error or a pending edit: the last plot stays, dimmed. */
    dim: () => void (slot.dataset.stale = 'true'),
    /** Language or theme changed. */
    rebuild: build,
  }
}
