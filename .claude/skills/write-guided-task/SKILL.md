---
name: write-guided-task
description: Template and checklist for writing an educational guided task / challenge for the Bragg simulation (Explore or Lab mode) — goal, prediction, allowed controls, auto-checked success condition, explanation, teacher note, bilingual ES/EN strings. Use whenever creating or editing content in web/src/pedagogy.
---

# Write a guided task

Audience: students in a first university modern-physics lab (EPN), who may be using a phone. Teachers use the
tasks in class. Each task has to teach one idea, be checkable by the simulation, and be short.

## Pedagogical shape: predict → act → observe → explain
1. **Predict**: the student commits to a guess before touching anything (multiple choice or a number).
   This is what turns playing around into learning.
2. **Act**: only the controls the task needs are enabled. The rest are dimmed, not hidden.
3. **Observe**: the view gives feedback (the peak appears, the Huygens panel lights up, the spectrum changes).
4. **Explain**: 2–4 sentences that connect what they saw to Bragg's law, then show the prediction again.

## Task file shape (`web/src/pedagogy/tasks/<id>.ts`)
```ts
export const task: GuidedTask = {
  id: 'kalpha-vanish-voltage',
  mode: 'explore',                      // 'explore' | 'lab'
  concept: 'characteristic-threshold',  // one concept per task
  level: 1,                             // 1 intro · 2 core · 3 challenge
  controls: ['U'],                      // enabled controls
  initial: { U_kV: 35, I_mA: 1, coupled: true, limits_deg: [5, 9] },
  predict: { kind: 'number', unit: 'kV', key: 'task.kalpha.predict' },
  success: (s) => s.lastScan?.hasPeak('Kalpha', 1) === false && s.U_kV > 0, // asks the model, no magic thresholds
  explain: 'task.kalpha.explain',
  teacherNote: 'task.kalpha.teacher',   // expected answer, common mistakes, what to discuss
};
```
All strings go in `web/src/pedagogy/i18n/{es,en}.ts` under the same keys. Spanish is written first, and it has to be natural
Spanish, not a translation.

## Checklist
- [ ] One concept, one success condition, finishable in under 5 minutes.
- [ ] The success condition comes from the physics model (via `src/physics` or `analysis`), not from magic numbers.
- [ ] Lab mode never reveals expected angles, λ values, or the answer. Explore mode may.
- [ ] Addresses at least one known misconception (the `pedagogy-reviewer` agent has the list).
- [ ] Uses the units and symbols the leaflet uses: θ is the glancing angle, β is the target angle, d = 282.01 pm.
- [ ] The teacher note includes the expected result with its physical justification.
- [ ] Both languages are complete. Text is short enough for a 360 px screen.

## Seed ideas
- At what voltage do the characteristic lines disappear, and why is it the Mo K threshold and not λ_min?
- Predict θ for 2nd-order Kα, then find it.
- Shrink s₂ until Kα and Kβ merge, and relate that to angular resolution.
- Put in the Zr filter: which peak disappears, and why that one?
- From one measured scan, find λ(Kα) from three orders and compare with the leaflet's Table 5 workflow (Lab mode).
- Duane–Hunt: move U and watch the continuum edge. Estimate h (Phase 11).
