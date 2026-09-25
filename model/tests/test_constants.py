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


def test_line_components_match_xraylib():
    hc = c.HC_KEV_PM
    ka1, ka2 = (hc / xraylib.LineEnergy(42, line) for line in (xraylib.KL3_LINE, xraylib.KL2_LINE))
    assert [lam for lam, _ in c.MO_KA_COMPONENTS] == approx([ka1, ka2], abs=1e-3)
    ratio = xraylib.RadRate(42, xraylib.KL2_LINE) / xraylib.RadRate(42, xraylib.KL3_LINE)
    assert c.MO_KA_COMPONENTS[1][1] / c.MO_KA_COMPONENTS[0][1] == approx(ratio, abs=1e-3)


def test_line_components_average_to_leaflet_wavelengths():
    for comps, lam in ((c.MO_KA_COMPONENTS, c.MO_KA_PM), (c.MO_KB_COMPONENTS, c.MO_KB_PM)):
        assert sum(f for _, f in comps) == approx(1.0, abs=1e-4)
        assert sum(x * f for x, f in comps) == approx(lam, abs=0.01)
