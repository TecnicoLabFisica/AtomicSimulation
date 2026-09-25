"""Coupled 2:1 scan: the expected counting rate R̄(β) the GM counter sees (no noise).

In COUPLED mode the target (crystal) sits at β = θ and the sensor arm at 2θ (LD 554 800).
R̄(β) = dead_time( scale · Σ_n r_n [continuum_n + lines_n](β) + leak(β) + scatter ):
- continuum_n: Kramers spectrum at λ_n(θ), times absorber transmission, the Jacobian
  dλ/dθ and the Lorentz-polarization factor, convolved with the instrument Gaussian σ;
- lines_n: Mo Kα1,2 / Kβ1,3 / Kβ2 δ-lines, same factors, as Gaussians at their Bragg angles;
- leak: tail of the direct beam reaching the counter at small 2θ;
- scatter: flat scattered radiation (air, crystal, housing).
Leak and scatter both follow the tube as I·(U/35 kV)², an assumption Fig. 4 (35 kV only)
cannot test. With the tube off R̄ = 0; the GM natural background (≲ 1/s) is neglected.
Every fitted value in ``DEFAULT`` is documented in model/PARAMETERS.md.
"""

import dataclasses

import numpy as np

from braggsim.constants import MO_KA_COMPONENTS, MO_KB_COMPONENTS
from braggsim.crystal import (
    dlambda_dtheta_pm_per_deg,
    lambda_from_theta,
    lorentz_polarization,
    theta_from_lambda,
)
from braggsim.detector import dead_time
from braggsim.filters import transmission
from braggsim.source import continuum, line_rates

# Air between anode and counter: path length is an assumption (≈ 12 cm anode → crystal plus
# s2 ≈ 6 cm), not fitted. Air density 1.205 mg/cm³ at 20 °C, 1 atm.
AIR = "Air, Dry (near sea level)"
AIR_PATH_CM = 18.0
AIR_MG_CM2 = 1.205 * AIR_PATH_CM

# Effective absorber standing in for the glass tube wall and anode self-absorption (thickness
# fitted). Borosilicate glass fits Fig. 4 as well as SiO2 or Al and better than Be or Mo.
ABSORBER = "Glass, Pyrex"
U_REF_KV = 35.0  # voltage at which leak_amp_per_s and scatter_per_s are quoted

# Sensor arm range −10° … +170° (LD 554 800) → coupled target angle β = θ in −5° … +85°.
BETA_MIN_DEG, BETA_MAX_DEG = -5.0, 85.0
THETA_STEP_DEG = 0.01  # internal grid for the continuum convolution
KERNEL_HALF_WIDTH_SIGMA = 6


@dataclasses.dataclass(frozen=True)
class ModelParams:
    scale: float  # counts/s per relative source unit
    line_to_cont: float  # Kα line strength relative to the continuum (1/pm)
    r2: float  # order reflectivity relative to n = 1
    r3: float
    sigma_deg: float  # Gaussian angular resolution at s1 ≈ 5 cm, s2 ≈ 6 cm
    tau_s: float  # GM dead time
    leak_amp_per_s: float  # direct-beam halo at 2θ = 0, at 35 kV and 1 mA (extrapolated)
    leak_width_deg: float  # its Gaussian width in 2θ
    absorber_mg_cm2: float  # effective absorber areal density
    scatter_per_s: float = 0.0  # flat scattered radiation at 35 kV and 1 mA

    def replace(self, **changes):
        return dataclasses.replace(self, **changes)

    @property
    def order_reflectivity(self):
        return {1: 1.0, 2: self.r2, 3: self.r3}


# Fitted to leaflet Fig. 4 on 2026-09-24 (notebooks/03_full_spectrum_vs_fig4.ipynb); tau_s fixed.
DEFAULT = ModelParams(
    scale=1.529e5,
    line_to_cont=6.72e-3,
    r2=0.470,
    r3=0.253,
    sigma_deg=0.1203,
    tau_s=1.0e-4,
    leak_amp_per_s=1.46e5,
    leak_width_deg=1.142,
    absorber_mg_cm2=310.0,
    scatter_per_s=6.80,
)


def coupled_betas(lo_deg, hi_deg, step_deg):
    """Target angles β of a coupled scan from ``lo_deg`` to ``hi_deg`` inclusive (degrees)."""
    n = round((hi_deg - lo_deg) / step_deg) + 1
    return np.round(lo_deg + step_deg * np.arange(n), 10)


def _transmission(lambda_pm, params):
    return transmission(lambda_pm, AIR, AIR_MG_CM2) * transmission(
        lambda_pm, ABSORBER, params.absorber_mg_cm2
    )


def _gaussian(x_deg, sigma_deg):
    return np.exp(-0.5 * (x_deg / sigma_deg) ** 2) / (sigma_deg * np.sqrt(2 * np.pi))


def _continuum_density(beta_deg, U_kV, I_mA, params):
    """Σ_n r_n × continuum per degree of θ, convolved with the instrument Gaussian, at β."""
    # Grid on the fixed lattice θ = i·step, so R̄(β) does not depend on which βs are queried
    # together; at least one kernel long, because "same" mode assumes that.
    half = round(KERNEL_HALF_WIDTH_SIGMA * params.sigma_deg / THETA_STEP_DEG)
    i_lo = max(int(np.floor(beta_deg.min() / THETA_STEP_DEG)) - half, 1)
    i_hi = max(int(np.ceil(beta_deg.max() / THETA_STEP_DEG)) + half, i_lo + 2 * half)
    theta = THETA_STEP_DEG * np.arange(i_lo, i_hi + 1)
    density = np.zeros_like(theta)
    for n, r_n in params.order_reflectivity.items():
        lam = lambda_from_theta(theta, n)
        spec = continuum(lam, U_kV, I_mA)
        on = spec > 0
        if on.any():
            density[on] += (
                r_n * spec[on] * _transmission(lam[on], params)
                * dlambda_dtheta_pm_per_deg(theta[on], n) * lorentz_polarization(theta[on])
            )  # fmt: skip
    k = THETA_STEP_DEG * np.arange(-half, half + 1)
    kernel = _gaussian(k, params.sigma_deg)
    smoothed = np.convolve(density, kernel / kernel.sum(), mode="same")
    return np.interp(beta_deg, theta, smoothed)


def _line_density(beta_deg, U_kV, I_mA, params):
    """Σ_n r_n × Mo K line components as Gaussians at their Bragg angles, at β."""
    ka, kb = line_rates(U_kV, I_mA, params.line_to_cont)
    lines = [(lam, ka * f) for lam, f in MO_KA_COMPONENTS] + [
        (lam, kb * f) for lam, f in MO_KB_COMPONENTS
    ]
    out = np.zeros_like(beta_deg)
    for n, r_n in params.order_reflectivity.items():
        for lam, rate in lines:
            theta = theta_from_lambda(lam, n)
            if rate == 0 or np.isnan(theta):
                continue
            weight = r_n * rate * _transmission(lam, params) * lorentz_polarization(theta)
            out += weight * _gaussian(beta_deg - theta, params.sigma_deg)
    return out


def expected_rate(beta_deg, U_kV, I_mA, params=DEFAULT):
    """Expected observed counting rate R̄(β) in counts/s for a coupled scan (deterministic).

    ``beta_deg``: target angles (θ = β, sensor at 2β); ``U_kV``: tube voltage; ``I_mA``:
    emission current. Negative β reflects off the other crystal face, so |β| is used.
    """
    beta = np.asarray(beta_deg, dtype=float)
    if np.any((beta < BETA_MIN_DEG) | (beta > BETA_MAX_DEG)):
        raise ValueError(f"β outside the coupled range {BETA_MIN_DEG}° … {BETA_MAX_DEG}°")
    if U_kV < 0 or I_mA < 0:
        raise ValueError("U_kV and I_mA must be ≥ 0")
    if beta.size == 0:
        return beta
    theta = np.abs(beta)
    tube = I_mA * (U_kV / U_REF_KV) ** 2
    true_rate = tube * (
        params.scatter_per_s
        + params.leak_amp_per_s * np.exp(-0.5 * (2 * theta / params.leak_width_deg) ** 2)
    )
    if I_mA > 0 and U_kV > 0:
        true_rate = true_rate + params.scale * (
            _continuum_density(theta, U_kV, I_mA, params) + _line_density(theta, U_kV, I_mA, params)
        )
    return dead_time(true_rate, params.tau_s)
