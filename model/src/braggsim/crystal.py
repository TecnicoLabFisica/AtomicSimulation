"""Bragg geometry at the NaCl monocrystal: n λ = 2 d sin θ (LD P6.3.3.1, Eq. I).

θ is the glancing angle, measured from the lattice planes, in degrees.
"""

import numpy as np

from braggsim.constants import D_NACL_PM


def theta_from_lambda(lambda_pm, n=1, d_pm=D_NACL_PM):
    """Glancing angle θ in degrees for wavelength ``lambda_pm`` in order ``n``.

    Returns NaN where n λ > 2 d (no reflection exists in that order).
    """
    s = n * np.asarray(lambda_pm, dtype=float) / (2 * d_pm)
    with np.errstate(invalid="ignore"):
        return np.degrees(np.arcsin(np.where(s <= 1, s, np.nan)))


def lambda_from_theta(theta_deg, n=1, d_pm=D_NACL_PM):
    """Wavelength in pm reflected in order ``n`` at glancing angle ``theta_deg``."""
    return 2 * d_pm * np.sin(np.radians(theta_deg)) / n


def dlambda_dtheta_pm_per_deg(theta_deg, n=1, d_pm=D_NACL_PM):
    """Jacobian dλ/dθ = (2 d / n) cos θ, in pm per degree, for mapping spectra onto angle."""
    return 2 * d_pm / n * np.cos(np.radians(theta_deg)) * np.pi / 180
