// The speaker key: Geiger–Müller clicks at the counted rate, and a soft detent tick (plus a haptic pulse
// where the Vibration API exists) when ADJUST turns. Silent while the speaker is off.
import type { Apparatus } from '../apparatus/apparatus'

// In real time: a browser cannot schedule clicks much faster, so higher rates (or time scales) all sound alike.
const MAX_CLICKS_PER_S = 200
const LOOKAHEAD_S = 0.1 // clicks are scheduled this far ahead on the audio clock, so frame jitter is inaudible

let ctx: AudioContext | undefined
let click: AudioBuffer
let tick: AudioBuffer

/** A short decaying burst: noise for the counter, a 2 kHz tone for the detent. */
function burst(c: AudioContext, ms: number, amp: number, wave: (i: number) => number): AudioBuffer {
  const b = c.createBuffer(1, Math.round((c.sampleRate * ms) / 1000), c.sampleRate)
  const data = b.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = amp * wave(i) * Math.exp((-5 * i) / data.length)
  return b
}

// Browsers only start audio from a user gesture: open it on the first one.
function unlock() {
  if (!ctx) {
    ctx = new AudioContext()
    click = burst(ctx, 3, 0.5, () => Math.random() * 2 - 1)
    tick = burst(ctx, 6, 0.15, (i) => Math.sin((2 * Math.PI * 2000 * i) / ctx!.sampleRate))
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

function play(buffer: AudioBuffer, at: number) {
  const src = ctx!.createBufferSource()
  src.buffer = buffer
  src.connect(ctx!.destination)
  src.start(at)
}

export function mountSound(a: Apparatus) {
  addEventListener('pointerdown', unlock, true)
  addEventListener('keydown', unlock, true)
  let seen = a.secondsCounted
  let rate = 0 // clicks per real second
  let next = 0 // audio time of the next click

  const render = () => {
    if (a.secondsCounted !== seen) {
      seen = a.secondsCounted
      const c = a.lastSecondCounts
      const speedUp = Number.isFinite(a.timeScale) ? a.timeScale : 1 // instant mode counts in real time
      rate = c > 0 ? Math.min(c * speedUp, MAX_CLICKS_PER_S) : 0
    }
    if (!ctx || ctx.state !== 'running' || !a.speaker || rate === 0) return void (next = 0)
    const now = ctx.currentTime
    const gap = () => -Math.log(1 - Math.random()) / rate // counts arrive at random: exponential gaps
    if (next < now) next = now + gap()
    for (; next < now + LOOKAHEAD_S; next += gap()) play(click, next)
  }

  // The knob's detents are mechanical: the haptic pulse always, the audible tick only with the speaker on.
  const detent = () => {
    navigator.vibrate?.(4)
    if (a.speaker && ctx?.state === 'running') play(tick, ctx.currentTime)
  }

  return { render, detent }
}
