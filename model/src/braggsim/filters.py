"""Transmission of X-rays through absorbers (air, windows, filters) via xraylib.

Mass attenuation coefficients: xraylib ``CS_Total_CP`` (Schoonjans et al., Spectrochim.
Acta B 66, 776 (2011)); ``material`` is a chemical formula ("Zr", "Be") or an xraylib NIST
compound name ("Air, Dry (near sea level)").
"""

import functools

import numpy as np
import xraylib

from braggsim.constants import HC_KEV_PM

# μ/ρ is tabulated on this fixed grid and interpolated log–log, so the web app can load the very
# same numbers (artifacts/tables/mu_rho.json) and match Python to 1e-9. It spans λ_min at 35 kV
# (35.4 pm) to 1st order at the arm limit θ = 85° (562 pm); beyond it the end values are held.
# Away from absorption edges the table is within 3e-6 of xraylib; an edge is smeared over one
# grid step (0.3 %).
MU_RHO_GRID_PM = np.round(np.geomspace(30.0, 600.0, 1000), 9)  # round: same nodes on every CPU


@functools.cache
def mu_rho_table(material):
    """Mass attenuation coefficient μ/ρ of ``material`` in cm²/g on ``MU_RHO_GRID_PM``."""
    table = np.array([xraylib.CS_Total_CP(material, HC_KEV_PM / x) for x in MU_RHO_GRID_PM])
    table.flags.writeable = False
    return table


def transmission(lambda_pm, material, areal_density_mg_cm2):
    """Fraction T = exp(−μ/ρ · ρx) transmitted through ``areal_density_mg_cm2`` of material."""
    log_lam = np.log(np.asarray(lambda_pm, dtype=float))
    log_mu = np.interp(log_lam, np.log(MU_RHO_GRID_PM), np.log(mu_rho_table(material)))
    return np.exp(-np.exp(log_mu) * areal_density_mg_cm2 / 1000)
