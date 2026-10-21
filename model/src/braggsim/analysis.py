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
from scipy.special import ndtr

from braggsim.constants import D_NACL_PM, MO_K_EDGE_KEV, MO_KA_PM, MO_KB_COMPONENTS, MO_KB_PM
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
# Absorption edge (Moseley, EPN Práctica 5). The coarse search compares the mean transmission in the
# 0.3° (3 steps at Δβ = 0.1°) on each side of every split; 0.3° is about 2.4σ of the instrument
# width, wide enough to average noise and narrow enough that the two sides see only one edge. The
# fine fit then runs over ±0.5° around the coarse position, ≈ 4σ either side of the step.
EDGE_SPLIT_HALF_WINDOW_DEG = 0.3
EDGE_FIT_HALF_WINDOW_DEG = 0.5
# Coarsest step Δβ that ``k_edge_deg`` accepts. At Δβ ≥ 0.16° the 0.3° split window holds only one
# point per side (it needs two) and the ±0.5° fit window fewer than 6 points; 0.15° is the largest
# step of the 0.05° grid that still gives 2 points per side and 7 in the fit. Checked in
# test_analysis (Δβ = 0.15° works, 0.2° is refused).
MAX_EDGE_STEP_DEG = 0.15


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


def k_edge_deg(beta_deg, rate_open_per_s, rate_foil_per_s, dt_s):
    """Angle β (degrees) of a foil's K absorption edge and its 1σ error, from two coupled scans.

    Method of EPN Práctica 5 (and the LD "Moseley's law" experiment): scan once without and once
    with the foil at the sensor and look at T = R_foil / R_open. Going up in β the wavelength grows
    and T *rises* at the K edge, where the foil stops absorbing strongly. The edge is located in
    two steps. Coarse: for every split, the weighted mean T over the next 0.3° against the mean
    over the previous 0.3°; the split with the most significant rise wins and must stand
    ``MIN_PROMINENCE_SIGMA`` above noise. Fine: a weighted fit of the model
    below over ±0.5° around it. The error is √cov of β_e, with σ_T propagated from the Poisson
    variance of both scans.

    The fine model is the exact Gaussian convolution of a step of height h at β_e whose plateau
    has its own linear slope s above the edge, on a linear background c0 + c1 x (x = β − β_e):
    T = c0 + c1 x + h Φ(x/w) + s (x Φ(x/w) + w φ(x/w)), with Φ the normal CDF and φ its density.

    Resolution bias: the counter sees each spectrum convolved with the instrument Gaussian, so T is
    a ratio of two convolved spectra, not a convolved T. The steep open spectrum next to the Mo
    lines (Zr beside Kα, Mo beside Kβ) pulls the steepest rise of T a few hundredths of a degree
    below θ(λ_K) (Zr, Mo ≈ −0.04°; Ag, In ≈ −0.01°; PARAMETERS.md, "Moseley analysis"). It is not
    removed. The rates are the displayed (observed, dead-time-affected) ones, as the students take
    them; their dead time adds ≤ 0.006° (the sign varies by foil), and leak, scatter and background
    are negligible (< 0.0003°). The four foil scans share one open scan, so their edges are
    slightly correlated (up to ≈ 40 % of T's variance on the Zr plateau); ``moseley_fit`` treats
    them as independent.
    """
    beta = np.asarray(beta_deg, dtype=float)
    r_open = np.asarray(rate_open_per_s, dtype=float)
    r_foil = np.asarray(rate_foil_per_s, dtype=float)
    if beta.ndim != 1 or beta.shape != r_open.shape or beta.shape != r_foil.shape:
        raise ValueError("β and both rates must be 1-D arrays of the same length")
    if beta.size < 8:
        raise ValueError("an edge scan needs at least 8 points")
    if np.median(np.diff(beta)) > MAX_EDGE_STEP_DEG + 1e-9:
        raise ValueError(
            f"Δβ too coarse for an edge: median step {np.median(np.diff(beta)):.3f}° "
            f"> {MAX_EDGE_STEP_DEG}°"
        )
    if not (
        np.all(np.isfinite(beta))
        and np.all(np.isfinite(r_open))
        and np.all(np.isfinite(r_foil))
        and dt_s > 0
    ):
        raise ValueError("β and the rates must be finite numbers and Δt > 0")
    if np.any(r_open <= 0):
        raise ValueError("the open scan must have a positive rate at every β")
    T = r_foil / r_open
    sig = np.sqrt(_rate_var(r_foil, dt_s) + T**2 * _rate_var(r_open, dt_s)) / r_open
    w = 1 / sig**2

    def side_mean(sel):
        return np.sum(w[sel] * T[sel]) / np.sum(w[sel]), 1 / np.sqrt(np.sum(w[sel]))

    best, best_sig = None, 0.0
    h = EDGE_SPLIT_HALF_WINDOW_DEG + 1e-9
    for k in range(beta.size):
        lo = (beta >= beta[k] - h) & (beta < beta[k])
        hi = (beta > beta[k]) & (beta <= beta[k] + h)
        if lo.sum() < 2 or hi.sum() < 2:
            continue
        (m_lo, e_lo), (m_hi, e_hi) = side_mean(lo), side_mean(hi)
        z = (m_hi - m_lo) / np.hypot(e_lo, e_hi)
        if z > best_sig:
            best, best_sig = k, z
    if best is None or best_sig < MIN_PROMINENCE_SIGMA:
        raise ValueError(
            f"no rise of the transmission above {MIN_PROMINENCE_SIGMA}σ: is the foil in the beam?"
        )
    on = np.abs(beta - beta[best]) <= EDGE_FIT_HALF_WINDOW_DEG + 1e-9
    if on.sum() < 6:
        raise ValueError("fewer than 6 points around the edge; widen the scan")
    x, y, e = beta[on], T[on], sig[on]

    def model(b, c0, c1, b_e, width, height, slope):
        x_ = b - b_e
        u = x_ / width
        phi = np.exp(-0.5 * u**2) / np.sqrt(2 * np.pi)
        return c0 + c1 * x_ + height * ndtr(u) + slope * (x_ * ndtr(u) + width * phi)

    # Start: levels from the side means; the edge at the coarse split. Bounds keep the width
    # positive (0.02° to 1°) and the step a rise, the edge inside the window.
    dh = (
        side_mean((beta > beta[best]) & (beta <= beta[best] + h))[0]
        - side_mean((beta >= beta[best] - h) & (beta < beta[best]))[0]
    )
    p0 = (y[0], 0.0, beta[best], 0.12, max(dh, 1e-3), 0.0)
    bounds = (
        [-np.inf, -np.inf, x[0], 0.02, 0.0, -np.inf],
        [np.inf, np.inf, x[-1], 1.0, np.inf, np.inf],
    )
    p, cov = curve_fit(model, x, y, p0=p0, sigma=e, absolute_sigma=True, bounds=bounds)
    return float(p[2]), float(np.sqrt(cov[2, 2]))


def moseley_fit(Z, lambda_K_pm, lambda_err_pm=None):
    """Rydberg constant and K screening constant from the K edges of several elements.

    Moseley's law for the K edge, 1/λ = R (Z − σ_K)², is the line √(1/λ) = k Z + c with
    k = √R and σ_K = −c/k. With ``lambda_err_pm`` the fit is weighted by the propagated error of
    √(1/λ) (absolute errors); without it the points weigh equally and the errors are scaled by
    the residuals. Returns ``(R_per_m, R_err_per_m, sigma_K, sigma_K_err, chi2_dof)``, 1σ, from the
    full 2×2 covariance (k and c are strongly correlated). ``chi2_dof`` is the weighted χ² per
    degree of freedom (N − 2) of the line; it is NaN for the unweighted fit, whose errors are
    already scaled by the residuals. The quoted errors are the counting errors alone: a χ²/dof
    well above 1 means the edges do not lie exactly on a line (real edges are not hydrogen-like,
    and the instrument bias differs between foils), which the ± does not include.

    Source: EPN Práctica 5; LD "Moseley's law" experiment. Real K edges do not follow the simple
    formula exactly: R from tabulated xraylib edges comes out 0.987 R∞ (1.3 % low; R∞ =
    ``constants.R_INF_PER_M``, CODATA 2022) with σ_K ≈ 3.41. The straight line absorbs two
    Z-dependent effects of opposite sign: relativistic binding alone would raise R (a Dirac 1s fit
    with constant σ gives ≈ 1.07 R∞), and outer-electron screening that grows with Z outweighs it.
    Compare σ_K with LD's "lit. 3.6" only with care: that is the kind of value one gets with R
    fixed at R∞ (3.63–3.70 per element from the tabulated edges), whereas in a free fit R and σ_K
    are strongly correlated, so a lower R goes with a lower σ_K. LD's 1.056e7 m⁻¹ / 2.7 lies along
    the same correlation.
    """
    Z = np.asarray(Z, dtype=float)
    lam_m = np.asarray(lambda_K_pm, dtype=float) * 1e-12
    if Z.ndim != 1 or Z.shape != lam_m.shape or Z.size < 3:
        raise ValueError("need Z and λ_K as 1-D arrays of the same length, at least 3 points")
    if not (np.all(np.isfinite(Z)) and np.all(np.isfinite(lam_m)) and np.all(lam_m > 0)):
        raise ValueError("Z and λ_K must be finite and λ_K > 0")
    y = 1 / np.sqrt(lam_m)
    A = np.column_stack([Z, np.ones_like(Z)])
    if lambda_err_pm is None:
        W = np.ones_like(Z)
    else:
        err = np.asarray(lambda_err_pm, dtype=float) * 1e-12
        if err.shape != Z.shape or not (np.all(np.isfinite(err)) and np.all(err > 0)):
            raise ValueError("lambda_err_pm must match Z, be finite and > 0")
        sy = 0.5 * y * err / lam_m  # y = λ^(-1/2): σ_y = ½ y σ_λ/λ
        W = 1 / sy**2
    cov = np.linalg.inv(A.T @ (A * W[:, None]))
    k, c = cov @ (A.T @ (W * y))
    if lambda_err_pm is None:
        resid = y - (k * Z + c)
        cov = cov * np.sum(resid**2) / (Z.size - 2)
    # σ_K = −c/k and R = k², with the k–c covariance in the gradients.
    g_s = np.array([c / k**2, -1 / k])
    sigma_err = np.sqrt(g_s @ cov @ g_s)
    chi2_dof = (
        np.nan
        if lambda_err_pm is None
        else float(np.sum(W * (y - (k * Z + c)) ** 2) / (Z.size - 2))
    )
    return float(k**2), float(2 * k * np.sqrt(cov[0, 0])), float(-c / k), float(sigma_err), chi2_dof


def edge_wavelength_table(beta_deg, rate_open_per_s, foil_rates_per_s, dt_s, d_pm=D_NACL_PM):
    """K edge of each foil in ``foil_rates_per_s`` ({element: rate}) against one open scan.

    One dict per foil, in input order: ``element``, ``theta_deg`` and ``theta_err_deg`` from
    ``k_edge_deg``, and ``lambda_pm`` / ``lambda_err_pm`` by Bragg's law (1st order, lattice
    spacing ``d_pm`` of the crystal the scans used: ``crystal.d_pm(LIF)`` for the LiF variant) with
    the error propagated through dλ/dθ. These feed ``moseley_fit``.
    """
    rows = []
    for element, rate in foil_rates_per_s.items():
        theta, err = k_edge_deg(beta_deg, rate_open_per_s, rate, dt_s)
        rows.append(
            {
                "element": element,
                "theta_deg": theta,
                "theta_err_deg": err,
                "lambda_pm": float(lambda_from_theta(theta, 1, d_pm)),
                "lambda_err_pm": float(abs(dlambda_dtheta_pm_per_deg(theta, 1, d_pm)) * err),
            }
        )
    return rows


@dataclasses.dataclass(frozen=True)
class AttenuationFit:
    mu_per_mm: float  # effective linear attenuation coefficient, 1/mm
    mu_err_per_mm: float  # 1σ: point counting errors plus the common R0 (and background) error
    chi2_dof: float  # weighted χ² per degree of freedom (N − 1) of ln T = −μ d, point errors only
    T: np.ndarray  # background-subtracted transmission of each point
    T_err: np.ndarray  # 1σ of each T
    mu_eff_per_mm: np.ndarray  # −ln T_i / d_i, 1/mm: the slope up to point i, shows curvature


def attenuation_fit(
    d_mm, rate_per_s, rate0_per_s, dt_s, dt0_s=None, background_per_s=0.0, background_dt_s=None
):
    """Attenuation coefficient μ from the rates behind absorbers of thickness ``d_mm``.

    Lambert's law ln T = −μ d with T_i = (R_i − b)/(R0 − b): R0 is the open-beam rate, b the
    background run (tube off). The line is fitted **through the origin** (T(0) = 1 by definition),
    weighted by the Poisson variance of each R_i (``dt_s``: scalar or one gate per point). The
    errors of R0 (``dt0_s``) and of b (``background_dt_s``) are common to every point, so they are
    propagated as correlated terms, not as extra weights: a shift δ in ln(R0 − b) moves μ by
    δ Σw d / Σw d². Without ``dt0_s`` or ``background_dt_s`` that quantity is treated as exact.
    Returns an ``AttenuationFit``: μ in 1/mm with its 1σ error, χ²/dof, and per point T, its error
    and μ_eff,i = −ln T_i / d_i.

    Source: EPN Práctica 1. Caveats: (1) the beam is polychromatic (Mo K lines on a bremsstrahlung
    continuum) and the soft part is absorbed first, so ln T vs d curves upward (beam hardening);
    μ is then an effective value that depends on the d range, and μ_eff,i falls with d. A
    monochromatic beam gives a straight line. (2) The counter's dead time is NOT corrected here:
    the GM is non-paralysable, R_obs = R/(1 + Rτ) (``detector.dead_time``), so rates near
    1000/s are low by ≈ 10 % and bend the data; correct with ``detector.dead_time_correct`` first
    if that matters. Mass coefficient: μ/ρ [cm²/g] = 10 · μ [1/mm] / ρ [g/cm³].
    """
    d = np.asarray(d_mm, dtype=float)
    r = np.asarray(rate_per_s, dtype=float)
    if d.ndim != 1 or d.shape != r.shape:
        raise ValueError("d_mm and rate_per_s must be 1-D arrays of the same length")
    if d.size < 2:
        raise ValueError("need at least 2 points")
    dt = np.broadcast_to(np.asarray(dt_s, dtype=float), d.shape)
    if dt.shape != d.shape:
        raise ValueError("dt_s must be a scalar or match d_mm")
    scalars = [rate0_per_s, background_per_s] + [
        x for x in (dt0_s, background_dt_s) if x is not None
    ]
    if not (
        np.all(np.isfinite(d))
        and np.all(np.isfinite(r))
        and np.all(np.isfinite(dt))
        and np.all(np.isfinite(np.asarray(scalars, dtype=float)))
    ):
        raise ValueError("all inputs must be finite")
    if np.any(d <= 0):
        raise ValueError("d_mm must be > 0 (the open beam is R0, not a point)")
    if np.any(dt <= 0) or (dt0_s is not None and dt0_s <= 0):
        raise ValueError("counting times must be > 0")
    if background_dt_s is not None and background_dt_s <= 0:
        raise ValueError("counting times must be > 0")
    if background_per_s < 0:
        raise ValueError("background_per_s must be >= 0")
    b, r0 = float(background_per_s), float(rate0_per_s)
    if r0 - b <= 0 or np.any(r - b <= 0):
        raise ValueError("a rate is at or below the background: no transmission to take a log of")
    net, net0 = r - b, r0 - b
    T = net / net0
    var_r = _rate_var(r, dt)
    var0 = 0.0 if dt0_s is None else float(_rate_var(r0, dt0_s))
    var_b = 0.0 if background_dt_s is None else float(_rate_var(b, background_dt_s))
    y = np.log(T)
    w = 1 / (var_r / net**2)  # independent part of σ(ln T_i)
    s_dd = np.sum(w * d * d)
    mu = -float(np.sum(w * d * y) / s_dd)
    # Gradients of μ = −Σ w d y / Σ w d² (w fixed): y_i depends on R_0 and b through ln(R0 − b).
    g0 = float(np.sum(w * d) / s_dd) / net0  # dμ/dR0
    gb = float(np.sum(-w * d / s_dd * (-1 / net + 1 / net0)))  # dμ/db
    var_mu = 1 / s_dd + g0**2 * var0 + gb**2 * var_b
    chi2_dof = float(np.sum(w * (y + mu * d) ** 2) / (d.size - 1))
    var_T = var_r / net0**2 + T**2 * var0 / net0**2 + ((r - r0) / net0**2) ** 2 * var_b
    return AttenuationFit(
        mu_per_mm=mu,
        mu_err_per_mm=float(np.sqrt(var_mu)),
        chi2_dof=chi2_dof,
        T=T,
        T_err=np.sqrt(var_T),
        mu_eff_per_mm=-y / d,
    )


def scaled_transmission(
    rate_per_s,
    rate_open_per_s,
    I_mA,
    I_open_mA,
    dt_s,
    dt_open_s,
    background_per_s=0.0,
    background_dt_s=None,
    tau_s=0.0,
):
    """Transmission T and its 1σ error of an absorber read at ``I_mA`` against an open beam read at
    ``I_open_mA`` (EPN Práctica 1, run 2a: heavy plates at 1 mA, open beam at 0.02 mA).

    Both observed rates are first corrected for the counter's dead time (``tau_s``, non-paralyzable,
    ``detector.dead_time_correct``), then the background (a true rate) is subtracted, and the open
    beam is scaled by I/I_open, since the tube emission is linear in the current. So
    T = (A − b)/((B − b) · I/I_open) with A, B the true rates. The error combines the Poisson
    variance of each reading, multiplied by the dead-time Jacobian dR/dR_obs = 1/(1 − R_obs τ)², and
    the background error (``background_dt_s``; exact if None), which is common to both rates.
    Raises ValueError if a rate is at or below the background or at or above 1/τ.

    Caveat: the Poisson variance used here is that of the counts. A real dead-time-limited GM is
    sub-Poissonian (variance ≈ N (1 − Rτ)²), which roughly cancels the Jacobian, so these errors
    are conservative for the open beam at ≈ 0.3 R τ.
    """
    r = np.asarray(rate_per_s, dtype=float)
    r0 = np.asarray(rate_open_per_s, dtype=float)
    b = float(background_per_s)
    if not (np.all(np.isfinite(r)) and np.all(np.isfinite(r0)) and np.isfinite(b)):
        raise ValueError("all inputs must be finite")
    if I_mA <= 0 or I_open_mA <= 0 or np.any(np.asarray(dt_s) <= 0) or dt_open_s <= 0:
        raise ValueError("currents and counting times must be > 0")
    if b < 0 or tau_s < 0:
        raise ValueError("background_per_s and tau_s must be >= 0")
    if background_dt_s is not None and background_dt_s <= 0:
        raise ValueError("counting times must be > 0")
    if np.any(r * tau_s >= 1) or np.any(r0 * tau_s >= 1):
        raise ValueError("a rate is at or above 1/tau: it cannot be corrected for dead time")
    a_true = r / (1 - r * tau_s)
    b_true = r0 / (1 - r0 * tau_s)
    if np.any(a_true - b <= 0) or np.any(b_true - b <= 0):
        raise ValueError("a rate is at or below the background: no transmission")
    scale = I_mA / I_open_mA
    num, den = a_true - b, (b_true - b) * scale
    T = num / den
    var_a = _rate_var(r, dt_s) / (1 - r * tau_s) ** 4
    var_o = _rate_var(r0, dt_open_s) / (1 - r0 * tau_s) ** 4
    var_b = 0.0 if background_dt_s is None else float(_rate_var(b, background_dt_s))
    dT_db = (a_true - b_true) / ((b_true - b) ** 2 * scale)
    var_T = var_a / den**2 + (T / (b_true - b)) ** 2 * var_o + dT_db**2 * var_b
    return T, np.sqrt(var_T)
