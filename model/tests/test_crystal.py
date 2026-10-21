import numpy as np
import pytest
from pytest import approx
from xraylib import FF_Rayl

from braggsim import scan
from braggsim.constants import D_NACL_PM, MO_KA_PM, MO_KB_PM
from braggsim.crystal import (
    CALCITE,
    LIF,
    MUSCOVITE,
    NACL,
    PRESETS,
    SI,
    Crystal,
    build_basis,
    cell_volume_A3,
    d_pm,
    density_g_cm3,
    dlambda_dtheta_pm_per_deg,
    lambda_from_theta,
    linear_attenuation_per_cm,
    structure_factor_sq,
    structure_factor_sq_hkl,
    structure_factor_sq_rel,
    theta_from_lambda,
)

# LD P6.3.3.1 Table 2: expected glancing angles at NaCl (d = 282.01 pm), degrees, two decimals.
TABLE_2 = [
    (1, 7.24, 6.42),
    (2, 14.60, 12.93),
    (3, 22.21, 19.61),
]


@pytest.mark.parametrize(("n", "theta_ka", "theta_kb"), TABLE_2)
def test_bragg_angles_reproduce_leaflet_table_2(n, theta_ka, theta_kb):
    assert round(float(theta_from_lambda(MO_KA_PM, n)), 2) == theta_ka
    assert round(float(theta_from_lambda(MO_KB_PM, n)), 2) == theta_kb


@pytest.mark.parametrize("n", [1, 2, 3])
def test_lambda_from_theta_inverts_theta_from_lambda(n):
    lam = np.array([40.0, 71.08, 150.0])
    assert lambda_from_theta(theta_from_lambda(lam, n), n) == approx(lam, rel=1e-12)


def test_no_reflection_when_n_lambda_exceeds_2d():
    assert np.isnan(theta_from_lambda(2 * D_NACL_PM + 1.0, 1))
    assert np.isnan(theta_from_lambda(MO_KA_PM, 8))  # 8 · 71.08 pm > 564.02 pm
    assert theta_from_lambda(2 * D_NACL_PM, 1) == approx(90.0)


@pytest.mark.parametrize("d", [282.01, 201.4, 998.5])
@pytest.mark.parametrize("n", [1, 2, 3])
def test_jacobian_matches_numerical_derivative(n, d):
    theta = np.array([3.0, 7.24, 20.0])
    h = 1e-5
    numeric = (lambda_from_theta(theta + h, n, d) - lambda_from_theta(theta - h, n, d)) / (2 * h)
    assert dlambda_dtheta_pm_per_deg(theta, n, d) == approx(numeric, rel=1e-7)


def test_lorentz_polarization_factor_textbook_values():
    from braggsim.crystal import lorentz_polarization

    # (1 + cos²2θ) / (2 sin 2θ): at θ = 45° the polarization term is 1/2 and sin 2θ = 1.
    assert lorentz_polarization(45.0) == approx(0.5)
    # At small θ it approaches 1/sin 2θ (fully unpolarized-beam limit).
    assert lorentz_polarization(1.0) == approx(1 / np.sin(np.radians(2.0)), rel=1e-3)


def test_unphysical_inputs_give_nan_not_a_wrong_angle():
    assert np.isnan(theta_from_lambda(-50.0))
    assert np.isnan(theta_from_lambda(71.08, n=0))
    assert np.isnan(lambda_from_theta(95.0)) and np.isnan(lambda_from_theta(-1.0))


def test_structure_factor_ratios_of_the_nacl_h00_orders():
    # Kinematic |F|² of (400), (600) relative to (200) from xraylib FF_Rayl(Na) + FF_Rayl(Cl);
    # the ratio falls because the form factors fall with sin θ / λ.
    r = structure_factor_sq_rel(3)
    assert r == approx((1.0, 0.481, 0.268), abs=0.001)


def test_crystal_engine_reproduces_the_nacl_closed_form_to_1e_12():
    n_max = scan.MAX_ORDER
    generic = [structure_factor_sq(NACL, n) for n in range(1, n_max + 1)]
    old = structure_factor_sq_rel(n_max)
    assert [f / generic[0] for f in generic] == approx(old, rel=1e-12)


def test_crystal_nacl_is_the_anchor_with_exact_d_and_fitted_thermal_motion():
    assert d_pm(NACL) == D_NACL_PM  # exactly, so fixtures stay byte-identical
    assert NACL.fitted_debye_waller and all(atom[4] == 0.0 for atom in NACL.basis)
    assert not any(c.fitted_debye_waller for c in (LIF, SI, CALCITE, MUSCOVITE))


# (d in pm, θ(Mo Kα, n = 1) in degrees) per preset: model/PARAMETERS.md, "Crystal presets".
@pytest.mark.parametrize(
    ("crystal", "d", "theta"),
    [
        (NACL, 282.01, 7.2399),
        (LIF, 201.4, 10.1639),
        (SI, 313.560, 6.5081),
        (CALCITE, 303.51, 6.7246),
        (MUSCOVITE, 998.5, 2.0397),
    ],
)
def test_crystal_presets_spacing_and_mo_ka_angle(crystal, d, theta):
    assert d_pm(crystal) == approx(d, abs=0.05)
    assert float(theta_from_lambda(MO_KA_PM, 1, d_pm(crystal))) == approx(theta, abs=1e-3)


def test_crystal_metric_tensor_gives_the_cubic_and_hexagonal_textbook_spacings():
    assert d_pm(SI, (2, 2, 0)) == approx(543.1020511 / np.sqrt(8), rel=1e-12)
    hexagonal = (4 / 3 / 498.8**2) * 1 + 16 / 1706.1**2  # (104): h² + hk + k² = 1
    assert d_pm(CALCITE) == approx(hexagonal**-0.5, rel=1e-12)
    assert d_pm(MUSCOVITE) == approx(2007.0 * np.sin(np.radians(95.71)) / 2, rel=1e-12)


def test_crystal_cell_contents_match_z_times_the_formula():
    assert len(NACL.basis) == len(LIF.basis) == len(SI.basis) == 8
    assert len(CALCITE.basis) == 30  # Z = 6: Ca6 C6 O18
    counts = {z: sum(a[5] for a in CALCITE.basis if a[0] == z) for z in (20, 6, 8)}
    assert counts == {20: 6, 6: 6, 8: 18}
    # Z = 4 KAl2(AlSi3O10)(OH)2: K4 Al12... = 76 heavy atoms with the mixed T sites
    mus = {z: sum(a[5] for a in MUSCOVITE.basis if a[0] == z) for z in (19, 13, 14, 8)}
    assert mus == {
        19: pytest.approx(4),
        13: pytest.approx(12),
        14: pytest.approx(12),
        8: pytest.approx(48),
    }


@pytest.mark.parametrize("crystal", [CALCITE, MUSCOVITE, SI])
def test_crystal_generated_positions_are_distinct_mod_1(crystal):
    keys = [(a[0], a[4], *(round(v * 1e4) % 10000 for v in a[1:4])) for a in crystal.basis]
    # mixed sites repeat a position once per species; nothing else may repeat
    assert len(set(keys)) == len(keys)


def test_crystal_calcite_carbonate_bond_is_128_pm():
    g = np.array(
        [[498.8**2, -0.5 * 498.8**2, 0], [-0.5 * 498.8**2, 498.8**2, 0], [0, 0, 1706.1**2]]
    )
    carbon = np.array([a[1:4] for a in CALCITE.basis if a[0] == 6])
    oxygen = np.array([a[1:4] for a in CALCITE.basis if a[0] == 8])
    best = min(
        np.sqrt((d := o - c + np.array([i, j, k])) @ g @ d)
        for c in carbon[:1]
        for o in oxygen
        for i in (-1, 0, 1)
        for j in (-1, 0, 1)
        for k in (-1, 0, 1)
    )
    assert best == approx(128.0, abs=1.0)  # Markgraf & Reeder: C-O ≈ 1.28 Å


def test_crystal_silicon_200_is_forbidden_and_222_is_nearly_so_for_atoms_at_rest():
    assert structure_factor_sq_hkl(SI, 2, 0, 0) < 1e-20 * structure_factor_sq_hkl(SI, 1, 1, 1)
    at_rest = Crystal(
        "Si at rest", *[543.1] * 3, 90.0, 90.0, 90.0,
        tuple((14, x, y, z, 0.0, 1.0) for _, x, y, z, _, _ in SI.basis), (1, 1, 1), "test",
    )  # fmt: skip
    assert structure_factor_sq(at_rest, 2) / structure_factor_sq(at_rest, 1) < 1e-6
    assert structure_factor_sq(SI, 1) > 0 and structure_factor_sq(SI, 3) > 0  # (111), (333)


def test_crystal_rock_salt_cut_along_111_alternates_with_sum_and_difference_of_form_factors():
    sites = [(((11, 1.0),), (0, 0, 0), 0.0), (((17, 1.0),), (0.5, 0, 0), 0.0)]
    cut111 = Crystal(
        "NaCl (111)", *[564.02] * 3, 90.0, 90.0, 90.0,
        build_basis(sites, centrings=((0, 0, 0), (0, 0.5, 0.5), (0.5, 0, 0.5), (0.5, 0.5, 0))),
        (1, 1, 1), "test",
    )  # fmt: skip
    d = d_pm(cut111)
    for n in (1, 2, 3, 4):
        q = n / (2 * d / 100)
        fa, fb = FF_Rayl(11, q), FF_Rayl(17, q)
        expected = 16 * ((fa - fb) ** 2 if n % 2 else (fa + fb) ** 2)
        assert structure_factor_sq(cut111, n) == approx(expected, rel=1e-9)


def test_crystal_muscovite_001_is_extinct_and_002_allowed_calcite_104_allowed():
    assert structure_factor_sq_hkl(MUSCOVITE, 0, 0, 1) < 1e-9 * structure_factor_sq_hkl(
        MUSCOVITE, 0, 0, 2
    )
    assert structure_factor_sq_hkl(MUSCOVITE, 0, 0, 3) < 1e-9 * structure_factor_sq_hkl(
        MUSCOVITE, 0, 0, 2
    )
    assert structure_factor_sq(MUSCOVITE, 1) > 1e3
    assert structure_factor_sq(CALCITE, 1) > 1e3


def test_crystal_cut_on_an_extinct_reflection_is_refused():
    with pytest.raises(ValueError, match="absent"):
        Crystal("bad", *[564.02] * 3, 90.0, 90.0, 90.0, NACL.basis, (1, 0, 0), "test")


def test_crystal_densities_match_the_literature():
    # Walker 2004 (2.164), Heacock/CODATA (2.329), Markgraf & Reeder (2.713), ideal muscovite ≈ 2.82
    assert density_g_cm3(NACL) == approx(2.1635, abs=2e-3)
    assert density_g_cm3(SI) == approx(2.329, abs=2e-3)
    assert density_g_cm3(CALCITE) == approx(2.713, abs=5e-3)
    assert density_g_cm3(LIF) == approx(2.636, abs=5e-3)
    assert density_g_cm3(MUSCOVITE) == approx(2.810, abs=5e-3)
    assert cell_volume_A3(NACL) == approx(564.02**3 / 1e6)


def test_crystal_linear_attenuation_of_nacl_at_mo_ka_matches_xraylib_compound():
    import xraylib

    mu = linear_attenuation_per_cm(NACL, MO_KA_PM)
    ref = xraylib.CS_Total_CP("NaCl", 17.443) * density_g_cm3(NACL)
    assert mu == approx(ref, rel=2e-3)


def test_crystal_default_scan_is_the_nacl_scan_and_others_differ():
    beta = np.array([5.0, 7.24, 14.6])
    base = scan.expected_rate(beta, 35.0, 1.0)
    assert np.array_equal(base, scan.expected_rate(beta, 35.0, 1.0, crystal=NACL))
    assert scan.max_order(NACL) == scan.MAX_ORDER == 15
    assert not np.allclose(scan.expected_rate(beta, 35.0, 1.0, crystal=LIF), base)


def test_crystal_non_fitted_presets_keep_their_own_thermal_motion_not_the_fitted_one():
    p = scan.DEFAULT
    hot = p.replace(debye_waller_pm2=p.debye_waller_pm2 * 3)
    a, b = p.order_strengths(SI), hot.order_strengths(SI)
    # r_n / r_1 of Si does not depend on B_fit; r_1 moves with NaCl's exp(-2 B s_1²) in `scale`
    assert [b[n] / b[1] for n in (2, 3)] == approx([a[n] / a[1] for n in (2, 3)], rel=1e-12)
    s1_sq = (1 / (2 * D_NACL_PM)) ** 2
    assert b[1] / a[1] == approx(np.exp(2 * 2 * p.debye_waller_pm2 * s1_sq), rel=1e-12)
    assert hot.order_strengths(NACL) != p.order_strengths(NACL)
    assert set(PRESETS) == {"NaCl", "LiF", "Si", "calcite", "muscovite"}


def test_crystal_a_clone_of_the_anchor_reproduces_the_nacl_scan():
    import dataclasses

    clone = dataclasses.replace(NACL, name="clone")
    beta = np.array([5.0, 7.24, 14.6])
    assert clone is not NACL
    assert scan.expected_rate(beta, 35.0, 1.0, crystal=clone) == approx(
        scan.expected_rate(beta, 35.0, 1.0), rel=1e-12
    )


def test_crystal_fitted_anchor_needs_an_exact_d_and_atoms_at_rest():
    import dataclasses

    with pytest.raises(ValueError, match="anchor"):
        dataclasses.replace(NACL, d_anchor_pm=None)
    with pytest.raises(ValueError, match="anchor"):
        dataclasses.replace(NACL, basis=SI.basis, cut=(1, 1, 1), d_anchor_pm=None)
