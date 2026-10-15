"""Transmission of X-rays through absorbers (air, windows, filters) via xraylib.

Mass attenuation coefficients: xraylib ``CS_Total_CP`` (Schoonjans et al., Spectrochim.
Acta B 66, 776 (2011)); ``material`` is a chemical formula ("Zr", "Be") or an xraylib NIST
compound name ("Air, Dry (near sea level)").
"""

import functools
import math

import numpy as np
import xraylib

from braggsim.constants import HC_KEV_PM

# Absorbers (xraylib names): the union of the LD foil set 554 832 and the absorption accessory
# 554 834 (Al wheel, material wheel). "Polystyrene" is the NIST compound for the LD "C" absorber.
ABSORBERS = ("Polystyrene", "Al", "Fe", "Cu", "Zr", "Mo", "Ag", "In")

# LD foil set 554 832, thickness in mm (LD catalog).
FOILS_MM = {"Zr": 0.05, "Mo": 0.1, "Ag": 0.05, "In": 0.3, "Al": 0.5, "Fe": 0.5, "Cu": 0.07}

# The two plates of the absorption accessory 554 834: 7 slots at target angles 0°, 10° … 60°
# ((material, thickness_mm) or None = open). Assumptions (model/PARAMETERS.md): the material plate's
# 0.4 mm is the user's decision (the catalog says 0.5 mm) and its open slot is at 60°
# (open question 10 in Plan-New-Features.md).
WHEELS_MM = {
    "al": (None, *(("Al", 0.5 * k) for k in range(1, 7))),
    "material": (*((m, 0.4) for m in ("Polystyrene", "Al", "Fe", "Cu", "Zr", "Ag")), None),
}

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


def areal_density_mg_cm2(material, thickness_mm):
    """Areal density ρx in mg/cm² of a ``thickness_mm`` foil: 100 · thickness_mm · ρ(g/cm³)."""
    if material == "Polystyrene":
        rho_g_cm3 = xraylib.GetCompoundDataNISTByName(material)["density"]
    else:
        rho_g_cm3 = xraylib.ElementDensity(xraylib.SymbolToAtomicNumber(material))
    return 100 * thickness_mm * rho_g_cm3


def check_filters(filters):
    """Raise ValueError unless every ``(material, areal_density_mg_cm2)`` is one of ``ABSORBERS``
    (the web app has μ/ρ tables for those only) with a finite density ≥ 0."""
    for material, areal_density_mg_cm2 in filters:
        if material not in ABSORBERS:
            raise ValueError(f"no μ/ρ table for filter {material!r}: use one of {ABSORBERS}")
        if not (math.isfinite(areal_density_mg_cm2) and areal_density_mg_cm2 >= 0):
            raise ValueError(f"filter areal density must be finite and ≥ 0: {areal_density_mg_cm2}")
