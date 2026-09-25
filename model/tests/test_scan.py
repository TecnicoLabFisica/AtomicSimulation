import csv
from pathlib import Path

import numpy as np
import pytest
from pytest import approx

from braggsim.constants import MO_K_EDGE_KEV, MO_KA_PM, MO_KB_PM
from braggsim.crystal import theta_from_lambda
from braggsim.scan import DEFAULT, coupled_betas, expected_rate
from braggsim.source import lambda_min_pm

LEAFLET_BETAS = coupled_betas(2.0, 25.0, 0.1)


def test_leaflet_scan_has_231_steps():
    # LD P6.3.3.1: 2° → 25° in 0.1° steps.
    assert LEAFLET_BETAS.size == 231
    assert LEAFLET_BETAS[0] == 2.0 and LEAFLET_BETAS[-1] == 25.0


def test_expected_rate_is_deterministic_and_non_negative():
    a = expected_rate(LEAFLET_BETAS, 35.0, 1.0)
    assert np.array_equal(a, expected_rate(LEAFLET_BETAS, 35.0, 1.0))
    assert np.all(a >= 0)


@pytest.mark.parametrize("n", [1, 2, 3])
@pytest.mark.parametrize("lam", [MO_KA_PM, MO_KB_PM])
def test_line_centroids_sit_at_leaflet_table_2_angles(n, lam):
    # Lines dominate (continuum ×1e-4 relative), no dead time: the intensity centroid of the
    # Kα1/Kα2 (or Kβ) blend is at the Bragg angle of the leaflet's mean wavelength.
    theta = float(theta_from_lambda(lam, n))
    beta = np.arange(theta - 0.5, theta + 0.5, 0.002)
    params = DEFAULT.replace(line_to_cont=1e4 * DEFAULT.line_to_cont, tau_s=0.0,
                             leak_amp_per_s=0.0, scatter_per_s=0.0)  # fmt: skip
    rate = expected_rate(beta, 35.0, 1.0, params)
    assert np.sum(beta * rate) / np.sum(rate) == approx(theta, abs=0.01)


def test_no_characteristic_lines_below_mo_k_edge():
    beta = np.arange(2.0, 25.0, 0.05)
    no_lines = DEFAULT.replace(line_to_cont=0.0)
    for U in (19.0, MO_K_EDGE_KEV):  # lines switch on only above the edge itself
        assert expected_rate(beta, U, 1.0) == approx(expected_rate(beta, U, 1.0, no_lines))
    assert not np.allclose(expected_rate(beta, 35.0, 1.0), expected_rate(beta, 35.0, 1.0, no_lines))


def test_continuum_onset_moves_with_voltage():
    beta = np.arange(3.0, 8.0, 0.01)
    params = DEFAULT.replace(leak_amp_per_s=0.0, scatter_per_s=0.0)
    onsets = []
    for U in (25.0, 30.0, 35.0):
        rate = expected_rate(beta, U, 1.0, params)
        onsets.append(beta[np.argmax(rate > 0.05 * rate.max())])
    assert onsets == sorted(onsets, reverse=True)


def test_continuum_starts_at_duane_hunt_angle():
    # λ_min(35 kV) = 35.42 pm → θ_min = arcsin(λ_min / 2d) = 3.60° (LD P6.3.3.1). With σ = 0 no
    # continuum below θ_min, and some right above it.
    theta_min = float(theta_from_lambda(lambda_min_pm(35.0)))
    assert theta_min == approx(3.60, abs=0.005)
    params = DEFAULT.replace(leak_amp_per_s=0.0, scatter_per_s=0.0, sigma_deg=1e-3)
    below, above = expected_rate(np.array([theta_min - 0.02, theta_min + 0.05]), 35.0, 1.0, params)
    assert below == approx(0, abs=1e-6) and above > 1


def test_dead_time_acts_on_the_total_rate_at_the_ka_peak():
    # Non-paralyzable R/(1+Rτ) on everything the counter sees (lines, continuum, leak, scatter).
    beta = np.array([float(theta_from_lambda(MO_KA_PM))])
    true = expected_rate(beta, 35.0, 1.0, DEFAULT.replace(tau_s=0.0))
    assert expected_rate(beta, 35.0, 1.0) == approx(true / (1 + true * DEFAULT.tau_s), rel=1e-12)
    assert true[0] > 2000  # the tip is where dead time matters (≈ 24 % loss)


def test_rate_is_linear_in_current_without_dead_time():
    params = DEFAULT.replace(tau_s=0.0)
    r1 = expected_rate(LEAFLET_BETAS, 35.0, 0.5, params)
    r2 = expected_rate(LEAFLET_BETAS, 35.0, 1.0, params)
    assert r2 == approx(2 * r1, rel=1e-12)


def test_tube_off_gives_zero_rate():
    # Scatter and leak follow the tube; the GM natural background is neglected (scan.py).
    assert np.all(expected_rate(LEAFLET_BETAS, 35.0, 0.0) == 0)
    assert np.all(expected_rate(LEAFLET_BETAS, 0.0, 1.0) == 0)


def test_small_angles_and_single_points_match_a_full_scan():
    # The continuum grid sits on a fixed lattice, so one β at a time equals a whole scan.
    beta = coupled_betas(-5.0, 10.0, 0.1)
    one_by_one = [expected_rate(np.array([b]), 35.0, 1.0)[0] for b in beta]
    assert one_by_one == approx(expected_rate(beta, 35.0, 1.0), rel=1e-12)


def test_negative_voltage_or_current_is_rejected():
    with pytest.raises(ValueError):
        expected_rate(LEAFLET_BETAS, -1.0, 1.0)
    with pytest.raises(ValueError):
        expected_rate(LEAFLET_BETAS, 35.0, -1.0)


def test_angles_outside_sensor_arm_range_are_rejected():
    # LD 554 800: sensor arm −10° … +170°, so β = θ is limited to −5° … +85° when coupled.
    with pytest.raises(ValueError):
        expected_rate(np.array([86.0]), 35.0, 1.0)


# Fig. 4 regression. The digitized peaks sit a constant +0.090° above the Bragg angles, which
# the leaflet's own Table 3 does not show, so it is a figure offset: calibration-only, fitted in
# notebook 03, and never part of expected_rate (model/PARAMETERS.md).
FIG4_BETA_OFFSET_DEG = 0.090
FIG4_CSV = Path(__file__).resolve().parents[1] / "data" / "fig4_digitized.csv"


def _fig4_log_panel():
    with FIG4_CSV.open() as f:
        rows = [r for r in csv.DictReader(line for line in f if not line.startswith("#"))]
    b = np.array([float(r["beta_deg"]) for r in rows if r["panel"] == "log"])
    rate = np.array([float(r["rate_per_s"]) for r in rows if r["panel"] == "log"])
    return b, rate, expected_rate(b - FIG4_BETA_OFFSET_DEG, 35.0, 1.0)


def test_default_model_reproduces_fig4_log_panel():
    # Fit gives 0.051 dex; the two digitized panels agree to 0.012 dex, the digitization floor.
    b, data, model = _fig4_log_panel()
    assert np.sqrt(np.mean(np.log10(model / data) ** 2)) < 0.06


@pytest.mark.parametrize("n", [1, 2, 3])
@pytest.mark.parametrize("lam", [MO_KA_PM, MO_KB_PM])
def test_fig4_peak_heights_within_known_line_tip_deficit(n, lam):
    # Gaussian line tips come out 0.70–1.04 × Fig. 4 (PARAMETERS.md, Known deviations).
    b, data, model = _fig4_log_panel()
    near = np.abs(b - FIG4_BETA_OFFSET_DEG - theta_from_lambda(lam, n)) < 0.2
    assert 0.65 < model[near].max() / data[near].max() < 1.15
