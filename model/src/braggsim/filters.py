"""Transmission of X-rays through absorbers (air, windows, filters) via xraylib.

Mass attenuation coefficients: xraylib ``CS_Total_CP`` (Schoonjans et al., Spectrochim.
Acta B 66, 776 (2011)); ``material`` is a chemical formula ("Zr", "Be") or an xraylib NIST
compound name ("Air, Dry (near sea level)").
"""

import numpy as np
import xraylib

from braggsim.constants import HC_KEV_PM


def transmission(lambda_pm, material, areal_density_mg_cm2):
    """Fraction T = exp(−μ/ρ · ρx) transmitted through ``areal_density_mg_cm2`` of material."""
    lam = np.asarray(lambda_pm, dtype=float)
    mu_cm2_g = np.array([xraylib.CS_Total_CP(material, HC_KEV_PM / x) for x in lam.ravel()])
    return np.exp(-mu_cm2_g.reshape(lam.shape) * areal_density_mg_cm2 / 1000)
