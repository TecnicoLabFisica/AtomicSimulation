// Runs forgeEntry off the main thread. Messages in: {id, input}; out: {id, ...ForgeResult}.
import { handleForge } from './forge-client'
import { loadCrystals, loadForgeElements } from './tables'
import type { ForgeInput } from './forge'

self.onmessage = async (ev: MessageEvent<{ id: number; input: ForgeInput }>) => {
  const { id, input } = ev.data
  try {
    await Promise.all([loadForgeElements(), loadCrystals()]) // memoized; a failed load is retried next message
    ;(self as any).postMessage({ id, ...handleForge(input) })
  } catch (e) {
    ;(self as any).postMessage({ id, error: { code: 'internal', hint: null, message: String(e) } })
  }
}
