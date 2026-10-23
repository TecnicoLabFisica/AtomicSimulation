// Setup tray: the accessories mounted on the 554 800 (target holder, collimator and sensor filters).
// Renders Apparatus.setup; every change goes to Apparatus.mount. Absorber tables load on first open.
import type { Apparatus, Holder } from '../apparatus/apparatus'
import { crystalLabel, getLang, isForgeKey, t } from '../i18n'
import { getMode } from '../pedagogy/mode'
import { lockedCrystal } from '../pedagogy/task'
import { FOILS_MG_CM2, XRF_SAMPLE_NAMES, loadAbsorbers, loadCrystals, loadXrfSample } from '../physics/tables'

const HOLDERS: Holder[] = ['crystal', 'alWheel', 'materialWheel', 'sample', 'empty']
const FIELDS = ['holder', 'crystal', 'collimatorFilter', 'sensorFilter', 'detector', 'sample'] as const

/** The task lock means "only the task's crystal may be mounted", not "freeze what is mounted": the picker is off only while
 * the locked crystal is on the holder; with another one mounted it offers the way back (the mounted one, then the locked). */
export function crystalPicker(lock: string | null, mounted: string, all: string[]): { disabled: boolean; ids: string[] } {
  if (lock === null) return { disabled: false, ids: all }
  return mounted === lock ? { disabled: true, ids: all } : { disabled: false, ids: [mounted, lock] }
}
/** A crystal may be mounted unless a task locks another one. */
export const crystalAllowed = (lock: string | null, crystal: string): boolean => lock === null || crystal === lock

export function mountSetup(root: HTMLDetailsElement, a: Apparatus) {
  let loaded = false
  let failed = false // the last table load failed: one line says so until the next success
  const fail = () => void (failed = true)
  let pickerKey = '' // the crystal ids the picker lists now, to rebuild its options only on change
  let detectorRefused = false // the last mount was refused because the sensor arm is not at 90°
  let token = 0 // each change handler run; a later run or a task's lock voids an earlier one's pending mount
  const build = () => {
    const s = t()
    const foils = [['', s.noFilter], ...Object.keys(FOILS_MG_CM2).sort().map((k) => [k, k])]
    const opts = (rows: string[][]) => rows.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')
    pickerKey = ''
    root.innerHTML = `
      <summary data-summary></summary>
      <label>${s.holder}<select data-field="holder">${opts(HOLDERS.map((h) => [h, s.holders[h]]))}</select></label>
      <label data-crystal-row>${s.crystal}<select data-field="crystal" aria-describedby="crystal-note">${opts(Object.entries(s.crystals))}</select></label>
      <p class="hint" data-crystal-note id="crystal-note" hidden></p>
      <label>${s.collimatorFilter}<select data-field="collimatorFilter">${opts(foils)}</select></label>
      <label>${s.sensorFilter}<select data-field="sensorFilter">${opts(foils)}</select></label>
      <label>${s.detector}<select data-field="detector">${opts(Object.entries(s.detectors))}</select></label>
      <label data-sample-row>${s.sample}<select data-field="sample">${opts(XRF_SAMPLE_NAMES.map((n) => [n, s.samples[n] ?? n]))}</select></label>
      <p class="hint" data-detector-note></p>
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
    const [holder, crystal, c, f, detector, sample] = FIELDS.map((k) => field(k).value)
    const mine = ++token
    const before = a.setup // the tray as the student saw it: a mount made meanwhile (another tab of the bench, a task) voids this one
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
    if (holder === 'sample') {
      try {
        await loadXrfSample(sample) // lazy chunk, ~70 kB per sample
        failed = false
      } catch {
        ok = false
        fail()
      }
    }
    if (mine !== token || a.setup !== before || !crystalAllowed(lockedCrystal(), crystal)) ok = false // a task started meanwhile
    const mounted = ok && a.mount({ holder: holder as Holder, crystal, collimatorFilter: c || null, sensorFilter: f || null, detector: detector as 'gm' | 'energy', sample })
    if (!mounted) {
      for (const k of FIELDS) field(k).value = a.setup[k] ?? '' // refused: the tray shows what is mounted
      field('crystal').blur()
      detectorRefused = ok && a.alert === 'detector' // mount() reports its own refusal; no mount call, no cause
    } else detectorRefused = false
  })
  const render = () => {
    const s = t()
    const setText = (el: HTMLElement, text: string) => {
      if (el.textContent !== text) el.textContent = text
    }
    const onCrystal = a.setup.holder === 'crystal'
    // Lab mode: the crystal's name only, as on a real bench.
    const holderText = onCrystal ? s.setupCrystal(crystalLabel(a.setup.crystal)) : a.setup.holder === 'sample' ? `${s.holders.sample}: ${s.samples[a.setup.sample!] ?? a.setup.sample}` : s.holders[a.setup.holder]
    const mounted = [a.setup.collimatorFilter, a.setup.sensorFilter].filter((n) => n !== null)
    const filterText = mounted.length ? ` · ${s.setupFilters(mounted)}` : ''
    const detectorText = a.setup.detector === 'energy' ? ` · ${s.detectors.energy}` : ''
    setText(root.querySelector<HTMLElement>('[data-summary]')!, `${s.setup} · ${holderText}${filterText}${detectorText}`)
    root.querySelector<HTMLElement>('[data-crystal-row]')!.hidden = !onCrystal
    root.querySelector<HTMLElement>('[data-sample-row]')!.hidden = a.setup.holder !== 'sample'
    setText(root.querySelector<HTMLElement>('[data-detector-note]')!, detectorRefused && a.setup.detector !== 'energy' ? s.detectorNeedsArm : '')
    setText(root.querySelector<HTMLElement>('[data-locked]')!, failed ? s.loadFailed : a.doorsClosed ? s.setupLocked : '')
    // One line under the crystal row: the task's lock, else (Explore only, not NaCl, whose heights are fitted) the heights note.
    const lock = lockedCrystal() // a guided task fixes the crystal: the picker shows its name, disabled
    const note = root.querySelector<HTMLElement>('[data-crystal-note]')!
    const kind = isForgeKey(a.setup.crystal) ? 'forged' : a.setup.crystal === 'LiF' ? 'mosaic' : 'perfect'
    const heights = getMode() === 'explore' && a.setup.crystal !== 'NaCl' ? s.heightsNote[kind] : ''
    const text = !onCrystal ? '' : lock ? s.taskCrystal(crystalLabel(lock)) : heights
    setText(note, text)
    note.hidden = text === ''
    // the presets, plus the forged crystal on the holder (the select cannot show a value it has no option for)
    const picker = crystalPicker(lock, a.setup.crystal, [...Object.keys(s.crystals), ...(isForgeKey(a.setup.crystal) ? [a.setup.crystal] : [])])
    const key = `${picker.ids.join()} ${getLang()}`
    if (key !== pickerKey) {
      pickerKey = key
      field('crystal').replaceChildren(...picker.ids.map((id) => new Option(crystalLabel(id), id))) // text, never markup: a forged name is a stranger's
    }
    for (const k of FIELDS) {
      const sel = field(k)
      const off = a.doorsClosed || !loaded || (k === 'crystal' && picker.disabled)
      if (sel.disabled !== off) sel.disabled = off
      const v = a.setup[k] ?? ''
      if (document.activeElement !== sel && sel.value !== v) sel.value = v
    }
  }
  build()
  return { build, render }
}
