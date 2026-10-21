// Lab mode: the stored scan points as CSV, for the student's own analysis (LD P6.3.3.1 Tables 3–5).
import type { Apparatus, Mode, ReplayPoint, Setup } from '../apparatus/apparatus'

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
    `# setup: holder ${scan.setup.holder}; collimator filter ${scan.setup.collimatorFilter ?? 'none'}; sensor filter ${scan.setup.sensorFilter ?? 'none'}`,
    `# mode ${scan.mode}; at the start: U = ${(scan.u / 10).toFixed(1)} kV, I = ${(scan.i / 100).toFixed(2)} mA, dt = ${scan.dt} s`,
    `${angle},rate_per_s`,
    ...a.replay.map((p) => `${(p.angle / 10).toFixed(1)},${p.rate}`),
  ].join('\n') + '\n'
}

/** Save the CSV as a file download. */
export function downloadCsv(a: Apparatus): void {
  const csv = replayCsv(a)
  if (csv === null) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `bragg-scan-${foilLabel(a.lastScan!.setup)}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
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
