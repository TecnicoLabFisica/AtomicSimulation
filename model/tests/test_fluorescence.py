"""XRF sample model (EPN Práctica 6): physical checks of ``braggsim.fluorescence``."""

import math

import numpy as np
import pytest
import xraylib
from scipy import integrate, special

from braggsim import detector
from braggsim import fluorescence as fl
from braggsim.constants import HC_KEV_PM, MO_KA_KEV

SIN45 = math.sin(math.radians(45))


def _rate(sample, label, U=35.0, current=1.0):
    return {ln.label: ln.rate_per_s for ln in fl.line_rates(sample, U, current)}[label]


def _node_near(sample, e_kev):
    kern = fl.kernels(fl._resolve(sample))
    i = int(np.argmin(np.abs(HC_KEV_PM / kern.lam_pm - e_kev)))
    return kern, i, HC_KEV_PM / kern.lam_pm[i]


def _kernel(kern, label):
    return next(lk for lk in kern.lines if lk.label == label).k


def _hand_primary(z, line, e0, e_line):
    """Textbook thick pure-element primary kernel at one energy."""
    mu0, mu1 = xraylib.CS_Total(z, e0), xraylib.CS_Total(z, e_line)
    q = xraylib.CS_FluorLine_Kissel_Cascade(z, line, e0)
    t_air = fl._t_air_out(e_line)
    return q / SIN45 / (mu0 / SIN45 + mu1 / SIN45) * fl._FLUOR_FRACTION * t_air


@pytest.mark.parametrize("sym,z", [("Cu", 29), ("Zn", 30)])
def test_kb_over_ka_is_the_radiative_ratio_corrected_by_self_absorption(sym, z):
    # Above the K edge only K-shell vacancies feed both lines, so Q(Kβ)/Q(Kα) is the xraylib
    # radiative-rate ratio (1e-3: the Kβ macro line in RadRate omits nothing but rounding).
    e0 = 17.5
    q_ratio = xraylib.CS_FluorLine_Kissel_Cascade(
        z, xraylib.KB_LINE, e0
    ) / xraylib.CS_FluorLine_Kissel_Cascade(z, xraylib.KA_LINE, e0)
    assert q_ratio == pytest.approx(
        xraylib.RadRate(z, xraylib.KB_LINE) / xraylib.RadRate(z, xraylib.KA_LINE), rel=1e-3
    )
    kern, i, e = _node_near(sym, e0)
    ea, eb = xraylib.LineEnergy(z, xraylib.KA_LINE), xraylib.LineEnergy(z, xraylib.KB_LINE)
    mu0 = xraylib.CS_Total(z, e)
    expected = (
        xraylib.CS_FluorLine_Kissel_Cascade(z, xraylib.KB_LINE, e)
        / xraylib.CS_FluorLine_Kissel_Cascade(z, xraylib.KA_LINE, e)
        * (mu0 + xraylib.CS_Total(z, ea))
        / (mu0 + xraylib.CS_Total(z, eb))
        * fl._t_air_out(eb)
        / fl._t_air_out(ea)
    )
    got = _kernel(kern, f"{sym} Kβ")[i] / _kernel(kern, f"{sym} Kα")[i]
    assert got == pytest.approx(expected, rel=1e-9)


def test_lines_are_zero_below_their_absorption_edge():
    # Cu K edge 8.979 keV; Pb L3 edge 13.035 keV. The continuum starts at λ_min = hc/U.
    assert all(ln.rate_per_s == 0 for ln in fl.line_rates("Cu", 8.9, 1.0) if "Cu" in ln.label)
    assert all(ln.rate_per_s == 0 for ln in fl.line_rates("CuZn39Pb3", 8.9, 1.0))
    assert all(ln.rate_per_s == 0 for ln in fl.line_rates("Pb", 13.0, 1.0))
    assert _rate("Pb", "Pb Lα1", 13.1) > 0
    # Zn K edge 9.659 keV: between the two edges Cu fluoresces, Zn does not
    assert _rate("CuZn36", "Cu Kα", 9.3) > 0 and _rate("CuZn36", "Zn Kα", 9.3) == 0


def test_rates_are_linear_in_current_and_zero_without_it():
    for s in ("CuZn39Pb3", "centavo2003"):
        full = fl.line_rates(s, 35.0, 1.0)
        half = fl.line_rates(s, 35.0, 0.5)
        zero = fl.line_rates(s, 35.0, 0.0)
        for a, b, c in zip(full, half, zero, strict=True):
            assert b.rate_per_s == pytest.approx(0.5 * a.rate_per_s, rel=1e-12)
            assert c.rate_per_s == 0.0


def test_pure_element_kernel_equals_the_textbook_primary_formula():
    for sym, z, lines in (("Cu", 29, ("Kα", "Kβ")), ("Zn", 30, ("Kα", "Kβ"))):
        kern, i, e = _node_near(sym, 17.48)
        for name, code in zip(lines, (xraylib.KA_LINE, xraylib.KB_LINE), strict=True):
            e_line = xraylib.LineEnergy(z, code)
            assert _kernel(kern, f"{sym} {name}")[i] == pytest.approx(
                _hand_primary(z, code, e, e_line), rel=1e-9
            )
    kern, i, e = _node_near("Pb", 17.48)
    assert _kernel(kern, "Pb Lα1")[i] == pytest.approx(
        _hand_primary(82, xraylib.LA1_LINE, e, xraylib.LineEnergy(82, xraylib.LA1_LINE)), rel=1e-9
    )


def test_bulk_samples_are_infinitely_thick_for_a_half_millimetre_sheet():
    # Hardest case: 35 keV photons and the Cu Kα return path in Cu (0.5 mm sheet, an assumption).
    m = 8.96 * 0.05
    a = xraylib.CS_Total(29, 35.0) / SIN45
    b = xraylib.CS_Total(29, 8.04) / SIN45
    assert math.exp(-m * (a + b)) < 1e-6


def test_copper_in_brass_follows_its_weight_fraction_up_to_matrix_effects():
    # Zn has Z close to Cu, so it absorbs the exciting photons almost like Cu and Zn Kβ adds a few
    # percent of secondary Cu K: Cu Kα per unit w_Cu stays within ±10 % of pure Cu.
    ratio = _rate("CuZn36", "Cu Kα") / (0.64 * _rate("Cu", "Cu Kα"))
    assert 0.9 < ratio < 1.1


def test_secondary_fluorescence_in_leaded_brass_is_a_few_percent():
    # Zn Kβ (9.57 keV) and Pb L lines excite Cu K: expect a few percent. In the model matrix
    # absorption (Zn and Pb raise μ at 17.5 and 8.04 keV) costs Cu Kα about 10 % and this secondary
    # only partly offsets it, so first-order A_alloy/A_pure is Cu 54.2 / Zn 39.4 / Pb 2.68 %. LD's
    # published 61.6/35.6/2.9 comes from its atoms-per-volume normalisation w_i ∝ ρ_i A_i/A_i^pure
    # (L3.4), not from this secondary.
    cu = fl.secondary_fraction("CuZn39Pb3", "Cu Kα", 35.0)
    zn = fl.secondary_fraction("CuZn39Pb3", "Zn Kα", 35.0)
    assert 0.02 < cu < 0.08
    assert 0 < zn < cu  # only Pb L (3 % w) is above the Zn K edge
    assert fl.secondary_fraction("Cu", "Cu Kα", 35.0) == 0.0
    assert fl.secondary_fraction("CuZn36", "Cu Kα", 35.0) > 0


def test_coin_core_line_drops_with_plating_and_equals_pure_iron_without_it():
    fe = [_rate(fl.coin(t), "Fe Kα") for t in (0.0, 5.0, 10.0, 18.0, 25.0)]
    assert all(a > b for a, b in zip(fe, fe[1:], strict=False))
    assert fe[0] == pytest.approx(
        _rate(fl._bulk("Fe", Fe=100), "Fe Kα"), rel=1e-6
    )  # the coin grid also splits at the Cu edges
    assert _rate(fl.coin(0.0), "Cu Kα") == 0.0
    assert _rate(fl.coin(1000.0), "Cu Kα") == pytest.approx(_rate("Cu", "Cu Kα"), rel=1e-6)


def test_interface_secondary_matches_a_direct_double_integral():
    m, a0, mu0j, mu1j, b1 = 0.016, 40.0, 60.0, 250.0, 300.0
    got = fl._cross_secondary(None, None, (m, np.array([a0]), mu0j, mu1j, b1))[0]
    ref = integrate.dblquad(
        lambda v, u: math.exp(a0 * u) * special.exp1(mu0j * u + mu1j * v) * math.exp(-b1 * v),
        0, m, 0, np.inf,
    )[0]  # fmt: skip
    assert got == pytest.approx(ref, rel=1e-5)


def test_mo_compton_line_sits_at_the_90_degree_shift():
    lines = {ln.label: ln for ln in fl.line_rates("Cu", 35.0, 1.0)}
    expected = MO_KA_KEV / (1 + MO_KA_KEV / 510.999)  # E/(1 + E/mc²(1 − cos 90°))
    assert lines["Mo Kα Compton"].energy_keV == pytest.approx(expected, abs=0.01)
    assert lines["Mo Kα Rayleigh"].energy_keV == pytest.approx(MO_KA_KEV, abs=0.01)
    assert lines["Mo Kα Rayleigh"].rate_per_s > lines["Mo Kα Compton"].rate_per_s > 0
    # no Mo lines below the Mo K edge
    assert all(ln.rate_per_s == 0 for ln in fl.line_rates("Cu", 19.0, 1.0) if "Mo" in ln.label)


def test_scattered_continuum_ends_at_the_duane_hunt_limit_and_compton_is_shifted():
    out = fl.scattered_continuum("CuZn36", 20.0, 1.0)
    for kind, shift in (("rayleigh", 0.0), ("compton", fl.COMPTON_SHIFT_PM)):
        e, dens = out[kind]
        assert np.all(np.diff(e) >= 0) and np.all(dens >= 0)
        assert e[dens > 0].max() == pytest.approx(HC_KEV_PM / (HC_KEV_PM / 20.0 + shift), rel=0.01)


def test_rejects_unknown_samples_and_tube_settings_out_of_range():
    with pytest.raises(ValueError):
        fl.line_rates("brass", 35.0, 1.0)
    for u, i in ((36.0, 1.0), (35.0, 1.1), (-1.0, 1.0), (float("nan"), 1.0)):
        with pytest.raises(ValueError):
            fl.line_rates("Cu", u, i)


def test_bracketed_edges_put_each_step_between_two_nodes():
    # Cu K edge in pure Cu: μ jumps by the xraylib ratio across the pair, and the Cu Kα kernel is
    # exactly 0 on the long-λ node (E below the edge) and > 0 on the short one.
    kern = fl.kernels(fl._resolve("Cu"))
    lam_edge = HC_KEV_PM / xraylib.EdgeEnergy(29, xraylib.K_SHELL)
    long_i = int(np.argmin(np.abs(kern.lam_pm - lam_edge * (1 + fl.EDGE_BRACKET))))
    short_i = int(np.argmin(np.abs(kern.lam_pm - lam_edge * (1 - fl.EDGE_BRACKET))))
    assert kern.lam_pm[long_i] == pytest.approx(lam_edge * (1 + fl.EDGE_BRACKET), rel=1e-12)
    assert kern.lam_pm[short_i] == pytest.approx(lam_edge * (1 - fl.EDGE_BRACKET), rel=1e-12)
    mu = fl._mu(fl._resolve("Cu").layers[0], HC_KEV_PM / kern.lam_pm[[short_i, long_i]])
    jump = xraylib.CS_Total(29, HC_KEV_PM / kern.lam_pm[short_i]) / xraylib.CS_Total(
        29, HC_KEV_PM / kern.lam_pm[long_i]
    )
    assert mu[0] / mu[1] == pytest.approx(jump, rel=1e-12)
    assert jump > 5
    ka = _kernel(kern, "Cu Kα")
    assert ka[long_i] == 0.0 and ka[short_i] > 0


def test_every_step_of_the_grid_is_bracketed():
    for sample in ("CuZn39Pb3", "centavo2003"):
        sym = {s for layer in fl._resolve(sample).layers for s, _ in layer.composition}
        lam = fl.kernels(fl._resolve(sample)).lam_pm
        for edge in fl._edge_nodes(sym):
            for f in (1 - fl.EDGE_BRACKET, 1 + fl.EDGE_BRACKET):
                assert np.isclose(lam, edge * f, rtol=1e-12, atol=0).any()


@pytest.mark.parametrize("abm", [(60.0, 74.0, 300.0), (420.0, 74.0, 52.0), (20.0, 400.0, 30.0)])
def test_bulk_secondary_closed_form_matches_the_double_integral(abm):
    # Shiraiwa–Fujino: ∬ e^{−ax−by} E1(μ|x−y|) dx dy over 0…∞² = [ln(1+a/μ)/a + ln(1+b/μ)/b]/(a+b)
    # (the code's 1/(2 sinψ1) prefactor carries the remaining factors).
    a, b, mu = abm
    code = (np.log1p(a / mu) / a + np.log1p(b / mu) / b) / (a + b)

    def inner(x):
        f = lambda y: math.exp(-b * y) * special.exp1(mu * abs(x - y))  # noqa: E731
        return integrate.quad(f, 0, x, limit=200)[0] + integrate.quad(f, x, np.inf, limit=200)[0]

    ref = integrate.quad(lambda x: math.exp(-a * x) * inner(x), 0, np.inf, limit=200)[0]
    assert ref == pytest.approx(code, rel=1e-5)  # nested quad across the |x−y| kink


def test_layer_and_kernel_input_validation():
    with pytest.raises(ValueError):
        fl.coin(-1.0)
    with pytest.raises(ValueError):
        fl.Layer((("Cu", 1.0),), 10.0, 0.0)
    with pytest.raises(ValueError):
        fl.kernels(
            fl.Sample(
                "x", (fl.Layer((("Cu", 0.5), ("Zn", 0.5)), 10.0, 8.0), fl.Layer((("Fe", 1.0),)))
            )
        )
    with pytest.raises(ValueError):
        fl.kernels(fl.Sample("x", (fl.coin(5.0).layers[0],) * 3))


def test_zero_current_and_unexcited_secondary_do_not_produce_nan():
    assert all(ln.rate_per_s == 0.0 for ln in fl.line_rates("Cu", 0.0, 1.0))
    assert fl.secondary_fraction("CuZn39Pb3", "Cu Kα", 5.0) == 0.0


def test_scatter_rayleigh_to_compton_ratio_rises_with_atomic_number():
    def ratio(sample):
        lines = {ln.label: ln.rate_per_s for ln in fl.line_rates(sample, 35.0, 1.0)}
        return lines["Mo Kα Rayleigh"] / lines["Mo Kα Compton"]

    assert ratio("Pb") > 5 * ratio("Cu")
    assert ratio("Cu") == pytest.approx(2.87, rel=0.05)
    assert ratio("Pb") == pytest.approx(24.9, rel=0.05)


def test_xrf_flux_scale_is_the_gm_reading_over_its_efficiency_weighted_spectrum():
    p = fl.scan.DEFAULT
    assert fl._scale(p) == pytest.approx(p.direct_per_s / fl._gm_weighted_photons(p), rel=1e-15)
    # ε_GM is a few per mille at Mo energies, so the flux is a few hundred times the ε = 1 value
    ratio = fl._scale(p) / (p.direct_per_s / fl.scan._photons_out(35.0, p))
    assert 100 < ratio < 1000


def test_mca_spectrum_cu():
    counts, live, e = fl.mca_spectrum("Cu", 35, 1, 180)
    assert 0.95 < live / 180 < 0.99  # 3.2 % dead-time loss
    kpc = detector.kev_per_channel()
    assert int(np.argmax(counts[: int(9 / kpc)])) == round(8.04 / kpc)
    assert np.all(fl.mca_spectrum("Cu", 35, 0, 180)[0] == 0)
    c2, _, _ = fl.mca_spectrum("Cu", 35, 1, 90)
    assert c2.sum() / counts.sum() == pytest.approx(0.5, rel=1e-12)  # same rate, so exactly t/2


def test_detected_line_counts_match_the_spectrum():
    d = fl.detected_line_counts("Cu", 35, 1, 180)
    counts, live, e = fl.mca_spectrum("Cu", 35, 1, 180)
    assert d["Cu Kα"] == pytest.approx(
        next(ln.rate_per_s for ln in fl.line_rates("Cu", 35, 1) if ln.label == "Cu Kα")
        * float(detector.pin_efficiency(8.04105061567418))
        * live
    )
    assert counts[(e > 7.5) & (e < 8.6)].sum() > 0.95 * d["Cu Kα"]
