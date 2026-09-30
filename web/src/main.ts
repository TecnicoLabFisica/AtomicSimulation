// Entry point: one apparatus, the views around it, and one frame loop driving the simulated clock.
// The 3D bench is the room. The panel, the monitor's spectrum and the chamber's 2D goniometer are focus cards
// the camera flies to; Learn and Huygens stay inspectors.
import './styles/app.css'
import { Apparatus } from './apparatus/apparatus'
import { getLang, setLang, t, type Lang } from './i18n'
import { mountLearn, pt } from './pedagogy/card'
import { mountExplore } from './pedagogy/explore'
import { getMode, setMode } from './pedagogy/mode'
import type { Focus, mountBench, Pick } from './views/bench'
import { readPalette } from './views/canvas'
import { mountGoniometer } from './views/goniometer'
import { mountHuygens } from './views/huygens'
import { mountPanel } from './views/panel'
import { mountSound } from './views/sound'
import { mountSpectrum } from './views/spectrum'

type Theme = 'auto' | 'light' | 'dark'
const THEMES: Theme[] = ['auto', 'light', 'dark']
const SCALES = [1, 10, 100, Infinity]
const CARDS = ['panel', 'monitor', 'chamber'] as const
const TOAST_MS = 2500
const DESKTOP = matchMedia('(min-width: 1024px)') // as in app.css

const app = document.querySelector<HTMLElement>('#app')!
app.innerHTML = `
  <header class="topbar">
    <h1 data-title></h1>
    <div class="tools">
      <label class="scale"><span class="sim-tag" aria-hidden="true" data-sim-tag></span><span class="visually-hidden" data-scale-label></span>
        <select data-scale>${SCALES.map((x) => `<option value="${x}">${x === Infinity ? '' : `×${x}`}</option>`).join('')}</select>
      </label>
      <button class="tool" data-learn aria-controls="learn" aria-pressed="false"></button>
      <button class="tool explore" data-huygens aria-controls="huygens" aria-pressed="false">λ</button>
      <button class="tool" data-theme></button>
      <button class="tool" data-lang></button>
    </div>
  </header>
  <main class="stage" data-view="room">
    <canvas class="bench" data-bench role="img"></canvas>
    <p class="no3d" data-no3d hidden></p>
    <button class="act-strip" data-act hidden></button>
    <p class="toast" role="status" data-toast></p>
    <div class="dock" role="group" data-dock>
      <button class="gear" data-go="panel"><span aria-hidden="true">⚙︎</span><span data-settings></span></button>
      <button class="tool" data-go="monitor"></button>
      <button class="tool" data-go="chamber"></button>
      <button class="tool" data-door></button>
    </div>
    <section class="focus-card panel-card" data-focus="panel" role="dialog" tabindex="-1" aria-labelledby="panel-title" inert>
      <h2 class="card-title" id="panel-title" data-panel-title></h2><button class="tool close" data-back></button>
      <div class="panel" data-panel></div>
    </section>
    <section class="focus-card monitor-card" data-focus="monitor" role="dialog" tabindex="-1" inert>
      <button class="tool close" data-back></button>
      <div class="spectrum" data-spectrum></div>
    </section>
    <section class="focus-card chamber-card" data-focus="chamber" role="dialog" tabindex="-1" aria-labelledby="chamber-title" inert>
      <h2 class="card-title" id="chamber-title" data-chamber-title></h2><button class="tool close" data-back></button>
      <div class="led rate" role="group" data-rate-led><output data-rate></output><span class="unit" data-rate-unit></span></div>
      <canvas role="img" data-gonio></canvas><div class="sliders explore" data-explore></div>
    </section>
    <aside class="sheet inspector" id="learn" data-open="false">
      <button class="tool close" data-close aria-label="">×</button>
      <div class="learn" data-learn-body></div>
    </aside>
    <aside class="sheet inspector" id="huygens" data-open="false">
      <button class="tool close" data-close aria-label="">×</button>
      <div class="huygens" data-huygens-body></div>
    </aside>
  </main>`
const q = <T extends HTMLElement = HTMLElement>(sel: string) => app.querySelector<T>(sel)!

// Theme: automatic (system), light or dark; remembered where storage works.
let theme: Theme = 'auto'
try {
  theme = (THEMES as string[]).includes(localStorage.getItem('theme') ?? '') ? (localStorage.getItem('theme') as Theme) : 'auto'
} catch {}
function applyTheme() {
  if (theme === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
  readPalette()
}
applyTheme()
setMode(getMode())
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readPalette)

const apparatus = new Apparatus()
const sound = mountSound(apparatus)
const gonio = mountGoniometer(q<HTMLCanvasElement>('[data-gonio]'), apparatus)
const spectrum = mountSpectrum(q('[data-spectrum]'), apparatus)
const huygens = mountHuygens(q('[data-huygens-body]'), apparatus)
const panel = mountPanel(q('[data-panel]'), apparatus, sound.detent)
const explore = mountExplore(q('[data-explore]'), apparatus)
const learn = mountLearn(q('[data-learn-body]'), apparatus, {
  onMode: applyMode,
  onFocus: (keys) => {
    panel.focus(keys)
    // the settings button leads there: a badge, and the same said to screen readers
    const gear = q('[data-go="panel"]')
    gear.toggleAttribute('data-task', !!keys?.length)
    if (keys?.length) gear.setAttribute('aria-description', t().taskNeedsPanel)
    else gear.removeAttribute('aria-description')
  },
  // Below desktop the card is a bottom sheet over the instrument: step aside for the act step (the act
  // strip keeps the instruction, and the frame loop brings the card back once it is met).
  onAct: () => {
    if (!DESKTOP.matches) openSheet(learnSheet, false, false)
  },
})
const stage = q('.stage')
const huygensSheet = q('#huygens')
const learnSheet = q('#learn')
const actStrip = q<HTMLButtonElement>('[data-act]')
const inspectors = [learnSheet, huygensSheet]
const opener = (sheet: HTMLElement) => q(sheet === learnSheet ? '[data-learn]' : '[data-huygens]')

function labels() {
  const s = t()
  document.documentElement.lang = getLang()
  document.title = s.title
  q('[data-title]').textContent = s.titleShort
  q('[data-sim-tag]').textContent = s.simTag
  q('[data-scale-label]').textContent = `${s.timeScale} (${s.timeScaleNote})`
  q('[data-scale]').title = `${s.simulation}: ${s.timeScale}. ${s.timeScaleNote}`
  q('[data-scale] option:last-child').textContent = '×∞' // short for the phone topbar; the title names it
  q('[data-scale] option:last-child').title = s.instant
  q('[data-huygens]').setAttribute('aria-label', s.huygens)
  q('[data-huygens]').title = s.huygens
  q('[data-learn]').textContent = pt().learn
  const themeLabel = `${s.theme}: ${s.themes[theme]}`
  q('[data-theme]').setAttribute('aria-label', themeLabel)
  q('[data-theme]').title = themeLabel
  q('[data-theme]').textContent = { auto: '◐', light: '○', dark: '●' }[theme]
  q('[data-lang]').textContent = getLang() === 'es' ? 'EN' : 'ES'
  q('[data-lang]').setAttribute('aria-label', s.language)
  q('[data-gonio]').setAttribute('aria-label', getMode() === 'explore' ? `${s.gonioLabel}. ${s.dragCrystal}` : s.gonioLabel)
  for (const b of app.querySelectorAll('[data-close]')) b.setAttribute('aria-label', s.close)
  for (const b of app.querySelectorAll('[data-back]')) (b.setAttribute('aria-label', s.back), (b.textContent = '×'))
  q('[data-bench]').setAttribute('aria-label', s.benchLabel)
  q('[data-no3d]').textContent = s.no3d
  q('[data-settings]').textContent = s.settings
  q('[data-go="monitor"]').textContent = s.monitor
  q('[data-go="chamber"]').textContent = s.chamber
  q('[data-go="chamber"]').title = s.chamberLabel
  q('[data-panel-title]').textContent = s.panel
  q('[data-chamber-title]').textContent = s.chamberLabel
  q('[data-focus="monitor"]').setAttribute('aria-label', s.spectrum)
  q('[data-dock]').setAttribute('aria-label', s.dock)
  q('[data-rate-led]').setAttribute('aria-label', s.topDisplay)
  doorLabel()
}
function doorLabel() {
  const text = apparatus.doorsClosed ? t().doorOpen : t().doorClose
  if (q('[data-door]').textContent !== text) q('[data-door]').textContent = text
}
labels()

function openSheet(sheet: HTMLElement, open: boolean, moveFocus = true) {
  sheet.dataset.open = String(open)
  // One inspector at a time: Learn and Huygens share the right-hand column (the bottom sheet on phones).
  for (const o of inspectors) {
    if (o !== sheet && open) o.dataset.open = 'false'
    opener(o).setAttribute('aria-pressed', o.dataset.open!)
  }
  stage.toggleAttribute('data-inspector', open)
  // ponytail: focus moves in and back, no focus trap (the sheet is non-modal, Esc closes it)
  if (moveFocus) (open ? sheet.querySelector<HTMLElement>('[data-close]')! : opener(sheet)).focus()
  labels()
}

// The bench: the camera flies to a part, then its card fades in (CSS delays it by half the flight).
let bench: ReturnType<typeof mountBench> | null = null
let focus: Focus = 'room'
function setFocus(f: Focus) {
  if (f === focus) return
  const prev = focus
  focus = f
  stage.dataset.view = f
  for (const c of CARDS) q(`[data-focus="${c}"]`).inert = c !== f
  q('[data-dock]').inert = f !== 'room'
  bench?.fly(f)
  if (f !== 'room') q(`[data-focus="${f}"]`).focus() // the card, not its ×: no focus ring after a tap
  else if (prev !== 'room') q(`[data-go="${prev}"]`).focus()
}
function onPick(p: Pick | null) {
  if (p === 'door') toggleDoor()
  else if (p) setFocus(p)
  else setFocus('room') // a tap on the empty room: back out
}
let toastTimer: ReturnType<typeof setTimeout> | undefined
function toggleDoor() {
  if (apparatus.setDoors(!apparatus.doorsClosed)) return
  // Refused by the interlock: say why.
  bench?.shake()
  const el = q('[data-toast]')
  el.textContent = '' // so a repeated refusal is announced again
  el.textContent = t().doorLocked
  el.dataset.show = 'true'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.dataset.show = 'false'), TOAST_MS)
}
import('./views/bench')
  .then(({ mountBench }) => {
    bench = mountBench(q<HTMLCanvasElement>('[data-bench]'), apparatus, { spectrum, dialDeg: panel.dialDeg }, onPick)
    if (focus !== 'room') bench.fly(focus) // a card opened before the chunk arrived
  })
  .catch(() => {
    // No WebGL (or the chunk failed): the dock still opens every card.
    stage.toggleAttribute('data-no3d', true)
    q('[data-no3d]').hidden = false
  })

/** Explore ↔ Lab: lab mode hides every reveal (λ panel, overlays, sliders, λ in the readout). */
function applyMode() {
  if (getMode() === 'lab' && huygensSheet.dataset.open === 'true') openSheet(huygensSheet, false, false)
  labels()
}

app.addEventListener('click', (e) => {
  if (e.target === stage) return setFocus('room') // the scrim round an open card
  const b = (e.target as HTMLElement).closest<HTMLElement>('button')
  if (!b) return
  if (b.dataset.go) setFocus(b.dataset.go as Focus)
  else if (b.dataset.back !== undefined) setFocus('room')
  else if (b.dataset.door !== undefined) toggleDoor()
  else if (b.dataset.huygens !== undefined) openSheet(huygensSheet, huygensSheet.dataset.open !== 'true')
  else if (b.dataset.learn !== undefined) openSheet(learnSheet, learnSheet.dataset.open !== 'true')
  else if (b.dataset.close !== undefined) openSheet(b.closest<HTMLElement>('.inspector')!, false)
  else if (b.dataset.act !== undefined) openSheet(learnSheet, true)
  else if (b.dataset.theme !== undefined) {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
    try {
      localStorage.setItem('theme', theme)
    } catch {}
    applyTheme()
    labels()
  } else if (b.dataset.lang !== undefined) {
    setLang((getLang() === 'es' ? 'en' : 'es') as Lang)
    labels()
    panel.build()
    spectrum.build()
    huygens.build()
    explore.build()
    learn.build()
  }
})
q<HTMLSelectElement>('[data-scale]').addEventListener('change', (e) => {
  apparatus.timeScale = Number((e.target as HTMLSelectElement).value)
})
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  const inspector = inspectors.find((o) => o.dataset.open === 'true')
  if (inspector) openSheet(inspector, false)
  else setFocus('room')
})

// Keep the screen on while a program runs: a locked phone stops requestAnimationFrame, and a
// 38-minute scan at ×1 would silently stall. Unsupported or refused: the scan just pauses meanwhile.
let wakeLock: WakeLockSentinel | null = null
let wakeLockPending = false
function keepAwake(on: boolean) {
  if (on && !wakeLock && !wakeLockPending && 'wakeLock' in navigator) {
    wakeLockPending = true
    navigator.wakeLock.request('screen').then(
      (l) => (wakeLock = l).addEventListener('release', () => (wakeLock = null)),
      () => {},
    ).finally(() => (wakeLockPending = false))
  } else if (!on && wakeLock) {
    void wakeLock.release()
    wakeLock = null
  }
}

let last = performance.now()
let counting = false
function frame(now: number) {
  const dtS = Math.min((now - last) / 1000, 1) // cap: a background tab must not jump ahead
  last = now
  apparatus.tick(dtS)
  gonio(dtS)
  spectrum.render() // before the bench: the monitor copies it
  bench?.render(dtS)
  doorLabel()
  if (focus === 'chamber') {
    // the counter's reading next to the goniometer, as the device's top display shows it
    const d = apparatus.display()
    if (q('[data-rate]').textContent !== d.top) q('[data-rate]').textContent = d.top
    if (q('[data-rate-unit]').textContent !== d.topUnit) q('[data-rate-unit]').textContent = d.topUnit
  }
  // SCAN passed its self-test: step back from the panel to watch the arms move and the monitor fill.
  const nowCounting = apparatus.phase === 'positioning' || apparatus.phase === 'scan'
  if (nowCounting && !counting && focus === 'panel') setFocus('room')
  counting = nowCounting
  if (huygensSheet.dataset.open === 'true') huygens.render(dtS)
  panel.render()
  if (getMode() === 'explore') explore.render()
  // A task met while its sheet is closed (the student is at the instrument): bring the card back.
  if (learn.render() && learnSheet.dataset.open !== 'true') openSheet(learnSheet, true)
  // Meanwhile its instruction stays on show over the goniometer.
  const act = learnSheet.dataset.open === 'true' ? null : learn.actText()
  if (actStrip.hidden !== (act === null)) actStrip.hidden = act === null
  if (act !== null && actStrip.textContent !== act) actStrip.textContent = act
  sound.render()
  keepAwake(apparatus.busy)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
