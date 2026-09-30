// The bench in 3D: the X-ray apparatus 554 800 on a table, a monitor beside it. Like every view it only draws
// the Apparatus state (arms, door, HV, displays, key LEDs); taps become picks that main.ts acts on.
// Proportions: LD instruction sheet 554 800 §1, §4, §7 (67 × 48 × 35 cm; panel column on the left, then the tube
// chamber and the experiment chamber, each behind a lead-glass sliding door) and LD P6.3.3.1 (s₁ = 5 cm,
// s₂ = 6 cm). Built from primitives in code, no LD images or models. Scene units: cm.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Apparatus, Key } from '../apparatus/apparatus'
import { getLang, t } from '../i18n'
import { getMode } from '../pedagogy/mode'
import { armEaser, dpr, palette, paletteVersion, reducedMotion, type Palette } from './canvas'
import { S1_CM, S2_CM } from './goniometer'
import { GROUPS, keySelected } from './panel'

export type Focus = 'room' | 'panel' | 'monitor' | 'chamber'
export type Pick = Exclude<Focus, 'room'> | 'door'
type Colour = keyof Omit<Palette, 'caption' | 'footnote' | 'font' | 'mono'>

const RAD = Math.PI / 180
// Housing (instruction sheet §4) and the parts inside it, cm. x to the right, y up, z towards the student.
const W = 67
const H = 48
const D = 35
const FLOOR = 4.5 // chamber floor above the table (feet and base plate)
const CEIL = H - 2
const COL_X = -W / 2 + 17 // right edge of the panel column
const WALL_X = 1 // wall between the tube chamber and the experiment chamber
const BEAM_Y = 20
const ANODE_X = (COL_X + WALL_X) / 2
const SLIT_X = WALL_X + 5 // collimator slit, s₁ before the goniometer axis
const AXIS_X = SLIT_X + S1_CM
const DOOR_TOP = 31 // lead-glass window above the experiment chamber door
const DOOR_W = W / 2 - WALL_X - 1.5
const DOOR_SLIDE = WALL_X + 0.75 - COL_X // open, it stops at the panel column
const PANEL = { x: (-W / 2 + COL_X) / 2, y: 35, w: 15, h: 21 } // control panel face
const PX_PER_CM = 80 // panel texture resolution
const MONITOR = { x: 60, z: -4, yaw: -0.35, w: 44, h: 27.5, y: 34 } // a 20″ screen
const DASH_CM_PER_S = 3 // the beam's dashes travel while the tube emits
const TAP_PX = 6 // a pointer moving further is an orbit drag, not a tap

/** Mounts the bench on `canvas`. Throws if WebGL is unavailable (the caller falls back to the cards). */
export function mountBench(
  canvas: HTMLCanvasElement,
  a: Apparatus,
  views: { spectrum: { canvas(): HTMLCanvasElement; version(): number; empty(): boolean }; dialDeg(): number },
  onPick: (p: Pick | null) => void,
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 2000)
  const controls = new OrbitControls(camera, canvas)
  Object.assign(controls, {
    enablePan: false, enableDamping: !reducedMotion(), dampingFactor: 0.12,
    minAzimuthAngle: -0.7, maxAzimuthAngle: 0.7, minPolarAngle: 0.5, maxPolarAngle: 1.45,
  })
  let dirty = true
  controls.enabled = false // until the first layout places the camera
  // White light; its strength follows --bench-light (dimmer in dark mode, so the housing doesn't glare).
  const sky = new THREE.HemisphereLight(0xffffff, 0xffffff, 2.2)
  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(-40, 90, 70)
  scene.add(sky, sun)

  // Materials take their colour from the design tokens, re-read when the theme changes.
  const tinted: [THREE.Material & { color: THREE.Color }, Colour][] = []
  const matte = (c: Colour, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, ...extra })
    tinted.push([m, c])
    return m
  }
  const glow = (c: Colour, extra: THREE.MeshBasicMaterialParameters = {}) => {
    const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, ...extra })
    tinted.push([m, c])
    return m
  }
  const housing = matte('bench-housing')
  const trim = matte('bench-trim')
  const metal = matte('bench-metal', { roughness: 0.4, metalness: 0.6 })
  const glass = matte('bench-glass', { transparent: true, opacity: 0.15, roughness: 0.1, depthWrite: false })
  const pickables: THREE.Object3D[] = []
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p?: Pick) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    o.position.set(x, y, z)
    if (p) (o.userData.pick = p), pickables.push(o)
    return o
  }
  const cyl = (r: number, len: number, m: THREE.Material, axis: 'x' | 'y' | 'z', seg = 32) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m)
    if (axis === 'x') o.rotation.z = -Math.PI / 2
    if (axis === 'z') o.rotation.x = Math.PI / 2
    return o
  }
  const pick = <T extends THREE.Object3D>(o: T, p: Pick) => {
    o.traverse((c) => ((c.userData.pick = p), pickables.push(c)))
    return o
  }

  // Table with a soft contact shadow under each object.
  const table = matte('bench-table', { roughness: 0.9 })
  scene.add(box(210, 3, 95, table, 18, -1.5, 5))
  for (const [x, z] of [[-82, -38], [118, -38], [-82, 48], [118, 48]]) scene.add(box(4, 70, 4, table, x, -38, z))
  const shade = document.createElement('canvas')
  shade.width = shade.height = 64
  const sc = shade.getContext('2d')!
  const grad = sc.createRadialGradient(32, 32, 4, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,0.35)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  sc.fillStyle = grad
  sc.fillRect(0, 0, 64, 64)
  const shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shade), transparent: true, depthWrite: false })
  for (const [x, z, w, d] of [[0, 0, W + 14, D + 14], [MONITOR.x, MONITOR.z, 36, 26]]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), shadowMat)
    s.rotation.x = -Math.PI / 2
    s.position.set(x, 0.05, z)
    scene.add(s)
  }

  // Housing: base, roof, back, sides, the panel column, the chamber wall and the front frames.
  const dev = new THREE.Group()
  scene.add(dev)
  for (const [x, z] of [[-W / 2 + 4, -D / 2 + 4], [W / 2 - 4, -D / 2 + 4], [-W / 2 + 4, D / 2 - 4], [W / 2 - 4, D / 2 - 4]]) {
    dev.add(box(4, 1.5, 4, trim, x, 0.75, z))
  }
  dev.add(box(W, FLOOR - 1.5, D, housing, 0, (FLOOR + 1.5) / 2, 0))
  dev.add(box(W, H - CEIL, D, housing, 0, (H + CEIL) / 2, 0))
  dev.add(box(W, CEIL - FLOOR, 1, housing, 0, (CEIL + FLOOR) / 2, -D / 2 + 0.5))
  dev.add(box(COL_X + W / 2, CEIL - FLOOR, D, housing, (COL_X - W / 2) / 2, (CEIL + FLOOR) / 2, 0))
  dev.add(box(1, CEIL - FLOOR, D, housing, W / 2 - 0.5, (CEIL + FLOOR) / 2, 0))
  dev.add(box(1.5, CEIL - FLOOR, D, housing, WALL_X, (CEIL + FLOOR) / 2, 0))
  for (const x of [-W / 2 + 0.5, W / 2 - 0.5]) dev.add(box(1, 3, 12, trim, x + Math.sign(x) * 1, 38, 0)) // handles
  // Front frames round both doors and the window, a little proud of the chambers.
  const zf = D / 2 - 0.5
  dev.add(box(W / 2 - WALL_X, 1.5, 1, housing, (W / 2 + WALL_X) / 2, DOOR_TOP, zf))
  dev.add(box(1.5, CEIL - FLOOR, 1, housing, WALL_X, (CEIL + FLOOR) / 2, zf))
  const window_ = box(W / 2 - WALL_X - 1, CEIL - DOOR_TOP - 1, 0.4, glass, (W / 2 + WALL_X) / 2, (CEIL + DOOR_TOP) / 2, zf, 'chamber')
  dev.add(window_)
  const tubeDoor = box(WALL_X - COL_X - 1, CEIL - FLOOR - 1, 0.4, glass, (WALL_X + COL_X) / 2, (CEIL + FLOOR) / 2, D / 2 + 0.2)
  dev.add(tubeDoor)
  // Fluorescent screen (D = 15 cm) closing the far side of the experiment chamber.
  const screen = cyl(7.5, 0.4, trim, 'x', 48)
  screen.position.set(W / 2 + 0.2, BEAM_Y, 0)
  dev.add(screen)

  // Experiment chamber door: lead glass in a frame, sliding left on its own rail in front of the tube chamber.
  const door = new THREE.Group()
  const doorH = DOOR_TOP - FLOOR - 1
  const pane = box(DOOR_W - 1.6, doorH - 1.6, 0.4, glass, 0, 0, 0)
  door.add(pane)
  for (const y of [-doorH / 2 + 0.4, doorH / 2 - 0.4]) door.add(box(DOOR_W, 0.8, 0.8, trim, 0, y, 0))
  for (const x of [-DOOR_W / 2 + 0.4, DOOR_W / 2 - 0.4]) door.add(box(0.8, doorH, 0.8, trim, x, 0, 0))
  door.add(box(0.8, 5, 1.6, trim, -DOOR_W / 2 + 2.5, 0, 0.8)) // grip
  pick(door, 'door')
  pane.userData.glass = true // open or locked, taps pass through the glass: only the frame and grip answer
  const doorX = (W / 2 + WALL_X) / 2
  door.position.set(doorX, FLOOR + 0.5 + doorH / 2, D / 2 + 1)
  dev.add(door)

  // Control panel face: displays, key LEDs and labels are a texture, the ADJUST knob a real knob.
  const panelCanvas = document.createElement('canvas')
  panelCanvas.width = PANEL.w * PX_PER_CM
  panelCanvas.height = PANEL.h * PX_PER_CM
  const panelTex = new THREE.CanvasTexture(panelCanvas)
  const panelFace = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), new THREE.MeshBasicMaterial({ map: panelTex, toneMapped: false }))
  panelFace.position.set(PANEL.x, PANEL.y, D / 2 + 0.02)
  dev.add(pick(panelFace, 'panel'))
  const KNOB_PX = { x: PANEL.w / 2, y: 17.2 } // cm from the panel's top left
  const knob = new THREE.Group()
  const knobBody = cyl(1.6, 1.4, trim, 'z', 40)
  const notch = box(0.3, 1.1, 0.2, glow('accent', { opacity: 1 }), 0, 0.9, 0.75)
  knob.add(knobBody, notch)
  knob.position.set(PANEL.x - PANEL.w / 2 + KNOB_PX.x, PANEL.y + PANEL.h / 2 - KNOB_PX.y, D / 2 + 0.7)
  dev.add(pick(knob, 'panel'))
  // Connection panel below it: GM TUBE, HV OUT and the BNC sockets.
  dev.add(box(PANEL.w, 14, 0.2, trim, PANEL.x, 14, D / 2 + 0.1))
  for (const [x, y] of [[-4, 17], [0, 17], [4, 17], [-2, 11], [2, 11]]) {
    const s = cyl(0.7, 0.8, metal, 'z', 16)
    s.position.set(PANEL.x + x, y, D / 2 + 0.4)
    dev.add(s)
  }

  // Tube chamber: the Mo tube in its lead-glass tube, heat sink behind; the cathode glows while HV is on.
  const leadTube = cyl(5.5, 22, glass, 'z')
  leadTube.position.set(ANODE_X, BEAM_Y, 0)
  const bulb = cyl(3, 16, glass, 'z')
  bulb.position.copy(leadTube.position)
  const anode = cyl(0.8, 9, metal, 'z', 16)
  anode.position.set(ANODE_X, BEAM_Y, -4.5)
  const cathode = cyl(0.6, 5, metal, 'z', 16)
  cathode.position.set(ANODE_X, BEAM_Y, 5.5)
  const cathodeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), glow('led-on', { opacity: 0 }))
  cathodeGlow.position.set(ANODE_X, BEAM_Y, 3)
  dev.add(leadTube, bulb, anode, cathode, cathodeGlow, box(10, 10, 3, metal, ANODE_X, BEAM_Y, -D / 2 + 2.5))
  // Collimator through the chamber wall, ending in the slit.
  const coll = cyl(1, SLIT_X - WALL_X + 2, metal, 'x', 24)
  coll.position.set((SLIT_X + WALL_X - 2) / 2, BEAM_Y, 0)
  dev.add(coll)

  // Goniometer 554 831: base, turntable, target arm with the NaCl crystal, sensor arm with the GM counter.
  const gonio = new THREE.Group()
  gonio.position.set(AXIS_X, FLOOR, 0)
  dev.add(gonio)
  gonio.add(box(12, 8, 12, trim, 0, 4, 0))
  const table_ = cyl(5, 1, metal, 'y', 48)
  table_.position.y = 8.5
  gonio.add(table_)
  const beamH = BEAM_Y - FLOOR
  const targetArm = new THREE.Group()
  const post = cyl(0.4, beamH - 10, metal, 'y', 12)
  post.position.y = 9 + (beamH - 10) / 2
  const crystal = box(2, 2, 0.5, matte('phys-crystal', { roughness: 0.3 }), 0, beamH, 0.25) // face through the axis
  targetArm.add(post, crystal)
  const sensorArm = new THREE.Group()
  // ponytail: short enough to clear the back wall at 2θ = 90°; past ~160° the counter still clips the chamber wall
  const ARM_LEN = S2_CM + 9
  sensorArm.add(box(ARM_LEN - 4, 0.6, 1.6, metal, (ARM_LEN + 4) / 2, 9.3, 0))
  const counter = cyl(1.1, 8, trim, 'x')
  counter.position.set(S2_CM + 4, beamH, 0)
  const windowDisc = cyl(0.8, 0.1, metal, 'x', 24)
  windowDisc.position.set(S2_CM - 0.05, beamH, 0)
  const holder = cyl(0.35, beamH - 10, metal, 'y', 12)
  holder.position.set(S2_CM + 4, 9.5 + (beamH - 10) / 2, 0)
  sensorArm.add(counter, windowDisc, holder)
  gonio.add(targetArm, sensorArm)
  pick(gonio, 'chamber')

  // Beam: dashes travelling from the anode to the crystal, and the specular reflection at 2β whose opacity
  // is the model's expected rate there (log scale), exactly as in the 2D goniometer.
  const dashCanvas = document.createElement('canvas')
  dashCanvas.width = 2
  dashCanvas.height = 16
  const dc = dashCanvas.getContext('2d')!
  dc.fillStyle = '#fff'
  dc.fillRect(0, 0, 2, 9)
  const beamPart = (len: number) => {
    const map = new THREE.CanvasTexture(dashCanvas)
    map.wrapT = THREE.RepeatWrapping
    map.repeat.set(1, len / 1.1)
    const m = cyl(0.3, len, glow('phys-beam', { map }), 'x', 8)
    m.position.x = len / 2
    return m
  }
  const incident = beamPart(AXIS_X - ANODE_X)
  incident.position.set((ANODE_X + AXIS_X) / 2, BEAM_Y, 0)
  const reflectedArm = new THREE.Group()
  reflectedArm.position.set(AXIS_X, BEAM_Y, 0)
  const reflected = beamPart(S2_CM + 1.8)
  reflectedArm.add(reflected)
  dev.add(incident, reflectedArm)
  const incidentMat = incident.material as THREE.MeshBasicMaterial
  const reflectedMat = reflected.material as THREE.MeshBasicMaterial

  // Monitor on its stand; the screen shows the live spectrum.
  const monitor = new THREE.Group()
  monitor.position.set(MONITOR.x, 0, MONITOR.z)
  monitor.rotation.y = MONITOR.yaw
  monitor.add(box(22, 1, 15, trim, 0, 0.5, 0), box(3, MONITOR.y - 10, 2, trim, 0, (MONITOR.y - 10) / 2 + 1, -3))
  monitor.add(box(MONITOR.w + 2, MONITOR.h + 2, 2, trim, 0, MONITOR.y, -1))
  const monitorCanvas = document.createElement('canvas')
  monitorCanvas.width = 1280
  monitorCanvas.height = 800
  const monitorTex = new THREE.CanvasTexture(monitorCanvas)
  const monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(MONITOR.w, MONITOR.h), new THREE.MeshBasicMaterial({ map: monitorTex, toneMapped: false }))
  monitorScreen.position.set(0, MONITOR.y, 0.02)
  monitor.add(monitorScreen)
  scene.add(pick(monitor, 'monitor'))

  for (const tex of [panelTex, monitorTex]) {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  }

  // ── Panel face texture ────────────────────────────────────────────────
  const pc = panelCanvas.getContext('2d')!
  const KEY_ORDER: Key[] = GROUPS.flatMap(([, keys]) => keys)
  let panelSig = ''
  const drawPanel = (): boolean => {
    const d = a.display()
    const blink = !reducedMotion() && Math.floor(performance.now() / 500) % 2 === 1 // the device flashes at ~1 Hz
    const lamp = d.hvLamp && !blink
    const top = !(d.blinkTop && blink)
    const bottom = !(d.flashBottom && blink)
    const keys = KEY_ORDER.map((k) => (keySelected(a, k) ? 1 : 0)).join('')
    const sig = `${d.top}|${d.topUnit}|${d.bottom}|${d.bottomUnit}|${d.symbol}|${lamp}|${top}|${bottom}|${d.blinkTop}|${d.flashBottom}|${keys}|${getLang()}|${paletteVersion}`
    if (sig === panelSig) return false
    panelSig = sig
    const P = palette
    const s = t()
    const k = PX_PER_CM
    pc.fillStyle = P['bench-trim']
    pc.fillRect(0, 0, panelCanvas.width, panelCanvas.height)
    // HV lamp and the two LED displays
    pc.beginPath()
    pc.arc(0.9 * k, 1.5 * k, 0.35 * k, 0, 2 * Math.PI)
    pc.fillStyle = lamp ? P['led-on'] : P['led-bg']
    pc.fill()
    const led = (y: number, value: string, unit: string, on: boolean, sym = '', flashing = false) => {
      pc.fillStyle = P['led-bg']
      pc.beginPath()
      pc.roundRect(1.7 * k, y, 12.6 * k, 2.4 * k, 0.3 * k)
      pc.fill()
      if (flashing && reducedMotion()) {
        // steady cue instead of blinking, as the HTML panel does
        pc.strokeStyle = P.danger
        pc.lineWidth = 0.08 * k
        pc.stroke()
      }
      if (!on) return
      pc.fillStyle = P['led-on']
      pc.shadowColor = P['led-on']
      pc.shadowBlur = 0.25 * k
      pc.textBaseline = 'middle'
      pc.textAlign = 'right'
      pc.font = `${1.7 * k}px ${P.mono}`
      pc.fillText(value, 11.4 * k, y + 1.25 * k)
      pc.textAlign = 'left'
      pc.font = `${0.55 * k}px ${P.mono}`
      pc.fillText(unit, 11.7 * k, y + 0.8 * k)
      pc.fillText(sym, 11.7 * k, y + 1.7 * k)
      pc.shadowBlur = 0
    }
    led(0.5 * k, d.top, d.topUnit, top, '', d.blinkTop)
    led(3.3 * k, d.bottom, d.bottomUnit, bottom, d.symbol === 'lower' ? '▼' : d.symbol === 'upper' ? '▲' : d.symbol === 'exposure' ? '⧗' : '', d.flashBottom)
    // Key groups: pills with a lit LED where the HTML panel shows aria-pressed.
    const PILL_W = 2.6
    let y = 6.6
    for (const [g, groupKeys] of GROUPS) {
      pc.fillStyle = P['bench-ink']
      pc.globalAlpha = 0.7
      pc.textAlign = 'left'
      pc.textBaseline = 'alphabetic'
      pc.font = `600 ${0.42 * k}px ${P.font}`
      pc.fillText(s[g] as string, 0.5 * k, y * k)
      pc.globalAlpha = 1
      for (const [i, key] of groupKeys.entries()) {
        const x = 0.5 + i * (PILL_W + 0.2)
        pc.fillStyle = P['bench-ink']
        pc.globalAlpha = 0.14
        pc.beginPath()
        pc.roundRect(x * k, (y + 0.25) * k, PILL_W * k, 1.1 * k, 0.55 * k)
        pc.fill()
        pc.globalAlpha = 1
        pc.beginPath()
        pc.arc((x + 0.4) * k, (y + 0.8) * k, 0.13 * k, 0, 2 * Math.PI)
        pc.fillStyle = keySelected(a, key) ? P.accent : P['led-bg'] // as the HTML panel's key LEDs
        pc.fill()
        pc.fillStyle = P['bench-ink']
        pc.textAlign = 'center'
        pc.textBaseline = 'middle'
        const label = s.keys[key][0]
        pc.font = `500 ${(label.length > 4 ? 0.34 : 0.44) * k}px ${P.font}`
        pc.fillText(label, (x + 1.45) * k, (y + 0.82) * k)
      }
      y += 2.2
    }
    pc.fillStyle = P['bench-ink']
    pc.globalAlpha = 0.7
    pc.textAlign = 'center'
    pc.font = `600 ${0.42 * k}px ${P.font}`
    pc.fillText(s.adjust, KNOB_PX.x * k, (KNOB_PX.y - 2.3) * k)
    pc.globalAlpha = 1
    panelTex.needsUpdate = true
    return true
  }

  // ── Monitor texture: a copy of the uPlot canvas (or the empty-state text) ──
  const mc = monitorCanvas.getContext('2d')!
  let monitorSig = ''
  const drawMonitor = (): boolean => {
    const sig = `${views.spectrum.version()}|${paletteVersion}|${getLang()}`
    if (sig === monitorSig) return false
    monitorSig = sig
    const P = palette
    const [w, h] = [monitorCanvas.width, monitorCanvas.height]
    mc.fillStyle = P.surface
    mc.fillRect(0, 0, w, h)
    mc.fillStyle = P.label
    mc.textAlign = 'left'
    mc.textBaseline = 'top'
    mc.font = `600 44px ${P.font}`
    mc.fillText(t().spectrum, 40, 32)
    const src = views.spectrum.canvas()
    if (!views.spectrum.empty() && src.width > 0 && src.height > 0) {
      const f = Math.min((w - 80) / src.width, (h - 120) / src.height)
      mc.drawImage(src, (w - src.width * f) / 2, 100 + (h - 120 - src.height * f) / 2, src.width * f, src.height * f)
    } else {
      mc.fillStyle = P['label-2']
      mc.textAlign = 'center'
      mc.font = `36px ${P.font}`
      mc.fillText(t().spectrumEmpty, w / 2, h / 2, w - 80)
    }
    monitorTex.needsUpdate = true
    return true
  }

  // ── Camera: framings per focus, eased flights between them ────────────
  const presets = {} as Record<Focus, { pos: THREE.Vector3; target: THREE.Vector3 }>
  const frame = (target: THREE.Vector3, dir: THREE.Vector3, w: number, h: number, margin: number) => {
    const vfov = camera.fov * RAD
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)
    const dist = margin * Math.max(w / 2 / Math.tan(hfov / 2), h / 2 / Math.tan(vfov / 2))
    return { target, pos: target.clone().addScaledVector(dir.normalize(), dist) }
  }
  const monitorNormal = new THREE.Vector3(Math.sin(MONITOR.yaw), 0, Math.cos(MONITOR.yaw))
  const layout = () => {
    // Portrait (phones): the device fills the width with the monitor's edge in view; orbit or tap to it.
    presets.room = camera.aspect < 1
      ? frame(new THREE.Vector3(12, 22, 0), new THREE.Vector3(0, 0.55, 1), 92, 55, 1.15)
      : frame(new THREE.Vector3(24, 20, 0), new THREE.Vector3(0, 0.45, 1), 125, 55, 1.35)
    presets.panel = frame(new THREE.Vector3(PANEL.x, PANEL.y, D / 2), new THREE.Vector3(0, 0.12, 1), PANEL.w, PANEL.h, 1.5)
    presets.monitor = frame(
      new THREE.Vector3(MONITOR.x, MONITOR.y, MONITOR.z).addScaledVector(monitorNormal, 1),
      monitorNormal.clone().setY(0.08), MONITOR.w, MONITOR.h, 1.1,
    )
    presets.chamber = frame(new THREE.Vector3(AXIS_X + 3, BEAM_Y - 4, 0), new THREE.Vector3(0, 1, 0.75), 32, 30, 1.1)
    const room = presets.room.pos.distanceTo(presets.room.target)
    controls.minDistance = 0.45 * room
    controls.maxDistance = 1.3 * room
  }
  let focus: Focus = 'room'
  let flight: { from: THREE.Vector3; fromTarget: THREE.Vector3; t0: number; ms: number } | null = null
  const lookAt = new THREE.Vector3()
  const fly = (f: Focus, instant = false) => {
    focus = f
    if (!presets[f]) return // before the first layout, which then places the camera
    controls.enabled = false
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-camera')) || 0
    if (instant || reducedMotion()) {
      camera.position.copy(presets[f].pos)
      lookAt.copy(presets[f].target)
      flight = null
      settle()
    } else flight = { from: camera.position.clone(), fromTarget: lookAt.clone(), t0: performance.now(), ms }
    dirty = true
  }
  const settle = () => {
    camera.lookAt(lookAt)
    if (focus === 'room') {
      controls.target.copy(lookAt)
      controls.enabled = true
      controls.update()
    }
  }
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2) // --ease-in-out

  // ── Picking: a tap (not a drag) on a part of the bench ────────────────
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hit = (e: PointerEvent): Pick | null => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const first = ray.intersectObjects(pickables, false).find((h) => !h.object.userData.glass || (a.doorsClosed && !a.hvOn && !a.busy))
    return (first?.object.userData.pick as Pick | undefined) ?? null
  }
  let down: { x: number; y: number } | null = null
  canvas.addEventListener('pointerdown', (e) => {
    down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null
  })
  canvas.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < TAP_PX) onPick(hit(e))
    down = null
  })
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons === 0 && e.pointerType === 'mouse') canvas.style.cursor = hit(e) ? 'pointer' : ''
  })
  controls.addEventListener('change', () => (dirty = true))

  // ── Sizing ─────────────────────────────────────────────────────────────
  new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect
    if (width === 0 || height === 0) return
    renderer.setPixelRatio(dpr())
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    layout()
    if (!flight) fly(focus, true)
  }).observe(canvas)
  let tintedVersion = -1

  // ── Per frame ──────────────────────────────────────────────────────────
  const arms = armEaser(a)
  let rate = 0
  let rateKey = ''
  let doorOffset = a.doorsClosed ? 0 : DOOR_SLIDE
  let shakeT = 0
  let drawn = ''
  const render = (dtS: number) => {
    if (paletteVersion !== tintedVersion) {
      for (const [m, c] of tinted) m.color.set(palette[c])
      const light = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bench-light')) || 1
      sky.intensity = sun.intensity = 2.2 * light
      sky.groundColor.set(palette['bench-table'])
      tintedVersion = paletteVersion
      dirty = true
    }
    if (drawPanel()) dirty = true
    if (drawMonitor()) dirty = true
    if (flight) {
      const x = Math.min(1, (performance.now() - flight.t0) / flight.ms)
      const k = ease(x)
      camera.position.lerpVectors(flight.from, presets[focus].pos, k)
      lookAt.lerpVectors(flight.fromTarget, presets[focus].target, k)
      camera.lookAt(lookAt)
      if (x === 1) (flight = null), settle()
      dirty = true
    } else if (focus === 'room' && controls.enabled) controls.update()

    arms.step(dtS)
    targetArm.rotation.y = (arms.t / 10) * RAD
    sensorArm.rotation.y = (arms.s / 10) * RAD
    reflectedArm.rotation.y = 2 * targetArm.rotation.y
    knob.rotation.z = -views.dialDeg() * RAD
    const key = `${a.target} ${a.u} ${a.i} ${a.hvOn}`
    if (key !== rateKey) [rate, rateKey] = [a.specularRate(), key]
    const emitting = a.emitting
    const g = a.hvOn && a.i > 0 ? 0.3 + (0.7 * a.i) / 100 : 0
    ;(cathodeGlow.material as THREE.MeshBasicMaterial).opacity = g
    incident.visible = emitting
    reflected.visible = emitting && (rate > 0 || getMode() === 'lab')
    // Lab mode: a faint constant path, since a brightness that follows the rate would find the peaks for the student
    reflectedMat.opacity = getMode() === 'lab' ? 0.2 : Math.min(1, Math.max(0.2, Math.log10(1 + rate) / 4))
    incidentMat.opacity = 0.9
    const animate = emitting && !reducedMotion()
    if (animate) {
      incidentMat.map!.offset.y -= (DASH_CM_PER_S * dtS) / 1.1
      reflectedMat.map!.offset.y -= (DASH_CM_PER_S * dtS) / 1.1
    }
    // Door: slides on the UI clock towards the apparatus state; a refused open gives a short shake.
    const goal = a.doorsClosed ? 0 : DOOR_SLIDE
    doorOffset = reducedMotion() ? goal : doorOffset + (goal - doorOffset) * Math.min(1, dtS * 10)
    if (Math.abs(goal - doorOffset) < 0.01) doorOffset = goal
    shakeT = Math.max(0, shakeT - dtS)
    door.position.x = doorX - doorOffset + (shakeT > 0 ? Math.sin(shakeT * 60) * 0.5 * (shakeT / 0.4) : 0)

    const sig = `${arms.t} ${arms.s} ${door.position.x} ${g} ${rate} ${emitting} ${knob.rotation.z} ${getMode()}`
    if (!dirty && !animate && sig === drawn) return
    drawn = sig
    dirty = false
    renderer.render(scene, camera)
  }

  return {
    render,
    fly: (f: Focus) => fly(f),
    /** The door refused to open (interlock): a short shake. */
    shake: () => {
      if (!reducedMotion()) shakeT = 0.4
    },
  }
}
