// About · Legal: a native modal dialog, opened from a quiet header button. Text comes from the i18n dictionary.
import { t } from '../i18n'

const REPO = 'https://github.com/TecnicoLabFisica/AtomicSimulation'
const LINKS = [
  ['aboutSource', REPO],
  ['aboutLicenseCode', `${REPO}/blob/main/LICENSE`],
  ['aboutLicenseContent', `${REPO}/blob/main/LICENSE-CONTENT`],
  ['aboutThirdParty', `${REPO}/blob/main/THIRD-PARTY-NOTICES.md`],
  ['aboutBundled', './licenses.txt'], // emitted by build.license (vite.config.ts)
] as const

export function mountAbout(opener: HTMLElement) {
  const dlg = document.createElement('dialog')
  dlg.className = 'about'
  dlg.setAttribute('aria-labelledby', 'about-title')
  document.body.append(dlg)
  function build() {
    const s = t()
    dlg.innerHTML = `<button class="tool close" type="button" autofocus aria-label="${s.close}">×</button>
      <div class="about-body"><h2 id="about-title">${s.aboutTitle}</h2>
      <p>${s.aboutWhat}</p><p>${s.aboutTrademarks}</p>
      <h3>${s.aboutSafetyTitle}</h3><p>${s.aboutSafety}</p>
      <h3>${s.aboutDataTitle}</h3><p>${s.aboutData}</p>
      <h3>${s.aboutLicensesTitle}</h3>
      <ul>${LINKS.map(([k, href]) => `<li><a href="${href}" target="_blank" rel="noopener">${s[k]}</a></li>`).join('')}</ul></div>`
    opener.textContent = 'ⓘ'
    opener.setAttribute('aria-label', s.aboutTitle)
    opener.title = s.aboutTitle
  }
  const open = () => dlg.showModal()
  opener.addEventListener('click', open)
  dlg.addEventListener('keydown', (e) => e.stopPropagation()) // keep Esc from the global sheet handler; native cancel still closes
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || (e.target as HTMLElement).closest('.close')) dlg.close() // backdrop or ×
  })
  build()
  return { build, open }
}
