"""Write the teacher answer key for the guided tasks and the LD P6.3.3.1 evaluation.

    python model/scripts/teacher_key.py

Writes docs/teacher-key.md from the reference model: a simulated leaflet scan evaluated like
Tables 3–5 (braggsim.analysis), the Mo K line threshold from a voltage sweep, and the expected
answers of the web app's guided tasks. The simulated counts use a fixed seed, so the output is
the same on every run. Generated file: do not edit it by hand.
"""

from pathlib import Path

import numpy as np
import xraylib

import braggsim
from braggsim.analysis import (
    MAX_EDGE_STEP_DEG,
    MAX_STEP_DEG,
    MIN_PROMINENCE_SIGMA,
    THRESHOLD_HALF_WINDOW_DEG,
    edge_wavelength_table,
    line_threshold_kv,
    moseley_fit,
    order_means_pm,
    peak_center,
    wavelength_table,
)
from braggsim.constants import HC_KEV_PM, MO_K_EDGE_KEV, MO_KA_PM, MO_KB_PM, R_INF_PER_M
from braggsim.crystal import theta_from_lambda
from braggsim.detector import sample_counts
from braggsim.filters import FOILS_MM, areal_density_mg_cm2
from braggsim.scan import DEFAULT, coupled_betas, expected_rate
from braggsim.source import LINE_EXPONENT_M, lambda_min_pm

OUT = Path(__file__).resolve().parents[2] / "docs" / "teacher-key.md"
SEED = 2026
DT_S = 10.0  # s, leaflet measuring time per step
SWEEP_U_KV = np.arange(22.0, 35.1, 1.0)
SWEEP_I_MA = 0.1  # mA; dead-time loss ≈ 2.6 % at the 35 kV peak tip (≈ 21 % at 1 mA)
LINE_NAMES = {"Ka": "Kα", "Kb": "Kβ"}
# EPN Práctica 5 (Moseley): NaCl, COUPLED 3.7° → 7.5°, Δβ = 0.1°, 35 kV, 1 mA, Δt = 5 s.
P5_BETA_RANGE_DEG = (3.7, 7.5)
P5_STEP_DEG = 0.1
P5_DT_S = 5.0
P5_Z = {"Zr": 40, "Mo": 42, "Ag": 47, "In": 49}
LD_EXAMPLE_R_PER_M = 1.056e7  # LD's published Moseley example
LD_EXAMPLE_SIGMA_K = 2.7


def _theta(lam_pm, n=1):
    return float(theta_from_lambda(lam_pm, n))


def _leaflet_section(rng):
    beta = coupled_betas(2.0, 25.0, 0.1)
    rate = sample_counts(expected_rate(beta, 35.0, 1.0), DT_S, rng) / DT_S
    rows = wavelength_table(beta, rate, DT_S)
    means = order_means_pm(rows)
    out = [
        "## Tables 3–5: λ from three orders (task `lambda-three-orders`)",
        "",
        "One simulated scan at the leaflet settings (35 kV, 1.00 mA, Δt = 10 s, Δβ = 0.1°, "
        "COUPLED 2° → 25°), evaluated as in the leaflet: whole-peak centroid, λ = 2d sin θ / n, "
        "mean over orders. Errors are counting statistics only (1σ). A student's own scan scatters "
        "by about these errors.",
        "",
        "| n | Line | θ (°) | λ (pm) |",
        "|---|---|---|---|",
    ]
    for r in rows:
        out.append(
            f"| {r['n']} | {LINE_NAMES[r['line']]} "
            f"| {r['theta_deg']:.3f} ± {r['theta_err_deg']:.3f} "
            f"| {r['lambda_pm']:.2f} ± {r['lambda_err_pm']:.2f} |"
        )
    out += ["", "| Line | Mean λ (pm) | Literature (pm) |", "|---|---|---|"]
    for line, lit in (("Ka", MO_KA_PM), ("Kb", MO_KB_PM)):
        lam, err = means[line]
        out.append(f"| {LINE_NAMES[line]} | {lam:.2f} ± {err:.2f} | {lit:.2f} |")
    out += [
        "",
        "Prediction question: *the same λ in all three orders*. The order changes the angle, not "
        "the wavelength; the spread of λ over the orders above is counting noise.",
        "",
        "The task is met by a finished, exported COUPLED scan at steady U and I that holds every "
        f"line of orders 1–3 with its marked window, uses Δβ ≤ {MAX_STEP_DEG}°, and whose weakest "
        f"line (3rd-order Kβ) is expected to stand {MIN_PROMINENCE_SIGMA}σ above its background. "
        "At 35 kV and 1 mA, Δt = 1 s falls just short; the leaflet's 10 s is comfortable.",
        "",
    ]
    return out


def _moseley_section(rng):
    beta = coupled_betas(*P5_BETA_RANGE_DEG, P5_STEP_DEG)

    def scan(filters=(), noisy=True):
        rate = expected_rate(beta, 35.0, 1.0, filters=filters)
        return sample_counts(rate, P5_DT_S, rng) / P5_DT_S if noisy else rate

    def fit(noisy):
        r_open = scan(noisy=noisy)
        foils = {el: scan(((el, areal_density_mg_cm2(el, FOILS_MM[el])),), noisy) for el in P5_Z}
        rows = edge_wavelength_table(beta, r_open, foils, P5_DT_S)
        lam = [r["lambda_pm"] for r in rows]
        return rows, moseley_fit(z, lam, [r["lambda_err_pm"] for r in rows])

    z = list(P5_Z.values())
    rows, (R, R_err, sigma, sigma_err, chi2) = fit(noisy=True)
    # The same evaluation on the noise-free scans isolates the resolution bias from the noise.
    _, (R_exact, _, sigma_exact, _, chi2_exact) = fit(noisy=False)
    lam_tab = [HC_KEV_PM / xraylib.EdgeEnergy(zz, xraylib.K_SHELL) for zz in z]
    R_tab, _, sigma_tab, _, _ = moseley_fit(z, lam_tab)
    th = {el: _theta(lam) for el, lam in zip(P5_Z, lam_tab, strict=True)}
    out = [
        "## Moseley's law (task `moseley-k-edges`)",
        "",
        f"One open scan and one scan per foil (Zr, Mo, Ag, In) at the EPN Práctica 5 settings: "
        f"COUPLED {beta[0]:.1f}° → {beta[-1]:.1f}°, Δβ = {P5_STEP_DEG:.1f}°, 35 kV, 1.00 mA, "
        f"Δt = {P5_DT_S:.0f} s, the foil at the sensor. Simulated counts, errors are counting "
        "statistics (1σ). The K edge is the steepest rise of T = R(foil)/R(open) in β "
        "(`braggsim.analysis.k_edge_deg`); θ → λ_K by Bragg's law, first order.",
        "",
        "| Foil | Z | θ edge (°) | λ_K (pm) | Tabulated λ_K (pm) | Tabulated θ (°) |",
        "|---|---|---|---|---|---|",
    ]
    for r, zz, lam, el in zip(rows, z, lam_tab, P5_Z, strict=True):
        out.append(
            f"| {el} | {zz} | {r['theta_deg']:.3f} ± {r['theta_err_deg']:.3f} "
            f"| {r['lambda_pm']:.2f} ± {r['lambda_err_pm']:.2f} | {lam:.2f} | {th[el]:.3f} |"
        )
    out += [
        "",
        "Fit of √(1/λ_K) = √R (Z − σ_K):",
        "",
        "| Source | R (10⁷ m⁻¹) | σ_K | χ²/dof |",
        "|---|---|---|---|",
        f"| This simulated measurement | {R / 1e7:.3f} ± {R_err / 1e7:.3f} "
        f"| {sigma:.2f} ± {sigma_err:.2f} | {chi2:.1f} |",
        f"| The same evaluation, noise-free | {R_exact / 1e7:.3f} | {sigma_exact:.2f} "
        f"| {chi2_exact:.1f} |",
        f"| Tabulated (xraylib) edges | {R_tab / 1e7:.3f} | {sigma_tab:.2f} | |",
        f"| LD's published example | {LD_EXAMPLE_R_PER_M / 1e7:.3f} | {LD_EXAMPLE_SIGMA_K:.1f} | |",
        f"| Rydberg constant R∞ (CODATA 2022) | {R_INF_PER_M / 1e7:.3f} | | |",
        "",
        "Prediction question: *where does the Ag edge fall compared with Zr?* At a smaller "
        f"angle ({th['Ag']:.2f}° against {th['Zr']:.2f}°): Ag has the higher Z, so the higher "
        "K binding energy and the shorter λ_K, and a shorter wavelength reflects at a smaller "
        "angle.",
        "",
        f"This simulated measurement lands {100 * (1 - R / R_INF_PER_M):.1f} % below R∞. Two "
        "causes add up, and the rows above separate them.",
        "",
        f"- **Physics, {100 * (1 - R_tab / R_INF_PER_M):.1f} % (tabulated row).** The straight "
        "line absorbs two Z-dependent effects of opposite sign. Relativistic binding alone would "
        "raise R (a Dirac 1s fit with constant σ gives ≈ 1.07 R∞), and outer-electron screening "
        "that grows with Z outweighs it.",
        f"- **Instrument, {100 * (1 - R_exact / R_tab):.1f} % (noise-free row against tabulated "
        "row).** Each edge lands 0.005–0.05° below its tabulated angle, because the counter's "
        "angular resolution blurs the two spectra before they are divided. The steep open "
        "spectrum beside the Mo lines pulls Zr and Mo the most, so the shift is uneven and tilts "
        "the line (`model/PARAMETERS.md`). A real goniometer does the same.",
        "",
        "The quoted ± is the counting error only: a measurement scatters by it around the "
        f"noise-free row, not around the tabulated one. χ²/dof = {chi2:.1f} (noise-free "
        f"{chi2_exact:.1f}) with 2 degrees of freedom is consistent with a straight line.",
        "",
        f"The task is met by the scans, not by the student's R: a COUPLED window that covers "
        f"{P5_BETA_RANGE_DEG[0]}° → {P5_BETA_RANGE_DEG[1]}° with Δβ ≤ {MAX_EDGE_STEP_DEG}°, "
        "and all four foils plus an open scan. A student's R scatters by about the error above "
        "and sits below R∞.",
        "",
    ]
    return out


def _sweep(I_mA, rng=None):
    """1st-order Kα window and peak areas over SWEEP_U_KV, noise-free or sampled with ``rng``."""
    theta = _theta(MO_KA_PM)
    w = THRESHOLD_HALF_WINDOW_DEG
    beta = coupled_betas(round(theta - w, 1), round(theta + w, 1), 0.1)
    peaks = []
    for U in SWEEP_U_KV:
        rate = expected_rate(beta, U, I_mA)
        if rng is not None:
            rate = sample_counts(rate, DT_S, rng) / DT_S
        peaks.append(peak_center(beta, rate, DT_S, beta[0], beta[-1]))
    return beta, [p.area for p in peaks], [p.area_err for p in peaks]


def _threshold_section(rng):
    beta, area, err = _sweep(SWEEP_I_MA, rng)
    U_K, U_K_err, m, m_err = line_threshold_kv(SWEEP_U_KV, area, err)
    # Dead-time bias: noise-free fits at the sweep current and at 1 mA.
    U_low, _, _, _ = line_threshold_kv(SWEEP_U_KV, *_sweep(SWEEP_I_MA)[1:])
    U_high, _, m_high, _ = line_threshold_kv(SWEEP_U_KV, *_sweep(1.0)[1:])
    out = [
        "## Line threshold (task `line-threshold`)",
        "",
        f"Expected answer: the Mo K lines exist only above U_K = {MO_K_EDGE_KEV:.1f} kV, where eU "
        f"equals the Mo K binding energy ({MO_K_EDGE_KEV:.1f} keV). Kβ vanishes there too, not at "
        f"its own photon energy ({HC_KEV_PM / MO_KB_PM:.2f} keV). The common wrong answer is "
        f"{HC_KEV_PM / MO_KA_PM:.2f} kV, "
        "where λ_min = λ(Kα). Between the two, the continuum still reaches the Kα angle (e.g. "
        f"λ_min = {float(lambda_min_pm(19.0)):.1f} pm at 19.0 kV) but no Kα line is emitted.",
        "",
        'How to measure it: do not take "the first U where a peak is visible". The line area '
        f"grows as (U/U_K − 1)^m (model exponent m = {LINE_EXPONENT_M}), so a peak only stands "
        "out well above U_K. Measure the 1st-order Kα peak area at several U and extrapolate to "
        "zero. Keep the emission current low: at 1 mA the counter's dead time flattens the top "
        f"of the sweep, pushes the extrapolated U_K up by {U_high - U_low:.1f} kV and the "
        f"exponent m down to {m_high:.2f} (noise-free fits).",
        "",
        f"Simulated sweep: COUPLED {beta[0]:.1f}° → {beta[-1]:.1f}°, I = {SWEEP_I_MA:.2f} mA, "
        f"Δt = {DT_S:.0f} s; area above a straight baseline through the window ends.",
        "",
        "| U (kV) | Kα area (1/s · °) |",
        "|---|---|",
    ]
    out += [
        f"| {U:.1f} | {a:.2f} ± {e:.2f} |" for U, a, e in zip(SWEEP_U_KV, area, err, strict=True)
    ]
    out += [
        "",
        f"Fit area = A (U/U_K − 1)^m: **U_K = {U_K:.2f} ± {U_K_err:.2f} kV**, "
        f"m = {m:.2f} ± {m_err:.2f}. U_K and m are strongly correlated; fixing m at "
        f"{LINE_EXPONENT_M} would understate the error on U_K.",
        "",
        "Caveat: the simulation's lines grow exactly as this power law, so the fit checks the "
        "method, not the physics right above U_K. A real tube's yield near threshold need not "
        "follow a pure power law, so a real sweep can land a little off 20.0 kV.",
        "",
    ]
    return out


def main():
    rng = np.random.default_rng(SEED)
    ka3 = _theta(MO_KA_PM, 3)
    lines = [
        "# Teacher answer key",
        "",
        "<!-- Generated by model/scripts/teacher_key.py; do not edit by hand. -->",
        "",
        f"Reference model braggsim {braggsim.__version__}, simulated counts (seed {SEED}). "
        "Experiment: LD Physics Leaflet P6.3.3.1, X-ray apparatus 554 800; "
        "d = 282.01 pm (NaCl).",
        "",
        "## Third-order Kα (task `kalpha-third-order`)",
        "",
        f"θ = arcsin(3 λ(Kα) / 2d) = **{ka3:.2f}°** (leaflet Table 2: 22.21°). The task is met "
        f"on the nearest 0.1° step, {round(ka3, 1):.1f}°. The common wrong answer is "
        f"3 × {_theta(MO_KA_PM):.2f}° = {3 * _theta(MO_KA_PM):.2f}°, "
        f"{(ka3 - 3 * _theta(MO_KA_PM)) / DEFAULT.sigma_deg:.0f}σ short of the line "
        f"(σ = {DEFAULT.sigma_deg:.2f}°): there only continuum arrives. Third order, not second: "
        f"in second order the wrong answer ({2 * _theta(MO_KA_PM):.2f}°) is within σ of the line "
        f"({_theta(MO_KA_PM, 2):.2f}°) and would still see the peak.",
        "",
    ]
    lines += _threshold_section(rng)
    lines += _leaflet_section(rng)
    lines += _moseley_section(rng)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
