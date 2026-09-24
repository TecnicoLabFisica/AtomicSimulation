---
name: calibrate-model
description: Phase 3 calibration loop for the Bragg simulation — fit the empirical model parameters (scale, line/continuum ratio, r_n, m, τ, direct-beam leak, angular width) to the digitized leaflet Fig. 4 spectrum and document them honestly. Use when tuning the spectrum to match Fig. 4 or when any empirical parameter changes.
---

# Calibrate the model against Fig. 4

## Inputs
- `model/data/fig4_digitized.csv`, digitized from leaflet Fig. 4 (e.g. with WebPlotDigitizer) using the linear
  **and** the log panel. The log panel is the one that constrains the continuum and the 3rd order. Columns:
  `beta_deg, rate_per_s, panel` (`panel` ∈ {linear, log}). Put a header comment that cites the figure.
- The qualitative targets are in `bragg-reference/references/leaflet.md` (the Fig. 4 section).
- Fixed settings: U = 35 kV, I = 1 mA, Δβ = 0.1°, s₁ ≈ 5 cm, s₂ ≈ 6 cm.

## Loop (in `model/notebooks/03_full_spectrum_vs_fig4.ipynb`)
1. Fix everything that is known physics: d, line energies, λ_min, the Jacobian, and the Bragg angles. **Do not fit these.**
2. Free parameters, fitted roughly in this order, one group at a time:
   1. overall scale and continuum shape, fitted to the continuum away from the lines on the log scale
   2. the direct-beam leak term below ~3°
   3. line intensity exponent m and line/continuum ratio, fitted to the 1st-order Kα height
   4. Kα:Kβ ratio
   5. order reflectivities r₂, r₃ (r₁ ≡ 1)
   6. angular width σ(s₁, s₂), fitted to the peak widths
   7. GM dead time τ (effect near the 1st-order Kα) and efficiency ε(λ)
3. Use `scipy.optimize.least_squares`, fitting the **log** of the rate so the weak features count.
4. Plot the model against the data in linear and log, with residuals. Check against the qualitative list:
   the 3° minimum, the continuum hump near 5°, peak positions, relative heights across orders, and the fall-off to 25°.
5. Check that the parameters are physically plausible (τ ~ 10⁻⁴ s order of magnitude for a GM tube, r_n decreasing with
   n, m of order 1–2). An implausible value that fits well means the model is wrong. Fix the model instead.

## Honesty rules
- Never add a fudge term that exists only to fit one wiggle. Every term needs a physical story.
- Write each fitted value into `model/PARAMETERS.md` as a table row with the name, value, uncertainty (if available),
  what it was fitted to, the notebook, and the date. Add one sentence on its physical meaning.
- Record known residual mismatches in `PARAMETERS.md` under "Known deviations".
- Any calibrated constant that changes means the artifacts must be regenerated (`add-physics-feature` step 3).

## Done when
The linear and log overlays both match qualitatively, including the relative peak heights across orders.
`PARAMETERS.md` is complete, and `physics-reviewer` agrees the parameters are plausible.
