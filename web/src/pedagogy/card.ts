// The Learn sheet: the Explore/Lab switch, the guided-task list and the task card
// (predict → act → observe → explain). The act step ends by itself when the task's success(a) holds.
import type { Apparatus, Key } from '../apparatus/apparatus'
import { getLang, t } from '../i18n'
import { en } from './i18n/en'
import { es } from './i18n/es'
import { getMode, setHints, setMode, type AppMode } from './mode'
import { applyInitial, type GuidedTask } from './task'
import { task as kalphaThirdOrder } from './tasks/kalpha-third-order'
import { task as lambdaThreeOrders } from './tasks/lambda-three-orders'
import { task as lineThreshold } from './tasks/line-threshold'

export const TASKS: GuidedTask[] = [kalphaThirdOrder, lineThreshold, lambdaThreeOrders]
const MODES: AppMode[] = ['explore', 'lab']

/** Guided-task strings in the current language. */
export const pt = () => (getLang() === 'es' ? es : en)
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

type Hooks = { onMode: () => void; onFocus: (keys: Key[] | null) => void; onAct: () => void }

export function mountLearn(root: HTMLElement, a: Apparatus, { onMode, onFocus, onAct }: Hooks) {
  let task: GuidedTask | null = null
  let step = 0 // 0 predict · 1 act · 2 observe · 3 explain
  let prediction: string | null = null // the number as typed, or the chosen option's index
  const teacher = new URLSearchParams(location.search).has('teacher')

  const listHtml = () => {
    const s = t()
    const p = pt()
    return `
      <div class="view-head"><h2>${p.learn}</h2></div>
      <div class="seg" role="group" aria-label="${s.modeLabel}">
        ${MODES.map((m) => `<button data-mode="${m}" aria-pressed="${getMode() === m}">${s.modes[m]}</button>`).join('')}
      </div>
      <p class="note">${s.modeHint[getMode()]}</p>
      <h3>${p.tasks}</h3>
      <ul class="task-list">
        ${TASKS.map((k) => {
          const x = p.task[k.id as keyof typeof p.task]
          return `<li><button data-task="${k.id}">
            <span class="chip">${x.concept}</span>
            <strong>${x.title}</strong>
            <span class="meta">${p.levels[k.level]} · ${p.modeNote[k.mode]}</span>
          </button></li>`
        }).join('')}
      </ul>`
  }

  const bodyHtml = (k: GuidedTask) => {
    const p = pt()
    const x = p.task[k.id as keyof typeof p.task]
    if (step === 0) {
      const input = k.predict.kind === 'number'
        ? `<label class="predict-number"><span class="visually-hidden">${p.predictNumber}</span>
            <input data-predict inputmode="decimal" autocomplete="off" value="${esc(prediction ?? '')}">
            <span>${k.predict.unit}</span></label>`
        : `<div class="choices" role="group" aria-label="${p.steps[0]}">${x.options.map((o, i) =>
            `<button data-choice="${i}" aria-pressed="${prediction === String(i)}">${o}</button>`).join('')}</div>`
      return `<p>${x.predict}</p>${input}
        <button class="primary" data-commit ${prediction === null ? 'disabled' : ''}>${p.commit}</button>`
    }
    if (step === 1) return `<p>${x.act}</p><p class="hint">${p.waiting}</p>`
    if (step === 2) {
      return `<p class="done">✓ ${p.done}</p><p>${x.observe}</p>
        <button class="primary" data-next>${p.explainNext}</button>`
    }
    const mine = k.predict.kind === 'number'
      ? `${esc(prediction ?? '')}${k.predict.unit === '°' ? '' : ' '}${k.predict.unit}` // 22.2°, 20.0 kV
      : x.options[Number(prediction)]
    const answer = k.predict.kind === 'choice' ? `<dt>${p.expected}</dt><dd>${x.options[k.predict.answer]}</dd>` : ''
    return `<p>${x.explain}</p><dl class="recall"><dt>${p.yourPrediction}</dt><dd>${mine}</dd>${answer}</dl>
      <button class="back" data-restart>${p.restart}</button>`
  }

  const cardHtml = (k: GuidedTask) => {
    const p = pt()
    const x = p.task[k.id as keyof typeof p.task]
    return `
      <button class="back" data-back>‹ ${p.back}</button>
      <div class="view-head"><h2>${x.title}</h2><span class="chip">${x.concept}</span></div>
      <ol class="steps">${p.steps.map((st, i) =>
        `<li ${i === step ? 'aria-current="step"' : ''} ${i < step ? 'data-past' : ''}>${st}</li>`).join('')}</ol>
      <div class="task-body" aria-live="polite">${bodyHtml(k)}</div>
      ${teacher ? `<details class="teacher"><summary>${p.teacher}</summary><p>${x.teacher}</p></details>` : ''}`
  }

  const build = () => {
    root.innerHTML = task ? cardHtml(task) : listHtml()
  }
  const go = (next: number) => {
    step = next
    setHints(next >= 2) // the expected angles would give the answer away before it is found
    build()
    root.querySelector<HTMLElement>('.task-body input, .task-body button')?.focus()
    if (next === 1) onAct()
  }
  const start = (k: GuidedTask) => {
    task = k
    prediction = null
    if (getMode() !== k.mode) {
      setMode(k.mode)
      onMode()
    }
    applyInitial(a, k.initial)
    onFocus(k.controls)
    go(0)
  }

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b) return
    const d = b.dataset
    if (d.mode && d.mode !== getMode()) {
      setMode(d.mode as AppMode)
      onMode()
      build()
    } else if (d.task) start(TASKS.find((k) => k.id === d.task)!)
    else if (d.back !== undefined) {
      task = null
      setHints(true)
      onFocus(null)
      build()
    } else if (d.choice) {
      prediction = d.choice
      build()
      root.querySelector<HTMLElement>(`[data-choice="${d.choice}"]`)?.focus()
    } else if (d.commit !== undefined && prediction !== null) go(1)
    else if (d.next !== undefined) go(3)
    else if (d.restart !== undefined) start(task!)
  })
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement
    if (el.dataset.predict === undefined) return
    const v = el.value.trim()
    prediction = v !== '' && Number.isFinite(Number(v.replace(',', '.'))) ? v : null
    root.querySelector<HTMLButtonElement>('[data-commit]')!.disabled = prediction === null
  })
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).dataset.predict !== undefined && prediction !== null) go(1)
  })

  /** Per frame: the act step waits for the task's success condition. True when it was just met (the
   * caller brings the sheet back, since the student is at the instrument then). */
  const render = (): boolean => {
    if (!task || step !== 1 || !task.success(a)) return false
    go(2)
    return true
  }

  /** The act instruction while the task waits for it, else null. */
  const actText = () => (task && step === 1 ? pt().task[task.id as keyof ReturnType<typeof pt>['task']].act : null)

  build()
  return { build, render, actText }
}
