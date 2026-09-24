# Design tokens

These are implemented as CSS custom properties in `web/src/styles/tokens.css`. Canvas code reads them through
`getComputedStyle(document.documentElement)` and re-reads them when the theme changes. It never hard-codes colours.

## Typography
- Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, "Segoe UI", Roboto, sans-serif`.
  Use the system font on each device and **don't bundle webfonts**, because the app has to load fast on phones.
- Numbers: `font-variant-numeric: tabular-nums;` everywhere a value changes.
- Mono (for LED-style readouts, if not using a segment font): `ui-monospace, "SF Mono", Menlo, Consolas, monospace`.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--text-display` | 34/40 | 700 | Mode title (rare) |
| `--text-title` | 22/28 | 600 | Section / sheet titles |
| `--text-headline` | 17/22 | 600 | Card headers, task titles |
| `--text-body` | 17/24 | 400 | Explanations |
| `--text-callout` | 15/20 | 400 | Controls, labels |
| `--text-footnote` | 13/18 | 400 | Axis labels, units, hints |
| `--text-caption` | 11/13 | 500 | Tick labels, badges (uppercase + 0.06em tracking) |
Use a letter-spacing of −0.01em at ≥ 22 px.

## Spacing: 4 pt base, 8 pt rhythm
`--space-1: 4px · --space-2: 8px · --space-3: 12px · --space-4: 16px · --space-5: 24px · --space-6: 32px · --space-7: 48px · --space-8: 64px`.
Screen margins are 16 (phone), 24 (tablet), and 32 (desktop).

## Radii and strokes
`--radius-s: 8px` (chips, inputs) · `--radius-m: 14px` (cards) · `--radius-l: 22px` (sheets, panel) · `--radius-full`.
Hairline: `--stroke-hair: 0.5px` on DPR ≥ 2 and 1px otherwise. Chart strokes are 1.5px (data) and 0.5–1px (grid).

## Colour: UI (light / dark)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #F5F5F7 | #000000 | App background |
| `--surface` | #FFFFFF | #1C1C1E | Cards, panel |
| `--surface-2` | #F2F2F7 | #2C2C2E | Inset areas, sheet |
| `--fill` | rgba(120,120,128,.12) | rgba(120,120,128,.24) | Control backgrounds |
| `--separator` | rgba(60,60,67,.18) | rgba(84,84,88,.6) | Hairlines, grid |
| `--label` | #1D1D1F | #F5F5F7 | Primary text |
| `--label-2` | rgba(60,60,67,.62) | rgba(235,235,245,.62) | Secondary text, units |
| `--label-3` | rgba(60,60,67,.32) | rgba(235,235,245,.32) | Disabled, ticks |
| `--accent` | #0071E3 | #0A84FF | **The only** interaction colour: selected key, focus, primary button |
| `--danger` | #D70015 | #FF453A | HV on lamp, interlock blink, errors |
| `--success` | #248A3D | #30D158 | "SAFE… OK", task solved |

## Colour: physics (same meaning in every view)
| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--phys-kalpha` | #E8590C | #FF8A3D | Mo Kα (line, peak marker, λ in Huygens panel) |
| `--phys-kbeta` | #7048E8 | #9D7BFF | Mo Kβ |
| `--phys-continuum` | #868E96 | #8E8E93 | Bremsstrahlung, measured spectrum curve |
| `--phys-beam` | #0CA5B0 | #3FE0E8 | X-ray beam, incident/reflected rays, wavefronts |
| `--phys-crystal` | #495057 | #C7C7CC | Crystal planes, lattice points |
| `--phys-constructive` | = `--success` | | Path-difference condition met |
Kα and Kβ must *also* differ in something other than colour: labels ("Kα", "Kβ") on peaks, and a solid versus dashed
marker. Orange and violet stay distinguishable for the common forms of colour-blindness.
The data curve is drawn in `--label` (strong) or `--phys-continuum`. Line colours are reserved for markers and overlays.

## Elevation
Mostly flat. `--shadow-1: 0 1px 2px rgba(0,0,0,.06), 0 1px 1px rgba(0,0,0,.04)` for cards in light mode.
In dark mode use surface steps instead of shadows. Sheets use `backdrop-filter: saturate(180%) blur(20px)` over a
semi-transparent `--surface`, with a solid fallback.

## Themes
`:root` holds the light values. `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]` override them, and
`[data-theme="light"]` forces light. The manual toggle is stored in `localStorage`.
