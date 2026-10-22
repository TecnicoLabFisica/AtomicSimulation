// Runs forgeEntry off the main thread. Messages in: {id, input}; out: {id, ...ForgeResult}.
import { handleForge } from './forge-client'
import { loadForgeElements } from './tables'
import type { ForgeInput } from './forge'

self.onmessage = async (ev: MessageEvent<{ id: number; input: ForgeInput }>) => {
  const { id, input } = ev.data
  try {
    await loadForgeElements() // memoized, a failed load is retried next message (the NaCl reference is the built-in NACL)
    ;(self as any).postMessage({ id, ...handleForge(input) })
  } catch (e) {
    ;(self as any).postMessage({ id, error: { code: 'internal', hint: null, message: String(e) } })
  }
}
