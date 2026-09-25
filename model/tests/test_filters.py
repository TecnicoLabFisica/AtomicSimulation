import numpy as np
import xraylib
from pytest import approx

from braggsim.constants import HC_KEV_PM, MO_KA_PM, MO_KB_PM
from braggsim.filters import transmission

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
