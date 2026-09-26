import numpy as np
import pytest
from pytest import approx

from braggsim.analysis import (
    THRESHOLD_HALF_WINDOW_DEG,
    find_line_peaks,
    line_threshold_kv,
    order_means_pm,
    peak_center,
    wavelength_table,
)
from braggsim.constants import MO_K_EDGE_KEV, MO_KA_PM, MO_KB_PM
from braggsim.crystal import theta_from_lambda
from braggsim.detector import sample_counts
from braggsim.scan import DEFAULT, coupled_betas, expected_rate
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
