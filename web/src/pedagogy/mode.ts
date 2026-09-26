// Explore mode shows the physics (expected angles, λ, sliders, dragging the crystal). Lab mode shows
// only what the real bench shows: the panel, the arms and the raw counts.
export type AppMode = 'explore' | 'lab'

// Storage can throw (blocked cookies, sandboxed LMS iframes): the mode then just isn't remembered.
let mode: AppMode = 'explore'
try {
  if (localStorage.getItem('mode') === 'lab') mode = 'lab'
} catch {}

export function getMode(): AppMode {
  return mode
}
export function setMode(m: AppMode): void {
  mode = m
  try {
    localStorage.setItem('mode', m)
  } catch {}
  document.documentElement.dataset.mode = m
}

// A guided task hides the expected-angle overlays until its act step is done, so they can't give the
// answer away; the sliders and crystal drag stay.
let hints = true
export function setHints(on: boolean): void {
  hints = on
}
/** Draw the Explore overlays (expected angles, the λ < λmin band, nλ in the readout). */
export function showHints(): boolean {
  return mode === 'explore' && hints
}
