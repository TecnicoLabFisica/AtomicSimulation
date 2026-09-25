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
from scipy.signal import find_peaks

from braggsim.crystal import dlambda_dtheta_pm_per_deg, lambda_from_theta

# A characteristic line is at most this wide (FWHM ≈ 0.3° at the leaflet's slits); the
# bremsstrahlung hump near 5° is several degrees wide and must not count as a line.
MAX_LINE_FWHM_DEG = 0.8
# Half-width of the marked peak region. It must reach Kβ2, 0.37° below Kβ1,3 in 3rd order, with
# ≈ 2.5σ to spare; much wider windows pick up the curvature of the continuum hump in 1st order.
PEAK_HALF_WINDOW_DEG = 0.7
MIN_PROMINENCE_SIGMA = 5  # in units of the Poisson noise of the rate
MIN_LINE_WIDTH_STEPS = 1.5  # a lone one-step spike is noise; lines span several Δβ steps
# One line's λ must agree across orders to this (pm); a larger spread means the peaks were paired
# into the wrong orders (the scan missed one).
MAX_ORDER_SPREAD_PM = 1.0


@dataclasses.dataclass(frozen=True)
class Peak:
    center_deg: float
    center_err_deg: float  # 1σ, propagated from Poisson counting noise
    width_deg: float  # rms width of the marked region (low: the window truncates the tails)


def _rate_var(rate_per_s, dt_s):
    """Poisson variance of a displayed rate N/Δt, at least that of one count."""
    return np.maximum(np.asarray(rate_per_s, dtype=float) * dt_s, 1) / dt_s**2


def find_line_peaks(beta_deg, rate_per_s, dt_s):
    """Target angles β (degrees, ascending) of the narrow line peaks in a scan with step Δt_s."""
    beta = np.asarray(beta_deg, dtype=float)
    if beta.size < 3:
        raise ValueError("a scan needs at least 3 points to show a peak")
    step = beta[1] - beta[0]
    idx, _ = find_peaks(
        rate_per_s,
        prominence=MIN_PROMINENCE_SIGMA * np.sqrt(_rate_var(rate_per_s, dt_s)),
        width=(MIN_LINE_WIDTH_STEPS, MAX_LINE_FWHM_DEG / step),
    )
    return beta[idx]


def peak_center(beta_deg, rate_per_s, dt_s, lo_deg, hi_deg):
    """Centroid and rms width of the peak marked from ``lo_deg`` to ``hi_deg`` (inclusive).

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
    err = np.sqrt((grad**2 * _rate_var(y, dt_s)).sum())
    width = np.sqrt(max(((x - center) ** 2 * signal).sum() / area, 0.0))
    return Peak(float(center), float(err), float(width))


def wavelength_table(beta_deg, rate_per_s, dt_s, half_window_deg=PEAK_HALF_WINDOW_DEG):
    """Rows of LD P6.3.3.1 Tables 3 and 4: one dict per line and order.

    Peaks are paired in ascending angle as (Kβ, Kα) of orders 1, 2, 3, as students count them,
    so the scan must start below the 1st-order Kβ (6.4°). Each peak is marked ±half_window_deg,
    cut at the midpoint to its neighbours. Uncertainties are counting statistics only (no
    goniometer zero error, no uncertainty in d). Raises ValueError if the peaks do not form Kβ/Kα
    pairs of consecutive orders from n = 1.
    """
    peaks = find_line_peaks(beta_deg, rate_per_s, dt_s)
    if peaks.size == 0 or peaks.size % 2:
        raise ValueError(f"expected Kβ/Kα pairs, found {peaks.size} line peaks")
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
        if np.ptp(lam) > MAX_ORDER_SPREAD_PM:
            raise ValueError(
                f"λ({line}) spreads {np.ptp(lam):.1f} pm over the orders: the scan must start "
                "below the 1st-order Kβ and contain whole Kβ/Kα pairs"
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
