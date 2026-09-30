# Components

## Layout: the bench and its focus cards
- **The room**: the whole stage below the topbar is a 3D bench (`views/bench.ts`, three.js, lazy chunk). It shows
  the 554 800 on a table with a monitor beside it. The student can orbit a little (yaw ±40°, no pan) and zoom.
  The topbar keeps the title, time acceleration, Learn, λ, theme and language.
- **Focus**: tapping a part flies the camera to it (`--dur-camera`, ease-in-out). Its **focus card** then fades in
  during the second half of the flight: the panel face → the 554 800 panel card, the monitor → the spectrum card
  (16:10), and the goniometer or chamber window → the chamber card (the live count rate, the 2D goniometer, and the
  Explore sliders). A
  corner ×, Esc, or a tap on the scrim flies back out. The door toggles in place. If the interlock refuses it, the
  door shakes and a toast explains why.
- **Dock**: a floating pill at the bottom holding ⚙︎ Settings (the primary action; an accent badge plus an
  `aria-description` when a guided task needs the panel, and icon-only below 400 px), Monitor, Goniometer, and
  Open/Close door. It gives the same actions as tapping meshes, for
  keyboard and screen-reader users and for the no-WebGL fallback. It is hidden while a card is open. Behind an open
  card, a blurred `--bg` scrim quiets the room. Cards are `role="dialog"` and receive focus themselves, and the
  task's act strip stays above them.
- **When SCAN passes its self-test** (the positioning or scan phase) while the panel card is open, the view flies back
  to the room, so the student sees the arms move and the monitor fill.
- **Inspectors** (Learn, Huygens) are a right-hand floating column on desktop and bottom sheets below 1024 px.
- **Phone**: cards fill the width, the dock spans it, and the portrait room frames the device with the monitor's edge.
- The app never scrolls. Cards scroll inside themselves.

## 3D bench
- It is built procedurally from primitives, with proportions from the 554 800 manual (see `bragg-reference`), and
  uses no LD imagery. Materials are matte. Object colours come from the `--bench-*` tokens, which stay the same in
  both themes except the table. The canvas is transparent over `--bg`.
- The panel face is a canvas texture that mirrors the device: LED displays, the HV lamp, key LEDs (`keySelected`),
  blinking at about 1 Hz where the device blinks, plus a real ADJUST knob that turns with the HTML dial. The monitor
  screen copies the uPlot canvas.
- The arms use the same `armEaser` as the 2D view. The beam matches the 2D goniometer: dashes while emitting, and a
  reflected opacity equal to the log rate in Explore mode. In Lab mode the reflected beam is a constant faint path,
  because rate-following brightness would find the peaks for the student. Tapping the closed door's glass opens it.
  While the door is open or locked, the glass lets taps through to the goniometer.
- It redraws only when something changed. There are no real-time shadows, only a contact-shadow plane.

## Goniometer canvas (top-down schematic, not a photo)
- Elements: tube (a rounded rectangle with a small anode glyph), collimator slit, the crystal on the target
  arm at θ, and the GM counter on the sensor arm at 2θ. Arm lengths follow s₁ and s₂ proportionally.
- An angle scale arc with hairline ticks every 1°, labelled every 5° in `--text-caption`.
  Show θ and 2θ arcs with small labels. In explore mode show "θ" and "2θ" and nothing else by default.
- The beam is drawn in `--phys-beam` (see motion). The crystal planes are a few hairlines in `--phys-crystal`.
- Explore overlays: ghost ticks at the expected Kα/Kβ angles for n = 1–3 in the physics colours.
- Interaction (explore mode): drag the crystal to set θ directly, and the arm follows with coupling. In lab mode
  positioning only happens through the panel, like the real device.

## 554 800 panel
- Take the real device's *layout* (top display for the rate, bottom display for the selected quantity, the key groups
  Parameter · Scan mode · Operation, the ADJUST knob, and the HV lamp) and render it in the app's calm language:
  a `--surface` card with `--radius-l`, keys as rounded pills, and small LED dots showing which key is selected.
- **Displays**: dark inset (`#0B0B0C` in both themes), 4 digits, tabular mono or a subtle 7-segment font (SVG,
  no webfont dependency) in a warm red-orange glow (`#FF3B30` with a soft `text-shadow`). Unit and symbol sit to the
  right in a small dot-matrix style. This is the **only** skeuomorphic element, and even here keep it subtle.
- Keys: labels U, I, Δt, Δβ, β LIMITS, SENSOR, TARGET, COUPLED, ZERO, RESET, REPLAY, SCAN, HV ON/OFF, and 🔈.
  The selected key has an `--accent` ring. Disabled keys (for the current state) use `--label-3` and are still readable.
- **ADJUST knob**: a circular dial of 88–120 px. Drag it in a circle, or scroll the wheel or trackpad. Arrow keys step
  by one increment, and Shift+Arrow steps by ×10. Dynamic response: speed maps to the step multiplier. A subtle
  detent tick sounds with the audio toggle, and haptics fire where the Vibration API exists.
- Door: a toggle "Doors closed / open" with a lock glyph. It is locked while HV is on.
- The time-acceleration control sits **outside** the emulated panel and is labelled clearly as a simulation feature.

## Spectrum plot (uPlot)
- The x axis is β (target angle) in °. The y axis is R in 1/s. There is a segmented Linear | Log toggle, and in log
  mode the axis shows 10ⁿ ticks.
- Data is a 1.5px line in `--label`, with small points only when zoomed. Grid lines are `--separator` hairlines on
  y only. Axis labels use `--text-footnote` in `--label-2`.
- Explore overlays: vertical hairline markers with labels "1·Kα", "2·Kβ", … in the physics colours, and a shaded
  band below the λ_min angle.
- Interactions: tap or hover shows a crosshair readout (β, R, and λ for n = 1). Pinch or wheel zooms, and double-tap
  resets. CSV export sits in the overflow menu.
- A theme adapter maps tokens to uPlot options and rebuilds when the theme changes.

## Huygens / path-difference panel
- A close-up of 3–4 lattice planes with the incident and reflected wavefronts. It shows the path difference 2d sin θ as a
  highlighted bracket next to a λ ruler for the selected line.
- It shows the live equation `2d sin θ = ___ pm` against `nλ = ___ pm`. When they match within the angular width,
  the bracket turns `--phys-constructive` and the equation settles.
- A line selector (Kα / Kβ) uses the physics colours.

## Sheets, cards, controls
- Sheets are bottom sheets on phone and popovers or inspectors on larger screens, with a grabber, swipe to dismiss,
  and a focus trap.
- Sliders (explore mode only: U, I, s₂) show the value and unit right-aligned in tabular numbers. Steps are the
  device's steps.
- A segmented control switches modes (Explore / Lab).
- Buttons: primary (filled `--accent`), secondary (tinted `--fill`), and plain text. All are at least 44 px tall.

## Guided task card
It has a title, the concept chip, and step dots (Predict · Act · Observe · Explain). The prediction input is large and
thumb-friendly. On success there is a gentle `--success` check with a single fade and no confetti.
