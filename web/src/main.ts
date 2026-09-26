// Entry point: one apparatus, the views around it, and one frame loop driving the simulated clock.
import './styles/app.css'
import { Apparatus } from './apparatus/apparatus'
import { getLang, setLang, t, type Lang } from './i18n'
import { readPalette } from './views/canvas'
import { mountGoniometer } from './views/goniometer'
import { mountHuygens } from './views/huygens'
import { mountPanel } from './views/panel'
import { mountSound } from './views/sound'
import { mountSpectrum } from './views/spectrum'

type Theme = 'auto' | 'light' | 'dark'
const THEMES: Theme[] = ['auto', 'light', 'dark']
const SCALES = [1, 10, 100, Infinity]
const SWIPE_PX = 40

const app = document.querySelector<HTMLElement>('#app')!
app.innerHTML = `
  <header class="topbar">
    <h1 data-title></h1>
    <div class="tools">
      <label class="scale"><span class="sim-tag" aria-hidden="true" data-sim-tag></span><span class="visually-hidden" data-scale-label></span>
        <select data-scale>${SCALES.map((x) => `<option value="${x}">${x === Infinity ? '' : `×${x}`}</option>`).join('')}</select>
      </label>
      <button class="tool" data-huygens aria-controls="huygens" aria-pressed="false">λ</button>
      <button class="tool" data-theme></button>
      <button class="tool" data-lang></button>
    </div>
  </header>
  <main class="stage">
    <section class="view gonio"><canvas role="img" data-gonio></canvas></section>
    <section class="view spectrum" data-spectrum></section>
    <aside class="sheet huygens-sheet" id="huygens" data-open="false">
      <button class="tool close" data-close aria-label="">×</button>
      <div class="huygens" data-huygens-body></div>
    </aside>
    <section class="sheet panel-sheet" data-open="false">
      <button class="grabber" data-grab aria-expanded="false"></button>
      <div class="panel" data-panel></div>
    </section>
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
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readPalette)

const apparatus = new Apparatus()
const sound = mountSound(apparatus)
const gonio = mountGoniometer(q<HTMLCanvasElement>('[data-gonio]'), apparatus)
const spectrum = mountSpectrum(q('[data-spectrum]'), apparatus)
const huygens = mountHuygens(q('[data-huygens-body]'), apparatus)
const panel = mountPanel(q('[data-panel]'), apparatus, sound.detent)
const panelSheet = q('.panel-sheet')
const huygensSheet = q('.huygens-sheet')

function labels() {
  const s = t()
  document.documentElement.lang = getLang()
  document.title = s.title
  q('[data-title]').textContent = s.titleShort
  q('[data-sim-tag]').textContent = s.simTag
  q('[data-scale-label]').textContent = `${s.timeScale} (${s.timeScaleNote})`
  q('[data-scale]').title = `${s.simulation}: ${s.timeScale}. ${s.timeScaleNote}`
  q('[data-scale] option:last-child').textContent = s.instant
  q('[data-huygens]').setAttribute('aria-label', s.huygens)
  q('[data-huygens]').title = s.huygens
  const themeLabel = `${s.theme}: ${s.themes[theme]}`
  q('[data-theme]').setAttribute('aria-label', themeLabel)
  q('[data-theme]').title = themeLabel
  q('[data-theme]').textContent = { auto: '◐', light: '○', dark: '●' }[theme]
  q('[data-lang]').textContent = getLang() === 'es' ? 'EN' : 'ES'
  q('[data-lang]').setAttribute('aria-label', s.language)
  q('[data-gonio]').setAttribute('aria-label', s.gonioLabel)
  q('[data-close]').setAttribute('aria-label', s.close)
  q('[data-grab]').setAttribute('aria-label', panelSheet.dataset.open === 'true' ? s.panelHide : s.panelShow)
}
labels()

function openSheet(sheet: HTMLElement, open: boolean) {
  sheet.dataset.open = String(open)
  if (sheet === panelSheet) q('[data-grab]').setAttribute('aria-expanded', String(open))
  else {
    q('[data-huygens]').setAttribute('aria-pressed', String(open))
    q('.stage').toggleAttribute('data-inspector', open)
    // ponytail: focus moves in and back, no focus trap (the sheet is non-modal, Esc closes it)
    q(open ? '[data-close]' : '[data-huygens]').focus()
  }
  labels()
}

app.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button')
  if (!b) return
  if (b.dataset.grab !== undefined) openSheet(panelSheet, panelSheet.dataset.open !== 'true')
  else if (b.dataset.huygens !== undefined) openSheet(huygensSheet, huygensSheet.dataset.open !== 'true')
  else if (b.dataset.close !== undefined) openSheet(huygensSheet, false)
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
  }
})
q<HTMLSelectElement>('[data-scale]').addEventListener('change', (e) => {
  apparatus.timeScale = Number((e.target as HTMLSelectElement).value)
})
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (huygensSheet.dataset.open === 'true') openSheet(huygensSheet, false)
  else if (panelSheet.dataset.open === 'true') openSheet(panelSheet, false)
})
// Swipe the grabber or the displays up to open the panel sheet, down to close it (phone layout).
let swipeY: number | null = null
panelSheet.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('[data-grab], .displays')) swipeY = e.clientY
})
panelSheet.addEventListener('pointerup', (e) => {
  if (swipeY === null) return
  const dy = e.clientY - swipeY
  swipeY = null
  if (Math.abs(dy) >= SWIPE_PX) openSheet(panelSheet, dy < 0)
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
function frame(now: number) {
  const dtS = Math.min((now - last) / 1000, 1) // cap: a background tab must not jump ahead
  last = now
  apparatus.tick(dtS)
  gonio(dtS)
  spectrum.render()
  if (huygensSheet.dataset.open === 'true') huygens.render(dtS)
  panel.render()
  sound.render()
  keepAwake(apparatus.busy)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
