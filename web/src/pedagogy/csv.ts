// Lab mode: the stored scan points as CSV, for the student's own analysis (LD P6.3.3.1 Tables 3–5).
import { type Apparatus, type Mode, type ReplayPoint, type Setup } from '../apparatus/apparatus'
import { WHEELS_MG_CM2 } from '../physics/tables'

/** Stored-value arrays already exported, with how many points they held then (a scan grows while it runs). */
const exported = new WeakMap<ReplayPoint[], number>()

/** One exported scan with the setup it was made with (the apparatus keeps only its last scan). */
export type ExportRecord = {
  setup: Setup
  mode: Mode
  first: number // 0.1° units: the first and last stored angles
  last: number
  step: number // 0.1° units; 0 for a single point
  u: number // 0.1 kV
  i: number // 0.01 mA
  dt: number // s
  changed: boolean // a setting changed during the scan
}

const records = new WeakMap<Apparatus, ExportRecord[]>()

/** The scans exported so far, oldest first. */
export const exportedScans = (a: Apparatus): readonly ExportRecord[] => records.get(a) ?? []

export const clearExports = (a: Apparatus): void => void records.delete(a)

/** The foils in the beam, joined (e.g. "Zr"), or "open" with none. */
const foilLabel = ({ collimatorFilter, sensorFilter }: Setup) =>
  [collimatorFilter, sensorFilter].filter((f) => f !== null).join('-') || 'open'

/** The apparatus' stored values (REPLAY) of the last auto-scan as CSV text; null if there is none. */
export function replayCsv(a: Apparatus, date = new Date()): string | null {
  const scan = a.lastScan
  if (!scan || a.replay.length === 0) return null
  const angle = scan.mode === 'SENSOR' ? 'sensor_deg' : 'beta_deg'
  return [
    '# Bragg reflection, simulated LD X-ray apparatus 554 800 (not measured data)',
    `# ${date.toISOString()}`,
    `# setup: holder ${scan.setup.holder}${scan.setup.holder === 'crystal' ? ` (${scan.setup.crystal})` : ''}; collimator filter ${scan.setup.collimatorFilter ?? 'none'}; sensor filter ${scan.setup.sensorFilter ?? 'none'}`,
    `# mode ${scan.mode}; at the start: U = ${(scan.u / 10).toFixed(1)} kV, I = ${(scan.i / 100).toFixed(2)} mA, dt = ${scan.dt} s`,
    `${angle},rate_per_s`,
    ...a.replay.map((p) => `${(p.angle / 10).toFixed(1)},${p.rate}`),
  ].join('\n') + '\n'
}

/** The apparatus' exposure log (EPN P1: one exposure per absorber) as CSV text, one row per exposure;
 * null if the log is empty. The slot, absorber and its areal density (mg/cm², the unit of the tables: no
 * thickness in mm is stored) are empty when the wheel frame blocks the beam or no plate is mounted. */
export function exposureCsv(a: Apparatus, date = new Date()): string | null {
  if (a.exposureLog.length === 0) return null
  const rows = a.exposureLog.map((e) => {
    const { holder, collimatorFilter, sensorFilter } = e.setup
    const plate = holder === 'alWheel' ? 'al' : holder === 'materialWheel' ? 'material' : null
    const slot = plate && e.slot !== null ? WHEELS_MG_CM2[plate][e.slot] : null
    // Open slot: "none", 0; frame in the beam: no slot, "frame"; no plate mounted: all three empty.
    const absorber = plate === null ? ['', '', ''] : e.slot === null ? ['', 'frame', ''] : [e.slot, slot?.[0] ?? 'none', slot?.[1] ?? 0]
    return [
      (e.target / 10).toFixed(1), (e.sensor / 10).toFixed(1), e.mode ?? '', holder, holder === 'crystal' ? e.setup.crystal : '', ...absorber,
      collimatorFilter ?? '', sensorFilter ?? '', (e.u / 10).toFixed(1), (e.i / 100).toFixed(2), e.dt, e.changed ? 1 : 0,
      Math.round(e.rate * e.dt), e.rate,
    ].join(',')
  }) // prettier-ignore
  return [
    '# Exposure series, simulated LD X-ray apparatus 554 800 (not measured data)',
    `# ${date.toISOString()}`,
    '# U_kV and I_mA are the values when counting started; changed = 1 if either changed while counting',
    '# rate_per_s is the mean rate over dt, as REPLAY shows it (counts / dt); areal_density_mg_cm2 is that of the absorber in the beam',
    'target_deg,sensor_deg,mode,holder,crystal,slot,absorber,areal_density_mg_cm2,collimator_filter,sensor_filter,U_kV,I_mA,dt_s,changed,counts,rate_per_s',
    ...rows,
  ].join('\n') + '\n'
}

/** Save the exposure series as a file download. */
export function downloadExposureCsv(a: Apparatus): void {
  const csv = exposureCsv(a)
  if (csv === null) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `xray-exposures-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

/** Save the CSV as a file download. */
export function downloadCsv(a: Apparatus): void {
  const csv = replayCsv(a)
  if (csv === null) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `bragg-scan-${a.lastScan!.setup.holder === 'crystal' ? `${a.lastScan!.setup.crystal}-` : ''}${foilLabel(a.lastScan!.setup)}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
  markExported(a)
}

export function markExported(a: Apparatus): void {
  exported.set(a.replay, a.replay.length)
  const s = a.lastScan
  const r = a.replay
  if (!s || r.length === 0) return
  const { setup, mode, u, i, dt, changed } = s
  // The angles actually stored, not the limits: a scan stopped early covers less than it was set to.
  const [first, last] = [r[0].angle, r.at(-1)!.angle]
  const step = r.length > 1 ? r[1].angle - r[0].angle : 0
  records.set(a, [...exportedScans(a), { setup, mode, first, last, step, u, i, dt, changed }])
}

/** The stored values on show were exported whole (not while the scan was still adding points). */
export function wasExported(a: Apparatus): boolean {
  return a.replay.length > 0 && exported.get(a.replay) === a.replay.length
}
