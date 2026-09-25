"""Emission of the Mo X-ray tube: bremsstrahlung continuum and characteristic K lines.

Intensities are photon rates in arbitrary relative units; the absolute scale is fitted in
``scan.ModelParams``. Everything scales linearly with the emission current I.
"""

import numpy as np

from braggsim.constants import HC_KEV_PM, KB_KA_RATIO, MO_K_EDGE_KEV

# Exponent m of the K-line intensity law I_K ∝ I (U/U_K − 1)^m. Fixed from the literature,
# not fitted: Fig. 4 was measured at one voltage only, which cannot constrain m.
# Green & Cosslett, J. Phys. D 1, 425 (1968). See model/PARAMETERS.md.
LINE_EXPONENT_M = 1.67


def lambda_min_pm(U_kV):
    """Duane–Hunt short-wavelength limit λ_min = hc / (e U) in pm (inf for U = 0)."""
    with np.errstate(divide="ignore"):
        return HC_KEV_PM / np.asarray(U_kV, dtype=float)


def continuum(lambda_pm, U_kV, I_mA):
    """Bremsstrahlung photon rate per unit wavelength (relative units per pm).

    Kramers' thick-target law I(E) ∝ Z I (E0 − E), converted to photons per pm:
    N(λ) ∝ I (λ/λ_min − 1) / λ², zero for λ ≤ λ_min. Kramers, Phil. Mag. 46, 836 (1923).
    """
    lam = np.asarray(lambda_pm, dtype=float)
    return I_mA * np.clip(lam / lambda_min_pm(U_kV) - 1, 0, None) / lam**2


def line_rates(U_kV, I_mA, line_to_cont):
    """Photon rates (Kα, Kβ) of the Mo K lines, in the continuum's units × pm.

    I_K = line_to_cont · I · (U/U_K − 1)^m above the Mo K edge U_K, else zero. The emitted
    Kβ/Kα ratio is the xraylib radiative-rate ratio. The lines are δ-functions in λ: their
    natural width (~0.01 pm) is far below what the goniometer resolves.
    """
    if U_kV <= MO_K_EDGE_KEV:
        return 0.0, 0.0
    ka = line_to_cont * I_mA * (U_kV / MO_K_EDGE_KEV - 1) ** LINE_EXPONENT_M
    return ka, KB_KA_RATIO * ka
