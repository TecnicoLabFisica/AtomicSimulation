"""Geiger–Müller end-window counter (LD 559 01): dead time and counting noise."""

import numpy as np


def dead_time(rate_per_s, tau_s):
    """Observed rate of a non-paralyzable counter, R_obs = R / (1 + R τ), in counts/s."""
    rate = np.asarray(rate_per_s, dtype=float)
    return rate / (1 + rate * tau_s)


def dead_time_correct(rate_per_s, tau_s):
    """True rate R = R_obs / (1 − R_obs τ), the inverse of ``dead_time``, in counts/s.

    Needs R_obs τ < 1 (a non-paralyzable counter cannot read above 1/τ).
    """
    rate = np.asarray(rate_per_s, dtype=float)
    if np.any(rate * tau_s >= 1):
        raise ValueError("observed rate at or above 1/τ cannot be corrected")
    return rate / (1 - rate * tau_s)


def sample_counts(R_bar, dt_s, rng):
    """Poisson-sampled counts in a gate of ``dt_s`` seconds for expected rates ``R_bar`` (1/s).

    The only source of randomness in the model; ``rng`` is a ``numpy.random.Generator``.
    Divide by ``dt_s`` to get the rate the apparatus displays.
    """
    return rng.poisson(np.asarray(R_bar, dtype=float) * dt_s)
