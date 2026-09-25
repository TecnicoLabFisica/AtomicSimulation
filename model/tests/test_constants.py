import xraylib
from pytest import approx

from braggsim import constants as c


def test_mo_k_edge_matches_xraylib():
    assert c.MO_K_EDGE_KEV == approx(xraylib.EdgeEnergy(42, xraylib.K_SHELL), abs=1e-4)


def test_kb_ka_ratio_matches_xraylib_radiative_rates():
    ka = sum(xraylib.RadRate(42, line) for line in (xraylib.KL3_LINE, xraylib.KL2_LINE))
    kb = sum(
        xraylib.RadRate(42, line)
        for line in (xraylib.KM3_LINE, xraylib.KM2_LINE, xraylib.KN3_LINE, xraylib.KN2_LINE)
    )
    assert c.KB_KA_RATIO == approx(kb / ka, abs=1e-4)


def test_leaflet_line_energies_and_wavelengths_are_consistent():
    # LD P6.3.3.1 Table 1 lists both E and λ; they must satisfy E = hc/λ to the table's precision.
    assert c.HC_KEV_PM / c.MO_KA_KEV == approx(c.MO_KA_PM, abs=2e-3)
    assert c.HC_KEV_PM / c.MO_KB_KEV == approx(c.MO_KB_PM, abs=2e-3)
