// port of braggsim.forge (+ the Crystal validation, structure factor, μ and extinction code of braggsim.crystal it
// runs on): the reference entry of a user-designed crystal from the per-element tables only (forge_elements.json).
// Reachable only by dynamic import (the Forge view): nothing in the main bundle may import this file.
import { HC_KEV_PM, MO_KA_PM, MO_KB_PM } from './constants'
import { NACL, interpNodes, type Crystal } from './crystal'
import { roundHalfEven, pyMod, trapezoid } from './numpy'
import { BETA_MAX_DEG, maxOrderForD } from './scan'
import { FORGE, MU_RHO_GRID_PM, deepFreeze, forgeElementsLoaded } from './tables'

const RAD = Math.PI / 180
const AVOGADRO_PER_MOL = 6.02214076e23
const RE_PM = 2.8179403262e-3
// The limits (n_points, max_orders, many_orders, min_atom_distance_pm, max_b_A2) are Python's, read from FORGE.constants.
const Y_MAX = 1.25
const MAX_THETA_B_DEG = 88
const TABLE_THETA_DEG = 85
const REFLECTIVITY_MODELS = ['ideal_mosaic', 'darwin', 'mosaic_extinction']

/** A design outside the trust boundary (port of braggsim.crystal.ForgeInputError). `code` is stable, for the UI's i18n:
 * bad_cell, bad_atom, bad_z, bad_occupancy, bad_b, b_too_large, site_overfilled, bad_cut, cut_absent, bad_model,
 * bad_mosaic, too_many_orders. `hint`: for cut_absent the smallest multiple of the cut that is present. The message is
 * for developers. */
export class ForgeInputError extends RangeError {
  code: string
  hint: readonly number[] | null
  constructor(code: string, message: string, hint: readonly number[] | null = null) {
    super(message)
    this.name = 'ForgeInputError'
    this.code = code
    this.hint = hint
  }
}

/** The fixture `input` shape: a cell, the atoms of the conventional cell (Z, x, y, z, B_A2, occupancy), the cut. */
export type ForgeInput = {
  name: string
  cell: { a_pm: number; b_pm: number; c_pm: number; alpha_deg: number; beta_deg: number; gamma_deg: number }
  basis: readonly (readonly number[])[]
  cut: readonly number[]
  reflectivity_model: string
  mosaic_fwhm_deg: number | null
  source?: string
}

type Design = {
  name: string
  cell: ForgeInput['cell']
  basis: readonly (readonly number[])[]
  cut: readonly number[]
  model: string
  fwhm: number | null
  source: string
  g: number[][] // metric tensor, pm²
  dPm: number
  vA3: number
  absent: Map<number, boolean>
}

type Cx = readonly [number, number]
const cdiv = ([ar, ai]: Cx, [br, bi]: Cx): Cx => { // numpy's (Smith) complex division
  if (Math.abs(br) >= Math.abs(bi)) {
    const rat = bi / br
    const scl = 1 / (br + bi * rat)
    return [(ar + ai * rat) * scl, (ai - ar * rat) * scl]
  }
  const rat = br / bi
  const scl = 1 / (bi + br * rat)
  return [(ar * rat + ai) * scl, (ai * rat - ar) * scl]
}
/** Principal square root. */
function csqrt(re: number, im: number): Cx {
  if (re === 0 && im === 0) return [0, im]
  const t = Math.sqrt((Math.abs(re) + Math.hypot(re, im)) / 2)
  return re >= 0 ? [t, im / (2 * t)] : [Math.abs(im) / (2 * t), im < 0 || Object.is(im, -0) ? -t : t]
}

// ---- Crystal geometry ----------------------------------------------------------------------------------------------

function metricTensorPm2(c: ForgeInput['cell']): number[][] {
  const { a_pm: a, b_pm: b, c_pm: cc } = c
  const [ca, cb, cg] = [c.alpha_deg, c.beta_deg, c.gamma_deg].map((x) => Math.cos(x * RAD))
  return [
    [a * a, a * b * cg, a * cc * cb],
    [a * b * cg, b * b, b * cc * ca],
    [a * cc * cb, b * cc * ca, cc * cc],
  ]
}
const det3 = (m: number[][]): number =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
function inv3(m: number[][]): number[][] {
  const d = det3(m)
  const c = (r: number, s: number) => {
    const [r1, r2] = [(r + 1) % 3, (r + 2) % 3]
    const [s1, s2] = [(s + 1) % 3, (s + 2) % 3]
    return m[r1][s1] * m[r2][s2] - m[r1][s2] * m[r2][s1]
  }
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => c(j, i) / d))
}
/** d_hkl = 1/√(hᵀ G⁻¹ h). */
function dFromMetric(g: number[][], hkl: readonly number[]): number {
  const gi = inv3(g)
  const hg = [0, 1, 2].map((j) => hkl[0] * gi[0][j] + hkl[1] * gi[1][j] + hkl[2] * gi[2][j])
  return 1 / Math.sqrt(hg[0] * hkl[0] + hg[1] * hkl[1] + hg[2] * hkl[2])
}

// ---- Atomic data from the tables (port of forge.TableAtoms) --------------------------------------------------------

function element(z: number) {
  if (!forgeElementsLoaded()) throw new Error('forge tables not loaded (await loadForgeElements())')
  return FORGE.elements[z - 1]
}
/** f₀(s) in electrons, s in Å⁻¹: linear on the uniform table, end value held. */
function f0(z: number, sInvA: number): number {
  const table = element(z).f0
  const g = Math.min(Math.max(sInvA, 0) / FORGE.f0_step_A, table.length - 1)
  const i = Math.min(Math.trunc(g), table.length - 2)
  return table[i] + (g - i) * (table[i + 1] - table[i])
}

type Nodes = { logSig: readonly [number[], number[]]; fp: readonly [number[], number[]]; fpp: readonly [number[], number[]] }
const nodesCache = new Map<number, Nodes>()
/** port of forge._nodes: (ln λ, ln σ) with the edge pairs inserted, (λ, f′) and (ln λ, ln |f″|). */
function elementNodes(z: number): Nodes {
  let n = nodesCache.get(z)
  if (n) return n
  const el = element(z)
  const lam = el.idx.map((i) => MU_RHO_GRID_PM[i])
  const pts: [number, number][] = []
  lam.forEach((l, i) => {
    if (el.edges_pm.every((e) => Math.abs(l - e) > 1e-6)) pts.push([Math.log(l), Math.log(el.sigma_cm2[i])])
  })
  el.edges_pm.forEach((e, k) => {
    pts.push([Math.log(e), Math.log(el.edge_sigma_cm2[k][0])], [Math.log(e), Math.log(el.edge_sigma_cm2[k][1])])
  })
  pts.sort((p, q) => p[0] - q[0]) // stable: below before above
  n = {
    logSig: [pts.map((p) => p[0]), pts.map((p) => p[1])],
    fp: [lam, [...el.f_prime]],
    fpp: [lam.map(Math.log), el.f_second.map((v) => Math.log(-v))],
  }
  nodesCache.set(z, n)
  return n
}
const fPrime = (z: number, eKev: number): number => interpNodes(HC_KEV_PM / eKev, ...elementNodes(z).fp)
const fSecond = (z: number, eKev: number): number => -Math.exp(interpNodes(Math.log(HC_KEV_PM / eKev), ...elementNodes(z).fpp))

// ---- Validation (port of Crystal.__post_init__) --------------------------------------------------------------------

/** |F|² (electrons²) of reflection hkl at s = q (Å⁻¹): |Σ occ f(s) e^{−B s²} e^{2πi h·r}|²; thermal=false: atoms at rest. */
function fSq(c: Design, hkl: readonly number[], q: number, thermal = true): number {
  const f = new Map<number, number>()
  let re = 0
  let im = 0
  for (const a of c.basis) {
    if (!f.has(a[0])) f.set(a[0], f0(a[0], q))
    const amp = f.get(a[0])! * a[5] * Math.exp(-(thermal ? a[4] : 0) * q ** 2)
    const phase = 2 * Math.PI * a[1] * hkl[0] + 2 * Math.PI * a[2] * hkl[1] + 2 * Math.PI * a[3] * hkl[2]
    re += amp * Math.cos(phase)
    im += amp * Math.sin(phase)
  }
  return Math.hypot(re, im) ** 2
}
const forwardLimit = (c: Design): number => c.basis.reduce((s, a) => s + a[5] * a[0], 0) ** 2

/** port of braggsim.crystal.order_is_absent: the at-rest |F|² is below 1e-12 (Σ occ Z)². */
function orderIsAbsent(c: Design, n: number): boolean {
  let v = c.absent.get(n)
  if (v === undefined) {
    v = fSq(c, c.cut.map((i) => n * i), n / ((2 * c.dPm) / 100), false) < 1e-12 * forwardLimit(c)
    c.absent.set(n, v)
  }
  return v
}

function design(input: ForgeInput): Design {
  const { name, basis, cut } = input
  const fail = (code: string, msg: string, hint: readonly number[] | null = null): never => {
    throw new ForgeInputError(code, `${name}: ${msg}`, hint)
  }
  const cell = Object.fromEntries(
    (['a_pm', 'b_pm', 'c_pm', 'alpha_deg', 'beta_deg', 'gamma_deg'] as const).map((k) => [k, input.cell[k]]),
  ) as ForgeInput['cell']
  if (!Object.values(cell).every((v) => Number.isFinite(v) && v > 0) || !basis.length)
    fail('bad_cell', 'a cell with positive finite lengths/angles and atoms')
  if (cut.length !== 3 || !cut.every(Number.isInteger) || !cut.some((v) => v !== 0)) fail('bad_cut', 'cut must be a nonzero (h, k, l) of integers')
  const model = input.reflectivity_model
  const fwhm = input.mosaic_fwhm_deg ?? null
  if (!REFLECTIVITY_MODELS.includes(model)) fail('bad_model', `reflectivity_model must be one of ${REFLECTIVITY_MODELS}`)
  if (model === 'mosaic_extinction') {
    if (fwhm === null || !(Number.isFinite(fwhm) && fwhm > 0)) fail('bad_mosaic', 'mosaic_extinction needs a finite mosaic_fwhm_deg > 0')
  } else if (fwhm !== null) fail('bad_mosaic', 'mosaic_fwhm_deg only applies to mosaic_extinction')
  const g = metricTensorPm2(cell)
  if (!(det3(g) > 0)) fail('bad_cell', 'the cell angles do not make a cell (det G ≤ 0)')
  const siteFill = new Map<string, number>()
  for (const atom of basis) {
    if (atom.length !== 6 || !atom.every(Number.isFinite)) fail('bad_atom', 'every atom is (Z, x, y, z, B_A2, occupancy)')
    const [z, x, y, zz, b, occ] = atom
    if (!Number.isInteger(z) || !(z >= 1 && z <= 92)) fail('bad_z', `atomic number ${z} outside 1 … 92`)
    if (!(occ > 0 && occ <= 1)) fail('bad_occupancy', `occupancy ${occ} outside (0, 1]`)
    if (b < 0) fail('bad_b', `Debye–Waller B ${b} Å² is negative`)
    if (b > FORGE.constants.max_b_A2) fail('b_too_large', `Debye–Waller B ${b} Å² above ${FORGE.constants.max_b_A2}`)
    const site = [x, y, zz].map((v) => pyMod(roundHalfEven(v * 1e4, 0), 10000)).join()
    siteFill.set(site, (siteFill.get(site) ?? 0) + occ)
  }
  if ([...siteFill.values()].some((fill) => fill > 1 + 1e-9)) fail('site_overfilled', 'a site holds atoms of total occupancy above 1')
  const dMetric = dFromMetric(g, cut)
  const c: Design = {
    name, cell, basis, cut, model, fwhm, source: input.source ?? '', g, dPm: dMetric,
    vA3: Math.sqrt(det3(g)) / 1e6, absent: new Map(),
  } // prettier-ignore
  const limit = 1e-12 * forwardLimit(c) // at rest, the criterion of orderIsAbsent
  if (fSq(c, cut, 1 / ((2 * dMetric) / 100), false) < limit) {
    let hkl: number[] | null = null
    for (let m = 2; m < 9 && !hkl; m++) {
      const h = cut.map((i) => m * i)
      if (fSq(c, h, m / ((2 * dMetric) / 100), false) >= limit) hkl = h
    }
    fail('cut_absent', `the cut reflection (${cut.join(', ')}) is systematically absent${hkl ? `; use the cut (${hkl.join(', ')}) (the smallest multiple that is present)` : ''}`, hkl)
  }
  return c
}
/** Highest order of the cut series at 35 kV (scan.maxOrder). */
const nMax = (c: Design): number => maxOrderForD(c.dPm)

// ---- μ, extinction -------------------------------------------------------------------------------------------------

const sortedEdges = (zs: readonly number[]): number[] => [...new Set(zs.flatMap((z) => element(z).edges_pm))].sort((a, b) => a - b)
const sortedZs = (c: Design): number[] => [...new Set(c.basis.map((a) => a[0]))].sort((a, b) => a - b)

/** port of forge._mu_nodes: (λ in pm, μ in 1/cm), μ = Σ occ σ/V exactly on the union of the elements' nodes, each edge twice. */
function muNodes(c: Design): { lam: number[]; mu: number[] } {
  const zs = sortedZs(c)
  const edges = sortedEdges(zs)
  const vCm3 = c.vA3 * 1e-24
  const mu = (lambdaPm: number): number => {
    const x = Math.log(lambdaPm)
    let s = 0
    for (const a of c.basis) s += a[5] * Math.exp(interpNodes(x, ...elementNodes(a[0]).logSig))
    return s / vCm3
  }
  const lam = [...new Set(zs.flatMap((z) => element(z).idx.map((i) => MU_RHO_GRID_PM[i])))]
    .sort((a, b) => a - b)
    .filter((x) => edges.every((e) => Math.abs(x - e) > 1e-6))
  const nodes: [number, number][] = lam.map((x) => [x, mu(x)])
  for (const e of edges) nodes.push([e, mu(e * (1 - 1e-9))], [e, mu(e * (1 + 1e-9))])
  nodes.sort((p, q) => p[0] - q[0]) // stable: below before above
  return { lam: nodes.map((p) => p[0]), mu: nodes.map((p) => p[1]) }
}

/** Everything of order n that does not depend on λ. */
type OrderCtx = { n: number; s: number; damp: number[]; f0: number[]; cos: number[]; sin: number[]; fH0: number }
function orderCtx(c: Design, n: number): OrderCtx {
  const s = 1 / ((2 * (c.dPm / n)) / 100)
  const damp = c.basis.map((a) => a[5] * Math.exp(-a[4] * s ** 2))
  const f0s = c.basis.map((a) => f0(a[0], s))
  const phase = c.basis.map((a) => 2 * Math.PI * (a[1] * (n * c.cut[0]) + a[2] * (n * c.cut[1]) + a[3] * (n * c.cut[2])))
  const cos = phase.map(Math.cos)
  const sin = phase.map(Math.sin)
  let re = 0
  let im = 0
  damp.forEach((d, j) => {
    re += d * f0s[j] * cos[j]
    im += d * f0s[j] * sin[j]
  })
  return { n, s, damp, f0: f0s, cos, sin, fH0: Math.hypot(re, im) ** 2 }
}

type Chis = { chi0Im: number; chiH: Cx; chiHb: Cx; theta: number; mu: number; kappa: number }
/** port of crystal._chis_full (only what the extinction uses: Im χ_0, χ_h, χ_h̄, θ_B, μ, κ). */
function chisFull(c: Design, ctx: OrderCtx, lambdaPm: number, muAt: (l: number) => number): Chis {
  const eKev = HC_KEV_PM / lambdaPm
  const gamma = (RE_PM * lambdaPm ** 2) / (Math.PI * c.vA3 * 1e6)
  const fp = new Map<number, [number, number]>()
  let hRe = 0
  let hIm = 0
  let bRe = 0
  let bIm = 0
  c.basis.forEach((a, j) => {
    let t = fp.get(a[0])
    if (!t) fp.set(a[0], (t = [fPrime(a[0], eKev), fSecond(a[0], eKev)]))
    const ar = ctx.damp[j] * (ctx.f0[j] + t[0])
    const ai = ctx.damp[j] * t[1]
    hRe += ar * ctx.cos[j] - ai * ctx.sin[j]
    hIm += ar * ctx.sin[j] + ai * ctx.cos[j]
    bRe += ar * ctx.cos[j] + ai * ctx.sin[j]
    bIm += -ar * ctx.sin[j] + ai * ctx.cos[j]
  })
  const kappa = ctx.fH0 > 0 ? Math.hypot(hRe, hIm) ** 2 / ctx.fH0 : 1
  const mu = muAt(lambdaPm)
  return {
    chi0Im: (mu * lambdaPm * 1e-10) / (2 * Math.PI),
    chiH: [-gamma * hRe, -gamma * hIm],
    chiHb: [-gamma * bRe, -gamma * bIm],
    theta: Math.asin((ctx.n * lambdaPm) / (2 * c.dPm)),
    mu,
    kappa,
  }
}

const polarizations = (theta: number): number[] => [1, Math.abs(Math.cos(2 * theta))].filter((c) => c >= 1e-9)
/** np.linspace(start, stop, n) */
function linspace(start: number, stop: number, n: number): Float64Array {
  const step = (stop - start) / (n - 1)
  const out = Float64Array.from({ length: n }, (_, i) => i * step + start)
  out[n - 1] = stop
  return out
}
const phiCache = new Map<number, { phi: Float64Array; tan: Float64Array; cos2: Float64Array }>()
function phiGrid(n: number) {
  let g = phiCache.get(n)
  if (!g) {
    const phi = linspace(-Math.PI / 2, Math.PI / 2, n)
    const inner = phi.subarray(1, n - 1)
    phiCache.set(n, (g = { phi, tan: inner.map(Math.tan), cos2: inner.map((v) => Math.cos(v) ** 2) }))
  }
  return g
}

/** port of crystal._y_darwin: y of a perfect crystal (Darwin–Prins integrated reflectivity over the ideal-mosaic one).
 * The hot loop is the complex arithmetic of numpy written out (Smith division, principal square root, the larger
 * |η ± √(η²−1)|), without allocating. */
function yDarwin(x: Chis, nPoints: number): number {
  const sin2 = Math.sin(2 * x.theta)
  const [hr, hi] = x.chiH
  const [kr, ki] = cdiv(x.chiH, x.chiHb)
  const k = Math.hypot(kr, ki)
  const [sr, si] = csqrt(hr * x.chiHb[0] - hi * x.chiHb[1], hr * x.chiHb[1] + hi * x.chiHb[0])
  const sAbs = Math.hypot(sr, si)
  const chiHAbs = Math.hypot(hr, hi)
  const { phi, tan, cos2 } = phiGrid(nPoints)
  const f = new Float64Array(nPoints)
  let num = 0
  let den = 0
  for (const c of polarizations(x.theta)) {
    const w = Math.max(1, x.chi0Im / (c * sAbs))
    f[0] = f[nPoints - 1] = k / (4 * w)
    // η = (w tan φ c|S| + i Im χ_0) / (c S): Smith's division by (br + i bi), the branch fixed by S
    const br = c * sr
    const bi = c * si
    const direct = Math.abs(br) >= Math.abs(bi)
    const rat = direct ? bi / br : br / bi
    const scl = 1 / (direct ? br + bi * rat : bi + br * rat)
    const ai = x.chi0Im
    for (let i = 0; i < nPoints - 2; i++) {
      const ar = w * tan[i] * c * sAbs
      const er = direct ? (ar + ai * rat) * scl : (ar * rat + ai) * scl
      const ei = direct ? (ai - ar * rat) * scl : (ai * rat - ar) * scl
      // √(η² − 1), principal branch
      const zr = er * er - ei * ei - 1
      const zi = 2 * er * ei
      const m = Math.sqrt(zr * zr + zi * zi)
      const t = Math.sqrt((Math.abs(zr) + m) / 2)
      const rr = t === 0 ? 0 : zr >= 0 ? t : Math.abs(zi) / (2 * t)
      const ri = t === 0 ? 0 : zr >= 0 ? zi / (2 * t) : zi < 0 || Object.is(zi, -0) ? -t : t
      // q = η ± root of the larger modulus (the stable branch); |1/q|² = 1/|q|²
      const pr = er + rr
      const pi = ei + ri
      const mr = er - rr
      const mi = ei - ri
      const qSq = pr * pr + pi * pi >= mr * mr + mi * mi ? pr * pr + pi * pi : mr * mr + mi * mi
      f[i + 1] = (k * (1 / qSq) * w) / cos2[i]
    }
    num += ((c * sAbs) / sin2) * trapezoid(f, phi)
    den += (Math.PI * c ** 2 * chiHAbs ** 2) / (4 * sin2 * x.chi0Im)
  }
  return num / den
}

/** port of crystal._y_secondary: y of a mosaic crystal with secondary extinction (Gaussian mosaic, Bacon & Lowde). */
function ySecondary(x: Chis, lambdaPm: number, fwhmDeg: number, nPoints: number): number {
  const sin2 = Math.sin(2 * x.theta)
  const lamCm = lambdaPm * 1e-10
  const sg = (fwhmDeg * RAD) / (2 * Math.sqrt(2 * Math.log(2)))
  const xs = linspace(-8, 8, nPoints).map((v) => v * sg)
  const wgt = xs.map((v) => Math.exp(-0.5 * (v / sg) ** 2) / (sg * Math.sqrt(2 * Math.PI)))
  const chiHAbs = Math.hypot(...x.chiH)
  const p = new Float64Array(nPoints)
  let num = 0
  let den = 0
  for (const c of polarizations(x.theta)) {
    const qp = (Math.PI ** 2 * c ** 2 * chiHAbs ** 2) / (lamCm * sin2)
    for (let i = 0; i < nPoints; i++) {
      const sig = qp * wgt[i]
      p[i] = sig / (x.mu + sig + Math.sqrt(x.mu ** 2 + 2 * x.mu * sig))
    }
    num += trapezoid(p, xs)
    den += qp
  }
  return ((num / den) * 2) * x.mu
}

/** port of crystal._extinction_raw: reflectivity factor y·κ of order n at λ from the physics. */
function extinctionRaw(c: Design, ctx: OrderCtx, lambdaPm: number, muAt: (l: number) => number): number {
  const n = ctx.n
  if (!(n * lambdaPm / (2 * c.dPm) > 0 && (n * lambdaPm) / (2 * c.dPm) <= Math.sin(MAX_THETA_B_DEG * RAD)))
    throw new RangeError(`${c.name}: order ${n} at ${lambdaPm} pm has θ_B beyond ${MAX_THETA_B_DEG}°`)
  if (orderIsAbsent(c, n)) return 1 // |F_h|² ≈ 0: nothing to extinguish
  const x = chisFull(c, ctx, lambdaPm, muAt)
  let y = 1
  if (c.model !== 'ideal_mosaic') {
    const yD = yDarwin(x, FORGE.constants.n_points)
    if (yD > Y_MAX) throw new Error(`${c.name} n=${n} λ=${lambdaPm}: y = ${yD} > ${Y_MAX}`)
    y = yD
    if (c.model === 'mosaic_extinction') {
      const ySec = ySecondary(x, lambdaPm, c.fwhm!, FORGE.constants.n_points)
      y = yD > 1 ? ySec : Math.max(yD, ySec)
    }
  }
  return y * x.kappa
}

// ---- cell scale (NaCl reference from the same tables) --------------------------------------------------------------

const FCC = [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]]
const fold = (v: number): number => (v < 1 - 1e-9 ? v : 0)
/** The calibration anchor NaCl as a Design (port of crystal.NACL: rock salt, B = 0, d anchored; cell, cut and d from NACL). */
function naclDesign(): Design {
  const basis: number[][] = []
  for (const [z, x0] of [[11, 0], [17, 0.5]])
    for (const t of FCC) basis.push([z, fold((x0 + t[0]) % 1), fold(t[1] % 1), fold(t[2] % 1), 0, 1])
  const cell = { a_pm: NACL.a_pm, b_pm: NACL.b_pm, c_pm: NACL.c_pm, alpha_deg: NACL.alpha_deg, beta_deg: NACL.beta_deg, gamma_deg: NACL.gamma_deg }
  const g = metricTensorPm2(cell)
  return { name: 'NaCl', cell, basis, cut: NACL.cut, model: NACL.reflectivity_model, fwhm: NACL.mosaic_fwhm_deg, source: '', g, dPm: NACL.d_pm, vA3: Math.sqrt(det3(g)) / 1e6, absent: new Map() } // prettier-ignore
}
const structureFactorSq = (c: Design, n: number): number => fSq(c, c.cut.map((i) => n * i), n / ((2 * c.dPm) / 100))
/** port of braggsim.crystal.cell_scale: (|F_1|²/V²) / (|F_1|²/V²)_NaCl, both from the element tables. */
function cellScale(c: Design): number {
  const nacl = naclDesign()
  const ref = structureFactorSq(nacl, 1) / nacl.vA3 ** 2
  return structureFactorSq(c, 1) / c.vA3 ** 2 / ref
}

// ---- Public API ----------------------------------------------------------------------------------------------------

/** port of braggsim.forge.entry (+ forged): the crystals.json entry of a user-designed crystal, computed here from
 * forge_elements.json only (await loadForgeElements(); the cross-crystal scale also needs loadCrystals()). Throws
 * ForgeInputError (a RangeError with a stable `code`; Python: ForgeInputError) for an invalid design and for more than 120 orders. The result is deep-frozen and
 * can be passed to expectedRate as it is. */
export function forgeEntry(input: ForgeInput): Crystal {
  const c = design(input)
  const nOrd = nMax(c)
  const { max_orders: maxOrders } = FORGE.constants
  if (nOrd > maxOrders) throw new ForgeInputError('too_many_orders', `${c.name}: ${nOrd} orders (limit ${maxOrders}): cell too large`)
  const { lam, mu } = muNodes(c)
  const logLam = lam.map(Math.log)
  const logMu = mu.map(Math.log)
  const muAt = (l: number): number => Math.exp(interpNodes(Math.log(l), logLam, logMu))

  // port of crystal.extinction_table for a forged crystal (not rounded)
  const extinction: number[][] = []
  for (let n = 1; n <= nOrd; n++) {
    const ctx = orderCtx(c, n)
    const lam88 = (2 * c.dPm * Math.sin(MAX_THETA_B_DEG * RAD)) / n
    const lamMax = (2 * c.dPm * Math.sin(TABLE_THETA_DEG * RAD)) / n
    let rowLen = 0 // searchsorted(grid, lamMax, 'right')
    while (rowLen < MU_RHO_GRID_PM.length && MU_RHO_GRID_PM[rowLen] <= lamMax) rowLen++
    rowLen = Math.min(rowLen + 1, MU_RHO_GRID_PM.length)
    const row: number[] = []
    for (let i = 0; i < rowLen; i++) row.push(extinctionRaw(c, ctx, Math.min(MU_RHO_GRID_PM[i], lam88), muAt))
    extinction.push(row)
  }
  const f = Array.from({ length: nOrd }, (_, i) => structureFactorSq(c, i + 1))
  const massGMol = c.basis.reduce((s, a) => s + a[5] * element(a[0]).atomic_weight, 0)
  const zs = sortedZs(c)
  return deepFreeze({
    name: c.name,
    a_pm: c.cell.a_pm, b_pm: c.cell.b_pm, c_pm: c.cell.c_pm,
    alpha_deg: c.cell.alpha_deg, beta_deg: c.cell.beta_deg, gamma_deg: c.cell.gamma_deg,
    cut: [...c.cut],
    d_pm: c.dPm,
    density_g_cm3: massGMol / (AVOGADRO_PER_MOL * c.vA3 * 1e-24),
    reflectivity_model: c.model,
    mosaic_fwhm_deg: c.fwhm,
    extinction,
    fitted_debye_waller: false,
    source: c.source,
    max_order: nOrd,
    cell_scale: cellScale(c),
    f_sq_rel: f.map((x) => x / f[0]),
    allowed_orders: Array.from({ length: nOrd }, (_, i) => i + 1).filter((n) => !orderIsAbsent(c, n)),
    mu_per_cm: Array.from(MU_RHO_GRID_PM, (l) => muAt(l)),
    mu_edges_pm: sortedEdges(zs),
    mu_nodes_pm: lam,
    mu_nodes_per_cm: mu,
  }) // prettier-ignore
}

/** port of braggsim.forge.warnings: codes (no UI text) for a design a student should reconsider. */
export function forgeWarnings(input: ForgeInput): string[] {
  const c = design(input)
  const out: string[] = []
  // closest pair of atoms, minimum image over the neighbouring cells (an atom's own image included)
  let min = Infinity
  for (const a of c.basis)
    for (const b of c.basis) {
      const diff = [1, 2, 3].map((k) => a[k] - b[k]).map((v) => v - roundHalfEven(v, 0))
      for (let sx = -1; sx <= 1; sx++)
        for (let sy = -1; sy <= 1; sy++)
          for (let sz = -1; sz <= 1; sz++) {
            const v = [diff[0] + sx, diff[1] + sy, diff[2] + sz]
            let q = 0
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) q += v[i] * c.g[i][j] * v[j]
            const dist = Math.sqrt(q)
            if (dist >= 1 && dist < min) min = dist // < 1 pm: the atom itself / the same mixed site
          }
    }
  if (min < FORGE.constants.min_atom_distance_pm) out.push('atoms_too_close')
  const reach = 2 * c.dPm * Math.sin(BETA_MAX_DEG * RAD)
  const orders = Array.from({ length: nMax(c) }, (_, i) => i + 1).filter((n) => !orderIsAbsent(c, n))
  if (!orders.some((n) => [MO_KA_PM, MO_KB_PM].some((lam) => n * lam <= reach))) out.push('no_line_reflects')
  if (nMax(c) > FORGE.constants.many_orders) out.push('many_orders')
  return out
}

/** The atomic data a forged crystal reads, as the tests probe them (port of forge.TableAtoms). */
export const tableAtoms = {
  f0,
  fPrime,
  fSecond,
  /** σ(λ) in cm²: log–log, sharp at the edges, end values held. */
  sigmaCm2: (z: number, lambdaPm: number): number => Math.exp(interpNodes(Math.log(lambdaPm), ...elementNodes(z).logSig)),
}
