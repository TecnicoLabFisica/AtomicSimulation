# Model parameters

Every empirical number in `braggsim` lives here. Each entry gives the value, what fixed it, and the
physics behind it. Change a value only by re-running the fit it came from, then update this file.

## Fitted to leaflet Fig. 4 (`scan.DEFAULT`)

Fit target: `model/data/fig4_digitized.csv`, log panel (229 points, U = 35 kV, I = 1 mA), least
squares on log₁₀ R. Notebook: `notebooks/03_full_spectrum_vs_fig4.ipynb`. Date: 2026-09-25
(refit after the order strengths moved from free r₂, r₃ to structure factors). The final log-RMS is 0.054 dex. Uncertainties are 1σ from the fit Jacobian, scaled by the residual RMS.
They assume independent residuals, which is not the case: neighbouring residuals correlate
(lag-1 autocorrelation 0.52, so about 75 of the 229 points are effectively independent). Read every ± as
about 1.7× larger.

| Name | Value | ± | Unit | Physical meaning |
|---|---|---|---|---|
| `scale` | 1.676e5 | 3.7 % | counts/s per source unit | Overall efficiency: solid angle × crystal reflectivity × counter efficiency |
| `line_to_cont` | 7.43e-3 | 3.9 % | pm⁻¹ | Prefactor c of the Kα rate c·I·(U/U_K − 1)^m relative to the Kramers continuum (at 35 kV the factor (U/U_K − 1)^m is 0.62) |
| `debye_waller_pm2` | 6.26e3 (0.63 Å²) | 9.0 % | pm² | Effective Debye–Waller B that sets how fast the orders weaken (see below) |
| `sigma_deg` | 0.1228 | 2.3 % | ° | Gaussian angular resolution (FWHM 0.29°) at the leaflet's slits. It is also the rocking-curve width when target and sensor are not coupled (see Known deviations) |
| `leak_amp_per_s` | 1.18e5 | 29 % | counts/s | Direct-beam halo at 2θ = 0 at 35 kV, 1 mA. It follows the tube as I·S(U) (`scan.tube_factor`, below); Fig. 4 (35 kV only) cannot test this. The data see only the halo's tail at 2θ = 4–5.2°, where it is well constrained: 312/s ± 7 % at 2θ = 4°. The value at 2θ = 0 is a Gaussian extrapolation (×380), correlated −0.98 with the width, so the rate for β < 2° is not validated |
| `leak_width_deg` | 1.161 | 2.0 % | ° (in 2θ) | Gaussian width of that halo, in sensor angle |
| `absorber_mg_cm2` | 326 | 4.2 % | mg/cm² | Effective absorber (xraylib `"Glass, Pyrex"`) for the tube's glass wall and anode self-absorption ≈ 1.5 mm of glass. Without it the fit gives 0.21 dex and B = 5.4 Å² (r₂ = 0.18) |
| `scatter_per_s` | 5.34 | 5.6 % | counts/s | Flat scattered radiation (air, crystal, housing) at 35 kV and 1 mA, seen at the ≈ 3° minimum. It follows the tube like the leak, so it is 0 with the tube off. Since 2026-10-14 this is the fitted floor 5.54 minus `background_per_s` (0.2): a bookkeeping split, no refit, and the sum at 35 kV / 1 mA is unchanged |
| `background_per_s` | 0.2 | assumed, 0.1–0.5 | counts/s | GM natural background, a true rate added before the dead time; independent of tube and filters. Anchored to LD instruction sheet 559 01 (end-window counter, background ≤ 7 pulses/min ≈ 0.12/s with 50 mm Pb + 3 mm Al shielding); inside the 554 800, less shielded, we assume 0.2. Lab staff could measure it with 0 kV / 0 mA for ≥ 100 s. Added 2026-10-14 |
| `direct_per_s` | 2.97e5 | derived, no measurement | counts/s | Direct beam at 35 kV, 1 mA, no absorber, sensor at 0°, no crystal (`scan.direct_rate`). Anchored to EPN Práctica 1: 950/s is the guide's pass threshold for skipping calibration (21 kV, 0.05 mA, collimator, s1 = s2 = 5 cm, no wheel absorber or foil; the tube's Pyrex absorber and the 18 cm air path included), not an observation, so this is a lower bound and a healthy apparatus may read more. True rate 950/(1 − 950τ) = 1049.7/s, minus background, divided by `tube_factor(21, 0.05)` = 3.534e-3. It goes through the unverified τ = 100 µs: at the 559 01 sheet's ≤ 90 µs it would be 1.0 % lower. No EPN measurement exists. Plausible: same order as `leak_amp_per_s` (1.18e5). Added 2026-10-14 |

Order strengths r_n (relative to n = 1, all orders up to `scan.MAX_ORDER` = 15) are
\|F_n\|²/\|F₁\|² · exp(−2B(s_n² − s₁²)) with s_n = n/(2d). The 1st-order reflection is (200), order n is (2n 0 0).
Kinematic structure-factor ratios from xraylib `FF_Rayl(Na) + FF_Rayl(Cl)` (`crystal.structure_factor_sq_rel`)
are 0.481 and 0.268 for n = 2, 3. With room-temperature Debye–Waller factors (B_Na ≈ 1.7 Å², B_Cl ≈ 1.2 Å²)
they drop to 0.369 and 0.134. Extinction, which weakens the strong 1st order most, pushes the ratios back up.
The fitted B = 0.63 Å² is therefore an *effective* value that lumps these effects together. It gives
r₂ = 0.427, r₃ = 0.195, r₄ = 0.089, r₅ = 0.038, between the two estimates. That is plausible but not an independent
confirmation. The earlier fit with free r₂, r₃ (0.470, 0.253; 0.051 dex) did not constrain n ≥ 4 at all.

## Derived, no free parameter

| Name | What | Why |
|---|---|---|
| Filters in `scan.expected_rate` | `filters` multiply the Bragg signal by T(λ) exactly; leak and scatter scale through the filtered `tube_factor` | Exact for the direct-beam halo, an assumption for scatter (scattered photons are not the filtered spectrum). Mo/Zr/Ag/In foils and the 554 834 wheel are all just `(material, mg/cm²)` entries. Added 2026-10-14 |
| `scan.tube_factor` | I · S(U), S(U) = [∫N(λ, U)T(λ)dλ + Σ lines N_K T(λ_K)] / (same at 35 kV) | Leak and scatter follow the photon rate that leaves the tube through the absorber: the Kramers continuum (trapezoid rule on `filters.MU_RHO_GRID_PM`) plus the Mo K lines. S = 0.545, 0.223, 0.050, 0.005 at 30, 25, 20, 15 kV. (U/35)², used before, gave 0.73, 0.51, 0.33, 0.18. The absorber removes the soft spectrum that low voltages add. Only S(35 kV) = 1 is tested (Fig. 4) |
| Rocking weight in `scan.expected_rate` | exp(−½ ((S/2 − β)/σ)²) for sensor S and target β | Uncoupled arms (SENSOR/TARGET scans). The spectrum follows the sensor (θ = \|S\|/2), and a target off S/2 only weakens it |

## Fixed from literature (not fitted)

| Name | Value | Source | Why not fitted |
|---|---|---|---|
| `source.LINE_EXPONENT_M` | 1.67 | Green & Cosslett (1968); literature values span ≈ 1.5–1.7 and 1.63 is also quoted. **Exact value to verify in the paper** | Needs scans at several U, and Fig. 4 is 35 kV only |
| `constants.KB_KA_RATIO` | 0.1935 | xraylib `RadRate` (Mo) | Freeing it gives ×1.16 and only 0.0005 dex better, so it is not needed |
| `constants.MO_KA_COMPONENTS`, `MO_KB_COMPONENTS` | Kα₁/Kα₂, Kβ₁,₃/Kβ₂ | xraylib line energies and `RadRate` | Atomic data |
| `ModelParams.tau_s` | 1.0e-4 s | Typical end-window GM tube. **Still to verify for the LD 559 01** | The log-RMS of the Fig. 4 fit is flat for τ from 0 to 100 µs, because the other parameters absorb it. The predicted peak heights do depend on τ: at 100 µs the 1st-order Kα tip loses ≈ 25 % |
| `crystal.structure_factor_sq_rel` | \|F_n\|²/\|F₁\|², n = 1…15 | xraylib `FF_Rayl`, F = 4(f_Na + f_Cl) | Atomic data |
| `scan.AIR_PATH_CM` | 18 cm | Geometry estimate: anode → crystal ≈ 12 cm, plus s₂ ≈ 6 cm | Degenerate with the absorber |

## Numerical and analysis choices (not fitted)

| Name | Value | Why |
|---|---|---|
| `filters.MU_RHO_GRID_PM` | 1000 log-spaced points, 30–600 pm, rounded to 1e-9 pm (the same nodes on every CPU) | μ/ρ is tabulated here and interpolated log–log, so the web app reads the same numbers (`artifacts/tables/mu_rho.json`). Away from edges it agrees with xraylib to within 3e-6, and 500 points would already give 1e-5. Beyond 30–600 pm the end values are held. An absorption edge is smeared over one grid step (0.3 % in λ): ≈ 0.05 keV at the Zr K edge (18.0 keV), ≈ 0.08 keV at In K (27.9 keV), ≈ 0.02° in θ (NaCl) at the Moseley edges (0.014–0.021°). Absorber μ/ρ tables: `artifacts/tables/mu_rho_absorbers.json`, same grid. The range covers λ_min at 35 kV and 1st order at θ = 85° |
| `analysis.PEAK_HALF_WINDOW_DEG` | 0.7° | Half-width of the region marked around each line, the leaflet's "entire width" of a peak, cut halfway to its neighbours. It is set by an a-priori criterion: reach Kβ₂, 0.37° below Kβ₁,₃ in 3rd order, plus ≈ 2.7σ. It does not change R̄. On the noise-free leaflet scan the model's own blend mean is 63.0945 pm (Kβ) and 71.0768 pm (Kα). At 0.7° the single orders give Kβ 63.075 / 63.094 / 63.103 pm for n = 1/2/3. The 1st order sits 0.02 pm low from a straight baseline under the curved continuum, the 3rd 0.007 pm high from the clipped Kβ₂ tail. They partly cancel in the mean (63.091 pm). Each ±0.1° of window moves λ̄(Kβ) by 0.008–0.016 pm (0.6° → 63.107, 0.8° → 63.083), below its 1σ counting error of 0.040 pm at the leaflet settings. Narrower windows miss Kβ₂ (0.4° → 63.18 pm), and from 1.0° on the 1st-order continuum biases Kβ low (63.06 pm). Chosen on 2026-09-24 in notebook 04; numbers from the 2026-09-25 refit |
| `analysis.MAX_LINE_FWHM_DEG`, `MIN_LINE_WIDTH_STEPS`, `MIN_PROMINENCE_SIGMA`, `MAX_STEP_DEG` | 0.8°, 1.2 steps, 5, 0.23° | A peak counts as a line if it is 1.2 Δβ steps to 0.8° wide and stands 5σ of Poisson noise above its surroundings. This excludes the 35 kV bremsstrahlung hump (≈ 1.2° wide) and lone noise spikes. A line with FWHM 0.28° needs ≥ 1.2 steps across it, so Δβ > 0.23° raises. Lowering the width limit cannot exclude the hump at 30 kV, which is 0.2–0.8° wide in noisy scans; `FIRST_LINE_DEG` handles that case |
| `analysis.FIRST_LINE_DEG` | 6.02° | 1st-order Kβ₂ (6.32°) minus 0.3° (≈ 2.5σ). No Mo K line reflects lower, so any peak below this is the bremsstrahlung hump |
| `analysis.MIN_PEAK_SEPARATION_DEG` | 0.5° | Of peaks closer than this, only the most prominent is kept. That is above the Kβ₁,₃–Kβ₂ spacing (0.37° in 3rd order, resolved at σ = 0.05°) and below the closest distinct pair (1st-order Kβ–Kα, 0.81°). The whole blend still falls inside its ±0.7° window, so the centroid is unchanged |
| `analysis.MAX_ORDER_SPREAD_PM`, `MAX_KB_KA_RATIO_DEV` | 3 pm, 3 % | Pairing checks: λ of one line across orders, and λ(Kβ)/λ(Kα) = 0.888 per order. A wrong pairing is off by ≥ 30 pm or ≥ 40 %. These limits also stay above the honest near-edge bias of 1st-order Kβ, so they reject mislabelling, not bias. The scan must also start ≥ `PEAK_HALF_WINDOW_DEG` below 1st-order Kβ and hold at least two orders |
| `analysis.THRESHOLD_HALF_WINDOW_DEG`; the teacher-key sweep | ±0.5°; 22–35 kV in 1 kV steps at 0.1 mA, Δt = 10 s | Line-threshold evaluation (`line_threshold_kv`, `model/scripts/teacher_key.py`). The window's lower end (6.7°) is ≈ 2.3σ above 1st-order Kβ₁,₃. That tail scales with the line, so it rescales the areas without moving U_K. The sweep starts at 22 kV, where the 1st-order Kα is visible, and runs at 0.1 mA to keep dead time small. Noise-free bias budget: straight baseline −0.18 kV, dead time +0.10 kV (0.1 mA) or +0.70 kV and m → 1.35 (1 mA). The fit recovers the model's own power law (m, `source.LINE_EXPONENT_M`), so it validates the method, not the near-threshold physics. Chosen 2026-09-25 |
| `analysis.EDGE_SPLIT_HALF_WINDOW_DEG`, `EDGE_FIT_HALF_WINDOW_DEG` | 0.3°, 0.5° | Absorption-edge search (`k_edge_deg`). Coarse step: mean T over 0.3° (3 points at Δβ = 0.1°) on each side of every split, ≈ 2.4σ of the instrument width: long enough to average noise, short enough that the two sides see one edge. Fine step: the convolved step-with-slope fit over ±0.5° (≈ 4σ). Window stability, noise-free, 2026-10-20: Ag moves 0.0004° and In 0.005° between ±0.3° and ±0.7°; Zr and Mo move 0.012° and 0.024° (their open spectrum is steep, see below) |
| `analysis.MAX_EDGE_STEP_DEG` | 0.15° | Coarsest Δβ `k_edge_deg` accepts. At 0.16° the 0.3° split window holds only one point per side (the coarse search needs two) and no edge is found; the ±0.5° fit window then also has fewer than 6 points. Checked noise-free 2026-10-20 with the limit lifted: 0.15° works, 0.16° fails |

## Absorber thicknesses (`filters.FOILS_MM`, `filters.WHEELS_MM`)

Areal density = 100 · thickness_mm · ρ (xraylib; polystyrene from the NIST compound). Added 2026-10-14.

| Item | Thickness (mm) | Source |
|---|---|---|
| Foil set 554 832 | Zr 0.05, Mo 0.1, Ag 0.05, In 0.3, Al 0.5, Fe 0.5, Cu 0.07 | LD catalog |
| 554 834 Al plate | open, Al 0.5, 1.0, 1.5, 2.0, 2.5, 3.0 (slots at 0°, 10° … 60°) | LD catalog |
| 554 834 material plate | Polystyrene, Al, Fe, Cu, Zr, Ag at 0.4 each, open at 60° | 0.4 mm by user decision (the catalog says 0.5 mm); open slot at 60° is an assumption (open question 10) |

Foil set 554 832 as used (thickness from the LD catalog × bulk density from xraylib `ElementDensity`; added 2026-10-20):

| Foil | Thickness (mm) | ρ (g/cm³) | ρx (mg/cm²) |
|---|---|---|---|
| Zr | 0.05 | 6.506 | 32.53 |
| Mo | 0.1 | 10.22 | 102.2 |
| Ag | 0.05 | 10.50 | 52.50 |
| In | 0.3 | 7.31 | 219.3 |
| Al | 0.5 | 2.699 | 134.9 |
| Fe | 0.5 | 7.874 | 393.7 |
| Cu | 0.07 | 8.96 | 62.72 |

Bulk density is an assumption: a rolled foil can be a few % lighter, and every ρx scales T as exp(−μ/ρ·ρx). The Moseley
practice (P5) reads only the edge *position*, which does not depend on ρx.

### Moseley analysis (EPN Práctica 5): known deviations

The K edge found by `analysis.k_edge_deg` (Gaussian-convolved step with its own plateau slope) differs from the
tabulated θ(λ_K) = asin(λ_K/2d). Noise-free at P5 settings (35 kV, 1 mA, Δβ = 0.1°, Δt = 5 s, ±0.5° window, measured
2026-10-20), edge minus θ(λ_K), with the 1σ counting error σ_θ of one P5 scan:

| Foil | Edge − θ(λ_K) | σ_θ | of which (a) resolution | (b) μ/ρ grid ramp | (c) dead time | (d) leak, scatter, background |
|---|---|---|---|---|---|---|
| Zr | −0.045° | 0.0055° | main part | +0.006° | ≤ 0.006° | < 0.0003° |
| Mo | −0.040° | 0.0103° | main part | +0.009° | ≤ 0.006° | < 0.0003° |
| Ag | −0.008° | 0.0106° | main part | −0.005° | ≤ 0.006° | < 0.0003° |
| In | −0.006° | 0.0121° | main part | −0.001° | ≤ 0.006° | < 0.0003° |

- **(a) Instrument resolution and the steep open spectrum.** The counter sees the reflected spectrum convolved with the
  instrument Gaussian (`sigma_deg` = 0.123°), so T = R_foil/R_open is a ratio of two convolved spectra, not a convolved T.
  The steep open spectrum next to the Mo lines pulls the steepest rise of T low (Zr beside Kα, Mo beside Kβ). A real
  goniometer has the same effect. It is not tuned away. Zr and Mo shift with the fit window (−0.043° to −0.056° and
  −0.035° to −0.059° from ±0.7° to ±0.3°); Ag and In hardly do (0.0004° and 0.005°).
- **(b) μ/ρ grid ramp.** The absorber's μ/ρ is log–log interpolated on `MU_RHO_GRID_PM`, which has no node at λ_K, so the
  edge is a short ramp rather than a step. It shifts the edge by +0.006 (Zr), +0.009 (Mo), −0.005 (Ag), −0.001° (In) from
  θ(λ_K). A later fix would add nodes at λ_K·(1 ± 1e-6); that changes `artifacts/` and the TS port, so it is out of scope now.
- **(c) Dead time.** The observed (dead-time-affected) rates are used, as the students take them. This adds at most
  0.006° to the offset; its sign varies by foil.
- **(d) Leak, scatter and background** are negligible (< 0.0003°).
- **Correlation.** The four foil scans share one open scan, so their edges are slightly correlated (up to ≈ 40 % of T's
  variance on the Zr plateau); `moseley_fit` treats them as independent.

Effect on the Moseley fit (√(1/λ_K) against Z), weighted by the counting errors as `moseley_fit` is used in the teacher key:

| Edges | R (m⁻¹) | σ_K | χ²/dof |
|---|---|---|---|
| Tabulated (xraylib) | 1.0836e7 (0.987 R∞) | 3.41 | |
| Model, noise-free (weighted) | 1.058e7 (0.964 R∞) | 2.84 | 0.2 |

So the bias is R −2.3 % and σ_K −0.57 against the tabulated edges. A single P5 measurement has a counting error of
±1.0 % on R and ±0.20 on σ_K, so the bias is ≈ 2.3σ and 2.9σ of one measurement: a systematic the quoted ± does not
include (the unweighted fit gives the same within 0.1 %). Neither is tuned away.

- **Foil K fluorescence is not modelled.** The foil re-emits ≈ 63 % of the photons absorbed above its edge as K X-rays
  (Zr: ω_K = 0.734 × (1 − 1/J) with jump factor J = 6.75). Only ≈ 1–2 % of the absorbed flux reaches the counter, after solid
  angle, self-absorption and detector efficiency, which is how the transmission just above the Zr edge goes from 0.046
  to ≈ 0.065. This is an estimate (Plan-New-Features physics review, 2026-10-14), not a model output. It changes the
  depth of the edge, not its position.

## Apparatus assumptions (web emulator)

Added 2026-10-14. No measurement behind any of them.

| Name | Value | Why |
|---|---|---|
| Direct-beam profile (`scan.direct_rate` `sensor_deg`) | Gaussian, width = `leak_width_deg` | Without a crystal the counter sees the beam's angular profile; its width is assumed equal to the fitted leak halo |
| `WHEEL_WINDOW_DEG` | 3° | A 554 834 slot is in the beam within ±3° of its centre; between slots the frame blocks it (background only). Binary window, to be confirmed by the lab staff |
| `Apparatus.saturated` threshold | Rτ = 0.3 | Dead-time losses exceed 23 % and the dead-time model choice starts to matter. The guide's own P1 run 2a polystyrene reading (30 kV, 0.02 mA, 0.4 mm; true ≈ 3160/s, Rτ ≈ 0.32, 24 % loss) trips the warning: kept as a teaching point, not hidden |

## Calibration-only (never used by the model)

| Name | Value | Where | Meaning |
|---|---|---|---|
| `FIG4_BETA_OFFSET_DEG` | 0.090 ± 0.004° | `tests/test_scan.py`, notebook 03 | The digitized Fig. 4 peaks sit a constant +0.09° above the Bragg angles. The leaflet's Table 3 lists the measured angles at the Bragg angles, so the shift comes from how the figure was drawn, or from the digitizer: both panels share the pixel zero `x0 = 97`, and 1.9 px would explain it. It is constant across all six peaks (0.07–0.11°, no trend), and the linear panel alone gives 0.094°. The fit compares the model at β − offset, and `expected_rate` does not include it |

## Known deviations

- **Line tips are 0.70–0.94 × Fig. 4.** The fit matches the log-panel wings. The tips come
  out 6–30 % low (Kβ in 2nd order is worst, 0.70; 1st- and 3rd-order Kα are best, 0.94). Freeing Kβ/Kα, giving the lines
  their own σ, a pseudo-Voigt profile, and τ ∈ 0–100 µs did not close the gap. We did not add a free peak-sharpness term. The relative
  heights across orders agree within 25 %.
- **Counter efficiency ε(λ) is constant.** The 559 01 fill gas is unknown, so a λ-dependent ε would be
  degenerate with the absorber.
- **One σ for every angle and slit.** σ(s₁, s₂) waits until a slit control exists.
- **Mosaic crystal: Q/2μ taken as constant within an order.** In reality, λ³/μ_NaCl(λ) rises
  ≈ 27 % from 40 to 200 pm. Adding it (xraylib, no free parameter) improves the fit by only 0.0003 dex
  and moves the absorber by ≈ 6 %. The fitted absorber absorbs it. Extinction is folded
  into B.
- **The ≈ 3° minimum is too shallow.** The model's floor is scatter plus background (5.54/s) plus the leak tail: at β = 2.7°
  it gives 7.9/s against 5.7/s in Fig. 4, and at 2.8° it gives 6.6/s where the figure dips below its axis
  (≲ 4.4/s, a point the digitizer omits). Before the refit it was 11/s and 8.7/s, mostly because scatter dropped from 6.8/s to 5.5/s. A steeper leak shape could fix this but is not justified by
  the data yet.
- **1st-order Kβ reads low near the K edge.** The Kβ line sits on the steep rise of the continuum hump, which a
  straight baseline cannot follow. λ̄(Kβ) is 63.09 pm at 35 kV, 63.05 pm at 30 kV and 62.9 pm at
  25 kV (mean of noisy scans), where 1st-order Kβ alone gives ≈ 62.5 pm. Kα and higher orders are unaffected. This is a limit of the
  evaluation, not of the model, and students at low U would see it too.
- **Analysis tested range** (noisy Monte Carlo, `wavelength_table`, 2°→25°, Δβ = 0.1°): 0 mislabelled tables at 25, 30 and 35 kV,
  Δt = 1–10 s, σ = 0.05–0.2°. Failures are clear ValueErrors: 0.2 % at the leaflet settings, 11 % at 25 kV, and 65 % at σ = 0.03°,
  where lines are narrower than 1.2 steps.
- **Counts after dead time are drawn as Poisson.** A dead-time-limited GM counter is slightly
  sub-Poissonian (variance ≈ N(1 − Rτ)², 0.58× at the 1st-order Kα tip). `detector.sample_counts` ignores this.
- **Leak and scatter are phenomenological.** They have no explicit dependence on the slits or the crystal,
  and their I·S(U) scaling is assumed. In uncoupled geometry the leak ignores the crystal shadowing the direct beam. With the tube off the model reads only the natural background, dead_time(`background_per_s`).
- **Rocking width = σ.** With target and sensor uncoupled, the Bragg signal falls off as a Gaussian of width σ in
  S/2 − β. The real rocking curve is the crystal's mosaic spread folded with the beam divergence, and only part of
  the coupled σ. The model lumps all of σ into it rather than adding a parameter no data constrain.
  In coupled scans it plays no role.
- **No Mo K absorption edge in the continuum.** Self-absorption in the anode would put a small step at 61.9 pm
  (λ_K). The effective glass absorber has no such edge.

## Validity range

What the model is trustworthy for, beyond the 35 kV, 1 mA, 2°–25° scan it was fitted to:

- **U ≳ 15 kV.** At lower voltages the whole spectrum lies where the effective absorber cuts it by orders of
  magnitude, and there its shape (glass, not the real wall and anode) is untested. At 10 kV R̄ is essentially zero.
- **|β| ≳ 1.5°.** Below that the rate is the leak's Gaussian extrapolation, ×380 beyond the data, and dead time
  (τ unverified) reduces it by up to ×4 (7280/s instead of 26 800/s at β = 1°).
- **Duane–Hunt tasks at 20–35 kV** work: the onset angle follows λ_min = hc/eU. At lower U the onset moves into
  the absorber-dominated region above.
- **Line threshold.** Lines switch on at U_K = 20.0 kV as (U/U_K − 1)^1.67, so they become visible only well
  above it. The answer key extrapolates line area against U to zero instead of reading the first visible
  peak (Bragg-Simulation-Plan.md, Phase 9).
- **Orders n ≥ 4 (β > 25°)** are extrapolation: r₄ = 0.089 and r₅ = 0.038 follow from the Debye–Waller factor
  fitted to orders 1–3, and no data beyond 25° test them.
- **`direct_rate` while Rτ ≲ 0.3** (true rate ≲ 3000/s). Above that a real GM counter paralyses and reads far less
  than the non-paralyzable R/(1 + Rτ): the open beam at 30 kV, 1 mA (1.6e5/s true) would read 9418/s here. Even polystyrene
  0.4 mm at 30 kV, 0.02 mA loses 24 % to dead time. `Apparatus.saturated` warns at such rates.
- **Still unverified:** `LINE_EXPONENT_M` (only 35 kV data) and τ of the 559 01 counter.
