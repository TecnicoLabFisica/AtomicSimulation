// Setup tray: the accessories mounted on the 554 800 (target holder, collimator and sensor filters).
// Renders Apparatus.setup; every change goes to Apparatus.mount. Absorber tables load on first open.
import type { Apparatus, Holder } from '../apparatus/apparatus'
import { t } from '../i18n'
import { getMode } from '../pedagogy/mode'
import { lockedCrystal } from '../pedagogy/task'
import { FOILS_MG_CM2, loadAbsorbers, loadCrystals } from '../physics/tables'

const HOLDERS: Holder[] = ['crystal', 'alWheel', 'materialWheel', 'empty']
const FIELDS = ['holder', 'crystal', 'collimatorFilter', 'sensorFilter'] as const

export function mountSetup(root: HTMLDetailsElement, a: Apparatus) {
  let loaded = false
  const build = () => {
    const s = t()
    const foils = [['', s.noFilter], ...Object.keys(FOILS_MG_CM2).sort().map((k) => [k, k])]
    const opts = (rows: string[][]) => rows.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')
    root.innerHTML = `
      <summary data-summary></summary>
      <label>${s.holder}<select data-field="holder">${opts(HOLDERS.map((h) => [h, s.holders[h]]))}</select></label>
      <label data-crystal-row>${s.crystal}<select data-field="crystal">${opts(Object.entries(s.crystals))}</select></label>
      <p class="hint" data-crystal-note hidden>${s.crystalHeightsNote}</p>
      <label>${s.collimatorFilter}<select data-field="collimatorFilter">${opts(foils)}</select></label>
      <label>${s.sensorFilter}<select data-field="sensorFilter">${opts(foils)}</select></label>
      <p class="hint" data-crystal-lock></p>
      <p class="hint" data-locked></p>`
  }
  const field = (f: (typeof FIELDS)[number]) => root.querySelector<HTMLSelectElement>(`[data-field="${f}"]`)!
  root.addEventListener('toggle', async () => {
    if (!root.open) return
    if (!loaded) {
      await loadAbsorbers()
      loaded = true
      build() // the filter options exist now
    }
    root.scrollIntoView({ block: 'nearest' }) // the opened rows, not just the summary, in view
  })
  root.addEventListener('change', async () => {
    const [holder, crystal, c, f] = FIELDS.map((k) => field(k).value)
    if (crystal !== 'NaCl') await loadCrystals() // the NaCl default never needs the table
    a.mount({ holder: holder as Holder, crystal, collimatorFilter: c || null, sensorFilter: f || null })
  })
  const render = () => {
    const s = t()
    const setText = (el: HTMLElement, text: string) => {
      if (el.textContent !== text) el.textContent = text
    }
    const onCrystal = a.setup.holder === 'crystal'
    // Lab mode: the crystal's name only, as on a real bench.
    setText(root.querySelector<HTMLElement>('[data-summary]')!, `${s.setup} · ${s.holders[a.setup.holder]}${onCrystal ? ` ${s.crystals[a.setup.crystal]}` : ''}`)
    root.querySelector<HTMLElement>('[data-crystal-row]')!.hidden = !onCrystal
    root.querySelector<HTMLElement>('[data-crystal-note]')!.hidden = !onCrystal || getMode() !== 'explore'
    setText(root.querySelector<HTMLElement>('[data-locked]')!, a.doorsClosed ? s.setupLocked : '')
    const lock = lockedCrystal() // a guided task fixes the crystal: the picker shows its name, disabled
    setText(root.querySelector<HTMLElement>('[data-crystal-lock]')!, lock && onCrystal ? `${s.taskCrystal} ${s.crystals[lock] ?? lock}.` : '')
    for (const k of FIELDS) {
      const sel = field(k)
      const off = a.doorsClosed || !loaded || (k === 'crystal' && lock !== null)
      if (sel.disabled !== off) sel.disabled = off
      const v = a.setup[k] ?? ''
      if (document.activeElement !== sel && sel.value !== v) sel.value = v
    }
  }
  build()
  return { build, render }
}
