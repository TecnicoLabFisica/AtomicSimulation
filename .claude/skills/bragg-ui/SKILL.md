---
name: bragg-ui
description: The visual design system of the Bragg simulation — elegant, simple, Apple-like, yet a precise lab instrument. Tokens (type, spacing, colour, physics colours, themes), motion principles, and component specs (goniometer canvas, 554 800 panel & LED displays, spectrum plot, Huygens panel, controls). Load before creating or changing anything in web/src/views, web/src/styles, web/src/pedagogy or index.html; use together with frontend-design.
---

# Bragg UI: design system

## Character
**Quiet, precise, and alive.** Think of an Apple *Measure/Weather*-style app crossed with a well-made lab
instrument. The physics is the hero and the chrome disappears. When a student looks at it they should see the crystal,
the beam, and the spectrum right away, and only then the controls.

`frontend-design` supplies general craft. This skill **narrows** it. Where they conflict, this skill wins. In
particular, don't use unusual display fonts or loud maximalist aesthetics here: the project's distinct look comes from
restraint, precise geometry, and meaningful motion.

## Principles
1. **Content first.** The goniometer and spectrum take most of the screen, and controls sit at the edges.
2. **One accent colour** for interaction. Colour otherwise *encodes physics* (Kα, Kβ, continuum, beam) and means
   the same thing in every view.
3. **Hierarchy through weight and size, not boxes.** Few borders, hairline separators, generous whitespace,
   and 1–2 levels of elevation at most.
4. **Motion explains.** Things move because the physics moves: arms rotate, the beam travels, and wavefronts
   interfere. There is no decorative animation.
5. **Progressive disclosure.** Explore mode shows overlays (expected angles, path difference). Lab mode strips
   them away. Advanced controls (s₂, dead time, Zr filter) sit behind a "More" sheet.
6. **Honest instrument.** Numbers use tabular figures, carry units, and show only the precision the device has
   (U to 0.1 kV, angles to 0.1°, rates as integers capped at 9999 on the emulated display).
7. **Touch-first.** Everything works with a thumb on a 360 px phone. Hover is only an enhancement.

## Reference files
| File | Contents |
|---|---|
| `references/tokens.md` | Type scale, spacing, radii, colours (UI + physics, light/dark), elevation, and the `tokens.css` skeleton |
| `references/motion.md` | Timing, easing, what animates and what doesn't, reduced motion, and the frame loop |
| `references/components.md` | Layouts per breakpoint, goniometer canvas, panel/LED displays, ADJUST knob, spectrum plot, Huygens panel, sheets, and tasks |

## Before you finish a UI change
- [ ] Only tokens used, with no raw hex, px font sizes, or durations in component code
- [ ] Light and dark both checked, and contrast is AA
- [ ] 390 px phone layout works, and touch targets are ≥ 44 px
- [ ] Reduced motion is respected
- [ ] All text comes from i18n (es/en)
- [ ] The `design-reviewer` agent has seen screenshots
