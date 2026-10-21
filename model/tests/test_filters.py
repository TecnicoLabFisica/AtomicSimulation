import numpy as np
import pytest
import xraylib
from pytest import approx

from braggsim.constants import (
    HC_KEV_PM,
    MO_KA_COMPONENTS,
    MO_KA_PM,
    MO_KB_COMPONENTS,
    MO_KB_PM,
)
from braggsim.filters import (
    ABSORBERS,
    FOILS_MM,
    MU_RHO_GRID_PM,
    WHEELS_MM,
    areal_density_mg_cm2,
    check_filters,
    edge_intervals,
    interp_log_mu,
    log_mu_rho,
    mu_rho_edges_pm,
    mu_rho_table,
    transmission,
)

LAM = np.array([40.0, MO_KB_PM, MO_KA_PM, 150.0])


def test_zero_thickness_transmits_everything():
    assert transmission(LAM, "Zr", 0.0) == approx(1.0)


def test_thicker_absorber_transmits_less():
    assert np.all(transmission(LAM, "Be", 50.0) < transmission(LAM, "Be", 10.0))


def test_zr_k_edge_between_mo_lines_suppresses_kb_far_more_than_ka():
    # Zr K edge (18.0 keV) lies between Mo Kα (17.4 keV) and Kβ (19.7 keV); ~0.05 mm Zr ≈ 32 mg/cm².
    t_ka, t_kb = transmission(np.array([MO_KA_PM, MO_KB_PM]), "Zr", 32.0)
    assert t_ka > 5 * t_kb


def test_zr_attenuation_jumps_about_sixfold_at_its_k_edge():
    # μ/ρ(Zr) ≈ 15 cm²/g just below and ≈ 95 cm²/g just above 17.998 keV (xraylib).
    hc, rho_x = 1239.841984, 100.0  # pm·keV, mg/cm²
    below, above = transmission(np.array([hc / 17.9, hc / 18.1]), "Zr", rho_x)
    jump = np.log(above) / np.log(below)
    assert 5 < jump < 7


def test_tabulated_attenuation_matches_xraylib_between_grid_points():
    # transmission() interpolates μ/ρ log–log on MU_RHO_GRID_PM (the table the web app loads).
    # Air and Pyrex have no absorption edge between 35 and 300 pm; there the grid (1000 points,
    # 0.3 % apart) must agree with direct xraylib to 1e-5, far below xraylib's own accuracy.
    lam = np.linspace(35.0, 300.0, 997)
    for material in ("Air, Dry (near sea level)", "Glass, Pyrex"):
        exact = np.array([xraylib.CS_Total_CP(material, HC_KEV_PM / x) for x in lam])
        assert -np.log(transmission(lam, material, 1000.0)) == approx(exact, rel=1e-5)


@pytest.mark.parametrize("density", [-1.0, float("nan"), float("inf")])
def test_filter_areal_density_must_be_finite_and_non_negative(density):
    with pytest.raises(ValueError):
        check_filters((("Zr", 1.0), ("Cu", density)))
    check_filters((("Zr", 0.0),))


def test_every_absorber_is_known_to_xraylib_and_attenuates():
    for m in ABSORBERS:
        assert 0 < transmission(MO_KA_PM, m, 10.0) < 1


def test_filter_without_an_exported_table_is_refused():
    # The web app has μ/ρ tables only for ABSORBERS (and air and Pyrex, which are not filters).
    with pytest.raises(ValueError):
        check_filters((("Ni", 1.0),))


def test_areal_density_is_linear_in_thickness():
    assert areal_density_mg_cm2("Cu", 0.3) == approx(3 * areal_density_mg_cm2("Cu", 0.1))


def test_densities_match_handbook_within_1_percent():
    handbook = {
        "Al": 2.70,
        "Fe": 7.87,
        "Cu": 8.96,
        "Zr": 6.52,
        "Mo": 10.2,
        "Ag": 10.5,
        "In": 7.31,
        "Polystyrene": 1.05,
    }
    assert set(handbook) == set(ABSORBERS)
    for m, rho in handbook.items():
        assert areal_density_mg_cm2(m, 1.0) / 100 == approx(rho, rel=0.01)


def test_wheels_have_seven_slots_of_known_absorbers():
    for slots in WHEELS_MM.values():
        assert len(slots) == 7
        assert all(s is None or s[0] in ABSORBERS for s in slots)
    assert all(m in ABSORBERS for m in FOILS_MM)


def test_zr_foil_transmission_jumps_at_the_k_edge_within_a_thousandth_of_a_pm():
    # A 0.05 mm Zr foil: T just below / above the edge equals the xraylib step (the grid
    # interpolation used to smear it over one 0.3 % step, ≈ +0.07 pm on the mid-transmission point).
    # The edge used is xraylib's CS_Total step (17.99807 keV, 68.8875 pm), 0.0018 pm short of
    # EdgeEnergy (17.9976 keV, which K_EDGE_KEV and the Moseley tables use).
    rho_x = areal_density_mg_cm2("Zr", FOILS_MM["Zr"])
    lam_k = mu_rho_edges_pm("Zr")[0]
    assert lam_k == approx(68.889, abs=3e-3)
    for lam in (lam_k - 1e-4, lam_k + 1e-4):
        exact = np.exp(-xraylib.CS_Total_CP("Zr", HC_KEV_PM / lam) * rho_x / 1000)
        assert transmission(lam, "Zr", rho_x) == approx(exact, rel=0.01)
    lam = np.linspace(lam_k - 0.5, lam_k + 0.5, 100001)
    t = transmission(lam, "Zr", rho_x)
    mid = lam[np.argmax(t > np.sqrt(t[0] * t[-1]))]
    assert mid == approx(lam_k, abs=1e-3)  # it was +0.07 pm off


def _plain_log_mu(m, lam):
    return np.interp(np.log(lam), np.log(MU_RHO_GRID_PM), np.log(mu_rho_table(m)))


def test_edge_aware_interpolation_changes_nothing_away_from_the_edge_intervals():
    lam = np.linspace(31.0, 590.0, 5003)
    for m in ABSORBERS + ("Glass, Pyrex",):
        keep = np.ones_like(lam, dtype=bool)
        for i, _ in edge_intervals(mu_rho_edges_pm(m)):
            keep &= ~((lam >= MU_RHO_GRID_PM[i]) & (lam <= MU_RHO_GRID_PM[i + 1]))
        assert log_mu_rho(lam, m)[keep] == approx(_plain_log_mu(m, lam)[keep], rel=0, abs=1e-12)


def test_scalar_input_gives_a_float_and_matches_the_array():
    assert isinstance(log_mu_rho(68.0, "Zr"), float)
    assert log_mu_rho(np.array([68.0, 69.0]), "Zr")[0] == log_mu_rho(68.0, "Zr")


def test_edge_ends_of_the_grid_hold_the_end_value():
    # An edge in the first / last grid interval has no second node on one side: hold the end value.
    g, tab = MU_RHO_GRID_PM, np.log(mu_rho_table("Zr"))
    lo, hi = (g[0] + g[1]) / 2, (g[-2] + g[-1]) / 2
    assert interp_log_mu(g[0] * 1.0005, tab, (lo,)) == tab[0]
    assert interp_log_mu(g[-1] * 0.9995, tab, (hi,)) == tab[-1]


def test_two_edges_in_neighbouring_intervals_are_refused():
    g = MU_RHO_GRID_PM
    with pytest.raises(ValueError):
        edge_intervals((g[10] * 1.0001, g[11] * 1.0001))


def test_edges_of_every_material_are_resolved_inside_the_grid_and_steps_of_the_table():
    for m in ABSORBERS + ("Glass, Pyrex", "Air, Dry (near sea level)"):
        edges = mu_rho_edges_pm(m)
        assert all(MU_RHO_GRID_PM[0] <= e < MU_RHO_GRID_PM[-1] for e in edges)
        edge_intervals(edges)  # raises if two edges are closer than a grid step
        for e in edges:  # the exported edge IS the step of CS_Total_CP: a factor > 1.02 across it
            below = xraylib.CS_Total_CP(m, HC_KEV_PM / (e * (1 - 1e-6)))
            above = xraylib.CS_Total_CP(m, HC_KEV_PM / (e * (1 + 1e-6)))
            assert below > 1.02 * above, (m, e)
    assert mu_rho_edges_pm("Zr")[0] == approx(68.887, abs=1e-3)
    assert mu_rho_edges_pm("Polystyrene") == ()


def test_no_grid_node_lies_between_xraylibs_edge_energy_and_the_cs_step():
    # xraylib's CS_Total steps 0.0018 pm (Zr K) to 0.17 pm (L edges) away from EdgeEnergy; if a node
    # sat in that gap the two conventions would give different sides. The exported edge is the CS
    # step, so the nodes next to it are on the right side whatever EdgeEnergy says; check the gap.
    elements = {m: xraylib.SymbolToAtomicNumber(m) for m in ABSORBERS if m != "Polystyrene"}
    for m, z in elements.items():
        for e in mu_rho_edges_pm(m):
            tab = [
                HC_KEV_PM / xraylib.EdgeEnergy(z, sh)
                for sh in (xraylib.K_SHELL, xraylib.L1_SHELL, xraylib.L2_SHELL, xraylib.L3_SHELL)
            ]
            near = min(tab, key=lambda x: abs(x - e))
            assert abs(near - e) < 0.2  # L-edge offsets reach 0.17 pm
            lo, hi = sorted((near, e))
            in_gap = (MU_RHO_GRID_PM > lo) & (MU_RHO_GRID_PM < hi)
            if in_gap.any():  # known case: Ag L2, node 351.8326 pm; the CS step decides the side
                assert (m, round(e)) == ("Ag", 352)


def test_every_material_transmits_the_mo_lines_like_xraylib():
    # Every Mo line component through every absorber (and the air and Pyrex of the model), at the
    # table's own μ/ρ to 1e-4: the Mo foil must transmit Kβ₂ (62.102 pm, 0.11 pm below its K edge)
    # with T = 0.261, where the smeared edge gave 0.073.
    for m in ABSORBERS + ("Glass, Pyrex", "Air, Dry (near sea level)"):
        rho_x = 1.0 if m != "Polystyrene" else 10.0
        if m in FOILS_MM:
            rho_x = areal_density_mg_cm2(m, FOILS_MM[m])
        for lam, _ in (*MO_KA_COMPONENTS, *MO_KB_COMPONENTS):
            exact = np.exp(-xraylib.CS_Total_CP(m, HC_KEV_PM / lam) * rho_x / 1000)
            assert transmission(lam, m, rho_x) == approx(exact, rel=1e-4), (m, lam)
    rho_x = areal_density_mg_cm2("Mo", FOILS_MM["Mo"])
    assert transmission(62.102, "Mo", rho_x) == approx(0.261, abs=0.002)
