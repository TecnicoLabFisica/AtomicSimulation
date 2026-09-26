// Entry point: one apparatus, the panel, and a frame loop driving the simulated clock.
import './styles/app.css'
import { Apparatus } from './apparatus/apparatus'
import { getLang } from './i18n'
import { mountPanel } from './views/panel'

document.documentElement.lang = getLang()
const apparatus = new Apparatus()
const render = mountPanel(document.querySelector<HTMLElement>('#app')!, apparatus)

// Keep the screen on while a program runs: a locked phone stops requestAnimationFrame, and a
// 38-minute scan at ×1 would silently stall. Unsupported or refused: the scan just pauses meanwhile.
let wakeLock: WakeLockSentinel | null = null
let wakeLockPending = false
function keepAwake(on: boolean) {
  if (on && !wakeLock && !wakeLockPending && 'wakeLock' in navigator) {
    wakeLockPending = true
    navigator.wakeLock.request('screen').then(
      (l) => (wakeLock = l).addEventListener('release', () => (wakeLock = null)),
      () => {},
    ).finally(() => (wakeLockPending = false))
  } else if (!on && wakeLock) {
    void wakeLock.release()
    wakeLock = null
  }
}

let last = performance.now()
function frame(now: number) {
  apparatus.tick(Math.min((now - last) / 1000, 1)) // cap: a background tab must not jump ahead
  last = now
  render()
  keepAwake(apparatus.busy)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
