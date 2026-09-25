"""Bragg geometry at the NaCl monocrystal: n λ = 2 d sin θ (LD P6.3.3.1, Eq. I).

θ is the glancing angle, measured from the lattice planes, in degrees.
"""

import functools

import numpy as np
import xraylib

from braggsim.constants import D_NACL_PM


def theta_from_lambda(lambda_pm, n=1, d_pm=D_NACL_PM):
    """Glancing angle θ in degrees for wavelength ``lambda_pm`` in order ``n``.

    Returns NaN where n λ > 2 d (no reflection exists in that order), for λ ≤ 0, or n < 1.
    """
    s = n * np.asarray(lambda_pm, dtype=float) / (2 * d_pm)
    with np.errstate(invalid="ignore"):
        return np.degrees(np.arcsin(np.where((s > 0) & (s <= 1) & (n >= 1), s, np.nan)))


def lambda_from_theta(theta_deg, n=1, d_pm=D_NACL_PM):
    """Wavelength in pm reflected in order ``n`` at glancing angle ``theta_deg`` (NaN outside
    0° … 90°, where no glancing angle exists)."""
    theta = np.asarray(theta_deg, dtype=float)
    lam = 2 * d_pm * np.sin(np.radians(theta)) / n
    return np.where((theta >= 0) & (theta <= 90), lam, np.nan)


def dlambda_dtheta_pm_per_deg(theta_deg, n=1, d_pm=D_NACL_PM):
    """Jacobian dλ/dθ = (2 d / n) cos θ, in pm per degree, for mapping spectra onto angle."""
    return 2 * d_pm / n * np.cos(np.radians(theta_deg)) * np.pi / 180


def lorentz_polarization(theta_deg):
    """Lorentz-polarization factor (1 + cos² 2θ) / (2 sin 2θ) for an unpolarized beam.

    Scales the integrated reflectivity of a mosaic crystal with glancing angle; the Lorentz
    part 1/sin 2θ is the time each crystallite spends in the reflecting position.
    Warren, *X-ray Diffraction* (1969), ch. 4. Diverges at θ = 0 and 90°; scan.py never
    evaluates it there.
    """
    two_theta = np.radians(2 * np.asarray(theta_deg, dtype=float))
    return (1 + np.cos(two_theta) ** 2) / (2 * np.sin(two_theta))


@functools.cache
def structure_factor_sq_rel(n_max):
    """|F|² of the NaCl (2n 0 0) reflections relative to (200), for orders n = 1 … n_max (tuple).

    Rock salt with h even: F = 4 (f_Na + f_Cl), atoms at rest (thermal motion is the separate
    Debye–Waller factor in scan.ModelParams). Form factors are xraylib ``FF_Rayl`` at
    q = sin θ / λ = n / (2d), in Å⁻¹ inside this function. Warren, *X-ray Diffraction* (1969),
    ch. 4; Schoonjans et al., Spectrochim. Acta B 66, 776 (2011).
    """
    f_sq = [
        (xraylib.FF_Rayl(11, q) + xraylib.FF_Rayl(17, q)) ** 2
        for q in (n / (2 * D_NACL_PM / 100) for n in range(1, n_max + 1))
    ]
    return tuple(f / f_sq[0] for f in f_sq)
