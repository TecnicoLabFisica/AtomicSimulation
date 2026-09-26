// Entry point: one apparatus, the panel, and a frame loop driving the simulated clock.
import './styles/app.css'
import { Apparatus } from './apparatus/apparatus'
import { getLang } from './i18n'
import { mountPanel } from './views/panel'

document.documentElement.lang = getLang()
const apparatus = new Apparatus()
const render = mountPanel(document.querySelector<HTMLElement>('#app')!, apparatus)

let last = performance.now()
function frame(now: number) {
  apparatus.tick(Math.min((now - last) / 1000, 1)) // cap: a background tab must not jump ahead
  last = now
  render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
