// Explore mode: U and I sliders under the goniometer. They write the same integer device fields as the
// panel's ADJUST (the device takes U and I changes even during a scan), so there is one state.
import { RANGES, type Apparatus } from '../apparatus/apparatus'
import { t } from '../i18n'

const SLIDERS = [
  { key: 'U', field: 'u', fmt: (v: number) => `${(v / 10).toFixed(1)} kV` },
  { key: 'I', field: 'i', fmt: (v: number) => `${(v / 100).toFixed(2)} mA` },
] as const

export function mountExplore(root: HTMLElement, a: Apparatus) {
  const build = () => {
    const s = t()
    root.innerHTML = SLIDERS.map(({ key }) => `
      <label class="slider" data-slider="${key}">
        <span>${s.keys[key][1]}</span>
        <output></output>
        <input type="range" min="${RANGES[key][0]}" max="${RANGES[key][1]}" step="1">
      </label>`).join('')
  }
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement
    const sl = SLIDERS.find((x) => x.key === el.closest<HTMLElement>('[data-slider]')?.dataset.slider)
    if (sl) a[sl.field] = Number(el.value)
  })

  const render = () => {
    for (const { key, field, fmt } of SLIDERS) {
      const row = root.querySelector<HTMLElement>(`[data-slider="${key}"]`)!
      const input = row.querySelector('input')!
      const out = row.querySelector('output')!
      const v = a[field]
      if (document.activeElement !== input && input.value !== String(v)) input.value = String(v)
      const text = fmt(v)
      if (out.textContent !== text) out.textContent = text
    }
  }

  build()
  return { build, render }
}
