"""Materials Forge: a crystal built only from the per-element tables must reproduce the
xraylib-built presets within the stated interpolation errors, and the crystallographic facts."""

import dataclasses
import functools
import math

import numpy as np
import pytest
import xraylib
from pytest import approx

from braggsim import crystal, forge, scan
from braggsim.constants import HC_KEV_PM, MO_KA_PM
from braggsim.crystal import (
    NACL,
    PRESETS,
    Crystal,
    _chis,
    _chis_full,
    _y_darwin,
    allowed_orders,
    build_basis,
    cell_scale,
    cell_volume_A3,
    d_pm,
    interp_nodes,
    mu_per_cm_table,
    structure_factor_sq,
    structure_factor_sq_hkl,
)
from braggsim.filters import MU_RHO_GRID_PM


@functools.cache
def _entry(name):
    return forge.entry(PRESETS[name])


# ---- element tables vs xraylib ----------------------------------------------------------------


def test_f0_table_interpolation_error_is_below_1e_3_of_f0_for_s_above_0_03():
    """|Δf₀| ≤ 1e-3 max(f₀, 1) e⁻ for every Z at s ≥ 0.03 Å⁻¹ (the first-order s of any crystal
    the lab can hold); below it xraylib's own FF_Rayl has a cusp that a 0.01 Å⁻¹ grid cannot
    follow, 1.2e-3 at worst."""
    s = np.linspace(0, 3.0, 1501)
    worst_all = worst_far = 0.0
    for z in range(1, 93):
        ref = np.array([xraylib.FF_Rayl(z, x) for x in s])
        got = np.array([forge.TABLES.f0(z, x) for x in s])
        err = np.abs(got - ref) / np.maximum(ref, 1.0)
        worst_all = max(worst_all, err.max())
        worst_far = max(worst_far, err[s >= 0.03].max())
    assert worst_far < 1e-3
    assert worst_all < 1.5e-3


def test_cross_section_interpolation_error_away_from_edges_is_below_1e_3():
    lam = np.geomspace(31, 599, 700)
    worst = 0.0
    for z in range(1, 93):
        edges = np.array(forge.element_tables()["elements"][z - 1]["edges_pm"])
        ok = np.ones(len(lam), bool)
        for e in edges:
            ok &= np.abs(lam / e - 1) > 5e-3  # the kink next to a step is outside the claim
        ref = np.array([xraylib.CS_Total(z, HC_KEV_PM / x) for x in lam])
        got = (
            forge.TABLES.cs_total_cm2_g(z, lam)
            * forge.TABLES.atomic_weight(z)
            / xraylib.AtomicWeight(z)
        )
        worst = max(worst, np.abs(got / ref - 1)[ok].max())
    assert worst < 1.5e-3


def test_cross_section_steps_sharply_at_the_zirconium_k_edge():
    k_edge = min(e for e in forge.element_tables()["elements"][39]["edges_pm"] if 60 < e < 80)
    below, above = (forge.TABLES.cs_total_cm2_g(40, [k_edge * (1 + d)])[0] for d in (-1e-6, 1e-6))
    assert k_edge == approx(68.887, abs=0.01)
    assert above / below == approx(1 / 6.0, rel=0.3)  # Zr K jump ≈ 6 (absorption falls past it)
    assert below > above


def test_anomalous_terms_stay_close_to_xraylib_at_the_mo_lines():
    for z in (8, 14, 20, 30, 40, 42, 56, 82):
        e = HC_KEV_PM / MO_KA_PM
        assert forge.TABLES.f_prime(z, e) == approx(xraylib.Fi(z, e), abs=0.3)
        assert forge.TABLES.f_second(z, e) == approx(xraylib.Fii(z, e), rel=0.1, abs=0.06)


def test_element_table_is_the_rounded_exported_precision():
    t = forge.element_tables()
    assert len(t["elements"]) == 92
    assert t["elements"][10]["symbol"] == "Na"
    assert t["elements"][10]["atomic_weight"] == approx(xraylib.AtomicWeight(11), rel=1e-12)
    assert all(x == round(x, forge.F0_DECIMALS) for x in t["elements"][16]["f0"])


# ---- forged presets reproduce the presets -------------------------------------------------------


def _row_tolerance(f_sq_rel):
    """κ divides by a nearly cancelled F₀ for a weak order, so the 0.06 e⁻ table errors of f′, f″
    are amplified there; such an order carries |F|² of the same small size in the rate."""
    return 0.01 if f_sq_rel >= 1e-2 else 0.05 if f_sq_rel >= 1e-3 else 0.15


@pytest.mark.parametrize("name", ["LiF", "Si", "calcite", "muscovite"])
def test_forged_preset_reproduces_the_xraylib_preset_scalars_mu_and_sampled_rows(name):
    """Everything but the full rows (those are built once for the three light cases below; the
    muscovite entry takes 40 s): d, orders, density, f_sq_rel, cell_scale, μ and sampled y·κ."""
    from braggsim.crystal import allowed_orders as allowed
    from braggsim.crystal import density_g_cm3, extinction_table, mu_edges_pm
    from braggsim.crystal import structure_factor_sq_rel_crystal as f_rel

    c = PRESETS[name]
    f = forge.forged(c)
    n_max = scan.max_order(c)
    assert d_pm(f) == d_pm(c)
    assert scan.max_order(f) == n_max
    assert allowed(f) == allowed(c)
    assert density_g_cm3(f) == approx(density_g_cm3(c), rel=1e-9)
    assert cell_scale(f) == approx(cell_scale(c), rel=1e-3)
    assert f_rel(f, n_max) == approx(f_rel(c, n_max), rel=1e-3)
    mu, ref = mu_per_cm_table(f), mu_per_cm_table(c)
    edges = np.array(mu_edges_pm(c))
    away = np.ones(len(ref), bool)
    for lam_e in edges:
        away &= np.abs(MU_RHO_GRID_PM / lam_e - 1) > 5e-3
    assert np.max(np.abs(mu / ref - 1)[away]) < 1e-3
    for lam_e in edges:  # every K / L edge of the preset is in the forged list (which adds M)
        assert min(abs(np.array(mu_edges_pm(f)) - lam_e)) < 0.01
    assert f.fitted_debye_waller is False
    assert f.reflectivity_model == c.reflectivity_model
    rows = extinction_table(c)
    rng = np.random.default_rng(7)
    for _ in range(25):  # y·κ at random (order, λ) of the table
        n = int(rng.integers(1, n_max + 1))
        lam = float(rng.uniform(35, min(600, 2 * d_pm(c) * 0.99 / n)))
        want = float(crystal.extinction_factor(c, n, lam))
        got = crystal._extinction_raw(f, n, lam)
        assert got == approx(want, rel=_row_tolerance(f_rel(c, n_max)[n - 1]) + 0.02), (n, lam)
    assert len(rows) == n_max


@pytest.mark.parametrize("name", ["LiF", "Si", "calcite"])
def test_forged_entry_rows_reproduce_the_preset_rows(name):
    c = PRESETS[name]
    e = _entry(name)
    rows = crystal.extinction_table(c)
    assert len(e["extinction"]) == len(rows)
    for n, (got, want) in enumerate(zip(e["extinction"], rows, strict=True), start=1):
        assert len(got) == len(want)
        assert np.max(np.abs(np.array(got) / want - 1)) < _row_tolerance(e["f_sq_rel"][n - 1]), n
    assert e["d_pm"] == d_pm(c)
    assert e["max_order"] == scan.max_order(c)
    assert e["fitted_debye_waller"] is False


def test_forged_entry_has_the_keys_of_a_preset_entry():
    import json
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / "artifacts" / "tables" / "crystals.json"
    preset = json.loads(path.read_text("utf-8"))["crystals"]["Si"]
    assert set(_entry("Si")) - set(preset) == {"mu_nodes_pm", "mu_nodes_per_cm"}
    assert set(preset) <= set(_entry("Si"))


def test_forged_density_is_the_xraylib_density():
    from braggsim.crystal import density_g_cm3

    assert _entry("calcite")["density_g_cm3"] == approx(2.71, rel=0.01)
    assert _entry("Si")["density_g_cm3"] == approx(density_g_cm3(PRESETS["Si"]), rel=1e-9)


def test_forged_nacl_copy_is_the_cell_scale_reference():
    """The reference for cell_scale is NaCl from the same tables, so NaCl itself gives 1."""
    copy = dataclasses.replace(NACL, name="NaCl copy", fitted_debye_waller=False, d_anchor_pm=None)
    assert cell_scale(forge.forged(copy)) == approx(1.0, rel=1e-12)


def test_scan_of_a_forged_preset_matches_the_preset_scan():
    beta = scan.coupled_betas(4.0, 12.0, 0.1)
    c = PRESETS["LiF"]
    ref = scan.expected_rate(beta, 35.0, 1.0, crystal=c)
    got = scan.expected_rate(beta, 35.0, 1.0, crystal=forge.forged(c))
    assert got == approx(ref, rel=0.01)


# ---- crystallographic facts through the forged path ---------------------------------------------


def test_silicon_200_and_222_are_absent_in_the_forged_diamond_lattice():
    si = forge.forged(PRESETS["Si"])
    f111 = structure_factor_sq(si, 1)
    assert structure_factor_sq_hkl(si, 2, 0, 0) < 1e-12 * f111
    assert structure_factor_sq_hkl(si, 2, 2, 2) < 1e-12 * f111
    assert 2 not in allowed_orders(si)
    assert {1, 3, 4, 5} <= set(allowed_orders(si))


def test_rock_salt_111_odd_orders_follow_the_difference_of_the_form_factors():
    """Along (111) of a rock salt, odd n have h k l all odd: F = 4 (f_A − f_B)."""
    sites = [(((11, 1.0),), (0, 0, 0), 0.0), (((17, 1.0),), (0.5, 0, 0), 0.0)]
    fcc = ((0, 0, 0), (0, 0.5, 0.5), (0.5, 0, 0.5), (0.5, 0.5, 0))
    c = Crystal(
        "NaCl (111)", 564.02, 564.02, 564.02, 90.0, 90.0, 90.0,
        build_basis(sites, centrings=fcc), (1, 1, 1), "test",
    )  # fmt: skip
    f = forge.forged(c)
    d = d_pm(f)
    for n in (1, 3, 5):
        s = n / (2 * d / 100)
        want = (4 * (forge.TABLES.f0(17, s) - forge.TABLES.f0(11, s))) ** 2
        assert structure_factor_sq(f, n) == approx(want, rel=1e-9)
    s = 2 / (2 * d / 100)  # the even order adds the two: (222) is strong
    assert structure_factor_sq(f, 2) == approx(
        (4 * (forge.TABLES.f0(17, s) + forge.TABLES.f0(11, s))) ** 2, rel=1e-9
    )


# ---- warnings -----------------------------------------------------------------------------------


def _cubic(name, a_pm, atoms, cut=(0, 0, 1)):
    return Crystal(name, a_pm, a_pm, a_pm, 90.0, 90.0, 90.0, tuple(atoms), cut, "test")


def test_warning_atoms_closer_than_70_pm_fires_across_the_cell_boundary():
    c = _cubic("close", 400.0, [(14, 0.0, 0, 0, 0.5, 1.0), (14, 0.9, 0, 0, 0.5, 1.0)])
    assert "atoms_too_close" in forge.warnings(c)  # 0.1 a = 40 pm through the boundary
    oh = _cubic("O-H", 400.0, [(8, 0.0, 0, 0, 0.5, 1.0), (1, 0.2425, 0, 0, 0.5, 1.0)])
    assert "atoms_too_close" not in forge.warnings(oh)  # 97 pm bond: below no known bond length


def test_warning_atoms_separated_by_a_lattice_vector_alone_are_flagged_when_cell_is_tiny():
    c = _cubic("tiny", 60.0, [(14, 0.0, 0, 0, 0.5, 1.0)])
    assert "atoms_too_close" in forge.warnings(c)  # an atom and its own image, 60 pm


def test_warning_no_mo_line_reflects_when_the_spacing_is_below_half_the_wavelength():
    c = _cubic("small", 30.0, [(14, 0.0, 0, 0, 0.5, 1.0)])
    assert "no_line_reflects" in forge.warnings(c)


def test_warning_every_order_absent_is_refused_by_the_crystal_itself():
    fcc = ((0, 0, 0), (0, 0.5, 0.5), (0.5, 0, 0.5), (0.5, 0.5, 0))
    basis = build_basis([(((14, 1.0),), (0, 0, 0), 0.5)], centrings=fcc)
    with pytest.raises(ValueError, match="systematically absent"):
        Crystal("fcc (100)", 543.0, 543.0, 543.0, 90.0, 90.0, 90.0, basis, (1, 0, 0), "test")


def test_good_crystals_and_mixed_sites_raise_no_warning():
    for name in ("LiF", "Si", "calcite", "muscovite"):
        assert forge.warnings(PRESETS[name]) == ()


# ---- speed trade-off of the forge-only quadrature ----------------------------------------------


def test_forge_quadrature_keeps_y_within_2e_3_of_the_2001_point_value():
    si = forge.forged(PRESETS["Si"])
    for n, lam in ((1, 71.08), (4, 63.1), (3, 120.0)):
        chi0, chi_h, chi_hb, theta, _ = _chis(si, n, lam)
        ref = _y_darwin(chi0, chi_h, chi_hb, theta)
        assert _y_darwin(chi0, chi_h, chi_hb, theta, forge.FORGE_N_POINTS) == approx(ref, rel=2e-3)
    assert forge.FORGE_N_POINTS == 201


def test_forge_quadrature_error_grows_as_absorption_vanishes_but_stays_below_2e_3():
    """g = Im χ_0/|S| → 0 (a nearly transparent perfect crystal) is the hard case of the
    substitution t = w tan φ: 1e-4 at g = 1e-2, 1.05e-3 at 1e-3, 1.8e-3 at 1e-4."""
    theta = math.radians(10.0)
    for g in (1e-2, 1e-3, 1e-4):
        chi_h = 1e-5 + 0j
        chi0 = complex(-3e-5, g * abs(chi_h))
        ref = _y_darwin(chi0, chi_h, chi_h, theta, 20001)
        got = _y_darwin(chi0, chi_h, chi_h, theta, forge.FORGE_N_POINTS)
        assert got == approx(ref, rel=2e-3), g


# ---- y can exceed 1 (anomalous absorption), κ, the reflectivity factor --------------------------


def test_pure_imaginary_structure_factor_gives_y_above_one_by_the_second_order_term():
    """f″ alone (|χ_h| = ε Im χ_0, centrosymmetric): Re(χ_h χ_h̄) = −|χ_h|², and
    y − 1 ≈ (⟨C⁴⟩/⟨C²⟩) ε²/8 with ⟨C^m⟩ the mean over the two polarizations."""
    theta = math.radians(15.0)
    c2 = math.cos(2 * theta) ** 2
    eps = 0.05
    chi0 = complex(-2e-5, 1e-6)
    chi_h = 1j * eps * chi0.imag
    y = _y_darwin(chi0, chi_h, chi_h, theta)
    assert y > 1
    assert y - 1 == approx((1 + c2**2) / (1 + c2) * eps**2 / 8, rel=0.03)


def test_pure_absorption_grating_limit_of_y_is_between_1_16_and_1_25():
    for deg in (2.0, 20.0, 60.0, 85.0):
        chi0 = complex(-2e-5, 1e-6)
        chi_h = 1j * chi0.imag  # |χ_h| = Im χ_0: the strongest possible absorption grating
        assert 1.16 < _y_darwin(chi0, chi_h, chi_h, math.radians(deg)) < 1.25, deg


def test_darwin_y_above_the_guard_is_an_error_and_mosaic_blocks_have_no_coherent_gain(monkeypatch):
    lif = forge.forged(PRESETS["LiF"])
    kappa = _chis_full(lif, 1, 71.08)[5]
    monkeypatch.setattr(crystal, "_y_darwin", lambda *a, **k: 1.3)
    with pytest.raises(ArithmeticError):
        crystal._extinction_raw(lif, 1, 71.08)
    monkeypatch.setattr(crystal, "_y_darwin", lambda *a, **k: 1.1)
    got = crystal._extinction_raw(lif, 1, 71.08)  # Darwin gain ignored: the secondary-extinction y
    monkeypatch.setattr(crystal, "_y_darwin", lambda *a, **k: 0.0)
    y_sec = crystal._extinction_raw(lif, 1, 71.08) / kappa  # max(0, ys) = ys
    assert got == approx(y_sec * kappa, rel=1e-12)
    assert y_sec < 1


def test_perfect_crystal_row_keeps_the_gain_above_one_unclipped(monkeypatch):
    si = forge.forged(PRESETS["Si"])
    monkeypatch.setattr(crystal, "_y_darwin", lambda *a, **k: 1.1)
    assert crystal._extinction_raw(si, 1, 71.08) == approx(1.1 * _chis_full(si, 1, 71.08)[5])


def _kappa_by_hand(c, n, lam):
    e = HC_KEV_PM / lam
    s = n / (2 * d_pm(c) / 100)
    f = f0 = 0j
    for z, x, y, zz, b, occ in c.basis:
        ph = np.exp(2j * np.pi * (n * np.dot((x, y, zz), c.cut)))
        damp = occ * math.exp(-b * s * s) * ph
        f0 += damp * c.atoms.f0(z, s)
        f += damp * (c.atoms.f0(z, s) + c.atoms.f_prime(z, e) + 1j * c.atoms.f_second(z, e))
    return abs(f) ** 2 / abs(f0) ** 2


def test_ideal_mosaic_row_is_the_anomalous_dispersion_factor_kappa():
    """A Zr-O ideal mosaic: no extinction, the whole reflectivity factor is κ, and at Mo Kα (just
    above the Zr K edge, 68.9 pm) it differs from 1 by tens of per cent."""
    basis = ((40, 0, 0, 0, 0.4, 1.0), (8, 0.5, 0.5, 0.5, 0.6, 1.0))
    c = Crystal("ZrO", 450.0, 450.0, 450.0, 90.0, 90.0, 90.0, basis, (0, 0, 1), "test")
    f = forge.forged(c)
    for lam in (71.08, 63.095, 120.0):
        assert crystal._extinction_raw(f, 1, lam) == approx(_kappa_by_hand(f, 1, lam), rel=1e-9)
    assert abs(crystal._extinction_raw(f, 1, 71.08) - 1) > 0.05
    assert crystal._extinction_raw(f, 1, 63.095) != approx(
        crystal._extinction_raw(f, 1, 71.08), rel=0.02
    )


def test_light_element_crystal_has_kappa_close_to_one():
    assert _kappa_by_hand(forge.forged(PRESETS["LiF"]), 1, 71.08) == approx(1.0, abs=0.01)


def test_anomalous_dispersion_enters_the_cross_crystal_scale_for_a_forged_ideal_mosaic():
    basis = ((40, 0, 0, 0, 0.4, 1.0), (8, 0.5, 0.5, 0.5, 0.6, 1.0))
    c = forge.forged(Crystal("ZrO", 450.0, 450.0, 450.0, 90.0, 90.0, 90.0, basis, (0, 0, 1), "t"))
    ratio = crystal.extinction_ratio(c, 1, 71.08)
    assert ratio == approx(
        crystal.extinction_factor(c, 1, 71.08) / crystal.extinction_factor(NACL, 1, 71.08)
    )
    assert ratio != approx(1.0, abs=0.02)


# ---- μ of a forged crystal: exact nodes, edges as steps -----------------------------------------


@pytest.mark.parametrize(("za", "zb"), [(29, 70), (40, 42)])
def test_forged_mu_is_the_mixture_of_the_element_cross_sections_even_inside_the_edges(za, zb):
    basis = ((za, 0, 0, 0, 0.5, 1.0), (zb, 0.5, 0.5, 0.5, 0.5, 1.0))
    c = forge.forged(Crystal("pair", 450.0, 450.0, 450.0, 90.0, 90.0, 90.0, basis, (0, 0, 1), "t"))
    t = forge.element_tables()["elements"]
    edges = sorted({e for z in (za, zb) for e in t[z - 1]["edges_pm"]})
    rng = np.random.default_rng(3)
    lam = np.concatenate(
        [rng.uniform(31, 599, 300)]
        + [e + rng.uniform(-0.5, 0.5, 20) for e in edges]
        + [[e * (1 - 1e-7), e * (1 + 1e-7)] for e in edges]
    )
    lam = lam[(lam > 30) & (lam < 600)]
    v_cm3 = cell_volume_A3(c) * 1e-24
    want = sum(np.exp(interp_nodes(np.log(lam), *forge._nodes(z)[0])) for z in (za, zb)) / v_cm3
    got = crystal.linear_attenuation_per_cm(c, lam)
    assert np.max(np.abs(got / want - 1)) < 2e-3
    # a step is a step: just below an edge μ is larger than just above it
    for e in edges:
        hi, lo = crystal.linear_attenuation_per_cm(c, np.array([e * (1 - 1e-7), e * (1 + 1e-7)]))
        assert hi >= lo * (1 - 1e-9)


# ---- validation at the trust boundary ----------------------------------------------------------


def _atoms(*atoms):
    return Crystal("v", 450.0, 450.0, 450.0, 90.0, 90.0, 90.0, tuple(atoms), (0, 0, 1), "t")


@pytest.mark.parametrize(
    ("atoms", "message", "code"),
    [
        (((0, 0, 0, 0, 0.5, 1.0),), "atomic number", "bad_z"),
        (((93, 0, 0, 0, 0.5, 1.0),), "atomic number", "bad_z"),
        (((14.5, 0, 0, 0, 0.5, 1.0),), "atomic number", "bad_z"),
        (((14, 0, 0, 0, 0.5, 0.0),), "occupancy", "bad_occupancy"),
        (((14, 0, 0, 0, 0.5, 1.5),), "occupancy", "bad_occupancy"),
        (((14, 0, 0, 0, -0.1, 1.0),), "negative", "bad_b"),
        (((14, 0, 0, 0, 30.5, 1.0),), "above", "b_too_large"),
        (((14, 0, 0, 0, float("nan"), 1.0),), "Z, x, y, z", "bad_atom"),
        (((14, 0, 0, 0, 0.5, 0.7), (8, 0, 0, 0, 0.5, 0.6)), "occupancy above 1", "site_overfilled"),
    ],
)
def test_forged_input_outside_the_trust_boundary_is_refused(atoms, message, code):
    with pytest.raises(crystal.ForgeInputError, match=message) as e:
        _atoms(*atoms)
    assert e.value.code == code and isinstance(e.value, ValueError)


@pytest.mark.parametrize(
    "cut", [(0.5, 0, 0), (float("nan"), 1, 0), (1, float("inf"), 0), (0, 0, 0), (1, 0)]
)
def test_cut_must_be_three_finite_integers_not_all_zero(cut):
    with pytest.raises(crystal.ForgeInputError) as e:
        Crystal("v", 450.0, 450.0, 450.0, 90.0, 90.0, 90.0, ((14, 0, 0, 0, 0.5, 1.0),), cut, "t")
    assert e.value.code == "bad_cut"
    assert _atoms((14, 0, 0, 0, 0.5, 1.0)).cut == (0, 0, 1)


def _b_crystal(b, model="darwin", eta=None):
    return Crystal("b", 450.0, 450.0, 450.0, 90.0, 90.0, 90.0, ((14, 0, 0, 0, b, 1.0),), (0, 0, 1),
                   "t", reflectivity_model=model, mosaic_fwhm_deg=eta)  # fmt: skip


@pytest.mark.parametrize(("model", "eta"), [("darwin", None), ("mosaic_extinction", 0.2)])
def test_the_largest_accepted_b_gives_finite_rows_and_rates(model, eta):
    c = _b_crystal(crystal.MAX_B_A2, model, eta)
    assert all(
        np.all(np.isfinite(r)) and np.all(np.array(r) > 0) for r in forge.entry(c)["extinction"]
    )
    rate = scan.expected_rate(np.arange(5.0, 20.0, 0.5), 35.0, 1.0, crystal=forge.forged(c))
    assert np.all(np.isfinite(rate))
    with pytest.raises(crystal.ForgeInputError) as e:
        _b_crystal(crystal.MAX_B_A2 + 1)
    assert e.value.code == "b_too_large"


@pytest.mark.parametrize(("model", "eta"), [("darwin", None), ("mosaic_extinction", 0.2)])
def test_a_vanishing_structure_amplitude_gives_the_kinematic_limit_y_one(monkeypatch, model, eta):
    """χ_h χ_h̄ = 0 (e^{−B s²} underflowed) is 0/0 in both y integrals: y = 1, κ still applies."""
    c = forge.forged(_b_crystal(0.5, model, eta))
    real = crystal._chis_full

    def vanished(*a):
        chi0, _, _, theta, mu, _ = real(*a)
        return chi0, 0j, 0j, theta, mu, 0.75

    monkeypatch.setattr(crystal, "_chis_full", vanished)
    assert crystal._extinction_raw(c, 1, MO_KA_PM) == approx(0.75, rel=1e-15)


def test_interp_nodes_steps_ends_and_nan():
    xs, ys = [0.0, 1.0, 1.0, 2.0], [0.0, 10.0, 20.0, 40.0]
    f = lambda x: float(interp_nodes(x, xs, ys))  # noqa: E731
    assert f(0.5) == 5.0 and f(1.5) == 30.0
    assert f(1.0) == 20.0  # exactly on the repeated abscissa: the value after the step
    assert f(1.0 - 1e-12) == approx(10.0, rel=1e-9)  # just below: the one before
    assert f(-5.0) == 0.0 and f(9.0) == 40.0  # ends held
    assert math.isnan(f(float("nan")))


def test_a_mixed_site_filled_exactly_is_accepted_and_impossible_angles_are_refused():
    _atoms((14, 0.1, 0.2, 0.3, 0.5, 0.75), (13, 0.1, 0.2, 0.3, 0.5, 0.25))
    with pytest.raises(ValueError, match="det G"):
        Crystal(
            "flat",
            450.0,
            450.0,
            450.0,
            150.0,
            150.0,
            150.0,
            ((14, 0, 0, 0, 0.5, 1.0),),
            (0, 0, 1),
            "t",
        )


def test_a_large_user_b_does_not_make_a_present_cut_systematically_absent():
    c = _atoms(
        (14, 0, 0, 0, 30.0, 1.0)
    )  # e^{−2·30·s²} is tiny at s = 1/(2d), but the atom is there
    assert 1 in allowed_orders(c)


def test_absent_cut_message_names_the_smallest_present_multiple():
    fcc = ((0, 0, 0), (0, 0.5, 0.5), (0.5, 0, 0.5), (0.5, 0.5, 0))
    basis = build_basis([(((14, 1.0),), (0, 0, 0), 0.5)], centrings=fcc)
    with pytest.raises(crystal.ForgeInputError, match=r"use the cut \(2, 0, 0\)") as e:
        Crystal("fcc", 543.0, 543.0, 543.0, 90.0, 90.0, 90.0, basis, (1, 0, 0), "t")
    assert e.value.code == "cut_absent" and e.value.hint == (2, 0, 0)


def test_many_orders_warns_and_an_oversized_cell_is_refused():
    big = Crystal(
        "big", 2400.0, 2400.0, 2400.0, 90.0, 90.0, 90.0, ((14, 0, 0, 0, 0.5, 1.0),), (0, 0, 1), "t"
    )
    assert scan.max_order(big) > forge.MANY_ORDERS
    assert "many_orders" in forge.warnings(big)
    huge = dataclasses.replace(big, a_pm=5000.0, b_pm=5000.0, c_pm=5000.0)
    with pytest.raises(crystal.ForgeInputError, match="orders") as e:
        forge.forged(huge)
    assert e.value.code == "too_many_orders"
    assert "many_orders" not in forge.warnings(PRESETS["muscovite"])
