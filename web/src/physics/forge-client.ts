// TS-only transport for the Forge view (not physics): the pure handler run inside the worker, and the main-thread client.
import { ForgeInputError, forgeEntry, forgeWarnings, type ForgeInput } from './forge'
import type { Crystal } from './crystal'
import type { WouldBeSpectrum } from './forge-plot'

/** `plot` is added by the worker (the pure handler leaves it out). */
export type ForgeOk = { entry: Crystal; warnings: string[]; plot?: WouldBeSpectrum }
export type ForgeErr = { error: { code: string; hint: readonly number[] | null; message: string } }
export type ForgeResult = ForgeOk | ForgeErr
/** Resolved for a request that a newer one overtook; the caller ignores it. */
export type ForgeStale = { stale: true }

/** Tables must be loaded (loadForgeElements, loadCrystals). Never throws: unexpected errors become code 'internal'. */
export function handleForge(input: ForgeInput): ForgeResult {
  try {
    return { entry: forgeEntry(input), warnings: forgeWarnings(input) }
  } catch (e) {
    if (e instanceof ForgeInputError) return { error: { code: e.code, hint: e.hint, message: e.message } }
    return { error: { code: 'internal', hint: null, message: e instanceof Error ? e.message : String(e) } }
  }
}

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, (r: ForgeResult | ForgeStale) => void>()

/** Build in a worker; only the latest request's promise gets the result, older ones resolve at once with {stale: true}. */
export function forgeInWorker(input: ForgeInput): Promise<ForgeResult | ForgeStale> {
  if (!worker) {
    worker = new Worker(new URL('./forge.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<{ id: number } & ForgeResult>) => {
      const { id, ...result } = ev.data
      pending.get(id)?.(result as ForgeResult)
      pending.delete(id)
    }
    // the worker chunk failed to load or crashed: answer what waits, then start a fresh worker next time
    worker.onerror = () => {
      for (const resolve of pending.values()) resolve({ error: { code: 'internal', hint: null, message: 'forge worker failed' } })
      pending.clear()
      worker = null
    }
  }
  for (const [id, resolve] of pending) {
    resolve({ stale: true })
    pending.delete(id)
  }
  const id = ++nextId
  return new Promise((resolve) => {
    pending.set(id, resolve)
    worker!.postMessage({ id, input })
  })
}
