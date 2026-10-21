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

    ``reflectivity_model``: "ideal_mosaic" for every preset (kinematic thick mosaic crystal,
    ∝ |F|²/(V² μ)). "darwin" (a perfect crystal) is a future Python-first feature with its own
    per-θ factor ∝ λ²|F|/(V sin 2θ), polarisation (1 + |cos 2θ|)/2 and no 1/μ. Si wafers and
    calcite cleavage pieces are near-perfect in practice, so their ideal-mosaic values are an
    upper bound (see ``cell_scale``).

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

    def __post_init__(self):
        cell = (self.a_pm, self.b_pm, self.c_pm, self.alpha_deg, self.beta_deg, self.gamma_deg)
        if not all(math.isfinite(v) and v > 0 for v in cell) or not self.basis:
            raise ValueError(f"{self.name}: a cell with positive finite lengths/angles and atoms")
        if len(self.cut) != 3 or not any(self.cut):
            raise ValueError(f"{self.name}: cut must be a nonzero (h, k, l)")
        if self.reflectivity_model != "ideal_mosaic":
            raise ValueError(f"{self.name}: only reflectivity_model 'ideal_mosaic' exists")
        if self.fitted_debye_waller and (
            self.d_anchor_pm is None or any(atom[4] != 0 for atom in self.basis)
        ):
            raise ValueError(f"{self.name}: a fitted-B anchor needs d_anchor_pm and all B = 0")
        d_metric = _d_from_metric(self, self.cut)
        if self.d_anchor_pm is not None and not math.isclose(
            d_metric, self.d_anchor_pm, rel_tol=1e-9
        ):
            raise ValueError(f"{self.name}: anchor d {self.d_anchor_pm} ≠ metric {d_metric}")
        if _f_sq(self, self.cut, 1 / (2 * d_metric / 100)) <= 1e-6 * _f_sq_forward_limit(self):
            raise ValueError(f"{self.name}: the cut reflection {self.cut} is systematically absent")


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
    """Density Σ occ·A / (N_A V) in g/cm³ from the basis (xraylib ``AtomicWeight``)."""
    mass_g_mol = sum(occ * xraylib.AtomicWeight(int(z)) for z, *_, occ in crystal.basis)
    return mass_g_mol / (AVOGADRO_PER_MOL * cell_volume_A3(crystal) * 1e-24)


def _f_sq(crystal, hkl, q_inv_A):
    """|F|² (electrons²) of reflection ``hkl`` at s = sin θ/λ = ``q_inv_A`` in Å⁻¹:
    |Σ occ f(s) e^{−B s²} e^{2πi (h x + k y + l z)}|²."""
    atoms = np.array(crystal.basis, dtype=float)
    f = {int(z): xraylib.FF_Rayl(int(z), q_inv_A) for z in set(atoms[:, 0])}
    amp = (
        np.array([f[int(z)] for z in atoms[:, 0]]) * atoms[:, 5] * np.exp(-atoms[:, 4] * q_inv_A**2)
    )
    phase = 2 * np.pi * atoms[:, 1:4] @ np.asarray(hkl, dtype=float)
    return float(abs(np.sum(amp * np.exp(1j * phase))) ** 2)


def _f_sq_forward_limit(crystal):
    """(Σ occ Z)²: the |F|² of a hypothetical in-phase reflection at q = 0, to judge 'absent'."""
    return sum(occ * z for z, *_, occ in crystal.basis) ** 2


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
def _mu_per_cm_table(crystal):
    """Linear attenuation μ in 1/cm on ``filters.MU_RHO_GRID_PM``: Σ_j occ_j σ_j / V with the
    atomic cross-sections σ_j = CS_Total(Z) · A / N_A (mixture rule, xraylib)."""
    from braggsim.filters import MU_RHO_GRID_PM

    v_cm3 = cell_volume_A3(crystal) * 1e-24
    table = np.zeros_like(MU_RHO_GRID_PM)
    for z, *_, occ in crystal.basis:
        mass = xraylib.AtomicWeight(int(z)) / AVOGADRO_PER_MOL
        table += (
            occ * mass * np.array([xraylib.CS_Total(int(z), HC_KEV_PM / x) for x in MU_RHO_GRID_PM])
        )
    table /= v_cm3
    table.flags.writeable = False
    return table


def linear_attenuation_per_cm(crystal, lambda_pm):
    """μ(λ) of the crystal in 1/cm, interpolated log–log like ``filters.transmission``."""
    from braggsim.filters import MU_RHO_GRID_PM

    log_mu = np.interp(
        np.log(np.asarray(lambda_pm, dtype=float)),
        np.log(MU_RHO_GRID_PM),
        np.log(_mu_per_cm_table(crystal)),
    )
    return np.exp(log_mu)


def cell_scale(crystal):
    """(|F_1|²/V²) / (|F_1|²/V²)_NaCl: the λ-independent part of the cross-crystal scale (1 for
    NaCl). Kinematic mosaic crystal: integrated reflectivity ∝ λ³|F|²/(V² μ) at the same λ
    (Warren ch. 4); λ³ is common at equal λ and cancels in the ratio. NaCl's missing
    λ³/μ_NaCl(λ) shape was absorbed by the Fig. 4 fit, so multiplying by μ_NaCl/μ_X
    (``mu_factor``) turns it into λ³/μ_X for crystal X; Lorentz-polarization and the Jacobian
    are applied in scan.py at the crystal's own θ and d.

    These are ideal-mosaic values for a crystal as perfect as the NaCl of Fig. 4, an upper
    bound. A perfect crystal follows the dynamical (Darwin) integrated reflectivity, which at Mo
    Kα, order 1 is 1/31 (NaCl), 1/150 (LiF), 1/28 (Si), 1/20 (calcite), 1/5 (muscovite) of the
    mosaic value. A Si wafer should read ≈ 0.03 × NaCl, not 0.68, and calcite cleavage pieces
    are close to perfect. LiF's ratio rests on its low μ, so secondary extinction lowers it to ≈
    2–3 for mosaic spreads of 0.05–0.3°. Computed, not fitted; check on the bench by comparing
    the order-1 Kα peak with NaCl at equal tube settings.
    """
    if crystal is NACL:
        return 1.0
    ref = structure_factor_sq(NACL, 1) / cell_volume_A3(NACL) ** 2
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
)  # fmt: skip
LIF = _rock_salt(
    "LiF", 402.8, "Li", "F", 1.0, 0.65,
    "Ott, Z. Kristallogr. 63, 222 (1926); B(Li), B(F) are an assumption",
)  # fmt: skip
SI = Crystal(
    "Si", 543.1020511, 543.1020511, 543.1020511, 90.0, 90.0, 90.0,
    build_basis(
        [(((14, 1.0),), (0, 0, 0), 0.476), (((14, 1.0),), (0.25, 0.25, 0.25), 0.476)],
        centrings=FCC,
    ),
    (1, 1, 1),
    "CODATA 2018 (a); Heacock et al., Science 2021 (B = 0.476 Å²)",
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
)  # fmt: skip

PRESETS = {c.name: c for c in (NACL, LIF, SI, CALCITE, MUSCOVITE)}
