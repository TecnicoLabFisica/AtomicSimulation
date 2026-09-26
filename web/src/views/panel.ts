// Minimal functional 554 800 panel (Phase 7). Renders Apparatus state; Phase 8 restyles it.
import { adjustMultiplier, type Apparatus, type Key } from '../apparatus/apparatus'
import { getLang, setLang, t, type Lang } from '../i18n'

const GROUPS: [keyof ReturnType<typeof t>, Key[]][] = [
  ['groupParams', ['U', 'I', 'DT', 'DBETA', 'LIMITS']],
  ['groupMode', ['SENSOR', 'TARGET', 'COUPLED', 'ZERO']],
  ['groupOps', ['RESET', 'REPLAY', 'SCAN', 'HV', 'SPEAKER']],
]
const SCALES = [1, 10, 100, Infinity]
const ADJUST_WINDOW_MS = 300

/** Builds the panel into `root`; returns the per-frame render function. */
export function mountPanel(root: HTMLElement, a: Apparatus): () => void {
  // Turning speed = detents in the last ADJUST_WINDOW_MS, so one quick double tap stays fine-grained.
  let recent: number[] = []
  const turn = (dir: number, coarse: boolean) => {
    const now = performance.now()
    recent = [...recent.filter((t0) => now - t0 < ADJUST_WINDOW_MS), now]
    const rate = recent.length < 3 ? 0 : (1000 * recent.length) / ADJUST_WINDOW_MS
    a.adjust(dir * (coarse ? 10 : 1) * adjustMultiplier(rate))
  }

  const build = () => {
    const s = t()
    document.title = s.title
    root.innerHTML = `
      <header class="bar">
        <h1>${s.title}</h1>
        <div class="seg" role="group" aria-label="${s.language}">
          ${(['es', 'en'] as Lang[]).map((l) => `<button data-lang="${l}" aria-pressed="${l === getLang()}">${l.toUpperCase()}</button>`).join('')}
        </div>
      </header>
      <section class="panel" aria-label="${s.panel}">
        <div class="displays" role="group" aria-label="${s.displays}">
          <span class="lamp" data-lamp role="img"></span>
          <div class="led" aria-live="off"><output data-top></output><span class="unit" data-top-unit></span></div>
          <div class="led"><output data-bottom></output><span class="unit" data-bottom-unit></span><span class="sym" data-sym></span></div>
        </div>
        ${GROUPS.map(([g, keys]) => `
          <div class="group" role="group" aria-label="${s[g]}">
            <h2>${s[g]}</h2>
            <div class="keys">${keys.map((k) => `<button class="key" data-key="${k}" aria-label="${s.keys[k][1]}">${s.keys[k][0]}</button>`).join('')}</div>
          </div>`).join('')}
        <div class="group adjust" role="group" aria-label="${s.adjust}">
          <h2>${s.adjust}</h2>
          <div class="keys">
            <button class="key knob" data-adjust="-1" aria-label="${s.adjustDown}">−</button>
            <button class="key knob" data-adjust="1" aria-label="${s.adjustUp}">+</button>
          </div>
          <p class="hint">${s.adjustHint}</p>
        </div>
      </section>
      <section class="sim" aria-label="${s.simulation}">
        <div class="row"><span>${s.doors}</span>
          <button class="key" data-doors></button></div>
        <div class="row"><span>${s.arms}</span><output data-arms></output></div>
        <div class="row"><span>${s.timeScale}<small>${s.timeScaleNote}</small></span>
          <div class="seg">${SCALES.map((x) => `<button data-scale="${x}">${x === Infinity ? s.instant : `×${x}`}</button>`).join('')}</div>
        </div>
      </section>`
  }

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b) return
    const d = b.dataset
    if (d.key) a.press(d.key as Key)
    else if (d.adjust) turn(Number(d.adjust), false)
    else if (d.doors !== undefined) a.setDoors(!a.doorsClosed)
    else if (d.scale) a.timeScale = Number(d.scale)
    else if (d.lang) {
      setLang(d.lang as Lang)
      build()
    }
  })
  window.addEventListener('keydown', (e) => {
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]
    if (dir === undefined) return
    e.preventDefault()
    turn(dir, e.shiftKey)
  })
  build()

  const q = (sel: string) => root.querySelector<HTMLElement>(sel)!
  const setText = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text
  }
  return () => {
    const s = t()
    const d = a.display()
    setText(q('[data-top]'), d.top)
    setText(q('[data-top-unit]'), d.topUnit)
    setText(q('[data-bottom]'), d.bottom)
    setText(q('[data-bottom-unit]'), d.bottomUnit)
    setText(q('[data-sym]'), d.symbol === 'lower' ? '▼' : d.symbol === 'upper' ? '▲' : d.symbol === 'exposure' ? '⧗' : '')
    q('[data-sym]').title = d.symbol ? s[({ lower: 'symLower', upper: 'symUpper', exposure: 'symExposure' } as const)[d.symbol]] : ''
    q('[data-top]').parentElement!.classList.toggle('blink', d.blinkTop)
    q('[data-bottom]').parentElement!.classList.toggle('blink', d.flashBottom)
    const lamp = q('[data-lamp]')
    lamp.classList.toggle('on', d.hvLamp)
    lamp.setAttribute('aria-label', d.hvLamp ? s.hvOn : s.hvOff)
    for (const b of root.querySelectorAll<HTMLElement>('[data-key]')) {
      const k = b.dataset.key
      const selected =
        k === a.bottomShows || (k === 'LIMITS' && a.bottomShows.startsWith('LIMIT')) ||
        (k === 'SPEAKER' && a.speaker) || (k === 'REPLAY' && a.replayIndex !== null) ||
        (k === 'HV' && a.hvOn) || (k === 'SCAN' && (a.phase === 'scan' || a.phase === 'exposure')) || k === a.mode
      b.setAttribute('aria-pressed', String(selected))
    }
    const doors = q('[data-doors]')
    setText(doors, a.doorsClosed ? s.doorsClosed : s.doorsOpen)
    doors.toggleAttribute('disabled', a.hvOn || a.busy)
    doors.title = a.hvOn || a.busy ? s.doorsLocked : ''
    setText(q('[data-arms]'), `${s.target} ${(a.target / 10).toFixed(1)}° · ${s.sensor} ${(a.sensor / 10).toFixed(1)}°`)
    for (const b of root.querySelectorAll<HTMLElement>('[data-scale]'))
      b.setAttribute('aria-pressed', String(Number(b.dataset.scale) === a.timeScale))
  }
}
