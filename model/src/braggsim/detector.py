"""Detectors of the 554 800: the Geiger–Müller end-window counter (LD 559 01: dead time, counting
noise) and the Si-PIN energy detector with a minimal MCA (LD 559 938: efficiency, resolution,
channel scale, dead time, expected counts per channel). Sources: LD instruction sheets 559 01 and
559 938; model/PARAMETERS.md."""

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


# LD 559 938 Si-PIN energy detector (LD instruction sheet 559 938; model/PARAMETERS.md, 2026-10-22).
PIN_WINDOW_UM = 40.0  # sheet: plastic window ≈ 40 µm graphite equivalent
PIN_WINDOW_DENSITY_G_CM3 = 2.26  # graphite
PIN_SI_UM = 150.0  # sheet
PIN_SI_DENSITY_G_CM3 = 2.33
PIN_SIGMA_EL_KEV = 0.160  # sheet: electronic noise
PIN_FANO = 0.15  # sheet
PIN_EPS_KEV = 0.0038  # sheet: 3.8 eV per electron-hole pair
PIN_DEAD_TIME_S = 250e-6  # sheet: ≈ 250 µs per pulse; non-paralyzable
_FWHM_PER_SIGMA = 2 * np.sqrt(2 * np.log(2))
# Assumption: the keV per channel at the guide's gain is not published. Full scale 40 keV at gain
# -2.5 puts the Mo Kα scatter (~17 keV) at channel ~224 of 512. Linear, offset 0.
MCA_FULL_SCALE_KEV_AT_REF_GAIN = 40.0
MCA_REF_GAIN = 2.5
# Escape peaks (Si Kα 1.74 keV) and the low-energy tail of the line shape are not modelled.


def pin_efficiency(E_keV):
    """Detection efficiency of the LD 559 938 at ``E_keV``: T_window · (1 − exp(−μ_photo,Si ρ t)).
    Window: ``PIN_WINDOW_UM`` of carbon (xraylib ``CS_Total``); Si: ``PIN_SI_UM`` (``CS_Photo``)."""
    e = np.asarray(E_keV, dtype=float)
    t_win = np.exp(
        -np.vectorize(lambda x: xraylib.CS_Total(6, x))(e)
        * PIN_WINDOW_DENSITY_G_CM3 * PIN_WINDOW_UM * 1e-4
    )  # fmt: skip
    mu_si = np.vectorize(lambda x: xraylib.CS_Photo(14, x))(e)
    return t_win * -np.expm1(-mu_si * PIN_SI_DENSITY_G_CM3 * PIN_SI_UM * 1e-4)


def pin_fwhm_keV(E_keV):
    """FWHM in keV of the Gaussian line response: 2√(2 ln 2) √(σ_el² + F ε E)."""
    e = np.asarray(E_keV, dtype=float)
    return _FWHM_PER_SIGMA * np.sqrt(PIN_SIGMA_EL_KEV**2 + PIN_FANO * PIN_EPS_KEV * e)


def kev_per_channel(n_channels=512, gain=-2.5):
    """Channel width in keV: full scale ∝ 1/|gain|, spread over ``n_channels`` (assumption).
    Raises ValueError for gain 0 or a channel wider than ``PIN_SIGMA_EL_KEV``: sampling a Gaussian
    at the channel centres then no longer conserves its area (error ~ exp(−2π²σ²/h²))."""
    if not (abs(gain) > 0 and float(n_channels).is_integer() and n_channels >= 1):  # NaN fails
        raise ValueError("gain must be non-zero and n_channels an integer >= 1")
    kpc = MCA_FULL_SCALE_KEV_AT_REF_GAIN * (MCA_REF_GAIN / abs(gain)) / n_channels
    if kpc > PIN_SIGMA_EL_KEV:
        raise ValueError(f"channel width {kpc:.3f} keV exceeds the line σ {PIN_SIGMA_EL_KEV} keV")
    return kpc


def _gauss_per_channel(e_ch, e0, fwhm):
    """Gaussian of unit area, sampled at the channel centres ``e_ch`` (per keV)."""
    sig = fwhm / _FWHM_PER_SIGMA
    return np.exp(-0.5 * ((e_ch - e0) / sig) ** 2) / (sig * np.sqrt(2 * np.pi))


def mca_live_time(total_rate_per_s, t_s):
    """Live time ``t_s``/(1 + R τ) of a non-paralyzable counter over ``t_s`` of real time (the
    preset time is taken as real time: assumption), for the true detected rate."""
    return t_s / (1 + total_rate_per_s * PIN_DEAD_TIME_S)


def mca_counts(lines, continuum, t_s, n_channels=512, gain=-2.5):
    """Expected counts per channel (deterministic) over ``t_s`` of real time.

    ``lines``: (energy_keV, rate_per_s) pairs, photons/s at the window; ``continuum``: a list of
    (energy_keV ascending, rate_per_s_per_keV) arrays. Each is weighted by ``pin_efficiency`` and
    smeared by a Gaussian of ``pin_fwhm_keV``, sampled at the channel centre × channel width; the
    continuum is cut into grid intervals (trapezoid photons at the midpoint). Dead time: live time
    from the total detected rate. Channel i is centred on i · keV per channel (offset 0).
    Returns (counts per channel, live_time_s, channel_energy_keV).
    """
    if not t_s >= 0:  # NaN fails too
        raise ValueError("t_s must be >= 0")
    kpc = kev_per_channel(n_channels, gain)
    e_ch = np.arange(n_channels) * kpc
    pulses = np.zeros(n_channels)  # detected pulses per second per channel
    total = 0.0
    for e0, rate in lines:
        r = rate * float(pin_efficiency(e0))
        total += r
        pulses += r * _gauss_per_channel(e_ch, e0, float(pin_fwhm_keV(e0))) * kpc
    for e, dens in continuum:
        e, dens = np.asarray(e, dtype=float), np.asarray(dens, dtype=float)
        mid = 0.5 * (e[1:] + e[:-1])
        r = 0.5 * (dens[1:] + dens[:-1]) * np.diff(e) * pin_efficiency(mid)
        total += float(r.sum())
        for em, rm in zip(mid, r, strict=True):
            if rm > 0 and em < e_ch[-1] + 5:
                pulses += rm * _gauss_per_channel(e_ch, em, float(pin_fwhm_keV(em))) * kpc
    live = mca_live_time(total, t_s)
    return pulses * live, live, e_ch
