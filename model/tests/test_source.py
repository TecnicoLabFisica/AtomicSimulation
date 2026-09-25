import numpy as np
from pytest import approx

from braggsim.constants import KB_KA_RATIO, MO_K_EDGE_KEV
from braggsim.source import continuum, lambda_min_pm, line_rates

LAM = np.linspace(20.0, 300.0, 561)


def test_duane_hunt_limit_at_35_kV():
    assert lambda_min_pm(35.0) == approx(35.42, abs=0.01)


def test_continuum_vanishes_below_duane_hunt_limit_and_is_positive_above():
    spec = continuum(LAM, 35.0, 1.0)
    below = LAM <= lambda_min_pm(35.0)
    assert np.all(spec[below] == 0)
    assert np.all(spec[~below] > 0)


def test_kramers_photon_spectrum_peaks_at_twice_lambda_min():
    lam = np.linspace(36.0, 200.0, 16401)
    assert lam[np.argmax(continuum(lam, 35.0, 1.0))] == approx(2 * lambda_min_pm(35.0), abs=0.02)


def test_continuum_edge_moves_with_voltage():
    lam_first_nonzero = [LAM[np.argmax(continuum(LAM, U, 1.0) > 0)] for U in (15.0, 25.0, 35.0)]
    assert lam_first_nonzero == sorted(lam_first_nonzero, reverse=True)


def test_everything_scales_linearly_with_emission_current():
    assert continuum(LAM, 35.0, 0.6) == approx(0.6 * continuum(LAM, 35.0, 1.0))
    assert line_rates(35.0, 0.6, 1.0) == approx(tuple(0.6 * r for r in line_rates(35.0, 1.0, 1.0)))


def test_no_emission_without_current_or_voltage():
    assert np.all(continuum(LAM, 35.0, 0.0) == 0)
    assert np.all(continuum(LAM, 0.0, 1.0) == 0)
    assert line_rates(35.0, 0.0, 1.0) == (0.0, 0.0)


def test_characteristic_lines_only_above_mo_k_edge():
    for U in (0.0, 10.0, 19.99, MO_K_EDGE_KEV):
        assert line_rates(U, 1.0, 1.0) == (0.0, 0.0)
    ka = [line_rates(U, 1.0, 1.0)[0] for U in (22.0, 28.0, 35.0)]
    assert 0 < ka[0] < ka[1] < ka[2]


def test_kb_to_ka_ratio_is_the_emission_ratio():
    ka, kb = line_rates(35.0, 1.0, 1.0)
    assert kb / ka == approx(KB_KA_RATIO)
