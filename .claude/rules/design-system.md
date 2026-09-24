---
paths:
  - "web/src/views/**"
  - "web/src/styles/**"
  - "web/src/pedagogy/**"
  - "web/src/main.ts"
  - "web/index.html"
---

# UI design rules (short form — the full system is in the `bragg-ui` skill; load it first)

- **Feel:** elegant, simple, calm, Apple-like. Also precise: it is a lab instrument, not a toy.
- Use only the design tokens (CSS custom properties) from `web/src/styles/tokens.css`. No
  ad-hoc colours, font sizes, radii, shadows, or durations.
- One accent colour. The physics colours (Kα, Kβ, continuum, beam) mean the same thing in every
  view: goniometer, spectrum, Huygens panel, and legends.
- Motion only when it carries meaning (arm rotation, beam, wavefronts, a point appearing on the
  spectrum). Ease-out/spring, 200–350 ms for UI, and a real-time physics clock for the apparatus.
  Always honour `prefers-reduced-motion`.
- Light and dark themes both work, driven by `prefers-color-scheme` plus a manual toggle.
- Mobile first: works at 360 px width, touch targets ≥ 44 px, no hover-only affordances.
  Canvas is sized with `devicePixelRatio`.
- Accessibility: WCAG AA contrast, full keyboard operation of the apparatus panel, ARIA labels
  from the i18n dictionary, and never colour as the only signal.
- All user-facing text comes from the i18n dictionary (es default, en).
- Performance: steady 60 fps with `requestAnimationFrame`, and no layout thrash in the animation loop.
- Views render state; they do not compute physics. Physics lives in `src/physics` and the device
  logic in `src/apparatus`.
- After a visible change, ask the `design-reviewer` agent for a critique at 390 / 820 / 1440 px.
