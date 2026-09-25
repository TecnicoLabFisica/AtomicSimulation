"""Geiger–Müller end-window counter (LD 559 01): dead time and counting noise."""

import numpy as np


def dead_time(rate_per_s, tau_s):
    """Observed rate of a non-paralyzable counter, R_obs = R / (1 + R τ), in counts/s."""
    rate = np.asarray(rate_per_s, dtype=float)
    return rate / (1 + rate * tau_s)


def sample_counts(R_bar, dt_s, rng):
    """Poisson-sampled counts in a gate of ``dt_s`` seconds for expected rates ``R_bar`` (1/s).

    The only source of randomness in the model; ``rng`` is a ``numpy.random.Generator``.
    Divide by ``dt_s`` to get the rate the apparatus displays.
    """
    return rng.poisson(np.asarray(R_bar, dtype=float) * dt_s)
