"""Bragg geometry and kinematic structure factors of a monocrystal: n λ = 2 d sin θ
(LD P6.3.3.1, Eq. I).

θ is the glancing angle, measured from the lattice planes, in degrees. A ``Crystal`` is data
(cell, atoms, cut plane); the presets NaCl (the calibrated anchor), LiF, Si, calcite and
muscovite are at the bottom of this file. Sources and values: model/PARAMETERS.md, "Crystal
presets".
"""

import dataclasses
import functools
import math

import numpy as np
import xraylib

from braggsim.constants import D_NACL_PM, HC_KEV_PM


def theta_from_lambda(lambda_pm, n=1, d_pm=D_NACL_PM):
    """Glancing angle θ in degrees for wavelength ``lambda_pm`` in order ``n``.

    Returns NaN where n λ > 2 d (no reflection exists in that order), for λ ≤ 0, or n < 1.
    """
    s = n * np.asarray(lambda_pm, dtype=float) / (2 * d_pm)
    with np.errstate(invalid="ignore"):
        return np.degrees(np.arcsin(np.where((s > 0) & (s <= 1) & (n >= 1), s, np.nan)))


def lambda_from_theta(theta_deg, n=1, d_pm=D_NACL_PM):
    """Wavelength in pm reflected in order ``n`` at glancing angle ``theta_deg`` (NaN outside
    0° … 90°, where no glancing angle exists)."""
    theta = np.asarray(theta_deg, dtype=float)
    lam = 2 * d_pm * np.sin(np.radians(theta)) / n
    return np.where((theta >= 0) & (theta <= 90), lam, np.nan)


def dlambda_dtheta_pm_per_deg(theta_deg, n=1, d_pm=D_NACL_PM):
    """Jacobian dλ/dθ = (2 d / n) cos θ, in pm per degree, for mapping spectra onto angle."""
    return 2 * d_pm / n * np.cos(np.radians(theta_deg)) * np.pi / 180


def lorentz_polarization(theta_deg):
    """Lorentz-polarization factor (1 + cos² 2θ) / (2 sin 2θ) for an unpolarized beam.

    Scales the integrated reflectivity of a mosaic crystal with glancing angle; the Lorentz
    part 1/sin 2θ is the time each crystallite spends in the reflecting position.
    Warren, *X-ray Diffraction* (1969), ch. 4. Diverges at θ = 0 and 90°; scan.py never
    evaluates it there.
    """
    two_theta = np.radians(2 * np.asarray(theta_deg, dtype=float))
    return (1 + np.cos(two_theta) ** 2) / (2 * np.sin(two_theta))


@functools.cache
def structure_factor_sq_rel(n_max):
    """|F|² of the NaCl (2n 0 0) reflections relative to (200), for orders n = 1 … n_max (tuple).

    Rock salt with h even: F = 4 (f_Na + f_Cl), atoms at rest (thermal motion is the separate
    Debye–Waller factor in scan.ModelParams). Form factors are xraylib ``FF_Rayl`` at
    q = sin θ / λ = n / (2d), in Å⁻¹ inside this function. Warren, *X-ray Diffraction* (1969),
    ch. 4; Schoonjans et al., Spectrochim. Acta B 66, 776 (2011).
    """
    f_sq = [
        (xraylib.FF_Rayl(11, q) + xraylib.FF_Rayl(17, q)) ** 2
        for q in (n / (2 * D_NACL_PM / 100) for n in range(1, n_max + 1))
    ]
    return tuple(f / f_sq[0] for f in f_sq)


# --------------------------------------------------------------------------------------------
# Generic crystal: cell + atoms + cut plane
# --------------------------------------------------------------------------------------------

AVOGADRO_PER_MOL = 6.02214076e23  # CODATA 2018, exact
REFLECTIVITY_MODELS = ("ideal_mosaic", "darwin", "mosaic_extinction")
EXTINCTION_N_POINTS = 2001  # quadrature points of the Darwin and the mosaic integrals
# largest accepted Debye–Waller B in Å²: above any real isotropic B, and e^{−B s²} cannot underflow
MAX_B_A2 = 30.0


class ForgeInputError(ValueError):
    """A ``Crystal`` the user designed is outside the trust boundary. ``code`` is stable (for the
    UI's i18n): bad_cell, bad_atom, bad_z, bad_occupancy, bad_b, b_too_large, site_overfilled,
    bad_cut, cut_absent, bad_model, bad_mosaic (and too_many_orders from ``forge.forged``).
    ``hint``: for cut_absent the smallest multiple of the cut that is present, else None. The
    message is for developers."""

    def __init__(self, code, message, hint=None):
        super().__init__(message)
        self.code = code
        self.hint = hint


def interp_nodes(x, xs, ys):
    """Piecewise-linear interpolation of ``ys(xs)`` at ``x`` (array ok), end values held; never an
    extrapolation. ``xs`` ascending; a repeated abscissa is a step: x equal to it reads the value
    after it, x below it the one before. Plain lookups, so the web port repeats it line by line."""
    xs = np.asarray(xs)
    ys = np.asarray(ys)
    x = np.asarray(x, dtype=float)
    j = np.clip(np.searchsorted(xs, x, side="right") - 1, 0, len(xs) - 2)
    dx = xs[j + 1] - xs[j]
    t = np.where(dx > 0, (np.clip(x, xs[0], xs[-1]) - xs[j]) / np.where(dx > 0, dx, 1.0), 0.0)
    return ys[j] + t * (ys[j + 1] - ys[j])


class XraylibAtoms:
    """Atomic data straight from xraylib: the source of every preset (Schoonjans et al.,
    Spectrochim. Acta B 66, 776 (2011)). ``forge.TableAtoms`` is the same interface on the
    exported per-element tables, which the browser can read; ``Crystal.atoms`` picks one.
    ``n_points``: quadrature size of the extinction integrals for crystals that use it."""

    n_points = EXTINCTION_N_POINTS

    def mu_nodes(self, crystal):
        """None: the μ of a preset lives on ``filters.MU_RHO_GRID_PM`` (a forged crystal has its
        own nodes, see forge.py)."""
        return None

    def f0(self, z, s_inv_A):
        """Rayleigh form factor f₀(s) in electrons, s = sin θ/λ in Å⁻¹ (xraylib ``FF_Rayl``)."""
        return xraylib.FF_Rayl(int(z), s_inv_A)

    def f_prime(self, z, e_kev):
        """Anomalous dispersion f′ in electrons at ``e_kev`` (xraylib ``Fi``)."""
        return xraylib.Fi(int(z), e_kev)

    def f_second(self, z, e_kev):
        """Anomalous absorption term at ``e_kev`` in electrons, xraylib's ``Fii``, which is
        negative: f₀ + f′ + i·Fii = f₀ + f′ − i|f″| is the scattering amplitude."""
        return xraylib.Fii(int(z), e_kev)

    def atomic_weight(self, z):
        """Atomic weight in g/mol (xraylib ``AtomicWeight``)."""
        return xraylib.AtomicWeight(int(z))

    def cs_total_cm2_g(self, z, lambda_pm):
        """Total mass cross-section in cm²/g at each wavelength of ``lambda_pm`` (xraylib
        ``CS_Total``)."""
        return np.array([xraylib.CS_Total(int(z), HC_KEV_PM / x) for x in lambda_pm])

    def edges_pm(self, zs):
        """K and L1–L3 edge wavelengths (pm) of the elements ``zs`` inside the μ/ρ grid
        (``filters.cs_step_edges_pm`` on the summed ``CS_Total``)."""
        from braggsim.filters import cs_step_edges_pm

        return cs_step_edges_pm(zs, lambda e_kev: sum(xraylib.CS_Total(z, e_kev) for z in zs))


XRAYLIB = XraylibAtoms()


@dataclasses.dataclass(frozen=True)
class Crystal:
    """A monocrystal cut along a lattice plane, as seen by the 2:1 coupled goniometer.

    ``basis``: every atom of the conventional cell as ``(Z, x, y, z, B_A2, occupancy)`` with
    fractional coordinates, the isotropic Debye–Waller B in Å² (amplitude e^{−B s²}, s = sin θ/λ
    in Å⁻¹) and the site occupancy (mixed sites are one entry per species at the same position).

    ``cut``: (h, k, l) of the FIRST reflection of the series the cut plane offers. Order n of
    the scan is the reflection (n h, n k, n l) with d_n = d/n. For a rock salt cut along (100)
    the series is (2n 0 0), so ``cut = (2, 0, 0)``: the (100) reflection itself is extinct in the
    face-centred lattice. Likewise Si (111), calcite (104), muscovite (002).

    ``fitted_debye_waller``: True only for the NaCl anchor. Its thermal weakening of the orders
    is the single effective ``scan.ModelParams.debye_waller_pm2`` fitted to leaflet Fig. 4 (atoms
    at rest inside F, B = 0 in ``basis``). Every other preset carries its literature B per atom
    in ``basis`` and gets no second, NaCl-fitted, global B.

    ``reflectivity_model``: how the crystal reflects, relative to the kinematic ideal-mosaic
    value (|F|²/(V² μ), the model of the NaCl anchor, see ``cell_scale``).
    "ideal_mosaic": exactly that, y = 1. "darwin": a perfect crystal, the dynamical
    Darwin–Prins integrated reflectivity (Si wafers, calcite cleavage, muscovite).
    "mosaic_extinction":
    a mosaic of spread ``mosaic_fwhm_deg`` with secondary extinction (LiF; also the NaCl
    reference). y ≤ 1 for a mosaic and for most perfect crystals; a perfect crystal whose
    f″ dominates a reflection with a nearly cancelled f₀ + f′ part can out-reflect the ideal
    mosaic (y up to 1.21, anomalous absorption). The reflectivity factor scan.py applies,
    ``extinction_factor``, is y times the anomalous-dispersion factor κ = |F(f₀+f′+if″)|²/|F(f₀)|²
    of the reflection; it enters as the ratio (yκ)_X,n(λ)/(yκ)_NaCl,1(λ) for every non-NaCl crystal.

    ``mosaic_fwhm_deg``: FWHM of the Gaussian mosaic spread in degrees, required (finite, > 0) for
    "mosaic_extinction" and None otherwise. An assumption (model/PARAMETERS.md).

    ``d_anchor_pm``: the exact series spacing of a calibration anchor. It replaces the value from
    the metric tensor (which agrees to 1e-9) so that fixtures stay byte-identical.
    """

    name: str
    a_pm: float
    b_pm: float
    c_pm: float
    alpha_deg: float
    beta_deg: float
    gamma_deg: float
    basis: tuple
    cut: tuple
    source: str
    fitted_debye_waller: bool = False
    d_anchor_pm: float | None = None
    reflectivity_model: str = "ideal_mosaic"
    mosaic_fwhm_deg: float | None = None
    atoms: object = XRAYLIB  # atomic-data source (XRAYLIB, or forge.TableAtoms for forged crystals)

    def __post_init__(self):
        cell = (self.a_pm, self.b_pm, self.c_pm, self.alpha_deg, self.beta_deg, self.gamma_deg)
        if not all(math.isfinite(v) and v > 0 for v in cell) or not self.basis:
            raise ForgeInputError(
                "bad_cell", f"{self.name}: a cell with positive finite lengths/angles and atoms"
            )
        if (
            len(self.cut) != 3
            or not all(math.isfinite(v) and float(v).is_integer() for v in self.cut)
            or not any(self.cut)
        ):
            raise ForgeInputError(
                "bad_cut", f"{self.name}: cut must be a nonzero (h, k, l) of integers"
            )
        if self.reflectivity_model not in REFLECTIVITY_MODELS:
            raise ForgeInputError(
                "bad_model", f"{self.name}: reflectivity_model must be one of {REFLECTIVITY_MODELS}"
            )
        if self.reflectivity_model == "mosaic_extinction":
            if self.mosaic_fwhm_deg is None or not (
                math.isfinite(self.mosaic_fwhm_deg) and self.mosaic_fwhm_deg > 0
            ):
                raise ForgeInputError(
                    "bad_mosaic",
                    f"{self.name}: mosaic_extinction needs a finite mosaic_fwhm_deg > 0",
                )
        elif self.mosaic_fwhm_deg is not None:
            raise ForgeInputError(
                "bad_mosaic", f"{self.name}: mosaic_fwhm_deg only applies to mosaic_extinction"
            )
        if float(np.linalg.det(_metric_tensor_pm2(self))) <= 0:
            raise ForgeInputError(
                "bad_cell", f"{self.name}: the cell angles do not make a cell (det G ≤ 0)"
            )
        site_fill = {}
        for atom in self.basis:
            if len(atom) != 6 or not all(math.isfinite(v) for v in atom):
                raise ForgeInputError(
                    "bad_atom", f"{self.name}: every atom is (Z, x, y, z, B_A2, occupancy)"
                )
            z, *xyz, b, occ = atom
            if z != int(z) or not 1 <= z <= 92:
                raise ForgeInputError("bad_z", f"{self.name}: atomic number {z} outside 1 … 92")
            if not 0 < occ <= 1:
                raise ForgeInputError(
                    "bad_occupancy", f"{self.name}: occupancy {occ} outside (0, 1]"
                )
            if b < 0:
                raise ForgeInputError("bad_b", f"{self.name}: Debye–Waller B {b} Å² is negative")
            if b > MAX_B_A2:
                raise ForgeInputError(
                    "b_too_large", f"{self.name}: Debye–Waller B {b} Å² above {MAX_B_A2}"
                )
            site = tuple(int(round(v * 1e4)) % 10000 for v in xyz)
            site_fill[site] = site_fill.get(site, 0.0) + occ
        if any(fill > 1 + 1e-9 for fill in site_fill.values()):
            raise ForgeInputError(
                "site_overfilled", f"{self.name}: a site holds atoms of total occupancy above 1"
            )
        if self.fitted_debye_waller and (
            self.d_anchor_pm is None or any(atom[4] != 0 for atom in self.basis)
        ):
            raise ValueError(f"{self.name}: a fitted-B anchor needs d_anchor_pm and all B = 0")
        d_metric = _d_from_metric(self, self.cut)
        if self.d_anchor_pm is not None and not math.isclose(
            d_metric, self.d_anchor_pm, rel_tol=1e-9
        ):
            raise ValueError(f"{self.name}: anchor d {self.d_anchor_pm} ≠ metric {d_metric}")
        limit = 1e-12 * _f_sq_forward_limit(self)  # at rest, the criterion of ``order_is_absent``
        if _f_sq(self, self.cut, 1 / (2 * d_metric / 100), thermal=False) < limit:
            for m in range(2, 9):
                hkl = tuple(int(m * i) for i in self.cut)
                if _f_sq(self, hkl, m / (2 * d_metric / 100), thermal=False) >= limit:
                    break
            else:
                hkl = None
            raise ForgeInputError(
                "cut_absent",
                f"{self.name}: the cut reflection {self.cut} is systematically absent"
                + (f"; use the cut {hkl} (the smallest multiple that is present)" if hkl else ""),
                hint=hkl,
            )


def _metric_tensor_pm2(c):
    a, b, cc = c.a_pm, c.b_pm, c.c_pm
    ca, cb, cg = (math.cos(math.radians(x)) for x in (c.alpha_deg, c.beta_deg, c.gamma_deg))
    return np.array(
        [
            [a * a, a * b * cg, a * cc * cb],
            [a * b * cg, b * b, b * cc * ca],
            [a * cc * cb, b * cc * ca, cc * cc],
        ]
    )


def _d_from_metric(c, hkl):
    """d_hkl = 1/√(hᵀ G⁻¹ h) with the reciprocal metric tensor G⁻¹ (any crystal system)."""
    h = np.asarray(hkl, dtype=float)
    return float(1 / math.sqrt(h @ np.linalg.inv(_metric_tensor_pm2(c)) @ h))


def d_pm(crystal, hkl=None):
    """Spacing d in pm of the planes ``hkl`` (default: the first reflection of the cut series).

    From the reciprocal metric tensor (Warren, *X-ray Diffraction*, 1969, ch. 1); a calibration
    anchor (``Crystal.d_anchor_pm``) returns its exact stored value for the series.
    """
    if hkl is None:
        if crystal.d_anchor_pm is not None:
            return crystal.d_anchor_pm
        hkl = crystal.cut
    return _d_from_metric(crystal, hkl)


def cell_volume_A3(crystal):
    """Volume of the conventional cell in Å³: √det G."""
    return math.sqrt(np.linalg.det(_metric_tensor_pm2(crystal))) / 1e6


def density_g_cm3(crystal):
    """Density Σ occ·A / (N_A V) in g/cm³ from the basis (``AtomicWeight``)."""
    mass_g_mol = sum(occ * crystal.atoms.atomic_weight(z) for z, *_, occ in crystal.basis)
    return mass_g_mol / (AVOGADRO_PER_MOL * cell_volume_A3(crystal) * 1e-24)


def _f_sq(crystal, hkl, q_inv_A, thermal=True):
    """|F|² (electrons²) of reflection ``hkl`` at s = sin θ/λ = ``q_inv_A`` in Å⁻¹:
    |Σ occ f(s) e^{−B s²} e^{2πi (h x + k y + l z)}|²; ``thermal=False`` puts the atoms at rest
    (B = 0)."""
    atoms = np.array(crystal.basis, dtype=float)
    f = {int(z): crystal.atoms.f0(z, q_inv_A) for z in set(atoms[:, 0])}
    b = atoms[:, 4] if thermal else 0.0
    amp = np.array([f[int(z)] for z in atoms[:, 0]]) * atoms[:, 5] * np.exp(-b * q_inv_A**2)
    phase = 2 * np.pi * atoms[:, 1:4] @ np.asarray(hkl, dtype=float)
    return float(abs(np.sum(amp * np.exp(1j * phase))) ** 2)


def _f_sq_forward_limit(crystal):
    """(Σ occ Z)²: the |F|² of a hypothetical in-phase reflection at q = 0, to judge 'absent'."""
    return sum(occ * z for z, *_, occ in crystal.basis) ** 2


@functools.cache
def order_is_absent(crystal, n):
    """True if order ``n`` of the cut series is systematically absent (e.g. Si (222)): the
    at-rest |F|² (B = 0) is below 1e-12 (Σ occ Z)². Judged at rest so that a reflection merely
    damped by a large Debye–Waller factor (LiF n = 11, muscovite 53) is not called extinct. NaCl
    (200) has every order. The one criterion of ``allowed_orders`` and of the extinction table."""
    if crystal is NACL:
        return False
    hkl = tuple(n * i for i in crystal.cut)
    f_sq = _f_sq(crystal, hkl, n / (2 * d_pm(crystal) / 100), thermal=False)
    return f_sq < 1e-12 * _f_sq_forward_limit(crystal)


@functools.cache
def structure_factor_sq(crystal, n):
    """|F|² of order ``n`` of the cut series, the reflection (n h, n k, n l), atoms with their own
    Debye–Waller B. s = n/(2 d) with xraylib ``FF_Rayl`` (Schoonjans et al., Spectrochim. Acta B
    66, 776 (2011)); B stays in Å² in here. Kinematic, per conventional cell."""
    hkl = tuple(n * i for i in crystal.cut)
    return _f_sq(crystal, hkl, n / (2 * d_pm(crystal) / 100))


def structure_factor_sq_hkl(crystal, h, k, l):  # noqa: E741
    """|F|² of an arbitrary reflection (h, k, l) of ``crystal`` (same model as above); used for
    extinction checks such as Si (200)."""
    return _f_sq(crystal, (h, k, l), 1 / (2 * _d_from_metric(crystal, (h, k, l)) / 100))


@functools.cache
def mu_per_cm_table(crystal):
    """Linear attenuation μ in 1/cm on ``filters.MU_RHO_GRID_PM``: Σ_j occ_j σ_j / V with the
    atomic cross-sections σ_j = CS_Total(Z) · A / N_A (mixture rule, xraylib). A forged crystal
    evaluates its own nodes (``Atoms.mu_nodes``) on the grid."""
    from braggsim.filters import MU_RHO_GRID_PM

    nodes = crystal.atoms.mu_nodes(crystal)
    if nodes is not None:
        table = np.exp(interp_nodes(np.log(MU_RHO_GRID_PM), *nodes))
        table.flags.writeable = False
        return table
    v_cm3 = cell_volume_A3(crystal) * 1e-24
    table = np.zeros_like(MU_RHO_GRID_PM)
    for z, *_, occ in crystal.basis:
        mass = crystal.atoms.atomic_weight(z) / AVOGADRO_PER_MOL
        table += occ * mass * crystal.atoms.cs_total_cm2_g(z, MU_RHO_GRID_PM)
    table /= v_cm3
    table.flags.writeable = False
    return table


@functools.cache
def mu_edges_pm(crystal):
    """K and L1–L3 absorption-edge wavelengths (pm) of the elements of ``crystal`` inside
    ``filters.MU_RHO_GRID_PM`` (steps of xraylib's ``CS_Total``, ``filters.cs_step_edges_pm``):
    NaCl Cl K 439.3 pm, calcite Ca K 307.0 pm, muscovite K K 343.7 pm."""
    return crystal.atoms.edges_pm(sorted({int(z) for z, *_ in crystal.basis}))


@functools.cache
def _log_mu_per_cm_table(crystal):
    table = np.log(mu_per_cm_table(crystal))
    table.flags.writeable = False
    return table


def linear_attenuation_per_cm(crystal, lambda_pm):
    """μ(λ) of the crystal in 1/cm, interpolated log–log like ``filters.transmission`` with the
    absorption edges of its elements kept sharp (``filters.interp_log_mu``)."""
    from braggsim.filters import interp_log_mu

    nodes = crystal.atoms.mu_nodes(crystal)
    if nodes is not None:  # forged: exact nodes with the edges as steps, never an extrapolation
        out = np.exp(interp_nodes(np.log(np.asarray(lambda_pm, dtype=float)), *nodes))
        return float(out) if out.ndim == 0 else out
    return np.exp(interp_log_mu(lambda_pm, _log_mu_per_cm_table(crystal), mu_edges_pm(crystal)))


def cell_scale(crystal):
    """(|F_1|²/V²) / (|F_1|²/V²)_NaCl: the λ-independent part of the cross-crystal scale (1 for
    NaCl). Kinematic mosaic crystal: integrated reflectivity ∝ λ³|F|²/(V² μ) at the same λ
    (Warren ch. 4); λ³ is common at equal λ and cancels in the ratio. NaCl's missing
    λ³/μ_NaCl(λ) shape was absorbed by the Fig. 4 fit, so multiplying by μ_NaCl/μ_X
    (``mu_factor``) turns it into λ³/μ_X for crystal X; Lorentz-polarization and the Jacobian
    are applied in scan.py at the crystal's own θ and d.

    This is the kinematic, ideal-mosaic ratio with f₀ only. The real reflectivity differs by the
    factor y·κ (``extinction_factor``, a per-order, per-λ factor: extinction y, mostly below 1,
    times the anomalous-dispersion factor κ of f′, f″); scan.py multiplies by
    (yκ)_X,n(λ)/(yκ)_NaCl,1(λ), so that the NaCl-anchored scale carries the same factor in the
    numerator and the denominator. At Mo Kα, order 1 the
    resulting order-1 Kα line weights relative to NaCl (r_1 · Lorentz-polarization · μ ratio ·
    yκ ratio) are given in model/PARAMETERS.md. For Si, ``cell_scale`` itself is 0.597.
    Computed, not fitted; check on the bench by comparing the order-1 Kα peak with NaCl at equal
    tube settings.
    """
    if crystal is NACL:
        return 1.0
    # the reference NaCl is computed from the same atomic data as the crystal (forged: tables)
    nacl = NACL if crystal.atoms is NACL.atoms else dataclasses.replace(NACL, atoms=crystal.atoms)
    ref = structure_factor_sq(nacl, 1) / cell_volume_A3(nacl) ** 2
    return structure_factor_sq(crystal, 1) / cell_volume_A3(crystal) ** 2 / ref


def mu_factor(crystal, lambda_pm):
    """μ_NaCl(λ) / μ_crystal(λ): the λ-dependent part of the cross-crystal scale (1 for NaCl).
    The more absorbing the crystal, the shallower the beam penetrates and the less of it
    reflects."""
    if crystal is NACL:
        return 1.0
    return linear_attenuation_per_cm(NACL, lambda_pm) / linear_attenuation_per_cm(
        crystal, lambda_pm
    )


def structure_factor_sq_rel_crystal(crystal, n_max):
    """|F_n|²/|F_1|², n = 1 … n_max, tuple, for any crystal. NaCl uses the closed form
    ``structure_factor_sq_rel`` (identical to 1e-12; kept so fixtures are byte-identical)."""
    if crystal is NACL:
        return structure_factor_sq_rel(n_max)
    f = [structure_factor_sq(crystal, n) for n in range(1, n_max + 1)]
    return tuple(x / f[0] for x in f)


# An order whose at-rest |F|² is below 1e-12 (Σ occ Z)² is systematically absent (F = 0 up to
# rounding, e.g. Si (222)): ``order_is_absent``, the one criterion for every consumer, from peak
# pairing to the web markers. The model gives exactly nothing there; a real wafer shows a very
# weak (222) (bonding charge, Renninger multiple diffraction), which no kinematic structure factor
# of spherical atoms contains.


def allowed_orders(crystal):
    """Orders n = 1 … max_order(crystal) of the cut series that are not extinct, ascending (tuple).

    Si (111): 1, 3, 4, 5, 7 … (no 2, 6, 10 …); NaCl (200) has them all.
    """
    from braggsim.scan import max_order

    n_max = max_order(crystal)
    return tuple(n for n in range(1, n_max + 1) if not order_is_absent(crystal, n))


# --------------------------------------------------------------------------------------------
# Extinction: how far a real crystal falls below the kinematic ideal-mosaic reflectivity
# --------------------------------------------------------------------------------------------

RE_PM = 2.8179403262e-3  # classical electron radius, pm (CODATA 2018)
NACL_THERMAL_B_A2 = (
    1.3  # B of Na and Cl at room temperature in Å², used only for the NaCl reference y
)
NACL_THERMAL_B_PM2 = 13000.0  # the same B in pm² (1 Å² = 10⁴ pm²), for the pm⁻¹ scale of scan.py
SIGNIFICANT_DIGITS = 4  # of the exported y tables, which Python itself interpolates
MAX_THETA_B_DEG = 88.0  # the dynamical formulas are not evaluated closer to backscattering
_TABLE_THETA_DEG = 85.0  # a row extends to the last scan angle (85°) plus one node


def _chis(crystal, n, lambda_pm):
    """(χ_0, χ_h, χ_h̄, θ_B in rad, μ in 1/cm) of order ``n`` at ``lambda_pm``: ``_chis_full``
    without κ."""
    return _chis_full(crystal, n, lambda_pm)[:5]


def _chis_full(crystal, n, lambda_pm):
    """(χ_0, χ_h, χ_h̄, θ_B in rad, μ in 1/cm, κ) of order ``n`` at ``lambda_pm`` (dimensionless χ).

    χ_h = −Γ F_h with Γ = r_e λ² / (π V) and F_h = Σ_j occ_j (f_j0(s) + f′_j − i|f″_j|) e^{−B_j s²}
    e^{+2πi h·r_j}; F_h̄ has the opposite phase, with the same atomic factors (not conjugated, so
    the absorbing crystal keeps χ_h ≠ χ_h̄*). f_j0 = xraylib ``FF_Rayl`` at s = n/(2 d) in Å⁻¹,
    f′, f″ = ``Fi``, ``Fii`` at E = hc/λ (``crystal.atoms``: xraylib, or the forge tables;
    xraylib's Fii is negative, so the amplitude is f₀ + f′ + i·Fii). κ = |F_h|²/|F_h(f₀ only)|²,
    the same sum without f′, f″ (same B and phases): the anomalous-dispersion factor of the
    reflection, the part of |F(λ)|² that the kinematic weight (f₀ only, ``structure_factor_sq``)
    leaves out. Re χ_0 = −Γ Σ occ (Z + f′); Im χ_0 = μ λ / (2π) with
    the same total μ as ``mu_factor``. NaCl takes B = ``NACL_THERMAL_B_A2`` here (its basis holds
    B = 0 because the Debye–Waller of its own scan is fitted). Authier, *Dynamical Theory of
    X-ray Diffraction* (OUP 2001), ch. 1–5; sign convention as X0h (Stepanov).
    """
    e_kev = HC_KEV_PM / lambda_pm
    d_n = d_pm(crystal) / n
    s_inv_A = 1 / (2 * d_n / 100)
    gamma = RE_PM * lambda_pm**2 / (math.pi * cell_volume_A3(crystal) * 1e6)
    at = np.array(crystal.basis, dtype=float)
    z = at[:, 0].astype(int)
    f0 = np.array([crystal.atoms.f0(zz, s_inv_A) for zz in z])
    fp = np.array([crystal.atoms.f_prime(zz, e_kev) for zz in z])
    fpp = np.array([crystal.atoms.f_second(zz, e_kev) for zz in z])
    b = np.full(len(z), NACL_THERMAL_B_A2) if crystal.fitted_debye_waller else at[:, 4]
    damp = at[:, 5] * np.exp(-b * s_inv_A**2)
    a_j = damp * (f0 + fp + 1j * fpp)
    phase = 2 * np.pi * (at[:, 1:4] @ (n * np.asarray(crystal.cut, dtype=float)))
    f_h = np.sum(a_j * np.exp(1j * phase))
    f_hb = np.sum(a_j * np.exp(-1j * phase))
    f_h0 = abs(np.sum(damp * f0 * np.exp(1j * phase))) ** 2
    kappa = abs(f_h) ** 2 / f_h0 if f_h0 > 0 else 1.0
    mu = float(linear_attenuation_per_cm(crystal, lambda_pm))
    chi0 = complex(
        -gamma * float(np.sum(at[:, 5] * (z + fp))), mu * lambda_pm * 1e-10 / (2 * math.pi)
    )
    sin_theta = n * lambda_pm / (2 * d_pm(crystal))
    return chi0, -gamma * f_h, -gamma * f_hb, math.asin(sin_theta), mu, float(kappa)


def _polarizations(theta_rad):
    """Polarization factors C_σ = 1 and C_π = |cos 2θ| (skipped below 1e-9, where π is blind)."""
    return [c for c in (1.0, abs(math.cos(2 * theta_rad))) if c >= 1e-9]


def _y_darwin(chi0, chi_h, chi_hb, theta_rad, n_points=EXTINCTION_N_POINTS):
    """y of a perfect crystal: Darwin–Prins integrated reflectivity over the ideal-mosaic one.

    Thick, symmetric Bragg case (b = −1), per polarization p with C = 1 or |cos 2θ|:
    η(t) = (t C|S| + i Im χ_0)/(C S), S = √(χ_h χ_h̄) (principal branch), r = 1/q with
    q = η ± √(η²−1) of the larger modulus (the stable branch), R(t) = |χ_h/χ_h̄| |r|²;
    R^θ = (C|S|/sin 2θ) ∫ R(t) dt, substituting t = w tan φ over φ ∈ (−π/2, π/2) (w = max(1, g),
    g = Im χ_0/(C|S|), so the absorption-broadened peak is resolved), trapezoid on
    ``n_points`` nodes (2001 for a preset; ``forge.FORGE_N_POINTS``). Ideal mosaic, same χ:
    π C² |χ_h|² / (4 sin 2θ Im χ_0).
    y = (R_σ + R_π)/(R_mos,σ + R_mos,π). It is not bounded by 1: to second order
    y ≈ 1 − (⟨C⁴⟩/⟨C²⟩) Re(χ_h χ_h̄)/(8 (Im χ_0)²), so where f″ dominates a reflection whose
    f₀ + f′ part nearly cancels, Re(χ_h χ_h̄) < 0 and the perfect crystal out-reflects the ideal
    mosaic (anomalous absorption); the pure absorption grating (|χ_h| = Im χ_0) gives 1.17-1.21.
    Darwin, Z. Phys. 1914 / Prins, Z. Phys. 63, 477 (1930);
    Zachariasen, *Theory of X-ray Diffraction in Crystals* (1945); Authier (2001).
    """
    sin2 = math.sin(2 * theta_rad)
    k = abs(chi_h / chi_hb)
    s_root = np.sqrt(chi_h * chi_hb + 0j)
    phi = np.linspace(-np.pi / 2, np.pi / 2, n_points)
    num = den = 0.0
    for c in _polarizations(theta_rad):
        g = chi0.imag / (c * abs(s_root))
        w = max(1.0, g)
        inner = phi[1:-1]
        eta = (w * np.tan(inner) * c * abs(s_root) + 1j * chi0.imag) / (c * s_root)
        root = np.sqrt(eta * eta - 1 + 0j)
        q = np.where(np.abs(eta + root) >= np.abs(eta - root), eta + root, eta - root)
        r = 1 / q
        f = np.concatenate(
            [[k / (4 * w)], k * np.abs(r) ** 2 * w / np.cos(inner) ** 2, [k / (4 * w)]]
        )
        num += c * abs(s_root) / sin2 * float(np.trapezoid(f, phi))
        den += math.pi * c**2 * abs(chi_h) ** 2 / (4 * sin2 * chi0.imag)
    return num / den


def _y_secondary(
    chi0, chi_h, theta_rad, mu_per_cm, lambda_pm, mosaic_fwhm_deg, n_points=EXTINCTION_N_POINTS
):
    """y of a mosaic crystal with secondary extinction, over the ideal-mosaic value.

    Gaussian mosaic W(Δ) of σ_η = FWHM/(2√(2 ln 2)); the reflecting power per unit path
    Q_p W(Δ), Q_p = π² C_p² |χ_h|² / (λ sin 2θ) in 1/cm; thick-crystal reflectivity
    P = σ/(μ + σ + √(μ² + 2μσ)) (Bacon & Lowde, Acta Cryst. 1, 303 (1948)); R_p = ∫ P dΔ over
    ±8 σ_η, trapezoid. y = (R_σ + R_π)/(Q_σ + Q_π) · 2μ, the kinematic limit being Q/(2μ).
    Darwin (1922); Sears, Acta Cryst. A53, 35 (1997). ``chi0`` is unused except to keep the
    signature parallel to ``_y_darwin``.
    """
    del chi0
    sin2 = math.sin(2 * theta_rad)
    lam_cm = lambda_pm * 1e-10
    sg = math.radians(mosaic_fwhm_deg) / (2 * math.sqrt(2 * math.log(2)))
    x = np.linspace(-8, 8, n_points) * sg
    wgt = np.exp(-0.5 * (x / sg) ** 2) / (sg * math.sqrt(2 * math.pi))
    num = den = 0.0
    for c in _polarizations(theta_rad):
        qp = math.pi**2 * c**2 * abs(chi_h) ** 2 / (lam_cm * sin2)
        sig = qp * wgt
        p = sig / (mu_per_cm + sig + np.sqrt(mu_per_cm**2 + 2 * mu_per_cm * sig))
        num += float(np.trapezoid(p, x))
        den += qp
    return num / den * 2 * mu_per_cm


Y_MAX = 1.25  # guard: just above the pure-absorption-grating limit of y (1.21)


def _extinction_raw(crystal, n, lambda_pm):
    """Reflectivity factor y·κ of order ``n`` at ``lambda_pm`` from the physics (not the table).

    y: the integrated reflectivity over the ideal-mosaic one (``reflectivity_model``), κ the
    anomalous-dispersion factor |F(f₀+f′+if″)|²/|F(f₀)|² of ``_chis_full``. "darwin": y from
    ``_y_darwin``, not clipped (it can exceed 1, see there); "mosaic_extinction": the blocks
    reflect kinematically, no coherent gain, so y = secondary extinction if the Darwin y is above 1
    and max(Darwin, secondary) otherwise; "ideal_mosaic" and a vanishing χ_h χ_h̄ (huge B): y = 1.
    A y above ``Y_MAX`` is an error.
    An absent order has no reflection to weigh: 1."""
    lam = lambda_pm
    sin_theta = n * lam / (2 * d_pm(crystal))
    if not 0 < sin_theta <= math.sin(math.radians(MAX_THETA_B_DEG)):
        raise ValueError(f"{crystal.name}: order {n} at {lam} pm has θ_B beyond {MAX_THETA_B_DEG}°")
    chi0, chi_h, chi_hb, theta, mu, kappa = _chis_full(crystal, n, lam)
    if order_is_absent(crystal, n):  # |F_h|² ≈ 0: nothing to extinguish
        return 1.0
    y = 1.0
    # χ_h χ_h̄ == 0 (e^{−B s²} underflowed): nothing to extinguish, the kinematic limit
    if crystal.reflectivity_model != "ideal_mosaic" and chi_h * chi_hb != 0:
        n_pts = crystal.atoms.n_points
        y_darwin = _y_darwin(chi0, chi_h, chi_hb, theta, n_pts)
        if y_darwin > Y_MAX:
            raise ArithmeticError(f"{crystal.name} n={n} λ={lam}: y = {y_darwin} > {Y_MAX}")
        y = y_darwin
        if crystal.reflectivity_model == "mosaic_extinction":
            y_sec = _y_secondary(chi0, chi_h, theta, mu, lam, crystal.mosaic_fwhm_deg, n_pts)
            y = y_sec if y_darwin > 1 else max(y_darwin, y_sec)
    return y * kappa


def _row_nodes(crystal, n):
    """Number of MU_RHO_GRID_PM nodes in a row: λ ≤ 2 d sin 85° / n plus one node (at least 1)."""
    from braggsim.filters import MU_RHO_GRID_PM

    lam_max = 2 * d_pm(crystal) * math.sin(math.radians(_TABLE_THETA_DEG)) / n
    return min(int(np.searchsorted(MU_RHO_GRID_PM, lam_max, side="right")) + 1, len(MU_RHO_GRID_PM))


def _round_sig(x):
    return float(f"{x:.{SIGNIFICANT_DIGITS}g}")


@functools.cache
def extinction_table(crystal):
    """The y·κ rows (extinction × anomalous dispersion, ``_extinction_raw``; the JSON key stays
    ``extinction``) of ``crystal`` on the first nodes of ``filters.MU_RHO_GRID_PM``: orders
    1 … ``max_order(crystal, 35 kV)`` (NaCl: order 1 only, the cross-crystal reference), each row
    up to λ ≤ 2 d sin 85° / n plus one node, rounded to 4 significant digits
    (the assumptions behind y are far coarser; it keeps the lazy table small). A tuple of read-only
    float arrays. The node past 88° is evaluated at the 88° wavelength (the formulas are not
    used near backscattering). The grid is 0.3 % in λ, so the interpolation (log y vs log λ) between
    the last node below 85° and the node past it is a coarse chord, not exact physics: near θ = 85°
    it can be off by a few % (up to 2 % for LiF n = 1–3 at ~84.5°).
    This rounded table, not the raw physics, is what ``extinction_factor`` and the web port read.
    Rows are y·κ with κ ≈ 1 for light elements; for ideal-mosaic crystals row = κ.
    A forged crystal (``atoms`` not xraylib, see forge.py) is not rounded: the port recomputes it.
    """
    from braggsim.filters import MU_RHO_GRID_PM
    from braggsim.scan import max_order

    rows = []
    rnd = _round_sig if crystal.atoms is XRAYLIB else float
    n_max = 1 if crystal.fitted_debye_waller else max_order(crystal)
    for n in range(1, n_max + 1):
        lam_88 = 2 * d_pm(crystal) * math.sin(math.radians(MAX_THETA_B_DEG)) / n
        row = np.array(
            [
                rnd(_extinction_raw(crystal, n, min(float(lam), lam_88)))
                for lam in MU_RHO_GRID_PM[: _row_nodes(crystal, n)]
            ]
        )
        row.flags.writeable = False
        rows.append(row)
    return tuple(rows)


def extinction_factor(crystal, n, lambda_pm):
    """Reflectivity factor y·κ of order ``n`` at ``lambda_pm`` (array ok): the integrated
    reflectivity of the real crystal over the kinematic f₀-only ideal-mosaic one: extinction y
    (``reflectivity_model``, can exceed 1 for a perfect crystal, see ``_y_darwin``) times the
    anomalous-dispersion factor κ. Log–log interpolation of ``extinction_table``, end values
    held (like ``linear_attenuation_per_cm``). NaCl has order 1 only (the reference of the
    cross-crystal scale, η 0.2°, B 1.3 Å²); it is not applied to NaCl's own scan, where the
    Fig. 4 fit already contains it.
    """
    from braggsim.filters import MU_RHO_GRID_PM

    rows = extinction_table(crystal)
    if not 1 <= n <= len(rows):
        raise ValueError(f"{crystal.name}: no extinction table for order {n} (1 … {len(rows)})")
    row = rows[n - 1]
    log_y = np.interp(
        np.log(np.asarray(lambda_pm, dtype=float)), np.log(MU_RHO_GRID_PM[: len(row)]), np.log(row)
    )
    return np.exp(log_y)


def extinction_ratio(crystal, n, lambda_pm):
    """(yκ)_X,n(λ) / (yκ)_NaCl,1(λ): the λ-dependent extinction and anomalous-dispersion part of
    the cross-crystal scale
    (1 for NaCl and for any other fitted-B anchor, whose scale already contains it)."""
    if crystal is NACL or crystal.fitted_debye_waller:
        return 1.0
    return extinction_factor(crystal, n, lambda_pm) / extinction_factor(NACL, 1, lambda_pm)


# --------------------------------------------------------------------------------------------
# Building the conventional cell from an asymmetric unit
# --------------------------------------------------------------------------------------------

IDENTITY = (lambda x, y, z: (x, y, z),)
FCC = ((0, 0, 0), (0, 0.5, 0.5), (0.5, 0, 0.5), (0.5, 0.5, 0))


def build_basis(sites, ops=IDENTITY, centrings=((0, 0, 0),)):
    """Full conventional-cell basis from an asymmetric unit.

    ``sites``: ``(species, (x, y, z), B_A2)`` with species ``((Z, occupancy), …)``. Every
    operator in ``ops`` (callable (x, y, z) → (x', y', z')) and every centring translation is
    applied; positions equal mod 1 (to 1e-5) are one atom. Returns a tuple of
    ``(Z, x, y, z, B_A2, occupancy)`` with coordinates folded into [0, 1).
    """
    out = []
    for species, xyz, b in sites:
        seen = set()
        for op in ops:
            for t in centrings:
                p = tuple((v + dt) % 1.0 for v, dt in zip(op(*xyz), t, strict=True))
                key = tuple(int(round(v * 1e5)) % 100000 for v in p)
                if key in seen:
                    continue
                seen.add(key)
                out.extend(
                    (z, *(v if v < 1 - 1e-9 else 0.0 for v in p), b, occ) for z, occ in species
                )
    return tuple(out)


_R3C = tuple(
    (lambda x, y, z, op=op: op(x, y, z))
    for sign in (1, -1)
    for op in (
        lambda x, y, z, s=sign: (s * x, s * y, s * z),
        lambda x, y, z, s=sign: (s * -y, s * (x - y), s * z),
        lambda x, y, z, s=sign: (s * (y - x), s * -x, s * z),
        lambda x, y, z, s=sign: (s * y, s * x, s * (0.5 - z)),
        lambda x, y, z, s=sign: (s * (x - y), s * -y, s * (0.5 - z)),
        lambda x, y, z, s=sign: (s * -x, s * (y - x), s * (0.5 - z)),
    )
)
_C2C = (
    lambda x, y, z: (x, y, z),
    lambda x, y, z: (-x, y, 0.5 - z),
    lambda x, y, z: (-x, -y, -z),
    lambda x, y, z: (x, -y, 0.5 + z),
)

_Z = {"Li": 3, "O": 8, "F": 9, "Na": 11, "Al": 13, "Si": 14, "Cl": 17, "K": 19, "Ca": 20, "C": 6}


def _rock_salt(name, a_pm, cation, anion, b_cation, b_anion, source, **kw):
    sites = [
        (((_Z[cation], 1.0),), (0, 0, 0), b_cation),
        (((_Z[anion], 1.0),), (0.5, 0, 0), b_anion),
    ]
    return Crystal(
        name,
        a_pm,
        a_pm,
        a_pm,
        90.0,
        90.0,
        90.0,
        build_basis(sites, centrings=FCC),
        (2, 0, 0),
        source,
        **kw,
    )


# --------------------------------------------------------------------------------------------
# Presets (model/PARAMETERS.md, "Crystal presets")
# --------------------------------------------------------------------------------------------

NACL = _rock_salt(
    "NaCl", 564.02, "Na", "Cl", 0.0, 0.0,
    "LD P6.3.3.1 (a0 = 564.02 pm, d = 282.01 pm); Walker et al., Am. Mineral. 89, 204 (2004)",
    fitted_debye_waller=True, d_anchor_pm=D_NACL_PM,
    reflectivity_model="mosaic_extinction", mosaic_fwhm_deg=0.2,
)  # fmt: skip
LIF = _rock_salt(
    "LiF", 402.7, "Li", "F", 1.0, 0.65,
    "NBS / ICDD (a = 4.0270 Å); Ott, Z. Kristallogr. 63, 222 (1926); B(Li), B(F) and the mosaic "
    "are assumptions",
    reflectivity_model="mosaic_extinction", mosaic_fwhm_deg=0.05,
)  # fmt: skip
SI = Crystal(
    "Si", 543.1020511, 543.1020511, 543.1020511, 90.0, 90.0, 90.0,
    build_basis(
        [(((14, 1.0),), (0, 0, 0), 0.476), (((14, 1.0),), (0.25, 0.25, 0.25), 0.476)],
        centrings=FCC,
    ),
    (1, 1, 1),
    "CODATA 2018 (a); Heacock et al., Science 2021 (B = 0.476 Å²)",
    reflectivity_model="darwin",
)  # fmt: skip
CALCITE = Crystal(
    "calcite", 498.8, 498.8, 1706.1, 90.0, 90.0, 120.0,
    build_basis(
        [
            (((20, 1.0),), (0, 0, 0), 0.94),
            (((6, 1.0),), (0, 0, 0.25), 0.91),
            (((8, 1.0),), (0.2567, 0, 0.25), 1.51),
        ],
        ops=_R3C,
        centrings=((0, 0, 0), (2 / 3, 1 / 3, 1 / 3), (1 / 3, 2 / 3, 2 / 3)),
    ),
    (1, 0, 4),
    "Markgraf & Reeder, Am. Mineral. 70, 590 (1985), 24 °C",
    reflectivity_model="darwin",
)  # fmt: skip
_MUSCOVITE_T = ((14, 0.75), (13, 0.25))
MUSCOVITE = Crystal(
    "muscovite", 520.0, 902.1, 2007.0, 90.0, 95.71, 90.0,
    build_basis(
        [
            (((19, 1.0),), (0, 0.0982, 0.25), 1.68),
            (((13, 1.0),), (0.2511, 0.0836, 0.0001), 0.63),
            (_MUSCOVITE_T, (0.4648, 0.9294, 0.13565), 0.62),
            (_MUSCOVITE_T, (0.4517, 0.2584, 0.13545), 0.63),
            (((8, 1.0),), (0.4170, 0.0926, 0.1683), 1.20),
            (((8, 1.0),), (0.2510, 0.8112, 0.1582), 1.43),
            (((8, 1.0),), (0.2510, 0.3705, 0.1690), 1.24),
            (((8, 1.0),), (0.4579, 0.9438, 0.0536), 0.84),
            (((8, 1.0),), (0.3858, 0.2528, 0.0537), 1.05),
            (((8, 1.0),), (0.4565, 0.5636, 0.0503), 0.94),
        ],
        ops=_C2C,
        centrings=((0, 0, 0), (0.5, 0.5, 0)),
    ),
    (0, 0, 2),
    "Guggenheim, Chang & Koster van Groos, Am. Mineral. 72, 537 (1987), 20 °C, ideal composition",
    reflectivity_model="darwin",
)  # fmt: skip

PRESETS = {c.name: c for c in (NACL, LIF, SI, CALCITE, MUSCOVITE)}
