# Motion

## Two clocks, never mixed
1. **UI clock**: sheets, key presses, and transitions. It runs in fixed short durations.
2. **Physics clock**: the apparatus's simulated time (arm stepping, Δt countdown, scan progress). It is scaled by the
   time-acceleration control (1×, 10×, 100×, instant). The *view* interpolates between states for smoothness, but
   the **state** always follows the apparatus logic. The display never shows a position the device isn't at.

## Timing and easing (UI clock)
| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 150ms | Key highlight, toggles |
| `--dur-base` | 250ms | Value changes, chips, small layout |
| `--dur-slow` | 350ms | Sheets, mode switches |
| `--ease-out` | cubic-bezier(0.22, 1, 0.36, 1) | Default for anything entering or settling |
| `--ease-in-out` | cubic-bezier(0.65, 0, 0.35, 1) | Moves between two resting states |
| spring (JS) | stiffness 300, damping 30 | Knob inertia, goniometer arm easing between steps |
| `--dur-camera` | 700ms | The 3D camera flying to or from a focus card (ease-in-out). The card fades in during the second half |
No bounce or overshoot on data, because data must never visually lie.

## What animates
- **Goniometer arms**: they rotate smoothly between 0.1° steps at the stepper-motor speed, and the sensor arm turns at twice the target arm.
- **Beam**: a soft moving dash or gradient pulse along the ray path, with intensity (opacity/width) proportional to the
  current rate on a log scale. The reflected beam brightens as a peak is approached.
- **Spectrum**: each new point fades in over `--dur-fast`, and the curve extends. There is no redraw flash.
- **Huygens panel**: wavefronts propagate continuously. When 2d sin θ = nλ the reflected fronts line up and the
  path-difference bracket turns `--phys-constructive`.
- **LED displays**: values change instantly, as on the real device. Blinking is used only where the device blinks
  (interlock, invalid limits, HV lamp) at about 1 Hz.

## What does not animate
Axes rescaling during a scan (fix the range up front, or change it only between scans), text, and layout on every data point.

## Reduced motion (`prefers-reduced-motion: reduce`)
- The beam becomes a static line whose opacity still encodes the rate. Wavefronts become static snapshots updated
  only when θ changes.
- Arms jump to each step with no interpolation. Sheets cross-fade instead of sliding.
- The camera jumps to its framing and the card appears at once. The door jumps, and there is no shake.
- Blinking becomes a steady state with an icon or text cue.

## Frame loop
There is one `requestAnimationFrame` loop that owns all canvases, and it only redraws dirty layers (static
background, arms, beam, overlays). It pauses when the page is hidden (`visibilitychange`). Canvases are sized with
`devicePixelRatio` capped at 2 on low-end devices, and nothing is allocated per frame in hot paths.
The target is 60 fps on a mid-range phone. If a feature can't hit it, simplify the feature.
