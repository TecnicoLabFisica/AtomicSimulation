import numpy as np
import pytest
from pytest import approx

from braggsim import detector
from braggsim.detector import dead_time, dead_time_correct, sample_counts


def test_dead_time_is_negligible_at_low_rates():
    assert dead_time(1.0, 1e-4) == approx(1.0, rel=1e-3)


def test_dead_time_saturates_at_inverse_tau():
    assert dead_time(1e9, 1e-4) == approx(1e4, rel=1e-3)


def test_zero_dead_time_leaves_rate_unchanged():
    rates = np.array([0.0, 10.0, 5000.0])
    assert dead_time(rates, 0.0) == approx(rates)


def test_counts_are_poisson_with_mean_and_variance_rate_times_dt():
    # Poisson in *counts* N = R·Δt, not in rate: mean = var = R̄·Δt.
    rng = np.random.default_rng(12345)
    for rate, dt in ((2.0, 10.0), (50.0, 10.0), (800.0, 1.0)):
        counts = sample_counts(np.full(20000, rate), dt, rng)
        assert counts.mean() == approx(rate * dt, rel=0.02)
        assert counts.var() == approx(rate * dt, rel=0.05)


def test_dead_time_correct_inverts_dead_time():
    r = np.array([0.0, 1.0, 500.0, 5000.0, 2e5])
    assert dead_time_correct(dead_time(r, 1e-4), 1e-4) == approx(r, rel=1e-9, abs=1e-12)
    with pytest.raises(ValueError):
        dead_time_correct(1e4, 1e-4)


def test_gm_efficiency_physical_trends():
    from braggsim.constants import HC_KEV_PM
    from braggsim.detector import gm_efficiency as eps

    lam = lambda e: HC_KEV_PM / e  # noqa: E731
    for e in (8.04, 17.48, 20.0, 35.0):
        assert 0 < eps(lam(e)) < 1
    assert eps(lam(8.04)) > eps(lam(17.48))  # the gas absorbs soft X-rays better
    # Br K edge 13.474 keV: an upward step
    assert eps(lam(13.47 * 0.999)) > 0 and eps(lam(13.48)) > 1.1 * eps(lam(13.46))
    # thin gas: ε ∝ pressure
    assert eps(lam(17.48), 1000.0) / eps(lam(17.48), 500.0) == pytest.approx(2.0, rel=0.02)


# --- LD 559 938 Si-PIN and MCA ---
def test_pin_fwhm_matches_sheet():
    assert detector.pin_fwhm_keV(6.40) == pytest.approx(0.40, abs=0.01)


def test_pin_efficiency_shape():
    eff = detector.pin_efficiency([2.0, 8.0, 20.0, 30.0])
    assert eff[1] > 0.8 and eff[0] < 0.2  # window cuts 2 keV
    assert eff[2] < 0.5 * eff[1] and eff[3] < eff[2]  # thin Si


def test_mca_line_area_and_linearity():
    lines = [(8.04, 100.0)]
    c, live, e = detector.mca_counts(lines, [], 100.0)
    expected = 100.0 * float(detector.pin_efficiency(8.04)) * live
    assert c.sum() == pytest.approx(expected, rel=1e-3)
    assert e[np.argmax(c)] == pytest.approx(8.04, abs=detector.kev_per_channel())
    assert detector.mca_live_time(160.0, 180.0) / 180.0 == pytest.approx(1 / 1.04)


def test_mca_dead_time_saturation():
    """Non-paralyzable: a true detected rate R = 1/τ records R/2, i.e. R·t/2 counts."""
    r = 1 / detector.PIN_DEAD_TIME_S  # 4000 /s detected
    c, live, _ = detector.mca_counts([(8.04, r / float(detector.pin_efficiency(8.04)))], [], 10.0)
    assert live == pytest.approx(5.0) and c.sum() == pytest.approx(r * 10.0 / 2, rel=1e-3)


def test_mca_rejects_unsampleable_scales():
    for gain, n in ((0, 512), (-1, 256), (-2.5, 128)):  # gain 0; channels wider than σ
        with pytest.raises(ValueError):
            detector.kev_per_channel(n, gain)
    with pytest.raises(ValueError):
        detector.mca_counts([(8.04, 1.0)], [], -1.0)
    # at the limit the sampled line still conserves its area
    c, live, _ = detector.mca_counts([(8.04, 100.0)], [], 100.0, 256, -2.5)
    assert c.sum() == pytest.approx(100.0 * float(detector.pin_efficiency(8.04)) * live, rel=1e-6)


def test_mca_continuum_conserves_photons():
    e = np.linspace(5.0, 25.0, 400)
    dens = np.full_like(e, 2.0)
    c, live, _ = detector.mca_counts([], [(e, dens)], 100.0)
    mid = 0.5 * (e[1:] + e[:-1])
    exp = np.sum(2.0 * np.diff(e) * detector.pin_efficiency(mid)) * live * 100.0 / 100.0
    assert c.sum() == pytest.approx(exp, rel=2e-3)
