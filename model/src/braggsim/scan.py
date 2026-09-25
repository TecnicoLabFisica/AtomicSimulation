"""Coupled 2:1 scan: the expected counting rate R̄(β) the GM counter sees (no noise).

In COUPLED mode the target (crystal) sits at β = θ and the sensor arm at 2θ (LD 554 800).
SENSOR and TARGET scans pass the sensor angle separately (``expected_rate(..., sensor_deg)``).
R̄(β) = dead_time( scale · Σ_n r_n [continuum_n + lines_n](β) + leak(β) + scatter ):
- r_n: strength of order n from the NaCl structure factor and one Debye–Waller factor;
- continuum_n: Kramers spectrum at λ_n(θ), times absorber transmission, the Jacobian
  dλ/dθ and the Lorentz-polarization factor, convolved with the instrument Gaussian σ;
- lines_n: Mo Kα1,2 / Kβ1,3 / Kβ2 δ-lines, same factors, as Gaussians at their Bragg angles;
- leak: tail of the direct beam reaching the counter at small 2θ;
- scatter: flat scattered radiation (air, crystal, housing).
Leak and scatter both follow the tube as I·S(U), the photon rate leaving it (``tube_factor``);
Fig. 4 (35 kV only) cannot test that. With the tube off R̄ = 0; the GM natural background
(≲ 1/s) is neglected.
Every fitted value in ``DEFAULT`` is documented in model/PARAMETERS.md.
"""

import dataclasses
import math

import numpy as np

from braggsim.constants import D_NACL_PM, MO_KA_COMPONENTS, MO_KB_COMPONENTS
from braggsim.crystal import (
    dlambda_dtheta_pm_per_deg,
    lambda_from_theta,
    lorentz_polarization,
    structure_factor_sq_rel,
    theta_from_lambda,
)
from braggsim.detector import dead_time
from braggsim.filters import MU_RHO_GRID_PM, transmission
from braggsim.source import continuum, lambda_min_pm, line_rates

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
# The target arm turns without limit.
SENSOR_MIN_DEG, SENSOR_MAX_DEG = -10.0, 170.0
BETA_MIN_DEG, BETA_MAX_DEG = SENSOR_MIN_DEG / 2, SENSOR_MAX_DEG / 2
U_MAX_KV, I_MAX_MA = 35.0, 1.0  # LD 554 800 tube limits
# Highest order that can reach the counter: n λ_min(35 kV) ≤ 2d sin 85° gives n = 15.
MAX_ORDER = int(2 * D_NACL_PM * math.sin(math.radians(BETA_MAX_DEG)) / lambda_min_pm(U_MAX_KV))
# The 554 800 tops out at 3600 steps (0.1° over 360°); far above that is a units mistake.
MAX_SCAN_STEPS = 100_000
THETA_STEP_DEG = 0.01  # internal grid for the continuum convolution
KERNEL_HALF_WIDTH_SIGMA = 6


@dataclasses.dataclass(frozen=True)
class ModelParams:
    scale: float  # counts/s per relative source unit
    line_to_cont: float  # Kα line strength relative to the continuum (1/pm)
    debye_waller_pm2: float  # effective B of exp(−2B s²), weakening the higher orders
    sigma_deg: float  # Gaussian angular resolution at s1 ≈ 5 cm, s2 ≈ 6 cm
    tau_s: float  # GM dead time
    leak_amp_per_s: float  # direct-beam halo at 2θ = 0, at 35 kV and 1 mA (extrapolated)
    leak_width_deg: float  # its Gaussian width in 2θ
    absorber_mg_cm2: float  # effective absorber areal density
    scatter_per_s: float = 0.0  # flat scattered radiation at 35 kV and 1 mA

    def __post_init__(self):
        values = dataclasses.asdict(self)
        if not all(math.isfinite(v) and v >= 0 for v in values.values()):
            raise ValueError(f"model parameters must be finite and ≥ 0: {values}")
        if self.sigma_deg == 0 or self.leak_width_deg == 0:
            raise ValueError("sigma_deg and leak_width_deg must be > 0")

    def replace(self, **changes):
        return dataclasses.replace(self, **changes)

    @property
    def order_reflectivity(self):
        """{n: r_n} relative to n = 1: r_n = |F_n|²/|F_1|² · exp(−2B (s_n² − s_1²)), s_n = n/(2d)
        in pm⁻¹ (Debye–Waller factor, Warren ch. 3). Orders with n λ > 2d are skipped later."""
        s1_sq = (1 / (2 * D_NACL_PM)) ** 2
        return {
            n: f * math.exp(-2 * self.debye_waller_pm2 * (n * n - 1) * s1_sq)
            for n, f in enumerate(structure_factor_sq_rel(MAX_ORDER), start=1)
        }


# Fitted to leaflet Fig. 4 on 2026-09-25 (notebooks/03_full_spectrum_vs_fig4.ipynb); tau_s fixed.
DEFAULT = ModelParams(
    scale=1.676e5,
    line_to_cont=7.43e-3,
    debye_waller_pm2=6.26e3,
    sigma_deg=0.1228,
    tau_s=1.0e-4,
    leak_amp_per_s=1.18e5,
    leak_width_deg=1.161,
    absorber_mg_cm2=326.0,
    scatter_per_s=5.54,
)


def coupled_betas(lo_deg, hi_deg, step_deg):
    """Target angles β of a coupled scan from ``lo_deg`` in steps of ``step_deg`` up to at most
    ``hi_deg`` (degrees). ``np.round`` trims float noise; it rounds ties to even."""
    if not (math.isfinite(lo_deg) and math.isfinite(hi_deg) and step_deg > 0 and hi_deg >= lo_deg):
        raise ValueError("a scan needs Δβ > 0 and upper limit ≥ lower limit (LD 554 800)")
    n = int(np.floor((hi_deg - lo_deg) / step_deg + 1e-9)) + 1  # 1e-9: 0.3/0.1 = 2.9999…
    if n > MAX_SCAN_STEPS:
        raise ValueError(f"{n} steps: a scan has at most {MAX_SCAN_STEPS}")
    # np.minimum: the 1e-9 slack must never put the last β past the limit.
    return np.minimum(np.round(lo_deg + step_deg * np.arange(n), 10), hi_deg)


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
    # ceil, not round: no tie-breaking rule (half-even vs half-up) for a port to get wrong.
    half = math.ceil(KERNEL_HALF_WIDTH_SIGMA * params.sigma_deg / THETA_STEP_DEG)
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


def _photons_out(U_kV, params):
    """Kramers continuum plus Mo K lines leaving the tube through the absorber, per mA."""
    lam = MU_RHO_GRID_PM
    total = np.trapezoid(continuum(lam, U_kV, 1.0) * _transmission(lam, params), lam)
    ka, kb = line_rates(U_kV, 1.0, params.line_to_cont)
    for rate, components in ((ka, MO_KA_COMPONENTS), (kb, MO_KB_COMPONENTS)):
        for lam_pm, fraction in components:
            total += rate * fraction * float(_transmission(lam_pm, params))
    return total


def tube_factor(U_kV, I_mA, params=DEFAULT):
    """I · S(U): how leak and scatter follow the tube, 1 at 35 kV and 1 mA.

    S(U) is the photon rate leaving the tube through the absorber, Kramers continuum
    (trapezoid rule on the fixed μ/ρ grid) plus Mo K lines, relative to 35 kV. No free
    parameter; only its 35 kV value is tested by Fig. 4 (model/PARAMETERS.md).
    """
    if I_mA == 0 or U_kV == 0:
        return 0.0
    return I_mA * float(_photons_out(U_kV, params) / _photons_out(U_REF_KV, params))


def expected_rate(beta_deg, U_kV, I_mA, params=DEFAULT, sensor_deg=None):
    """Expected observed counting rate R̄ in counts/s (deterministic).

    ``beta_deg``: target (crystal) angles; ``U_kV``: tube voltage; ``I_mA``: emission current.
    ``sensor_deg``: sensor arm angles, same shape as β; ``None`` is the 2:1 coupled scan
    (sensor at 2β). Negative angles reflect off the other crystal face.

    A photon reaching the sensor at angle S left the lattice planes at incidence S/2, so the
    reflected spectrum is that of θ = |S|/2 whatever the target angle. A target off S/2 by
    ε = S/2 − β only weakens it, by exp(−½ (ε/σ)²): the rocking curve, given the same width σ
    as the coupled line profile (no new parameter; model/PARAMETERS.md). The direct-beam leak
    depends on the sensor alone and scatter on neither.
    """
    beta = np.asarray(beta_deg, dtype=float)
    if sensor_deg is None:
        if not np.all((beta >= BETA_MIN_DEG) & (beta <= BETA_MAX_DEG)):  # NaN fails too
            raise ValueError(f"β outside the coupled range {BETA_MIN_DEG}° … {BETA_MAX_DEG}°")
        sensor = 2 * beta
    else:
        sensor = np.asarray(sensor_deg, dtype=float)
        if sensor.shape != beta.shape or not np.all(np.isfinite(beta)):
            raise ValueError("target and sensor angles must be finite arrays of the same shape")
        if not np.all((sensor >= SENSOR_MIN_DEG) & (sensor <= SENSOR_MAX_DEG)):
            raise ValueError(f"sensor outside its range {SENSOR_MIN_DEG}° … {SENSOR_MAX_DEG}°")
        beta = (beta + 180) % 360 - 180  # the target arm turns without limit
    if not (0 <= U_kV <= U_MAX_KV and 0 <= I_mA <= I_MAX_MA):  # NaN fails too
        raise ValueError(f"U_kV must be in 0 … {U_MAX_KV}, I_mA in 0 … {I_MAX_MA} (LD 554 800)")
    if beta.size == 0:
        return beta
    theta = np.abs(sensor) / 2
    true_rate = tube_factor(U_kV, I_mA, params) * (
        params.scatter_per_s
        + params.leak_amp_per_s * np.exp(-0.5 * (sensor / params.leak_width_deg) ** 2)
    )
    if I_mA > 0 and U_kV > 0:
        rocking = np.exp(-0.5 * ((sensor / 2 - beta) / params.sigma_deg) ** 2)
        true_rate = true_rate + params.scale * rocking * (
            _continuum_density(theta, U_kV, I_mA, params) + _line_density(theta, U_kV, I_mA, params)
        )
    return dead_time(true_rate, params.tau_s)
