"""Evaluation of a measured (or simulated, noisy) coupled scan: LD P6.3.3.1 Tables 3–5.

Mirrors the leaflet's workflow: mark the entire width of each line, take its peak centre with the
software's "Calculate Peak Center", get λ from Bragg's law per order, then average the orders.
Peak centres are centroids above a straight baseline; the leaflet does not say how the LD software
treats the background, so the baseline is our choice. Unlike a Gaussian fit, a centroid of the
whole blend returns the intensity-weighted mean wavelength (Kα1+Kα2, Kβ1,3+Kβ2) that Table 1
quotes, even where Kβ2 separates from Kβ1,3 (from 2nd order on).
"""

import dataclasses

import numpy as np
from scipy.optimize import curve_fit
from scipy.signal import find_peaks

from braggsim.constants import MO_K_EDGE_KEV, MO_KA_PM, MO_KB_COMPONENTS, MO_KB_PM
from braggsim.crystal import dlambda_dtheta_pm_per_deg, lambda_from_theta, theta_from_lambda
from braggsim.source import LINE_EXPONENT_M

# A characteristic line is at most this wide (FWHM ≈ 0.3° at the leaflet's slits); the
# bremsstrahlung hump near 5° is several degrees wide and must not count as a line.
MAX_LINE_FWHM_DEG = 0.8
# Half-width of the marked peak region. It must reach Kβ2, 0.37° below Kβ1,3 in 3rd order, with
# ≈ 2.5σ to spare; much wider windows pick up the curvature of the continuum hump in 1st order.
PEAK_HALF_WINDOW_DEG = 0.7
MIN_PROMINENCE_SIGMA = 5  # in units of the Poisson noise of the rate
MIN_LINE_WIDTH_STEPS = 1.2  # a lone one-step spike is noise; lines span several Δβ steps
# A line (FWHM ≥ 0.28° at the leaflet's slits) needs ≥ 1.2 steps across its FWHM.
MAX_STEP_DEG = 0.23
# Closer peaks are one line's fine structure (Kβ₁,₃–Kβ₂: 0.37° in 3rd order, resolved at small σ);
# the closest distinct lines, Kβ and Kα in 1st order, are 0.81° apart.
MIN_PEAK_SEPARATION_DEG = 0.5
# No Mo K line reflects below 1st-order Kβ₂ (6.32°); a peak further down, with ≈ 2.5σ margin, is
# the bremsstrahlung hump (near 5.4° at 30 kV it is narrow enough to pass the width test).
FIRST_LINE_DEG = float(theta_from_lambda(min(lam for lam, _ in MO_KB_COMPONENTS))) - 0.3
# Pairing checks. A peak paired into the wrong order or line is off by ≥ 30 pm in λ or ≥ 40 % in
# λ(Kβ)/λ(Kα) (0.888, Table 1); these limits stay far below that, but above the honest bias of
# 1st-order Kβ near the K edge (≈ −0.6 pm at 25 kV, PARAMETERS.md).
MAX_ORDER_SPREAD_PM = 3.0
MAX_KB_KA_RATIO_DEV = 0.03
# Line threshold: the 1st-order Kα area is integrated over ±0.5° (rounded to Δβ). The lower end,
# 6.7°, is ≈ 2.3σ above 1st-order Kβ₁,₃; that tail scales with the line, so it rescales the areas
# but does not move the extrapolated U_K.
THRESHOLD_HALF_WINDOW_DEG = 0.5


@dataclasses.dataclass(frozen=True)
class Peak:
    center_deg: float
    center_err_deg: float  # 1σ, propagated from Poisson counting noise
    width_deg: float  # rms width of the marked region (low: the window truncates the tails)
    area: float  # Σ (rate − baseline) · Δβ over the marked region, in 1/s · °
    area_err: float  # 1σ, propagated from Poisson counting noise


def _rate_var(rate_per_s, dt_s):
    """Poisson variance of a displayed rate N/Δt, at least that of one count."""
    return np.maximum(np.asarray(rate_per_s, dtype=float) * dt_s, 1) / dt_s**2


def find_line_peaks(beta_deg, rate_per_s, dt_s):
    """Target angles β (degrees, ascending) of the Mo K line peaks in a scan with step Δt_s.

    A line is a peak 1.2 steps to 0.8° wide, 5σ of counting noise above its surroundings and
    above 6.0°. Of peaks closer than 0.5° only the most prominent is kept (fine structure).
    """
    beta = np.asarray(beta_deg, dtype=float)
    rate = np.asarray(rate_per_s, dtype=float)
    if beta.ndim != 1 or beta.shape != rate.shape:
        raise ValueError("β and the rate must be 1-D arrays of the same length")
    if beta.size < 3:
        raise ValueError("a scan needs at least 3 points to show a peak")
    if not (np.all(np.isfinite(beta)) and np.all(np.isfinite(rate)) and dt_s > 0):
        raise ValueError("β and the rate must be finite numbers and Δt > 0")
    step = beta[1] - beta[0]
    if not (step > 0 and np.allclose(np.diff(beta), step, rtol=1e-6, atol=0)):
        raise ValueError("β must rise in equal steps Δβ, as in an auto-scan")
    if step > MAX_STEP_DEG:
        raise ValueError(
            f"Δβ = {step:g}° is too coarse to resolve the lines: use Δβ ≤ {MAX_STEP_DEG}°"
        )
    idx, props = find_peaks(
        rate,
        prominence=MIN_PROMINENCE_SIGMA * np.sqrt(_rate_var(rate, dt_s)),
        width=(MIN_LINE_WIDTH_STEPS, MAX_LINE_FWHM_DEG / step),
    )
    keep = []
    for i in idx[np.argsort(-props["prominences"], kind="stable")]:
        if beta[i] >= FIRST_LINE_DEG and all(
            abs(beta[i] - beta[j]) >= MIN_PEAK_SEPARATION_DEG for j in keep
        ):
            keep.append(i)
    return beta[np.sort(np.array(keep, dtype=int))]


def peak_center(beta_deg, rate_per_s, dt_s, lo_deg, hi_deg):
    """Centroid, rms width and area of the peak marked from ``lo_deg`` to ``hi_deg`` (inclusive).

    The background is the straight line through the two end points. The error propagates the
    Poisson variance of every point, the end points included through the baseline.
    """
    beta = np.asarray(beta_deg, dtype=float)
    on = (beta >= lo_deg - 1e-9) & (beta <= hi_deg + 1e-9)
    x, y = beta[on], np.asarray(rate_per_s, dtype=float)[on]
    if x.size < 3:
        raise ValueError(f"fewer than 3 points between {lo_deg}° and {hi_deg}°")
    t = (x - x[0]) / (x[-1] - x[0])
    signal = y - ((1 - t) * y[0] + t * y[-1])
    area = signal.sum()
    if area <= 0:
        raise ValueError(f"no peak above the baseline between {lo_deg}° and {hi_deg}°")
    center = (x * signal).sum() / area
    g = (x - center) / area  # ∂center/∂signal
    grad = g.copy()
    grad[0] -= ((1 - t) * g).sum()
    grad[-1] -= (t * g).sum()
    var = _rate_var(y, dt_s)
    err = np.sqrt((grad**2 * var).sum())
    width = np.sqrt(max(((x - center) ** 2 * signal).sum() / area, 0.0))
    step = (x[-1] - x[0]) / (x.size - 1)
    g_area = np.ones_like(x)  # ∂area/∂y, the end points through the baseline
    g_area[0] -= (1 - t).sum()
    g_area[-1] -= t.sum()
    area_err = step * np.sqrt((g_area**2 * var).sum())
    return Peak(float(center), float(err), float(width), float(area * step), float(area_err))


def wavelength_table(beta_deg, rate_per_s, dt_s, half_window_deg=PEAK_HALF_WINDOW_DEG):
    """Rows of LD P6.3.3.1 Tables 3 and 4: one dict per line and order.

    Peaks are paired in ascending angle as (Kβ, Kα) of orders 1, 2, 3, as students count them,
    so the scan must start half_window_deg below the 1st-order Kβ (6.4°) and hold at least two
    orders. Each peak is marked ±half_window_deg, cut at the midpoint to its neighbours.
    Uncertainties are counting statistics only (no goniometer zero error, no uncertainty in d).
    Raises ValueError, with what to change, if the peaks do not form Kβ/Kα pairs (λ ratio 0.888)
    of consecutive orders from n = 1.
    """
    beta = np.asarray(beta_deg, dtype=float)
    peaks = find_line_peaks(beta, rate_per_s, dt_s)
    first_kb_deg = float(theta_from_lambda(MO_KB_PM)) - half_window_deg
    if beta[0] > first_kb_deg:
        raise ValueError(
            f"the scan starts at {beta[0]:g}°: start it below {first_kb_deg:.1f}° so the "
            "1st-order Kβ line is whole"
        )
    if peaks.size < 4 or peaks.size % 2:
        raise ValueError(
            f"found {peaks.size} line peaks, need Kβ/Kα pairs in at least two orders: "
            "raise U well above 20 kV, lengthen Δt, or extend the scan to ≈ 25°"
        )
    mids = (peaks[1:] + peaks[:-1]) / 2
    lo = np.maximum(peaks - half_window_deg, np.r_[-np.inf, mids])
    hi = np.minimum(peaks + half_window_deg, np.r_[mids, np.inf])
    rows = []
    for i, (a, b) in enumerate(zip(lo, hi, strict=True)):
        peak = peak_center(beta_deg, rate_per_s, dt_s, a, b)
        n = i // 2 + 1
        rows.append(
            {
                "n": n,
                "line": ("Kb", "Ka")[i % 2],
                "theta_deg": peak.center_deg,
                "theta_err_deg": peak.center_err_deg,
                "width_deg": peak.width_deg,
                "lambda_pm": float(lambda_from_theta(peak.center_deg, n)),
                "lambda_err_pm": float(
                    dlambda_dtheta_pm_per_deg(peak.center_deg, n) * peak.center_err_deg
                ),
            }
        )
    for line in ("Ka", "Kb"):
        lam = [r["lambda_pm"] for r in rows if r["line"] == line]
        if not np.ptp(lam) <= MAX_ORDER_SPREAD_PM:
            raise ValueError(
                f"λ({line}) spreads {np.ptp(lam):.1f} pm over the orders, so the peaks are not "
                "Kβ/Kα pairs of consecutive orders: check for missing or extra peaks"
            )
    for kb, ka in zip(rows[::2], rows[1::2], strict=True):
        ratio = kb["lambda_pm"] / ka["lambda_pm"]
        if not abs(ratio / (MO_KB_PM / MO_KA_PM) - 1) <= MAX_KB_KA_RATIO_DEV:
            raise ValueError(
                f"order {kb['n']}: λ ratio {ratio:.3f} of the peak pair is not Kβ/Kα "
                f"({MO_KB_PM / MO_KA_PM:.3f})"
            )
    return rows


def order_means_pm(rows):
    """LD P6.3.3.1 Table 5: plain mean of λ over the orders, per line, as {line: (mean, 1σ)}."""
    out = {}
    for line in ("Ka", "Kb"):
        lam = np.array([r["lambda_pm"] for r in rows if r["line"] == line])
        err = np.array([r["lambda_err_pm"] for r in rows if r["line"] == line])
        out[line] = (float(lam.mean()), float(np.sqrt((err**2).sum()) / lam.size))
    return out


def line_threshold_kv(U_kV, area, area_err):
    """Voltage U_K (kV) where a characteristic line starts, from its peak areas at several U.

    Fits area = A · (U/U_K − 1)^m with A, U_K and m free (weighted by ``area_err``) and returns
    ``(U_K, U_K_err, m, m_err)``, 1σ. This extrapolates the area to zero, as the Phase 9 answer key
    asks; the first U with a *visible* peak lies well above U_K because the line rises as a power
    m ≈ 1.67 (Green & Cosslett 1968, source.py). U_K and m are strongly anti-correlated, so a free
    m dominates U_K_err; fixing m would make U_K look more precise than it is.

    Bias budget on the model's noise-free 1st-order Kα, 22–35 kV (test_analysis.py): the straight
    baseline under the curved continuum −0.18 kV; GM dead time (τ = 100 µs) +0.10 kV at 0.1 mA,
    +0.70 kV at 1 mA, where it also drags m to ≈ 1.35. So sweep at ≈ 0.1 mA.
    The fit recovers the model's own input law: it checks the method, not the physics near U_K,
    where the real thick-target yield need not be a pure power law.
    """
    U = np.asarray(U_kV, dtype=float)
    a = np.asarray(area, dtype=float)
    e = np.asarray(area_err, dtype=float)
    if U.ndim != 1 or U.shape != a.shape or a.shape != e.shape or U.size < 4:
        raise ValueError("need U, area and area_err as 1-D arrays of the same length, at least 4")
    if not (np.all(np.isfinite(U)) and np.all(np.isfinite(a)) and np.all(e > 0)):
        raise ValueError("U and the areas must be finite and every area_err > 0")

    def model(u, amp, u_k, m):
        return amp * np.clip(u / u_k - 1, 0, None) ** m

    # The start uses the known edge and exponent (convergence only; all three are free). The bounds
    # keep U_K below every swept U, where the clipped model would have no gradient, and m physical.
    i = np.argmax(U)
    p0 = (a[i] / (U[i] / MO_K_EDGE_KEV - 1) ** LINE_EXPONENT_M, MO_K_EDGE_KEV, LINE_EXPONENT_M)
    bounds = ([0, 0, 0.5], [np.inf, U.min() * (1 - 1e-6), 4])
    p, cov = curve_fit(model, U, a, p0=p0, sigma=e, absolute_sigma=True, bounds=bounds)
    return float(p[1]), float(np.sqrt(cov[1, 1])), float(p[2]), float(np.sqrt(cov[2, 2]))
