// Materials Forge: design a crystal (lattice, cell, atoms, cut plane, reflectivity model) and read, live, its d-spacing,
// density, the allowed/forbidden orders and any warnings. No physics here: forgeInWorker builds the crystal, the view
// shows it. User-supplied strings (the name, a share link's design) are only ever written with textContent / .value.
import { loadDesign, saveDesign, shareUrl } from './forge-share'
import type { Apparatus } from '../apparatus/apparatus'
import { crystalLabel, t } from '../i18n'
import { lockedCrystal } from '../pedagogy/task'
import { MO_KA_PM } from '../physics/constants'
import { thetaFromLambda, type Crystal } from '../physics/crystal'
import type { ForgeInput } from '../physics/forge'
import { forgeInWorker } from '../physics/forge-client'
import {
  DEFAULT_B_A2, LATTICES, MAX_ATOMS, PRESETS, expandCell, expandLattice, matchLattice,
  type Cell, type LatticeId, type Preset,
} from '../physics/forge-lattices'
import { BETA_MAX_DEG } from '../physics/scan'
import { CRYSTALS, deepFreeze, loadCrystals } from '../physics/tables'
import { errorText, ft } from './forge-i18n'
import { mountForgePlot } from './forge-plot'
import { crystalAllowed } from './setup'

/** Element symbols by atomic number (index Z − 1). A label list for the picker, not physics. */
export const ELEMENTS =
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U'.split(' ')

const DEBOUNCE_MS = 250
const SPINNER_DELAY_MS = 150
const VISIBLE_ORDERS = 12
const NAME_MAX = 40
const DEFAULT_ETA_DEG = 0.2

/** What the student edits. `cell` always holds the six values; the lattice decides which are free (expandCell). */
export type Design = {
  lattice: LatticeId; cell: Cell; elements: number[]; B: number[]; atoms: number[][]
  cut: number[]; model: ForgeInput['reflectivity_model']; eta: number; name: string
}

const padTo = (xs: number[], n: number, fill: (i: number) => number) => Array.from({ length: Math.max(n, 1) }, (_, i) => xs[i] ?? fill(i))

export function designFromPreset(p: Preset): Design {
  const cell = expandCell(p.lattice, { a_pm: p.a_pm, elements: p.elements })
  return {
    lattice: p.lattice, cell, elements: [...p.elements], B: [...p.B_A2], atoms: [], cut: [...p.cut],
    model: p.model, eta: p.eta_deg ?? DEFAULT_ETA_DEG, name: p.id,
  }
}

/** A finished ForgeInput (e.g. from a share link) as an editable design: the template that reproduces it exactly,
 * else the general lattice with its atoms by hand. */
export function designFromInput(i: ForgeInput): Design {
  const base = { cut: [...i.cut], model: i.reflectivity_model, eta: i.mosaic_fwhm_deg ?? DEFAULT_ETA_DEG, name: i.name }
  const m = matchLattice(i)
  if (m) {
    const manual = LATTICES[m.lattice].manualAtoms
    return { ...base, lattice: m.lattice, cell: { ...i.cell }, elements: m.elements, B: m.B_A2, atoms: manual ? i.basis.map((r) => [...r]) : [] }
  }
  return { ...base, lattice: 'general', cell: { ...i.cell }, elements: [i.basis[0][0]], B: [i.basis[0][4]], atoms: i.basis.map((r) => [...r]) }
}

export function toInput(d: Design): ForgeInput {
  const p = { ...d.cell, elements: d.elements, B_A2: d.B, atoms: d.atoms.length ? d.atoms : undefined }
  return {
    name: d.name, cell: expandCell(d.lattice, p), basis: expandLattice(d.lattice, p), cut: [...d.cut],
    reflectivity_model: d.model, mosaic_fwhm_deg: d.model === 'mosaic_extinction' ? d.eta : null,
  }
}

/** The lattice changes: keep what carries over (cell, elements), start the atom list of a hand-entered lattice sensibly. */
export function switchLattice(d: Design, next: LatticeId): Design {
  const old = d.lattice
  const slots = LATTICES[next].elements
  const out: Design = { ...d, lattice: next, elements: padTo(d.elements, slots, () => 17), B: padTo(d.B, slots, () => DEFAULT_B_A2), atoms: [] }
  if (next === 'general') out.cell = expandCell(old, { ...d.cell, elements: d.elements })
  if (next === 'hexagonal' && old !== 'general') out.cell = { ...d.cell, c_pm: Math.round(d.cell.a_pm * 1.6) }
  if (LATTICES[next].manualAtoms) {
    const rows = LATTICES[old].manualAtoms ? d.atoms : expandLattice(old, { ...d.cell, elements: d.elements, B_A2: d.B })
    out.atoms = next === 'general' && rows.length <= MAX_ATOMS ? rows.map((r) => [...r]) : [[out.elements[0], 0, 0, 0, out.B[0], 1]]
  }
  return out
}

/** Why an order has no angle: none = nλ > 2d (no Bragg solution), far = beyond the goniometer, forbidden = F = 0. */
export type Reach = 'ok' | 'none' | 'far'
export function classifyReach(thetaDeg: number): Reach {
  return Number.isNaN(thetaDeg) ? 'none' : thetaDeg > BETA_MAX_DEG ? 'far' : 'ok'
}
export type OrderRow = { n: number; hkl: number[]; allowed: boolean; fRel: number; thetaDeg: number; reach: Reach }
/** One row per order n of the forged crystal. fRel is |F|² relative to the largest allowed order (not to n = 1,
 * which can be tiny, e.g. KCl (1 1 1)). thetaDeg is Mo Kα's Bragg angle (NaN when nλ > 2d). */
export function orderRows(c: Crystal): OrderRow[] {
  const top = Math.max(0, ...c.f_sq_rel.filter((_, i) => c.allowed_orders.includes(i + 1)))
  return Array.from({ length: c.max_order }, (_, i) => {
    const n = i + 1
    const th = thetaFromLambda(MO_KA_PM, n, c.d_pm)
    return { n, hkl: c.cut.map((v) => v * n), allowed: c.allowed_orders.includes(n), fRel: top > 0 ? c.f_sq_rel[i] / top : 0, thetaDeg: th, reach: classifyReach(th) }
  })
}

/** The key the next forged crystal gets: forge:1, forge:2 … Keys are never reused, because a stored scan names its crystal by key. */
export function nextForgeKey(): string {
  let n = 1
  while (Object.hasOwn(CRYSTALS, `forge:${n}`)) n++
  return `forge:${n}`
}

/** Why the bench cannot take the crystal now (the doors must be open, the HV off and nothing running; a task may lock the crystal), or null. */
export function benchRefusal(a: Pick<Apparatus, 'doorsClosed' | 'hvOn' | 'busy'>, lock: string | null, key: string): 'locked' | 'doors' | 'busy' | null {
  if (!crystalAllowed(lock, key)) return 'locked'
  if (a.doorsClosed) return 'doors'
  return a.hvOn || a.busy ? 'busy' : null
}

/** Register a forged entry (frozen copy) under a new key and return it. */
export function registerForged(entry: Crystal): string {
  const key = nextForgeKey()
  CRYSTALS[key] = deepFreeze(structuredClone(entry))
  return key
}

/** `onUsed(message)` runs after the crystal is mounted on the bench (the host closes the sheet and shows the message). */
export function mountForge(root: HTMLElement, apparatus: Apparatus, onUsed?: (message: string) => void) {
  let d = designFromPreset(PRESETS[0])
  let seq = 0
  let debounce: ReturnType<typeof setTimeout> | undefined
  let okInput: ForgeInput | null = null // the design of the last successful build, if no edit since
  let lastEntry: Crystal | null = null // its crystal
  let plot: ReturnType<typeof mountForgePlot>
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!

  const num = (k: string, v: number, extra = '') => `<input type="number" lang="en" step="any" inputmode="decimal" data-${k} value="${v}" ${extra}>`
  const elSelect = (attr: string, z: number, label: string) =>
    `<select ${attr} aria-label="${label}">${ELEMENTS.map((s, i) => `<option value="${i + 1}"${i + 1 === z ? ' selected' : ''}>${s} (${i + 1})</option>`).join('')}</select>`

  /** The chip whose design equals the current one (name aside) is pressed. */
  function markPresets() {
    const cur = JSON.stringify({ ...toInput(d), name: '' })
    for (const b of root.querySelectorAll<HTMLElement>('[data-preset]'))
      b.setAttribute('aria-pressed', String(JSON.stringify({ ...toInput(designFromPreset(PRESETS.find((p) => p.id === b.dataset.preset)!)), name: '' }) === cur))
  }

  function controls() {
    const s = ft()
    const L = LATTICES[d.lattice]
    const field = (k: keyof Cell) => {
      const name = s.cellFields[k]
      return `<div class="forge-field"><label for="f-${k}">${name} (${k.endsWith('_deg') ? s.deg : s.pm})</label>
        <input id="f-${k}" type="number" lang="en" step="any" inputmode="decimal" data-cell="${k}" value="${d.cell[k]}">
        ${k.endsWith('_deg') ? '' : `<input type="range" min="150" max="2500" step="1" data-cell="${k}" value="${d.cell[k]}" aria-label="${s.slider(name)}">`}</div>`
    }
    // lengths get a slider; the three angles (general lattice only) are plain numbers in one row
    const lengths = L.cellFields.filter((k) => !k.endsWith('_deg')).map(field).join('')
    const angles = L.cellFields.filter((k) => k.endsWith('_deg'))
    const cellRows = [lengths, angles.length ? `<div class="forge-angles">${angles.map(field).join('')}</div>` : '']
    const slots = L.manualAtoms ? '' : Array.from({ length: L.elements }, (_, i) =>
      `<div class="forge-field slot"><label for="f-el${i}">${s.element(i + 1)}</label>${elSelect(`id="f-el${i}" data-el="${i}"`, d.elements[i], s.element(i + 1))}
        <label for="f-b${i}">${s.debye}</label>${num(`b="${i}"`, d.B[i], `id="f-b${i}" min="0"`)}</div>`).join('')
    const cols = [s.atomCols.z, s.atomCols.x, s.atomCols.y, s.atomCols.z2, s.atomCols.b, s.atomCols.occ]
    const short = [s.atomCols.x, s.atomCols.y, s.atomCols.z2, s.atomCols.b, s.atomCols.occShort]
    const atoms = !L.manualAtoms ? '' : `<fieldset class="forge-atoms"><legend>${s.atoms}</legend><p class="hint">${s.atomsHint}</p>
      ${d.atoms.map((r, i) => `<div class="forge-atom"><div class="forge-atom-head">${elSelect(`data-atom="${i}:0"`, r[0], `${cols[0]} ${i + 1}`)}
        <button type="button" class="tool" data-remove="${i}" aria-label="${s.removeAtom(i + 1)}" ${d.atoms.length < 2 ? 'disabled' : ''}>−</button></div>
        <div class="forge-atom-xyz">${[1, 2, 3, 4, 5].map((c) => `<label><span>${short[c - 1]}</span>${num(`atom="${i}:${c}"`, r[c], `aria-label="${cols[c]} ${i + 1}"`)}</label>`).join('')}</div></div>`).join('')}
      <button type="button" class="forge-add" data-add ${d.atoms.length >= MAX_ATOMS ? 'disabled' : ''}>${s.addAtom}</button>
      ${d.atoms.length >= MAX_ATOMS ? `<p class="hint">${s.atomsFull(MAX_ATOMS)}</p>` : ''}</fieldset>`
    const models = (['darwin', 'mosaic_extinction', 'ideal_mosaic'] as const).map((m) =>
      `<label class="forge-model"><input type="radio" name="forge-model" value="${m}" data-model${d.model === m ? ' checked' : ''}>
        <span><b>${s.models[m]}</b><span class="hint">${s.modelNotes[m]}</span></span></label>`).join('')
    $('[data-controls]').innerHTML = `
      <div class="forge-field"><span class="forge-label">${s.startFrom}</span>
        <div class="seg forge-presets" role="group" aria-label="${s.startFrom}">${PRESETS.map((p) => `<button type="button" data-preset="${p.id}" aria-pressed="false">${p.id}</button>`).join('')}</div></div>
      <div class="forge-field"><label for="f-name">${s.name}</label><input id="f-name" type="text" maxlength="${NAME_MAX}" data-name autocomplete="off"></div>
      <div class="forge-field"><label for="f-lattice">${s.lattice}</label>
        <select id="f-lattice" data-lattice>${(Object.keys(LATTICES) as LatticeId[]).map((l) => `<option value="${l}"${l === d.lattice ? ' selected' : ''}>${s.lattices[l]}</option>`).join('')}</select></div>
      <fieldset><legend>${s.cell}</legend>${cellRows.join('')}</fieldset>
      ${slots ? `<fieldset><legend>${s.elements}</legend>${slots}</fieldset>` : ''}${atoms}
      <fieldset><legend>${s.cut}</legend><p class="hint">${s.cutHint}</p><div class="forge-cut">${['h', 'k', 'l'].map((k, i) =>
        `<label>${k}${num(`cut="${i}"`, d.cut[i], `step="1" inputmode="numeric" aria-label="${s.cutIndex(k)}"`).replace('step="any"', '')}</label>`).join('')}</div></fieldset>
      <fieldset><legend>${s.model}</legend>${models}
        <div class="forge-field" data-eta-row${d.model === 'mosaic_extinction' ? '' : ' hidden'}><label for="f-eta">${s.eta}</label>${num('eta', d.eta, 'id="f-eta" min="0"')}</div></fieldset>`
    $<HTMLInputElement>('[data-name]').value = d.name // a property, never markup
    markPresets()
  }

  function build() {
    const s = ft()
    root.innerHTML = `<div class="forge-panel">
      <header class="forge-head"><h2 id="forge-title">${s.title}</h2><button type="button" class="tool close" data-forge-close></button></header>
      <div class="forge-summary" role="status" aria-live="polite" data-summary></div>
      <div class="forge-body"><div class="forge-plot" data-forge-plot></div>
        <form class="forge-controls" data-controls novalidate></form>
        <section class="forge-out" aria-labelledby="forge-out-h"><h3 id="forge-out-h">${s.readout}</h3><div data-result></div></section></div>
      <footer class="forge-foot">
        <p class="hint" role="status" aria-live="polite" data-use-msg></p>
        <input type="text" class="forge-link" data-link readonly hidden aria-label="${s.linkManual}">
        <button type="button" class="forge-add" data-share disabled>${s.copyLink}</button>
        <button type="button" class="forge-add primary" data-use aria-description="${s.useOnBenchHint}" disabled>${s.useOnBench}</button></footer></div>`
    plot = mountForgePlot($('[data-forge-plot]'))
    $('[data-forge-close]').textContent = '×'
    $('[data-forge-close]').setAttribute('aria-label', t().close)
    root.setAttribute('aria-label', s.title)
    controls()
    void run()
  }

  function show(r: Awaited<ReturnType<typeof forgeInWorker>>) {
    const s = ft()
    const sum = $('[data-summary]')
    const res = $('[data-result]')
    if ('stale' in r) return
    sum.dataset.state = 'ok'
    if ('error' in r) {
      plot.dim()
      sum.dataset.state = 'error'
      sum.textContent = errorText(r.error.code, r.error.hint, s)
      res.replaceChildren()
      return
    }
    const c = r.entry
    lastEntry = c
    if (r.plot) plot.update(r.plot, c)
    else plot.dim()
    $<HTMLButtonElement>('[data-use]').disabled = false
    sum.textContent = s.summary(c.d_pm.toFixed(2), c.density_g_cm3.toPrecision(4))
    const rows = orderRows(c)
    const shown = rows.slice(0, VISIBLE_ORDERS)
    const fText = (o: OrderRow) => (o.fRel >= 0.001 ? o.fRel.toPrecision(3) : s.belowRange)
    const thText = (o: OrderRow) => (o.reach === 'ok' ? `${o.thetaDeg.toFixed(1)}°` : o.reach === 'none' ? s.noBragg : s.tooFar(BETA_MAX_DEG))
    res.innerHTML = `${r.warnings.map((w) => `<p class="forge-warn">${s.warnings[w] ?? w}</p>`).join('')}
      <table class="forge-orders"><caption class="visually-hidden">${s.ordersTitle}</caption>
      <thead><tr><th>${s.cols.n}</th><th>${s.cols.hkl}</th><th>${s.cols.f}</th><th>${s.cols.theta}</th></tr></thead><tbody>
      ${shown.map((o) => `<tr data-allowed="${o.allowed}"><td>${o.n}</td><td>(${o.hkl.join(' ')})</td>
        <td>${o.allowed ? fText(o) : `<i>${s.forbidden}</i>`}</td><td>${o.allowed ? thText(o) : '–'}</td></tr>`).join('')}
      </tbody></table>${rows.length > shown.length ? `<p class="hint">${s.more(rows.length - shown.length)}</p>` : ''}`
  }

  async function run() {
    clearTimeout(debounce)
    const my = ++seq
    const input = toInput(d)
    const cue = setTimeout(() => {
      if (my === seq) {
        root.dataset.pending = 'true'
        $('[data-summary]').textContent = ft().calculating
      }
    }, SPINNER_DELAY_MS)
    const r = await forgeInWorker(input)
    clearTimeout(cue)
    if (my !== seq || 'stale' in r) return
    delete root.dataset.pending
    okInput = 'entry' in r ? input : null
    $<HTMLButtonElement>('[data-share]').disabled = !okInput
    if (okInput) saveDesign(okInput)
    show(r)
  }
  function schedule() {
    okInput = null
    $<HTMLButtonElement>('[data-use]').disabled = true
    $<HTMLButtonElement>('[data-share]').disabled = true
    plot.dim()
    markPresets()
    clearTimeout(debounce)
    debounce = setTimeout(run, DEBOUNCE_MS)
  }
  function rebuild(focusSel?: string) {
    controls()
    if (focusSel) root.querySelector<HTMLElement>(focusSel)?.focus()
    schedule()
  }

  // ---- events (delegated; controls() re-renders the form but this listener stays) ----
  const form = () => $('[data-controls]')
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement
    const ds = el.dataset
    const v = Number(el.value)
    if (ds.cell) {
      d.cell[ds.cell as keyof Cell] = v
      for (const o of form().querySelectorAll<HTMLInputElement>(`[data-cell="${ds.cell}"]`)) if (o !== el) o.value = el.value
    } else if (ds.name !== undefined) d.name = el.value
    else if (ds.cut) d.cut[Number(ds.cut)] = v
    else if (ds.eta !== undefined) d.eta = v
    else if (ds.b) d.B[Number(ds.b)] = v
    else if (ds.el) d.elements[Number(ds.el)] = v
    else if (ds.atom) {
      const [i, c] = ds.atom.split(':').map(Number)
      d.atoms[i][c] = v
    } else return
    schedule()
  })
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement
    if (el.dataset.lattice !== undefined) {
      d = switchLattice(d, el.value as LatticeId)
      rebuild('[data-lattice]')
    } else if (el.dataset.model !== undefined) {
      d.model = el.value as Design['model']
      $('[data-eta-row]').hidden = d.model !== 'mosaic_extinction'
      schedule()
    }
  })
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (b?.dataset.preset !== undefined) {
      d = designFromPreset(PRESETS.find((p) => p.id === b.dataset.preset)!)
      rebuild(`[data-preset="${b.dataset.preset}"]`)
    } else if (b?.dataset.use !== undefined) void useOnBench()
    else if (b?.dataset.share !== undefined) void copyLink()
    else if (b?.dataset.add !== undefined && d.atoms.length < MAX_ATOMS) {
      d.atoms.push([d.atoms.at(-1)?.[0] ?? 11, 0, 0, 0, DEFAULT_B_A2, 1])
      rebuild(`[data-atom="${d.atoms.length - 1}:0"]`)
    } else if (b?.dataset.remove !== undefined && d.atoms.length > 1) {
      d.atoms.splice(Number(b.dataset.remove), 1)
      rebuild('[data-add]')
    }
  })
  root.addEventListener('submit', (e) => e.preventDefault())

  const say = (text: string) => void ($('[data-use-msg]').textContent = text)
  async function copyLink() {
    if (!okInput) return
    const url = shareUrl(okInput, location)
    const field = $<HTMLInputElement>('[data-link]')
    try {
      await navigator.clipboard.writeText(url)
      field.hidden = true
      say(ft().linkCopied)
    } catch {
      field.value = url // no clipboard (insecure context, permission): offer it to copy by hand
      field.hidden = false
      field.select()
      say(ft().linkManual)
    }
  }
  async function useOnBench() {
    if (!lastEntry || !okInput) return
    const s = ft()
    const refusal = () => benchRefusal(apparatus, lockedCrystal(), nextForgeKey())
    let why = refusal()
    if (why) return say(s.refused[why])
    try {
      await loadCrystals() // expectedRate needs the table for any non-NaCl crystal
    } catch {
      return say(s.refused.load)
    }
    why = refusal() // the bench may have changed while the table loaded
    if (why) return say(s.refused[why])
    const key = registerForged(lastEntry)
    let ok = false
    try {
      ok = apparatus.mount({ ...apparatus.setup, holder: 'crystal', crystal: key })
    } catch {}
    if (!ok) {
      delete CRYSTALS[key] // never mounted, so no scan can name it
      return say(s.refused.busy)
    }
    say('')
    onUsed?.(s.mounted(crystalLabel(key)))
  }

  const saved = loadDesign()
  if (saved) d = designFromInput(saved)
  build()
  return {
    build,
    /** The theme changed: repaint the plot with the new palette. */
    redraw: () => plot.rebuild(),
    /** Load a design: a ForgeInput (share link) opens as the general lattice with its atoms by hand; none keeps the current one. */
    open(input?: ForgeInput) {
      if (input) d = designFromInput(input)
      controls()
      void run()
    },
    /** The design of the last successful build (null while an edit is pending or invalid). */
    currentInput: (): ForgeInput | null => okInput,
  }
}
