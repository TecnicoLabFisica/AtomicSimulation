// Lab mode: the stored scan points as CSV, for the student's own analysis (LD P6.3.3.1 Tables 3–5).
import type { Apparatus, ReplayPoint } from '../apparatus/apparatus'

/** Stored-value arrays already exported, with how many points they held then (a scan grows while it runs). */
const exported = new WeakMap<ReplayPoint[], number>()

/** The apparatus' stored values (REPLAY) of the last auto-scan as CSV text; null if there is none. */
export function replayCsv(a: Apparatus, date = new Date()): string | null {
  const scan = a.lastScan
  if (!scan || a.replay.length === 0) return null
  const angle = scan.mode === 'SENSOR' ? 'sensor_deg' : 'beta_deg'
  return [
    '# Bragg reflection, simulated LD X-ray apparatus 554 800 (not measured data)',
    `# ${date.toISOString()}`,
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
  link.download = `bragg-scan-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
  markExported(a)
}

export function markExported(a: Apparatus): void {
  exported.set(a.replay, a.replay.length)
}

/** The stored values on show were exported whole (not while the scan was still adding points). */
export function wasExported(a: Apparatus): boolean {
  return a.replay.length > 0 && exported.get(a.replay) === a.replay.length
}
