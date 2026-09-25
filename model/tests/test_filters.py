import numpy as np
from pytest import approx

from braggsim.constants import MO_KA_PM, MO_KB_PM
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
