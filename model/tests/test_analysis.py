import numpy as np
import pytest
import xraylib
from pytest import approx

import braggsim.analysis as analysis
from braggsim.analysis import (
    MAX_EDGE_STEP_DEG,
    THRESHOLD_HALF_WINDOW_DEG,
    attenuation_fit,
    edge_wavelength_table,
    find_line_peaks,
    k_edge_deg,
    line_threshold_kv,
    moseley_fit,
    order_means_pm,
    peak_center,
    scaled_transmission,
    wavelength_table,
)
from braggsim.constants import HC_KEV_PM, MO_K_EDGE_KEV, MO_KA_PM, MO_KB_PM, R_INF_PER_M
from braggsim.crystal import theta_from_lambda
from braggsim.detector import dead_time, sample_counts
from braggsim.filters import FOILS_MM, WHEELS_MM, areal_density_mg_cm2
from braggsim.scan import DEFAULT, coupled_betas, direct_rate, expected_rate
from braggsim.source import LINE_EXPONENT_M

# Leaflet settings: 2° → 25°, Δβ = 0.1°, Δt = 10 s, 35 kV, 1 mA (LD P6.3.3.1).
BETA = coupled_betas(2.0, 25.0, 0.1)
DT_S = 10.0
R_BAR = expected_rate(BETA, 35.0, 1.0)


def _noisy(seed):
    return sample_counts(R_BAR, DT_S, np.random.default_rng(seed)) / DT_S


def test_finds_the_six_line_peaks_but_not_the_bremsstrahlung_hump():
    peaks = find_line_peaks(BETA, _noisy(0), DT_S)
    expected = [theta_from_lambda(lam, n) for n in (1, 2, 3) for lam in (MO_KB_PM, MO_KA_PM)]
    assert peaks == approx(expected, abs=0.1)  # one Δβ step


def test_noise_free_peak_centres_sit_at_leaflet_table_2_angles():
    rows = wavelength_table(BETA, R_BAR, DT_S)
    for row in rows:
        lam = MO_KA_PM if row["line"] == "Ka" else MO_KB_PM
        assert row["theta_deg"] == approx(theta_from_lambda(lam, row["n"]), abs=0.01)


def test_noise_free_order_means_recover_the_literature_wavelengths():
    # The centroid of the whole blend (Kα1+Kα2, Kβ1,3+Kβ2) is the intensity-weighted mean
    # wavelength the leaflet quotes (Table 5 literature: 71.08, 63.09 pm). Single orders are off
    # by up to 0.023 pm (straight baseline under the curved continuum, clipped Kβ2 tail) and
    # partly cancel in the mean; 0.01 pm is the leaflet's rounding (PARAMETERS.md).
    means = order_means_pm(wavelength_table(BETA, R_BAR, DT_S))
    assert means["Ka"][0] == approx(MO_KA_PM, abs=0.01)
    assert means["Kb"][0] == approx(MO_KB_PM, abs=0.01)


def test_noisy_leaflet_scan_reproduces_tables_3_to_5():
    # Leaflet Table 5 measured means: λ(Kα) = 71.07 pm, λ(Kβ) = 63.08 pm. A simulated scan must
    # land within 3σ of its own propagated uncertainty (≈ 0.02 pm Kα, ≈ 0.04 pm Kβ).
    means = order_means_pm(wavelength_table(BETA, _noisy(2026), DT_S))
    for line, leaflet_pm in (("Ka", 71.07), ("Kb", 63.08)):
        mean, err = means[line]
        assert abs(mean - leaflet_pm) < 3 * err + 0.01  # + leaflet's 0.01 pm rounding


def test_centre_uncertainties_are_honest():
    # Over many noisy scans, (centre − noise-free centre) / σ must have unit spread.
    truth = np.array([r["theta_deg"] for r in wavelength_table(BETA, R_BAR, DT_S)])
    pulls = []
    for seed in range(50):
        rows = wavelength_table(BETA, _noisy(seed), DT_S)
        pulls += [
            (r["theta_deg"] - t) / r["theta_err_deg"] for r, t in zip(rows, truth, strict=True)
        ]
    assert np.std(pulls) == approx(1.0, abs=0.15)  # 300 pulls: 1σ of the std is 0.04
    assert np.mean(pulls) == approx(0.0, abs=0.2)


def test_no_characteristic_lines_below_the_mo_k_edge():
    rate = expected_rate(BETA, 19.0, 1.0)
    assert find_line_peaks(BETA, rate, DT_S).size == 0
    with pytest.raises(ValueError):
        wavelength_table(BETA, rate, DT_S)


def test_peak_center_of_a_gaussian_on_a_sloped_background():
    beta = np.arange(9.0, 11.0001, 0.05)
    rate = 1000 * np.exp(-0.5 * ((beta - 10.03) / 0.12) ** 2) + 50 + 20 * (beta - 9.0)
    peak = peak_center(beta, rate, 1e6, 9.0, 11.0)
    assert peak.center_deg == approx(10.03, abs=1e-3)
    assert peak.width_deg == approx(0.12, rel=0.02)


def test_peak_center_rejects_a_window_without_a_peak():
    beta = np.arange(9.0, 11.0001, 0.1)
    with pytest.raises(ValueError):
        peak_center(beta, 100 + 5 * (beta - 10) ** 2, 10.0, 9.0, 11.0)  # a dip


def test_a_scan_that_misses_the_first_order_is_rejected_not_mislabelled():
    # 7° → 21° misses 1st-order Kβ (6.4°) and 3rd-order Kα (22.2°): four peaks that pair up
    # into nonsense wavelengths. The per-line spread of λ over the orders exposes it.
    beta = coupled_betas(7.0, 21.0, 0.1)
    with pytest.raises(ValueError):
        wavelength_table(beta, expected_rate(beta, 35.0, 1.0), DT_S)


def test_lone_noise_spikes_are_not_lines():
    # A single-step spike (one Δβ wide) is noise, however high: lines span several steps.
    rate = R_BAR.copy()
    rate[BETA.tolist().index(16.1)] += 300.0
    assert find_line_peaks(BETA, rate, DT_S).size == 6


def test_too_short_scan_or_window_is_rejected():
    with pytest.raises(ValueError):
        find_line_peaks(np.array([7.2]), np.array([100.0]), DT_S)
    with pytest.raises(ValueError):
        peak_center(BETA, R_BAR, DT_S, 7.2, 7.2)


@pytest.mark.parametrize(
    "beta, rate",
    [
        (BETA, np.where(BETA == 10.0, np.nan, R_BAR)),  # a NaN reading
        (BETA[::-1], R_BAR[::-1]),  # descending β
        (np.r_[BETA[:50], BETA[51:]], np.r_[R_BAR[:50], R_BAR[51:]]),  # one step missing
        (BETA, R_BAR[:-1]),  # lengths differ
    ],
)
def test_malformed_scans_are_rejected(beta, rate):
    with pytest.raises(ValueError):
        find_line_peaks(beta, rate, DT_S)


def test_a_step_too_coarse_for_the_lines_is_rejected():
    beta = coupled_betas(2.0, 25.0, 0.3)
    with pytest.raises(ValueError, match="too coarse"):
        find_line_peaks(beta, expected_rate(beta, 35.0, 1.0), DT_S)


@pytest.mark.parametrize("seed", range(5))
def test_the_narrow_bremsstrahlung_hump_at_30kV_is_not_a_line(seed):
    # At 30 kV the hump sits near 5.4° and is only ≈ 0.5° wide, narrow enough to pass the width
    # test; no Mo K line reflects below 6.3°, so it is dropped and the six lines remain.
    rate = sample_counts(expected_rate(BETA, 30.0, 1.0), DT_S, np.random.default_rng(seed)) / DT_S
    assert find_line_peaks(BETA, rate, DT_S).size == 6
    means = order_means_pm(wavelength_table(BETA, rate, DT_S))
    assert means["Ka"][0] == approx(MO_KA_PM, abs=0.1)


def test_resolved_kb2_at_sharp_resolution_is_merged_into_its_line():
    # σ = 0.05°: Kβ₂ separates from Kβ₁,₃ in 3rd order (0.37° apart) but is still Kβ.
    rate = expected_rate(BETA, 35.0, 1.0, DEFAULT.replace(sigma_deg=0.05))
    assert find_line_peaks(BETA, rate, DT_S).size == 6
    means = order_means_pm(wavelength_table(BETA, rate, DT_S))
    assert means["Kb"][0] == approx(MO_KB_PM, abs=0.03)


def test_a_single_order_is_rejected():
    # 2° → 10° holds only the 1st-order pair: nothing confirms which order it is.
    beta = coupled_betas(2.0, 10.0, 0.1)
    with pytest.raises(ValueError, match="two orders"):
        wavelength_table(beta, expected_rate(beta, 35.0, 1.0), DT_S)


def test_a_scan_starting_inside_the_first_kb_line_is_rejected():
    beta = coupled_betas(6.0, 25.0, 0.1)
    with pytest.raises(ValueError, match="start it below"):
        wavelength_table(beta, expected_rate(beta, 35.0, 1.0), DT_S)


def _kalpha1_areas(I_mA, U_kV, rng=None, dt_s=DT_S):
    """Areas of the 1st-order Kα peak at each U, noise-free or sampled with ``rng``."""
    theta = float(theta_from_lambda(MO_KA_PM))
    w = THRESHOLD_HALF_WINDOW_DEG
    beta = coupled_betas(round(theta - w, 1), round(theta + w, 1), 0.1)
    peaks = []
    for U in U_kV:
        rate = expected_rate(beta, U, I_mA)
        if rng is not None:
            rate = sample_counts(rate, dt_s, rng) / dt_s
        peaks.append(peak_center(beta, rate, dt_s, beta[0], beta[-1]))
    return [p.area for p in peaks], [p.area_err for p in peaks]


U_SWEEP_KV = np.arange(22.0, 35.1, 1.0)


def test_line_area_extrapolates_to_the_mo_k_edge_at_low_current():
    # Noise-free at 0.1 mA the fit gives 19.92 kV, m = 1.63: the straight baseline under the curved
    # continuum (−0.18 kV) and a little dead time (+0.10 kV). 0.15 kV is a third of the ±0.4 kV
    # counting error of a real sweep (Δt = 10 s).
    area, err = _kalpha1_areas(0.1, U_SWEEP_KV)
    U_K, _, m, _ = line_threshold_kv(U_SWEEP_KV, area, err)
    assert U_K == approx(MO_K_EDGE_KEV, abs=0.15)
    assert m == approx(LINE_EXPONENT_M, abs=0.1)


def test_dead_time_at_full_current_pushes_the_extrapolated_threshold_up():
    # At 1 mA the 1st-order Kα peak reaches ≈ 2600/s, and τ = 100 µs flattens the top of the
    # sweep: U_K 20.52 kV (0.6 kV above the 0.1 mA fit), m 1.35.
    area, err = _kalpha1_areas(1.0, U_SWEEP_KV)
    U_K, _, m, _ = line_threshold_kv(U_SWEEP_KV, area, err)
    assert U_K > line_threshold_kv(U_SWEEP_KV, *_kalpha1_areas(0.1, U_SWEEP_KV))[0] + 0.4
    assert m < LINE_EXPONENT_M - 0.2


def test_threshold_uncertainty_is_honest():
    # 20 noisy sweeps (Δt = 10 s, 0.1 mA): the reported 1σ matches the scatter of U_K within 40 %.
    fits = np.array(
        [
            line_threshold_kv(
                U_SWEEP_KV, *_kalpha1_areas(0.1, U_SWEEP_KV, np.random.default_rng(s))
            )
            for s in range(20)
        ]
    )
    assert fits[:, 0].mean() == approx(MO_K_EDGE_KEV, abs=3 * fits[:, 1].mean() / np.sqrt(20))
    assert fits[:, 0].std() == approx(fits[:, 1].mean(), rel=0.4)


def test_peak_area_matches_a_known_gaussian():
    beta = coupled_betas(5.0, 9.0, 0.1)
    rate = 100 + 400 * np.exp(-0.5 * ((beta - 7.0) / 0.12) ** 2)
    assert peak_center(beta, rate, DT_S, 6.0, 8.0).area == approx(
        400 * 0.12 * np.sqrt(2 * np.pi), rel=1e-3
    )


# EPN Práctica 5 (Moseley): NaCl, COUPLED 3.7° → 7.5°, Δβ = 0.1°, 35 kV, 1 mA, Δt = 5 s.
P5_BETA = coupled_betas(3.7, 7.5, 0.1)
P5_DT_S = 5.0
P5_Z = {"Zr": 40, "Mo": 42, "Ag": 47, "In": 49}
P5_OPEN = expected_rate(P5_BETA, 35.0, 1.0)


def _foil_rate(el):
    return expected_rate(
        P5_BETA, 35.0, 1.0, filters=((el, areal_density_mg_cm2(el, FOILS_MM[el])),)
    )


def _lambda_k_pm(el):
    return HC_KEV_PM / xraylib.EdgeEnergy(P5_Z[el], xraylib.K_SHELL)


def _noise_free_edges():
    return {el: k_edge_deg(P5_BETA, P5_OPEN, _foil_rate(el), P5_DT_S)[0] for el in P5_Z}


def test_noise_free_k_edges_sit_slightly_below_the_tabulated_edge_angle():
    # The convolved spectra make T = R_foil/R_open rise below θ(λ_K) (PARAMETERS.md, Moseley
    # analysis). Measured offsets (θ(λ_K) − edge, 2026-10-20): Zr 0.0445°, Mo 0.0397°, Ag 0.0079°,
    # In 0.0059°, all positive and with the same sign for every fit window from ±0.3° to ±0.7°.
    # 0.06° is the largest (Zr) plus a 35 % margin; the sign is asserted because it is robust.
    for el, edge in _noise_free_edges().items():
        offset = float(theta_from_lambda(_lambda_k_pm(el))) - edge
        assert 0 < offset <= 0.06, el


@pytest.mark.parametrize("el", ["Ag", "In"])
def test_k_edge_of_a_clean_step_is_stable_against_the_fit_window(monkeypatch, el):
    # Ag and In sit away from the Mo lines, so the open spectrum is smooth and the fitted edge
    # should not depend on the window. Measured 2026-10-20: Ag moves by 0.0004° and In by 0.005°
    # between ±0.3° and ±0.7°; 0.008° is the larger plus a margin (the In σ is 0.012°).
    edges = []
    for hw in (0.3, 0.7):
        monkeypatch.setattr(analysis, "EDGE_FIT_HALF_WINDOW_DEG", hw)
        edges.append(k_edge_deg(P5_BETA, P5_OPEN, _foil_rate(el), P5_DT_S)[0])
    assert edges[0] == approx(edges[1], abs=0.008)


def test_k_edge_step_limit():
    # Δβ = 0.15° is the coarsest step with two points per side of the split and ≥ 6 in the fit;
    # at 0.16° the coarse search finds no edge at all (MAX_EDGE_STEP_DEG).
    assert MAX_EDGE_STEP_DEG == 0.15
    for step, ok in ((0.15, True), (0.2, False)):
        beta = coupled_betas(3.7, 7.5, step)
        r_open = expected_rate(beta, 35.0, 1.0)
        zr = (("Zr", areal_density_mg_cm2("Zr", FOILS_MM["Zr"])),)
        r_foil = expected_rate(beta, 35.0, 1.0, filters=zr)
        if ok:
            edge, _ = k_edge_deg(beta, r_open, r_foil, P5_DT_S)
            assert edge == approx(7.0, abs=0.1)
        else:
            with pytest.raises(ValueError, match="too coarse"):
                k_edge_deg(beta, r_open, r_foil, P5_DT_S)


def test_resolution_bias_of_model_edges_moves_the_moseley_fit_little():
    # The edges land 0.006° (In) to 0.045° (Zr) low (PARAMETERS.md, Moseley analysis). Weighted by
    # the counting errors (as students and the teacher key fit), measured 2026-10-20: R is 2.3 %
    # low (1.058e7 against 1.084e7) and σ_K 0.57 low (2.84 against 3.41); the counting error of a
    # single P5 measurement is ±1.0 % on R and ±0.20 on σ_K, so the bias is ≈ 2.3σ and 2.9σ of
    # one measurement: a systematic the quoted ± does not cover. rel = 0.03 and abs = 0.7 are
    # bias bounds (measured plus a margin), not noise bounds. The unweighted fit gives the same
    # within 0.1 %.
    z = list(P5_Z.values())
    R_tab, _, s_tab, _, _ = moseley_fit(z, [_lambda_k_pm(el) for el in P5_Z])
    rows = edge_wavelength_table(P5_BETA, P5_OPEN, {el: _foil_rate(el) for el in P5_Z}, P5_DT_S)
    lam = [r["lambda_pm"] for r in rows]
    R_w, _, s_w, _, chi2 = moseley_fit(z, lam, [r["lambda_err_pm"] for r in rows])
    R_u, _, s_u, _, chi2_u = moseley_fit(z, lam)
    for R, s in ((R_w, s_w), (R_u, s_u)):
        assert R == approx(R_tab, rel=0.03)
        assert s == approx(s_tab, abs=0.7)
    assert np.isfinite(chi2) and chi2 < 1  # noise-free edges lie on a line within the errors
    assert np.isnan(chi2_u)


def test_moseley_fit_of_tabulated_k_edges_falls_a_few_percent_below_rydberg():
    # Real K edges do not follow 1/λ = R (Z − σ)² exactly (Z = 40–49 is far from hydrogen-like);
    # the fit gives R ≈ 1.084e7 m⁻¹ (0.987 R∞) and σ_K ≈ 3.4, LD's example 1.056e7 and 2.7.
    R, _, sigma, _, _ = moseley_fit(list(P5_Z.values()), [_lambda_k_pm(el) for el in P5_Z])
    assert 0.97 < R / R_INF_PER_M < 0.995
    assert 3.0 < sigma < 4.0


def test_k_edge_uncertainties_are_honest():
    # This checks precision (scatter around the noise-free edge), not accuracy: the resolution
    # offset of the noise-free edge from θ(λ_K) is tested above.
    # 30 noisy scan pairs per foil: (edge − noise-free edge)/σ must have unit spread and no bias.
    # 120 pulls: 1σ of the std is 0.065, of the mean 0.09. A 200-seed run (2026-10-20) gave pull
    # std 0.94 and per-foil mean edges within 0.2σ of the noise-free ones.
    truth = _noise_free_edges()
    pulls = []
    for el in P5_Z:
        rf = _foil_rate(el)
        for seed in range(30):
            rng = np.random.default_rng([seed, P5_Z[el]])
            r_open = sample_counts(P5_OPEN, P5_DT_S, rng) / P5_DT_S
            r_foil = sample_counts(rf, P5_DT_S, rng) / P5_DT_S
            edge, err = k_edge_deg(P5_BETA, r_open, r_foil, P5_DT_S)
            pulls.append((edge - truth[el]) / err)
    assert np.std(pulls) == approx(1.0, abs=0.25)
    assert np.mean(pulls) == approx(0.0, abs=0.3)  # > 3σ of the mean


def test_k_edge_rejects_a_scan_without_a_foil_or_with_bad_input():
    rng = np.random.default_rng(1)
    r_open = sample_counts(P5_OPEN, P5_DT_S, rng) / P5_DT_S
    r_same = sample_counts(P5_OPEN, P5_DT_S, rng) / P5_DT_S  # T flat ≈ 1: no edge
    with pytest.raises(ValueError):
        k_edge_deg(P5_BETA, r_open, r_same, P5_DT_S)
    with pytest.raises(ValueError):
        k_edge_deg(P5_BETA, P5_OPEN, _foil_rate("Zr")[:-1], P5_DT_S)
    zero = P5_OPEN.copy()
    zero[3] = 0.0
    with pytest.raises(ValueError):
        k_edge_deg(P5_BETA, zero, _foil_rate("Zr"), P5_DT_S)
    with pytest.raises(ValueError):
        k_edge_deg(P5_BETA, P5_OPEN, _foil_rate("Zr"), 0.0)


def _synthetic_edges(R=1.0836e7, sigma=3.41):
    z = np.array([40.0, 42.0, 47.0, 49.0])
    return z, 1e12 / (R * (z - sigma) ** 2), R, sigma


def test_moseley_fit_recovers_r_and_screening_from_exact_edges():
    z, lam_pm, R, sigma = _synthetic_edges()
    got = moseley_fit(z, lam_pm)
    assert got[0] == approx(R, rel=1e-9)
    assert got[2] == approx(sigma, rel=1e-9)
    got_w = moseley_fit(z, lam_pm, 0.05 * np.ones(4))
    assert got_w[0] == approx(R, rel=1e-9)
    assert got_w[2] == approx(sigma, rel=1e-9)
    assert got_w[4] == approx(0.0, abs=1e-9)  # exact edges lie on the line


def test_moseley_fit_errors_scale_with_the_input_errors():
    z, lam_pm, _, _ = _synthetic_edges()
    a = moseley_fit(z, lam_pm, 0.05 * np.ones(4))
    b = moseley_fit(z, lam_pm, 0.10 * np.ones(4))
    assert b[1] == approx(2 * a[1], rel=1e-9)
    assert b[3] == approx(2 * a[3], rel=1e-9)


def test_moseley_fit_rejects_too_few_or_nonphysical_points():
    z, lam_pm, _, _ = _synthetic_edges()
    with pytest.raises(ValueError):
        moseley_fit(z[:2], lam_pm[:2])
    with pytest.raises(ValueError):
        moseley_fit(z, -lam_pm)


# EPN Práctica 1: Al wheel, 0.5 … 3.0 mm.
D_MM = np.arange(0.5, 3.01, 0.5)
MU_TRUE = 0.35  # 1/mm, a monochromatic beam in some absorber


def _mono_rates(r0=900.0, b=0.2):
    return r0 * np.exp(-MU_TRUE * D_MM) + b


def test_attenuation_fit_recovers_noise_free_monochromatic_mu():
    fit = attenuation_fit(D_MM, _mono_rates(), 900.2, 100.0, background_per_s=0.2)
    assert fit.mu_per_mm == approx(MU_TRUE, rel=1e-9)
    assert fit.chi2_dof == approx(0, abs=1e-12)
    assert fit.mu_eff_per_mm == approx(MU_TRUE, rel=1e-9)
    assert fit.T == approx(np.exp(-MU_TRUE * D_MM), rel=1e-9)


def test_attenuation_fit_is_linear_in_intensity():
    # Scaling the tube current by 3.7 scales every net rate: T, and so μ, must not move.
    b = 0.2
    one = attenuation_fit(D_MM, _mono_rates(), 900.2, 50.0, background_per_s=b)
    scaled = (_mono_rates() - b) * 3.7 + b
    two = attenuation_fit(D_MM, scaled, 900.0 * 3.7 + b, 50.0, background_per_s=b)
    assert two.mu_per_mm == approx(one.mu_per_mm, rel=1e-12)


def test_attenuation_fit_pull_is_standard_normal_with_noise():
    rng = np.random.default_rng(7)
    dt, b, r0, db = 30.0, 0.2, 900.0, 100.0
    pulls = []
    for _ in range(200):
        r = sample_counts(_mono_rates(r0, b), dt, rng) / dt
        r_open = sample_counts(r0 + b, 200.0, rng) / 200.0
        r_bg = sample_counts(b, db, rng) / db
        fit = attenuation_fit(D_MM, r, r_open, dt, 200.0, r_bg, db)
        pulls.append((fit.mu_per_mm - MU_TRUE) / fit.mu_err_per_mm)
    assert abs(np.mean(pulls)) < 0.2
    assert 0.8 < np.std(pulls) < 1.2


def test_attenuation_fit_rejects_a_point_at_or_below_the_background():
    r = _mono_rates()
    r[-1] = 0.2
    with pytest.raises(ValueError, match="background"):
        attenuation_fit(D_MM, r, 900.2, 100.0, background_per_s=0.2)
    with pytest.raises(ValueError, match="background"):
        attenuation_fit(D_MM, _mono_rates(), 0.1, 100.0, background_per_s=0.2)


def test_attenuation_fit_rejects_bad_input():
    r = _mono_rates()
    with pytest.raises(ValueError):
        attenuation_fit(D_MM, r, 900.0, 100.0, background_per_s=-0.1)
    with pytest.raises(ValueError):
        attenuation_fit(D_MM, r[:-1], 900.0, 100.0)
    with pytest.raises(ValueError):
        attenuation_fit(D_MM[:1], r[:1], 900.0, 100.0)
    with pytest.raises(ValueError):
        attenuation_fit(np.r_[0.0, D_MM[1:]], r, 900.0, 100.0)
    with pytest.raises(ValueError):
        attenuation_fit(D_MM, np.r_[np.nan, r[1:]], 900.0, 100.0)


def _al_wheel_mu_eff(U_kV, I_mA, filters=(), params=None):
    """μ_eff/ρ in cm²/g at each Al wheel thickness, from true (dead-time-free) rates."""
    params = params or DEFAULT.replace(tau_s=0.0, background_per_s=0.0)
    d = [mm for _, mm in WHEELS_MM["al"][1:]]
    r = [
        direct_rate(U_kV, I_mA, (*filters, ("Al", areal_density_mg_cm2("Al", mm))), params)
        for mm in d
    ]
    r0 = direct_rate(U_kV, I_mA, filters, params)
    fit = attenuation_fit(d, r, r0, 1.0)
    rho = areal_density_mg_cm2("Al", 1.0) / 100
    return 10 * fit.mu_eff_per_mm / rho


def test_attenuation_beam_hardening_lowers_mu_eff_with_thickness():
    mu = _al_wheel_mu_eff(21.0, 0.05)
    assert np.all(np.diff(mu) < 0)
    assert mu[0] == approx(6.91, rel=0.03)
    assert mu[-1] == approx(5.38, rel=0.03)
    # At 21 kV most of the continuum lies longward of Mo Kα (median ≈ 76 pm), so μ_eff stays above
    # the Kα value.
    mu_ka = xraylib.CS_Total_CP("Al", HC_KEV_PM / MO_KA_PM)
    assert 4.5 < mu_ka < 5.5
    assert mu[-1] > mu_ka


def test_attenuation_zirconium_filter_straightens_the_line_at_21_kv():
    # At 21 kV Zr removes the hard continuum above its K edge (59–69 pm), leaving a narrower
    # 69–92 pm band: less curved (spread 0.94 vs 1.52 cm²/g), but μ_eff rises. At 35 kV the spread
    # grows (1.29 vs 1.04 cm²/g, measured 2026-10-20), so only 21 kV is asserted.
    zr = ("Zr", areal_density_mg_cm2("Zr", 0.05))
    bare = _al_wheel_mu_eff(21.0, 0.05)
    filtered = _al_wheel_mu_eff(21.0, 0.15, (zr,))
    assert np.all(np.diff(filtered) < 0)
    assert filtered[0] - filtered[-1] < bare[0] - bare[-1]
    assert filtered[0] == approx(6.97, rel=0.03)
    assert filtered[-1] == approx(5.91, rel=0.03)


def test_attenuation_scaled_transmission_undoes_dead_time_and_current():
    tau, b = 1e-4, 0.2
    t_true = 0.37
    r_open_true, i_open, i = 1500.0 + b, 0.02, 1.0
    r_plate_true = t_true * (r_open_true - b) * (i / i_open) + b
    T, err = scaled_transmission(
        dead_time(r_plate_true, tau),
        dead_time(r_open_true, tau),
        i,
        i_open,
        90.0,
        90.0,
        b,
        100.0,
        tau,
    )
    assert T == approx(t_true, rel=1e-12)
    assert err > 0


def test_attenuation_scaled_transmission_error_matches_monte_carlo():
    rng = np.random.default_rng(3)
    tau, b, dt = 1e-4, 0.2, 90.0
    r_open, r_plate, i, i_open = dead_time(1500.2, tau), dead_time(300.0, tau), 1.0, 0.02
    pull = []
    T0, err = scaled_transmission(r_plate, r_open, i, i_open, dt, dt, b, None, tau)
    for _ in range(400):
        ro = sample_counts(r_open, dt, rng) / dt
        rp = sample_counts(r_plate, dt, rng) / dt
        pull.append(scaled_transmission(rp, ro, i, i_open, dt, dt, b, None, tau)[0])
    # The simulation draws plain Poisson counts, which is what the error propagates.
    assert np.std(pull) == approx(err, rel=0.15)
    assert np.mean(pull) == approx(T0, rel=0.05)


def test_attenuation_scaled_transmission_rejects_bad_rates():
    with pytest.raises(ValueError, match="background"):
        scaled_transmission(0.1, 900.0, 1.0, 1.0, 10.0, 10.0, 0.2)
    with pytest.raises(ValueError, match="1/tau"):
        scaled_transmission(1e4, 900.0, 1.0, 1.0, 10.0, 10.0, 0.2, tau_s=1e-4)
