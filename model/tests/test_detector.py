import numpy as np
from pytest import approx

from braggsim.detector import dead_time, sample_counts


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
