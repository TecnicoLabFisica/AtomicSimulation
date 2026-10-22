"""Geiger–Müller end-window counter (LD 559 01): dead time and counting noise."""

import numpy as np
import xraylib

from braggsim.constants import HC_KEV_PM

# LD 559 01 end-window GM counter (LD instruction sheet 559 01; model/PARAMETERS.md, 2026-10-22).
GM_WINDOW_FORMULA = "KAl3Si3O10(OH)2"  # muscovite mica
GM_WINDOW_UM = 13.5  # sheet: d = 12–15 µm
GM_WINDOW_DENSITY_G_CM3 = 2.83  # literature, muscovite
GM_ACTIVE_LENGTH_MM = 36.0  # sheet
# Fill gas: assumption (the sheet says neon/argon/halogen, pressure not published).
GM_GAS_PRESSURE_HPA = 500.0  # plausible 100–1000
GM_GAS_TEMPERATURE_K = 293.15
# (Z, molar mass g/mol, atoms per gas molecule): Ne 99.4 %, Ar 0.5 %, Br2 0.1 % by volume
GM_GAS = ((10, 20.1797, 0.994), (18, 39.948, 0.005), (35, 79.904, 0.002))
_R_J_MOL_K = 8.314462618


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


def gm_efficiency(lambda_pm, pressure_hPa=GM_GAS_PRESSURE_HPA):
    """Detection efficiency of the LD 559 01 end-window counter for photons of ``lambda_pm`` (pm)
    entering along the axis: ε = T_window · (1 − exp(−μ_photo,gas · m_gas)).

    Window: mica ``GM_WINDOW_UM`` thick (xraylib ``CS_Total_CP``). Gas: Ne + 0.5 % Ar + 0.1 % Br₂
    by volume at ``pressure_hPa`` and 20 °C, ideal gas, ``GM_ACTIVE_LENGTH_MM`` long; only
    photoabsorption counts (xraylib ``CS_Photo``; Compton electrons rarely trigger). The sheet does
    not publish gas or pressure, so ε ∝ p is uncertain by ×5 either way (model/PARAMETERS.md).
    Source: LD instruction sheet 559 01; Schoonjans et al., Spectrochim. Acta B 66, 776 (2011).
    """
    e_kev = HC_KEV_PM / np.asarray(lambda_pm, dtype=float)
    t_window = np.exp(
        -np.vectorize(lambda e: xraylib.CS_Total_CP(GM_WINDOW_FORMULA, e))(e_kev)
        * GM_WINDOW_DENSITY_G_CM3 * GM_WINDOW_UM * 1e-4
    )  # fmt: skip
    mol_per_cm3 = pressure_hPa * 100 / (_R_J_MOL_K * GM_GAS_TEMPERATURE_K) * 1e-6
    length_cm = GM_ACTIVE_LENGTH_MM / 10
    tau = sum(
        frac * mol_per_cm3 * molar_g * length_cm
        * np.vectorize(lambda e, z=z: xraylib.CS_Photo(z, e))(e_kev)
        for z, molar_g, frac in GM_GAS
    )  # fmt: skip
    return t_window * -np.expm1(-tau)
