# Model parameters

Every empirical number in `braggsim` lives here. Each entry gives the value, what fixed it, and the
physics behind it. Change a value only by re-running the fit it came from, then update this file.

## Fitted to leaflet Fig. 4 (`scan.DEFAULT`)

Fit target: `model/data/fig4_digitized.csv`, log panel (229 points, U = 35 kV, I = 1 mA), least
squares on log₁₀ R. Notebook: `notebooks/03_full_spectrum_vs_fig4.ipynb`. Date: 2026-09-24.
The final log-RMS is 0.051 dex. Uncertainties are 1σ from the fit Jacobian, scaled by the residual RMS.
They assume independent residuals, which is not the case: neighbouring residuals correlate
(lag-1 autocorrelation 0.51, so about 75 of the 229 points are effectively independent). Read every ± as
about 1.7× larger.

| Name | Value | ± | Unit | Physical meaning |
|---|---|---|---|---|
| `scale` | 1.529e5 | 3.4 % | counts/s per source unit | Overall efficiency: solid angle × crystal reflectivity × counter efficiency |
| `line_to_cont` | 6.72e-3 | 3.9 % | pm⁻¹ | Prefactor c of the Kα rate c·I·(U/U_K − 1)^m relative to the Kramers continuum (at 35 kV the factor (U/U_K − 1)^m is 0.62) |
| `r2` | 0.470 | 3.2 % | — | Effective 2nd-order reflectivity relative to 1st (see below) |
| `r3` | 0.253 | 4.0 % | — | Effective 3rd-order reflectivity relative to 1st (see below) |
| `sigma_deg` | 0.1203 | 2.3 % | ° | Gaussian angular resolution (FWHM 0.28°) at the leaflet's slits |
| `leak_amp_per_s` | 1.46e5 | 29 % | counts/s | Direct-beam halo at 2θ = 0 at 35 kV, 1 mA. It is assumed to scale as I·(U/35 kV)², like the total bremsstrahlung power; Fig. 4 (35 kV only) cannot test this. The data see only the halo's tail at 2θ = 4–5.2°, where it is well constrained: 318/s ± 7 % at 2θ = 4°. The value at 2θ = 0 is a Gaussian extrapolation (×460), correlated −0.98 with the width, so the rate for β < 2° is not validated |
| `leak_width_deg` | 1.142 | 2.0 % | ° (in 2θ) | Gaussian width of that halo |
| `absorber_mg_cm2` | 310 | 3.9 % | mg/cm² | Effective absorber (xraylib `"Glass, Pyrex"`) for the tube's glass wall and anode self-absorption ≈ 1.4 mm of glass. Without it the fit gives 0.20 dex and r₂ = 0.08 |
| `scatter_per_s` | 6.80 | 4.4 % | counts/s | Flat scattered radiation (air, crystal, housing) at 35 kV and 1 mA, seen at the ≈ 3° minimum. Assumed to follow the tube like the leak, so it is 0 with the tube off. The GM natural background (≲ 1/s) is neglected |

The 1st-order reflections are (200); orders n = 2 and 3 are (400) and (600). Kinematic structure-factor
ratios \|F_n\|²/\|F₁\|² from xraylib `FF_Rayl(Na) + FF_Rayl(Cl)` are 0.481 and 0.268. With room-temperature
Debye–Waller factors (B_Na ≈ 1.7 Å², B_Cl ≈ 1.2 Å²) they drop to 0.369 and 0.134. Extinction, which
weakens the strong 1st order most, pushes the ratios back up. The fitted r₂ and r₃ are therefore
*effective* values that lump these effects together. They lie between the two estimates, which is
plausible, but that is not an independent confirmation.

## Fixed from literature (not fitted)

| Name | Value | Source | Why not fitted |
|---|---|---|---|
| `source.LINE_EXPONENT_M` | 1.67 | Green & Cosslett (1968); literature values span ≈ 1.5–1.7 and 1.63 is also quoted. **Exact value to verify in the paper** | Needs scans at several U, and Fig. 4 is 35 kV only |
| `constants.KB_KA_RATIO` | 0.1935 | xraylib `RadRate` (Mo) | Freeing it gives ×1.16 and only 0.0005 dex better, so it is not needed |
| `constants.MO_KA_COMPONENTS`, `MO_KB_COMPONENTS` | Kα₁/Kα₂, Kβ₁,₃/Kβ₂ | xraylib line energies and `RadRate` | Atomic data |
| `ModelParams.tau_s` | 1.0e-4 s | Typical end-window GM tube. **Still to verify for the LD 559 01** | The log-RMS of the Fig. 4 fit is flat for τ from 0 to 100 µs, because the other parameters absorb it. The predicted peak heights do depend on τ: at 100 µs the 1st-order Kα tip loses ≈ 25 % |
| `scan.AIR_PATH_CM` | 18 cm | Geometry estimate: anode → crystal ≈ 12 cm, plus s₂ ≈ 6 cm | Degenerate with the absorber |

## Calibration-only (never used by the model)

| Name | Value | Where | Meaning |
|---|---|---|---|
| `FIG4_BETA_OFFSET_DEG` | 0.090 ± 0.004° | `tests/test_scan.py`, notebook 03 | The digitized Fig. 4 peaks sit a constant +0.09° above the Bragg angles. The leaflet's Table 3 lists the measured angles at the Bragg angles, so the shift comes from how the figure was drawn, or from the digitizer: both panels share the pixel zero `x0 = 97`, and 1.9 px would explain it. It is constant across all six peaks (0.07–0.11°, no trend), and the linear panel alone gives 0.094°. The fit compares the model at β − offset, and `expected_rate` does not include it |

## Known deviations

- **Line tips are 0.70–1.04 × Fig. 4.** The fit matches the log-panel wings. The 1st- and 2nd-order tips come
  out 15–30 % low (Kβ in 2nd order is worst, 0.70), and 3rd-order Kα matches. Freeing Kβ/Kα, giving the lines
  their own σ, a pseudo-Voigt profile, and τ ∈ 0–100 µs did not close the gap. We did not add a free peak-sharpness term. The relative
  heights across orders agree within 25 %.
- **Counter efficiency ε(λ) is constant.** The 559 01 fill gas is unknown, so a λ-dependent ε would be
  degenerate with the absorber.
- **One σ for every angle and slit.** σ(s₁, s₂) waits until a slit control exists.
- **Orders n ≤ 3.** The n = 4 continuum near 25° is ignored.
- **Mosaic crystal: Q/2μ taken as constant within an order.** In reality, λ³/μ_NaCl(λ) rises
  ≈ 27 % from 40 to 200 pm. Adding it (xraylib, no free parameter) improves the fit by only 0.0003 dex
  and moves the absorber from 310 to 328 mg/cm². The fitted absorber absorbs it. Extinction is folded
  into r₂ and r₃.
- **The ≈ 3° minimum is too shallow.** The model's floor is scatter (6.8/s) plus the leak tail: at β = 2.7°
  it gives 11/s against 5.7/s in Fig. 4, and at 2.8° it gives 8.7/s where the figure dips below its axis
  (≲ 4.4/s, a point the digitizer omits). A steeper leak shape could fix this but is not justified by
  the data yet.
- **Counts after dead time are drawn as Poisson.** A dead-time-limited GM counter is slightly
  sub-Poissonian (variance ≈ N(1 − Rτ)², 0.58× at the 1st-order Kα tip). `detector.sample_counts` ignores this.
- **Leak and scatter are phenomenological.** They have no explicit dependence on the slits or the crystal,
  and their I·U² scaling is assumed. With the tube off the model reads exactly 0 counts/s.
