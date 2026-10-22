"""Materials Forge engine: the reference entry (``crystals.json`` shape) of a user-designed crystal,
computed from per-element tables only, so the browser can repeat it without xraylib.

``element_tables`` is xraylib 4.2.1 sampled for Z = 1 … 92 and rounded to the precision it is
exported with (``artifacts/tables/forge_elements.json``); Python reads those rounded numbers back,
like ``crystal.extinction_table``. ``TableAtoms`` serves them through the same interface as
``crystal.XraylibAtoms``, so a forged crystal (``Crystal.atoms = TABLES``) runs through the
unchanged model: ``crystal.extinction_table`` (not rounded for it), ``cell_scale``,
``mu_per_cm_table`` and ``scan.expected_rate``. ``entry`` collects the numbers the port needs;
``warnings`` flags designs a student should reconsider. Honest-model notes and interpolation
errors: model/PARAMETERS.md, "Forge element tables".
"""

import dataclasses
import functools
import math

import numpy as np
import xraylib

from braggsim import scan
from braggsim.constants import HC_KEV_PM, MO_KA_PM, MO_KB_PM
from braggsim.crystal import (
    AVOGADRO_PER_MOL,
    MAX_B_A2,
    Crystal,
    ForgeInputError,
    _metric_tensor_pm2,
    allowed_orders,
    cell_scale,
    cell_volume_A3,
    d_pm,
    density_g_cm3,
    extinction_table,
    interp_nodes,
    mu_edges_pm,
    mu_per_cm_table,
    structure_factor_sq_rel_crystal,
)
from braggsim.filters import MU_RHO_GRID_PM

Z_MAX = 92
F0_STEP_A = 0.01  # f₀ grid step in s = sin θ/λ, Å⁻¹
F0_S_MAX_A = 3.0  # ≥ sin 85°/λ_min(35 kV) = 2.81 Å⁻¹; beyond it the last value is held
F0_DECIMALS = 4  # f₀ is exported to 1e-4 electrons
SIGMA_DIGITS, FP_DECIMALS, FPP_DIGITS = 5, 2, 3  # exported precision of σ, f′, f″
TOL_SIGMA_REL = 6e-4  # node choice: σ within this relative error on every μ/ρ grid node
TOL_FP_ABS = 0.06  # f′ within this many electrons …
TOL_FPP_REL, TOL_FPP_ABS = 0.08, 0.06  # … f″ within this relative OR absolute (electrons) error
FORGE_N_POINTS = 201  # extinction quadrature of a forged crystal (presets: 2001); y within 2e-3
MIN_ATOM_DISTANCE_PM = (
    70.0  # closer atoms are flagged (``warnings``); H₂ (74 pm) is the shortest bond
)
MANY_ORDERS = 60  # ``warnings``: a forged entry with more orders is slow to build (muscovite: 56)
MAX_ORDERS = 120  # ``forged`` refuses a crystal with more orders
CONSTANTS = {  # exported in forge_elements.json: the one source of the port's limits
    "min_atom_distance_pm": MIN_ATOM_DISTANCE_PM,
    "many_orders": MANY_ORDERS,
    "max_orders": MAX_ORDERS,
    "n_points": FORGE_N_POINTS,
    "max_b_A2": MAX_B_A2,
}
_EDGE_OFFSET = 1e-7  # relative energy offset from the CS step at which the two edge sides are read


def _sig(x, digits):
    return float(f"{x:.{digits}g}")


_SCAN_NODES = 24000  # log-spaced λ nodes of the step search (smooth change ≲ 5e-4 per node)
_STEP_SEEK = 1.01  # a CS_Total ratio above this between two scan nodes holds a step
_STEP_KEEP = 1.003  # steps smaller than this are not kept as edges


def _steps_kev(cs_total, lo, hi):
    """Energies (keV) of the steps of ``cs_total`` inside ``[lo, hi]`` (bisection to 1e-10)."""
    if cs_total(lo) / cs_total(hi) < _STEP_KEEP and cs_total(hi) / cs_total(lo) < _STEP_KEEP:
        return []
    if hi / lo - 1 < 1e-10:
        return [math.sqrt(lo * hi)]
    mid = math.sqrt(lo * hi)
    return _steps_kev(cs_total, lo, mid) + _steps_kev(cs_total, mid, hi)


def _step_edges_pm(z):
    """Wavelengths (pm, 1e-6) of every step of xraylib ``CS_Total(z)`` inside the μ/ρ grid: the
    K, L and M edges, found from the cross section itself (the K/L-only search of
    ``filters.cs_step_edges_pm`` misses M steps that sit off ``EdgeEnergy``)."""
    lams = np.geomspace(MU_RHO_GRID_PM[0], MU_RHO_GRID_PM[-1], _SCAN_NODES)
    cs = np.array([xraylib.CS_Total(z, HC_KEV_PM / x) for x in lams])
    out = set()
    for i in np.nonzero(cs[:-1] / cs[1:] > _STEP_SEEK)[0]:  # CS falls with λ except at an edge
        for e in _steps_kev(
            lambda e_kev: xraylib.CS_Total(z, e_kev), HC_KEV_PM / lams[i + 1], HC_KEV_PM / lams[i]
        ):
            out.add(round(HC_KEV_PM / e, 6))
    return tuple(sorted(out))


def _log_sigma_nodes(lam, sig, edges, edge_sigma):
    """(ln λ, ln σ) nodes sorted by λ: the nodes ``lam``/``sig`` (a node on an edge dropped) plus
    each edge twice: σ on its short-λ side, then its long-λ side (a step for ``interp_nodes``)."""
    lam, sig = np.asarray(lam, dtype=float), np.asarray(sig, dtype=float)
    keep = np.ones(len(lam), bool)
    for e in edges:
        keep &= np.abs(lam - e) > 1e-6
    xs, ys = list(np.log(lam[keep])), list(np.log(sig[keep]))
    for e, (below, above) in zip(edges, edge_sigma, strict=True):
        xs += [math.log(e)] * 2
        ys += [math.log(below), math.log(above)]
    order = np.argsort(xs, kind="stable")
    return np.array(xs)[order], np.array(ys)[order]


def _choose_nodes(sig, fp, fpp, edges, edge_sigma):
    """Indices of the ``MU_RHO_GRID_PM`` nodes kept for one element: start from both ends and add
    the node where the interpolation is worst (in units of its tolerance) until σ, f′, f″ are all
    within ``TOL_*`` on every grid node. Greedy: nodes land where f′, f″ and σ bend."""
    lam = MU_RHO_GRID_PM
    x = np.log(lam)
    idx = [0, len(lam) - 1]
    while True:
        i = np.array(sorted(idx))
        v_sig = interp_nodes(x, *_log_sigma_nodes(lam[i], sig[i], edges, edge_sigma))
        v_fp = interp_nodes(lam, lam[i], fp[i])
        v_fpp = -np.exp(interp_nodes(x, x[i], np.log(-fpp[i])))
        bad = np.maximum.reduce(
            [
                np.abs(np.exp(v_sig) / sig - 1) / TOL_SIGMA_REL,
                np.abs(v_fp - fp) / TOL_FP_ABS,
                np.abs(v_fpp - fpp) / np.maximum(TOL_FPP_REL * np.abs(fpp), TOL_FPP_ABS),
            ]
        )
        bad[i] = 0
        if bad.max() <= 1:
            return tuple(int(k) for k in i)
        idx.append(int(np.argmax(bad)))


@functools.cache
def element_tables():
    """Per-element tables for Z = 1 … 92 (xraylib 4.2.1), rounded to their exported precision.

    ``f0_step_A``, ``f0_s_max_A`` and ``elements`` (index Z − 1), each with: ``symbol``;
    ``atomic_weight`` (g/mol, as xraylib); ``f0`` (Rayleigh form factor, ``FF_Rayl``, e⁻,
    ``F0_DECIMALS`` decimals, uniform in s); ``idx``, the nodes of ``filters.MU_RHO_GRID_PM`` kept
    for this element (``_choose_nodes``), and on them ``sigma_cm2`` (atomic cross-section
    ``CS_Total``·A/N_A, ``SIGMA_DIGITS`` significant digits), ``f_prime`` (``Fi``,
    ``FP_DECIMALS`` decimals), ``f_second`` (``Fii``, negative as in xraylib, ``FPP_DIGITS``
    significant digits);
    ``edges_pm`` (K, L1–L3, M1–M5 steps of ``CS_Total`` inside the μ/ρ grid, 1e-6 pm,
    ``_step_edges_pm``) and ``edge_sigma_cm2`` (σ on the [short-λ side, long-λ side] of
    each edge). Fi and Fii are continuous across the edges in xraylib and carry no edge pair.
    Schoonjans et al., Spectrochim. Acta B 66, 776 (2011).
    """
    lam = MU_RHO_GRID_PM
    n_f0 = round(F0_S_MAX_A / F0_STEP_A) + 1
    s_grid = [i * F0_STEP_A for i in range(n_f0)]
    elements = []
    for z in range(1, Z_MAX + 1):
        mass_g = xraylib.AtomicWeight(z)
        per_atom = mass_g / AVOGADRO_PER_MOL

        def sigma(e_kev, z=z, per_atom=per_atom):
            return _sig(xraylib.CS_Total(z, e_kev) * per_atom, 5)

        edges = _step_edges_pm(z)
        edge_sigma = [
            [sigma(HC_KEV_PM / e * (1 + _EDGE_OFFSET)), sigma(HC_KEV_PM / e * (1 - _EDGE_OFFSET))]
            for e in edges
        ]
        sig = np.array([xraylib.CS_Total(z, HC_KEV_PM / x) * per_atom for x in lam])
        fp = np.array([xraylib.Fi(z, HC_KEV_PM / x) for x in lam])
        fpp = np.array([xraylib.Fii(z, HC_KEV_PM / x) for x in lam])
        idx = _choose_nodes(sig, fp, fpp, edges, edge_sigma)
        elements.append(
            {
                "symbol": xraylib.AtomicNumberToSymbol(z),
                "atomic_weight": mass_g,
                "f0": [round(xraylib.FF_Rayl(z, s), F0_DECIMALS) for s in s_grid],
                "idx": list(idx),
                "sigma_cm2": [_sig(sig[i], SIGMA_DIGITS) for i in idx],
                "f_prime": [round(fp[i], FP_DECIMALS) for i in idx],
                "f_second": [_sig(fpp[i], FPP_DIGITS) for i in idx],
                "edges_pm": list(edges),
                "edge_sigma_cm2": edge_sigma,
            }
        )
    return {
        "f0_step_A": F0_STEP_A,
        "f0_s_max_A": F0_S_MAX_A,
        "elements": elements,
    }


@functools.cache
def _nodes(z):
    """(ln λ, ln σ) of element ``z`` with its edge pairs inserted, (λ, f′) and (ln λ, ln |f″|)."""
    el = element_tables()["elements"][z - 1]
    lam = MU_RHO_GRID_PM[el["idx"]]
    log_sig = _log_sigma_nodes(lam, el["sigma_cm2"], el["edges_pm"], el["edge_sigma_cm2"])
    return log_sig, (lam, np.array(el["f_prime"])), (np.log(lam), np.log(-np.array(el["f_second"])))


@functools.cache
def _mu_nodes(crystal):
    """(λ in pm, μ in 1/cm) nodes of a forged crystal, μ = Σ_j occ_j σ_j(λ)/V exactly on them
    (σ_j from the element tables): the union of its elements' nodes, plus each edge of any element
    twice (μ at λ_e(1 − 1e-9), then λ_e(1 + 1e-9)), a step for ``interp_nodes``. Read log–log
    between nodes, never extrapolated, so an edge cannot leak into its neighbour's interval (the
    edge-thinned preset scheme of ``filters.interp_log_mu`` can, with two elements)."""
    t = element_tables()["elements"]
    zs = sorted({int(a[0]) for a in crystal.basis})
    edges = sorted({e for z in zs for e in t[z - 1]["edges_pm"]})
    lam = sorted({float(x) for z in zs for x in MU_RHO_GRID_PM[t[z - 1]["idx"]]})
    lam = [x for x in lam if all(abs(x - e) > 1e-6 for e in edges)]
    v_cm3 = cell_volume_A3(crystal) * 1e-24

    def mu(lambda_pm):
        x = np.log(np.asarray(lambda_pm, dtype=float))
        return (
            sum(
                atom[5] * np.exp(interp_nodes(x, *_nodes(int(atom[0]))[0]))
                for atom in crystal.basis
            )
            / v_cm3
        )

    nodes = [(x, float(mu(x))) for x in lam]
    for e in edges:
        nodes += [(e, float(mu(e * (1 - 1e-9)))), (e, float(mu(e * (1 + 1e-9))))]
    nodes.sort(key=lambda p: p[0])  # stable: below before above
    return np.array([p[0] for p in nodes]), np.array([p[1] for p in nodes])


class TableAtoms:
    """``crystal.XraylibAtoms`` interface served from ``element_tables`` (no xraylib at run time):
    f₀ linear on the uniform s grid, σ and |f″| log–log and f′ linear in λ on the coarse grid,
    σ sharp at the edges (``interp_nodes``); end values held. ``n_points`` = ``FORGE_N_POINTS``."""

    n_points = FORGE_N_POINTS

    def mu_nodes(self, crystal):
        """(ln λ, ln μ) of the forged crystal's own μ nodes (``_mu_nodes``); a step at every
        absorption edge."""
        lam, mu = _mu_nodes(crystal)
        return np.log(lam), np.log(mu)

    def f0(self, z, s_inv_A):
        """f₀(s) in electrons, s = sin θ/λ in Å⁻¹, by linear interpolation of the table."""
        table = element_tables()["elements"][int(z) - 1]["f0"]
        g = min(max(s_inv_A, 0.0) / F0_STEP_A, len(table) - 1)
        i = min(int(g), len(table) - 2)
        return table[i] + (g - i) * (table[i + 1] - table[i])

    def f_prime(self, z, e_kev):
        """f′ in electrons at ``e_kev`` (linear in λ)."""
        lam, fp = _nodes(int(z))[1]
        return float(interp_nodes(HC_KEV_PM / e_kev, lam, fp))

    def f_second(self, z, e_kev):
        """xraylib's (negative) ``Fii`` at ``e_kev`` (log–log in λ)."""
        xs, ys = _nodes(int(z))[2]
        return -math.exp(float(interp_nodes(math.log(HC_KEV_PM / e_kev), xs, ys)))

    def atomic_weight(self, z):
        """Atomic weight in g/mol."""
        return element_tables()["elements"][int(z) - 1]["atomic_weight"]

    def sigma_cm2(self, z, lambda_pm):
        """Atomic cross-section σ(λ) in cm²: log–log, sharp at the edges, end values held."""
        xs, ys = _nodes(int(z))[0]
        return np.exp(interp_nodes(np.log(np.asarray(lambda_pm, dtype=float)), xs, ys))

    def cs_total_cm2_g(self, z, lambda_pm):
        """Mass cross-section in cm²/g: σ(λ) / (A/N_A)."""
        return self.sigma_cm2(z, lambda_pm) / (self.atomic_weight(z) / AVOGADRO_PER_MOL)

    def edges_pm(self, zs):
        """Absorption edges (pm) of the elements ``zs`` inside the μ/ρ grid, sorted: the K, L and
        M steps of every element (information; μ is read from ``mu_nodes``)."""
        return tuple(
            sorted({e for z in zs for e in element_tables()["elements"][z - 1]["edges_pm"]})
        )


TABLES = TableAtoms()


def from_input(d):
    """The ``Crystal`` of a Forge input dict (the ``input`` of ``artifacts/fixtures/forge``: name,
    cell, basis, cut, reflectivity_model, mosaic_fwhm_deg, source): what the browser receives."""
    cell = d["cell"]
    return Crystal(
        d["name"], cell["a_pm"], cell["b_pm"], cell["c_pm"], cell["alpha_deg"], cell["beta_deg"],
        cell["gamma_deg"], tuple(tuple(a) for a in d["basis"]), tuple(d["cut"]),
        d.get("source", ""),
        reflectivity_model=d["reflectivity_model"], mosaic_fwhm_deg=d["mosaic_fwhm_deg"],
    )  # fmt: skip


def forged(crystal):
    """``crystal`` with its atomic data from the element tables and no calibration-anchor status
    (a forged crystal carries the user's B per atom, never the NaCl-fitted one)."""
    c = dataclasses.replace(crystal, atoms=TABLES, fitted_debye_waller=False, d_anchor_pm=None)
    if scan.max_order(c) > MAX_ORDERS:
        raise ForgeInputError(
            "too_many_orders",
            f"{c.name}: {scan.max_order(c)} orders (limit {MAX_ORDERS}): cell too large",
        )
    return c


def entry(crystal):
    """The ``artifacts/tables/crystals.json`` entry of ``crystal`` from the element tables only:
    exactly the keys ``export_artifacts._crystal_tables`` writes for a preset, so
    ``scan.expected_rate(..., crystal=forged(crystal))`` and the port agree, plus
    ``mu_nodes_pm`` / ``mu_nodes_per_cm`` (the μ the port reads: log–log between these nodes, a
    step at repeated λ; ``mu_per_cm`` is the same on the μ/ρ grid and ``mu_edges_pm`` the list of
    edges, both informational). The ``extinction`` rows are y·κ (``crystal.extinction_table``),
    not rounded. Sources: see ``crystal`` (Warren 1969; Authier 2001) and ``element_tables``."""
    c = forged(crystal)
    n_max = scan.max_order(c)
    return {
        "a_pm": c.a_pm, "b_pm": c.b_pm, "c_pm": c.c_pm,
        "alpha_deg": c.alpha_deg, "beta_deg": c.beta_deg, "gamma_deg": c.gamma_deg,
        "cut": list(c.cut),
        "d_pm": d_pm(c),
        "density_g_cm3": density_g_cm3(c),
        "reflectivity_model": c.reflectivity_model,
        "mosaic_fwhm_deg": c.mosaic_fwhm_deg,
        "extinction": [[float(v) for v in row] for row in extinction_table(c)],
        "fitted_debye_waller": False,
        "source": c.source,
        "max_order": n_max,
        "cell_scale": cell_scale(c),
        "f_sq_rel": list(structure_factor_sq_rel_crystal(c, n_max)),
        "allowed_orders": list(allowed_orders(c)),
        "mu_per_cm": [float(v) for v in mu_per_cm_table(c)],
        "mu_edges_pm": list(mu_edges_pm(c)),
        "mu_nodes_pm": [float(x) for x in _mu_nodes(c)[0]],
        "mu_nodes_per_cm": [float(x) for x in _mu_nodes(c)[1]],
    }  # fmt: skip


def warnings(crystal):
    """Codes (no UI text) for a design a student should reconsider; empty if none.

    ``atoms_too_close``: two atoms closer than ``MIN_ATOM_DISTANCE_PM`` (minimum image over the
    neighbouring cells, an atom's own image included; atoms within 1 pm are one mixed site and
    ignored; 70 pm is below the shortest bond, H₂ 74 pm, so O–H and N–H do not alarm).
    ``many_orders``: more than ``MANY_ORDERS`` orders (slow to build). ``no_line_reflects``: no
    non-extinct order reaches Mo Kα or Kβ below the goniometer limit (n λ > 2 d sin 85°). A
    crystal whose cut reflection is itself absent is refused by ``Crystal`` (ValueError), so it
    never gets here. Minimum image: Warren, *X-ray Diffraction* (1969), ch. 1 (metric tensor)."""
    out = []
    g = _metric_tensor_pm2(crystal)
    xyz = np.array([a[1:4] for a in crystal.basis], dtype=float)
    shifts = np.array(np.meshgrid(*[(-1, 0, 1)] * 3)).reshape(3, -1).T
    diff = xyz[:, None, :] - xyz[None, :, :]
    diff -= np.round(diff)  # wrap into [−½, ½]; the ±1 shifts cover skewed cells
    v = diff[:, :, None, :] + shifts[None, None, :, :]
    dist = np.sqrt(np.einsum("ijsa,ab,ijsb->ijs", v, g, v))
    dist[(dist < 1.0)] = np.inf  # the atom itself / the same mixed site
    if dist.min() < MIN_ATOM_DISTANCE_PM:
        out.append("atoms_too_close")
    d = d_pm(crystal)
    reach = 2 * d * math.sin(math.radians(scan.BETA_MAX_DEG))
    orders = allowed_orders(dataclasses.replace(crystal, atoms=TABLES))  # table f₀, as the browser
    if not any(n * lam <= reach for n in orders for lam in (MO_KA_PM, MO_KB_PM)):
        out.append("no_line_reflects")
    if scan.max_order(crystal) > MANY_ORDERS:
        out.append("many_orders")
    return tuple(out)
