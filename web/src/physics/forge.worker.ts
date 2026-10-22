// Runs forgeEntry off the main thread. Messages in: {id, input}; out: {id, ...ForgeResult}.
import { handleForge } from './forge-client'
import { wouldBeSpectrum } from './forge-plot'
import { loadCrystals, loadForgeElements } from './tables'
import type { ForgeInput } from './forge'

self.onmessage = async (ev: MessageEvent<{ id: number; input: ForgeInput }>) => {
  const { id, input } = ev.data
  try {
    await loadForgeElements() // memoized, a failed load is retried next message (the NaCl reference is the built-in NACL)
    const r = handleForge(input)
    if ('entry' in r) {
      try {
        await loadCrystals() // expectedRate wants the table for any non-NaCl crystal
        r.plot = wouldBeSpectrum(r.entry)
      } catch {} // the design still reads out; the view keeps its last plot
    }
    ;(self as any).postMessage({ id, ...r })
  } catch (e) {
    ;(self as any).postMessage({ id, error: { code: 'internal', hint: null, message: String(e) } })
  }
}
