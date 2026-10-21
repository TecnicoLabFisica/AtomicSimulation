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
  let failed = false // the last table load failed: one line says so until the next success
  const fail = () => void (failed = true)
  let token = 0 // each change handler run; a later run or a task's lock voids an earlier one's pending mount
  const build = () => {
    const s = t()
    const foils = [['', s.noFilter], ...Object.keys(FOILS_MG_CM2).sort().map((k) => [k, k])]
    const opts = (rows: string[][]) => rows.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')
    root.innerHTML = `
      <summary data-summary></summary>
      <label>${s.holder}<select data-field="holder">${opts(HOLDERS.map((h) => [h, s.holders[h]]))}</select></label>
      <label data-crystal-row>${s.crystal}<select data-field="crystal" aria-describedby="crystal-note">${opts(Object.entries(s.crystals))}</select></label>
      <p class="hint" data-crystal-note id="crystal-note" hidden></p>
      <label>${s.collimatorFilter}<select data-field="collimatorFilter">${opts(foils)}</select></label>
      <label>${s.sensorFilter}<select data-field="sensorFilter">${opts(foils)}</select></label>
      <p class="hint" data-locked></p>`
  }
  const field = (f: (typeof FIELDS)[number]) => root.querySelector<HTMLSelectElement>(`[data-field="${f}"]`)!
  root.addEventListener('toggle', async () => {
    if (!root.open) return
    if (!loaded) {
      try {
        await loadAbsorbers()
      } catch {
        fail() // the selects stay off; closing and opening the tray tries again
        return
      }
      loaded = true
      build() // the filter options exist now
    }
    failed = false
    root.scrollIntoView({ block: 'nearest' }) // the opened rows, not just the summary, in view
  })
  root.addEventListener('change', async () => {
    const [holder, crystal, c, f] = FIELDS.map((k) => field(k).value)
    const mine = ++token
    let ok = true
    if (crystal !== 'NaCl') {
      try {
        await loadCrystals() // the NaCl default never needs the table
        failed = false
      } catch {
        ok = false // offline: the picker goes back to what is mounted
        fail()
      }
    }
    if (mine !== token || (lockedCrystal() !== null && crystal !== a.setup.crystal)) ok = false // a task started meanwhile
    if (!ok || !a.mount({ holder: holder as Holder, crystal, collimatorFilter: c || null, sensorFilter: f || null })) {
      const sel = field('crystal')
      sel.value = a.setup.crystal
      sel.blur()
    }
  })
  const render = () => {
    const s = t()
    const setText = (el: HTMLElement, text: string) => {
      if (el.textContent !== text) el.textContent = text
    }
    const onCrystal = a.setup.holder === 'crystal'
    // Lab mode: the crystal's name only, as on a real bench.
    const holderText = onCrystal ? s.setupCrystal(s.crystals[a.setup.crystal]) : s.holders[a.setup.holder]
    const mounted = [a.setup.collimatorFilter, a.setup.sensorFilter].filter((n) => n !== null)
    const filterText = mounted.length ? ` · ${s.setupFilters(mounted.join(' + '))}` : ''
    setText(root.querySelector<HTMLElement>('[data-summary]')!, `${s.setup} · ${holderText}${filterText}`)
    root.querySelector<HTMLElement>('[data-crystal-row]')!.hidden = !onCrystal
    setText(root.querySelector<HTMLElement>('[data-locked]')!, failed ? s.loadFailed : a.doorsClosed ? s.setupLocked : '')
    // One line under the crystal row: the task's lock, else (Explore only, not NaCl, whose heights are fitted) the heights note.
    const lock = lockedCrystal() // a guided task fixes the crystal: the picker shows its name, disabled
    const note = root.querySelector<HTMLElement>('[data-crystal-note]')!
    const heights = getMode() === 'explore' && a.setup.crystal !== 'NaCl' ? s.heightsNote : ''
    const text = !onCrystal ? '' : lock ? s.taskCrystal(s.crystals[lock] ?? lock) : heights
    setText(note, text)
    note.hidden = text === ''
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
