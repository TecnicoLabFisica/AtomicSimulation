"""X-ray fluorescence and scatter of a flat sample hit by the Mo tube beam (EPN Práctica 6).

Geometry: the sample is a flat sheet at 45° to the beam, the energy detector (LD 559 938) sits at
90° to the beam, so the beam and the detected rays both make ψ = 45° with the surface. Collimator,
s1 = s2 = 6 cm. The output stops at the detector's entrance window: discrete lines (energy,
photons/s) plus the scattered continuum. Efficiency, resolution and dead time belong to
``detector`` (L3.3).

Port-friendly structure. For every sample and emitted line ℓ the module builds an excitation
kernel K_ℓ(λ): detected photons per photon of wavelength λ incident on the sample. The kernels
live on ``Kernels.lam_pm`` (``filters.MU_RHO_GRID_PM`` split at the absorption edges of the
sample's elements) followed by the four Mo line components, and the rate is only

    rate_ℓ = A · I · [ ∫ Φ̃(λ) K_ℓ(λ) dλ + Σ_comp Φ̃_comp K_ℓ(λ_comp) ]

with Φ̃(λ) = continuum(λ, U, 1) · T_glass(λ) · T_air,in(λ) (the pieces of ``scan._photons_out``),
Φ̃_comp the Mo line rates × fraction × the same transmissions, trapezoid rule for the integral.
The web port repeats that multiply-and-sum and needs no xraylib.

Physics (all cross sections from xraylib, Schoonjans et al., Spectrochim. Acta B 66, 776 (2011)):

* Primary fluorescence, fundamental parameters (Sherman, Spectrochim. Acta 7, 283 (1955)):
  per incident photon of energy E on a layer of mass thickness m,
  w_i Q_iℓ(E)/sinψ1 · (1 − e^{−m(a+b)})/(a+b), a = μ(E)/sinψ1, b = μ(E_ℓ)/sinψ2, with
  Q_iℓ = ``CS_FluorLine_Kissel_Cascade`` (photoionisation × yield × radiative rate, with
  Coster–Kronig and cascade). Layers above attenuate the incident and the outgoing beam.
* Secondary fluorescence in the bulk alloys: a line of element j above an absorption edge of
  element i excites i. Closed form of Shiraiwa & Fujino, Jpn. J. Appl. Phys. 5, 886 (1966), see also
  de Boer, X-Ray Spectrom. 19, 145 (1990): the double depth integral of E1 gives
  w_i Q_iℓ(E_j) w_j Q_j(E)/(2 sinψ1) · [ln(1+a/μ_j)/a + ln(1+b/μ_j)/b]/(a+b), μ_j = μ(E_j).
  Tertiary excitation is neglected.
* Two-layer coin: the plating's lines also excite the core (Cu Kα, Kβ above the Fe K edge). The
  same E1 integral across the interface has no closed form and is integrated numerically
  (Gauss–Legendre in ln s, E1(c) = ∫₁^∞ e^{−cs}/s ds).
* Scatter at 90° of the tube spectrum: xraylib ``DCS_Rayl`` and ``DCS_Compt`` (unpolarised beam)
  times the detector's solid angle, the same self-absorption denominator at the incident and the
  scattered energy. At 90° the Compton shift is constant, Δλ = h/(m_e c) = 2.426 pm.

Absolute scale (assumptions, model/PARAMETERS.md): the Geiger counter's reading at 21 kV (the
EPN anchor of ``direct_per_s``) is the tube spectrum weighted by ``detector.gm_efficiency`` (a few
per mille at Mo energies, uncertain by ×5 with the unpublished gas pressure); that fixes the photon
flux on the sample.

Not modelled: Compton Doppler broadening, tertiary excitation, Pb M lines (< 2.5 keV, below the
detector window's cut-off), same-element cross-line excitation (Pb Lγ above the L3 edge), the
core's secondary excitation of the coin's plating (Fe lines are below the Cu K edge), housing.
"""

import dataclasses
import functools
import math
from typing import NamedTuple

import numpy as np
import xraylib

from braggsim import detector, scan, source
from braggsim.constants import HC_KEV_PM, MO_KA_COMPONENTS, MO_KB_COMPONENTS
from braggsim.filters import MU_RHO_GRID_PM, cs_step_edges_pm, transmission

# Geometry, EPN Práctica 6 (assumptions: model/PARAMETERS.md).
S2_CM = 6.0  # sample → detector window
DETECTOR_RADIUS_MM = 0.4  # active area of the 559 938: 0.8 mm diameter
PSI_IN_DEG = 45.0  # beam to sample surface
PSI_OUT_DEG = 45.0  # surface to detector
AIR_IN_CM = 12.0  # anode → sample
OMEGA_SR = math.pi * (DETECTOR_RADIUS_MM / 10) ** 2 / S2_CM**2
_SIN_IN, _SIN_OUT = math.sin(math.radians(PSI_IN_DEG)), math.sin(math.radians(PSI_OUT_DEG))
_FLUOR_FRACTION = OMEGA_SR / (4 * math.pi)  # isotropic emission into the detector
_MG_CM2_PER_CM_AIR = scan.AIR_MG_CM2 / scan.AIR_PATH_CM
_SCATTER_ANGLE_RAD = math.pi / 2
COMPTON_SHIFT_PM = 2.42631023867  # h/(m_e c), CODATA 2018: λ' − λ at 90°

_MO_COMPONENTS = MO_KA_COMPONENTS + MO_KB_COMPONENTS  # Kα1, Kα2, Kβ1,3, Kβ2
_MO_LAMBDA_PM = np.array([lam for lam, _ in _MO_COMPONENTS])
_N_MO = len(_MO_COMPONENTS)


@dataclasses.dataclass(frozen=True)
class Layer:
    """Composition as ((symbol, mass fraction), ...); ``thickness_um`` None = infinitely thick.
    A finite layer needs ``thickness_um`` ≥ 0 and ``density_g_cm3`` > 0."""

    composition: tuple
    thickness_um: float | None = None
    density_g_cm3: float = 0.0

    def __post_init__(self):
        if self.thickness_um is not None and not (
            self.thickness_um >= 0 and self.density_g_cm3 > 0
        ):  # NaN fails too
            raise ValueError("a finite layer needs thickness_um ≥ 0 and density_g_cm3 > 0")

    @property
    def mass_g_cm2(self):
        if self.thickness_um is None:
            return math.inf
        return self.density_g_cm3 * self.thickness_um * 1e-4


@dataclasses.dataclass(frozen=True)
class Sample:
    """Layers from the surface down. ``kernels`` supports a single bulk layer, or two layers whose
    top layer is a single element (the coin); other stacks raise ValueError because the secondary
    fluorescence code does not cover them."""

    name: str
    layers: tuple


def _bulk(name, **wt_pct):
    comp = tuple((sym, pct / 100) for sym, pct in wt_pct.items())
    if not math.isclose(sum(w for _, w in comp), 1.0):
        raise ValueError(f"{name}: weight fractions must sum to 1")
    return Sample(name, (Layer(comp),))


def coin(plating_um):
    """Ecuador 1 centavo 2003: ``plating_um`` of Cu (8.96 g/cm³) on a steel core (pure Fe)."""
    return Sample(
        f"centavo2003_{plating_um:g}um",
        (Layer((("Cu", 1.0),), plating_um, 8.96), Layer((("Fe", 1.0),))),
    )


SAMPLES = {
    s.name: s
    for s in (
        _bulk("Cu", Cu=100),
        _bulk("Zn", Zn=100),
        _bulk("Pb", Pb=100),
        _bulk("CuZn39Pb3", Cu=58, Zn=39, Pb=3),  # LD 554 848
        _bulk("CuZn36", Cu=64, Zn=36),
        dataclasses.replace(coin(18.0), name="centavo2003"),
    )
}

# Lines: K lines by xraylib macro (Kα, Kβ), and for Pb the L lines whose production at 17.5 keV is
# ≥ 1 % of Lα1 (the omitted LB7, LB9, LB10, LB17 are each < 0.4 %).
_K_LINES = (("Kα", xraylib.KA_LINE), ("Kβ", xraylib.KB_LINE))
_PB_L_LINES = tuple(
    (label, getattr(xraylib, f"{code}_LINE"))
    for label, code in (
        ("Lα1", "LA1"), ("Lα2", "LA2"), ("Lβ1", "LB1"), ("Lβ2", "LB2"), ("Lγ1", "LG1"),
        ("Lℓ", "LL"), ("Lβ3", "LB3"), ("Lβ4", "LB4"), ("Lβ5", "LB5"), ("Lβ6", "LB6"),
        ("Lβ15", "LB15"), ("Lγ2", "LG2"), ("Lγ3", "LG3"),
    )
)  # fmt: skip


def reference_lines_keV():
    """Energies in keV of the lines a student may pick for a fit, in menu order: Fe/Cu/Zn Kα and Kβ
    (xraylib's ``LineEnergy`` of ``KA_LINE`` and ``KB_LINE``; KB_LINE is xraylib's Kβ energy, the
    KM3 energy for Fe/Cu/Zn, not a weighted composite, as the kernel labels) and Pb Lα (Lα1+Lα2)
    and Lβ (Lβ1+Lβ2), each weighted by xraylib ``RadRate``. "Pb Lβ" (12.616 keV) is the Lβ group in
    a fit: it also takes Lβ3 (12.79 keV) and Lβ4 (12.31 keV), ≈ +5.6 % vs Lβ1+Lβ2 in pure Pb.
    Source: xraylib ``LineEnergy``, ``RadRate``."""
    out = {}
    for sym in ("Fe", "Cu", "Zn"):
        z = xraylib.SymbolToAtomicNumber(sym)
        for label, code in _K_LINES:
            out[f"{sym} {label}"] = float(xraylib.LineEnergy(z, code))
    z = xraylib.SymbolToAtomicNumber("Pb")
    for label, codes in (("Lα", ("LA1", "LA2")), ("Lβ", ("LB1", "LB2"))):
        lines = [getattr(xraylib, f"{c}_LINE") for c in codes]
        w = [xraylib.RadRate(z, ln) for ln in lines]
        out[f"Pb {label}"] = float(
            sum(wi * xraylib.LineEnergy(z, ln) for wi, ln in zip(w, lines, strict=True)) / sum(w)
        )
    return out


def _lines_of(symbol):
    return _PB_L_LINES if symbol == "Pb" else _K_LINES


class Line(NamedTuple):
    label: str
    energy_keV: float
    rate_per_s: float


@dataclasses.dataclass(frozen=True, eq=False)
class LineKernel:
    label: str
    energy_keV: float
    k: np.ndarray  # detected photons per incident photon, on lam_pm then the Mo components
    k_secondary: np.ndarray  # the secondary-fluorescence part of k


@dataclasses.dataclass(frozen=True, eq=False)
class Kernels:
    lam_pm: np.ndarray  # n nodes; every kernel array has n + 4 entries (Mo components last)
    lines: tuple
    rayleigh: np.ndarray  # scatter kernels: detected at the incident λ
    compton: np.ndarray  # detected at λ + COMPTON_SHIFT_PM


def _q(z, line, e_kev):
    """xraylib Kissel-cascade line cross section in cm²/g (0 below the edge)."""
    try:
        return xraylib.CS_FluorLine_Kissel_Cascade(z, line, e_kev)
    except ValueError:  # "excitation energy too low to excite the shell"
        return 0.0


def _mu(layer, e_kev):
    """Total mass attenuation of the layer in cm²/g at energies ``e_kev`` (array)."""
    e = np.atleast_1d(e_kev)
    return sum(
        w * np.array([xraylib.CS_Total(xraylib.SymbolToAtomicNumber(s), x) for x in e])
        for s, w in layer.composition
    )


def _t_air_out(e_kev):
    return transmission(HC_KEV_PM / e_kev, scan.AIR, _MG_CM2_PER_CM_AIR * S2_CM)


def _film(ab, m):
    """(1 − e^{−m ab})/ab, the depth integral of a layer of mass thickness m (inf allowed)."""
    return -np.expm1(-m * ab) / ab


def _edge_nodes(symbols):
    """Wavelengths (pm) of the steps of the elements' K, L1–L3 shells inside the μ/ρ grid: both the
    step of xraylib's tabulated ``CS_Total`` (``cs_step_edges_pm``, up to 0.17 pm from the nominal
    edge) and ``hc / EdgeEnergy`` (where the Kissel cross sections switch on)."""
    edges = []
    for sym in symbols:
        z = xraylib.SymbolToAtomicNumber(sym)
        edges += cs_step_edges_pm([z], lambda e, z=z: xraylib.CS_Total(z, e))
        for shell in (xraylib.K_SHELL, xraylib.L1_SHELL, xraylib.L2_SHELL, xraylib.L3_SHELL):
            try:
                lam = HC_KEV_PM / xraylib.EdgeEnergy(z, shell)
            except ValueError:
                continue
            if MU_RHO_GRID_PM[0] < lam < MU_RHO_GRID_PM[-1]:
                edges.append(lam)
    return np.array(sorted(set(edges)))


EDGE_BRACKET = 1e-5  # relative: nodes at λ(1 ∓ 1e-5) put each step between two nodes


def _bracketed_grid(edges):
    """``MU_RHO_GRID_PM`` plus the nodes λ(1 − 1e-5) and λ(1 + 1e-5) around every edge, so the
    trapezoid rule sees the step as a (nearly) vertical segment and a function that is zero
    beyond the edge is exactly 0 on the long-λ node."""
    pairs = np.concatenate([edges * (1 - EDGE_BRACKET), edges * (1 + EDGE_BRACKET)])
    return np.unique(np.concatenate([MU_RHO_GRID_PM, pairs]))


def _grid(sample):
    """``MU_RHO_GRID_PM`` bracketed around every K, L1–L3 step of the sample's elements."""
    return _bracketed_grid(
        _edge_nodes({s for layer in sample.layers for s, _ in layer.composition})
    )


_Y_NODES, _Y_WEIGHTS = np.polynomial.legendre.leggauss(64)
_Y_MAX = 14.0  # ln s up to e^14: the integrand falls as 1/s²


def _cross_secondary(layer0, layer1, ctx):
    """∫₀^m dx ∫₀^∞ dv … of the E1 kernel across the interface (see module docstring), without
    the w Q prefactors: e^{−(a0+b0)m} ∫₁^∞ ds/s · m Φ((a0 − μ0j s)m)/(b1 + μ1j s)."""
    m, a0, mu0j, mu1j, b1 = ctx
    s = np.exp(_Y_MAX * (_Y_NODES + 1) / 2)
    z = np.minimum((a0[:, None] - mu0j * s) * m, 700.0)  # only absurd plating (> 100 µm) clips
    phi = np.where(np.abs(z) < 1e-12, 1.0, np.expm1(z) / np.where(z == 0, 1.0, z))
    return (m * phi / (b1 + mu1j * s)) @ (_Y_WEIGHTS * _Y_MAX / 2)


@functools.lru_cache(maxsize=32)
def kernels(sample):
    """Excitation and scatter kernels of ``sample`` (a ``Sample``), cached and read-only.
    Raises ValueError unless one bulk layer, or two layers with a single-element top."""
    layers = sample.layers
    if not (len(layers) == 1 or (len(layers) == 2 and len(layers[0].composition) == 1)):
        raise ValueError("kernels: need one bulk layer, or two layers with a single-element top")
    lam = _grid(sample)
    x = np.concatenate([lam, _MO_LAMBDA_PM])
    e0 = HC_KEV_PM / x
    m = [layer.mass_g_cm2 for layer in layers]
    mu0 = [_mu(layer, e0) for layer in layers]  # μ(E0) per layer

    def above(idx, mus, sin):  # attenuation by the layers above layer idx
        return np.exp(-sum((m[k] * mus[k] / sin for k in range(idx)), start=0.0))

    # Production cross sections Q_j(E0) of every line of every layer (the sources of secondaries).
    prod = {}
    for li, layer in enumerate(layers):
        for sym, _ in layer.composition:
            z = xraylib.SymbolToAtomicNumber(sym)
            for label, code in _lines_of(sym):
                prod[li, sym, label] = (
                    z, code, xraylib.LineEnergy(z, code),
                    np.array([_q(z, code, e) for e in e0]),
                )  # fmt: skip
    bulk = len(layers) == 1

    lines = []
    for li, layer in enumerate(layers):
        for sym, w_i in layer.composition:
            for label, code in _lines_of(sym):
                z, _, e_a, q = prod[li, sym, label]
                mu_a = _mu(layer, e_a)[0]
                a, b = mu0[li] / _SIN_IN, mu_a / _SIN_OUT
                in_out = above(li, mu0, _SIN_IN) * np.exp(
                    -sum((m[k] * _mu(layers[k], e_a)[0] / _SIN_OUT for k in range(li)), start=0.0)
                )
                primary = in_out * w_i * q / _SIN_IN * _film(a + b, m[li])
                secondary = np.zeros_like(x)
                if bulk or li == 1:  # sources: other elements of the bulk, or the plating
                    src_layer = layers[0]
                    for (sli, ssym, _), (_, _, e_j, q_j) in prod.items():
                        if sli != 0 or ssym == sym:
                            continue
                        q_ij = _q(z, code, e_j)
                        if q_ij == 0.0:
                            continue
                        w_j = dict(src_layer.composition)[ssym]
                        pref = w_i * q_ij * w_j * q_j / (2 * _SIN_IN)
                        if bulk:
                            mu_j = _mu(layer, e_j)[0]
                            secondary += pref * (
                                (np.log1p(a / mu_j) / a + np.log1p(b / mu_j) / b) / (a + b)
                            )
                        else:
                            ctx = (m[0], mu0[0] / _SIN_IN, _mu(layers[0], e_j)[0],
                                   _mu(layer, e_j)[0], b)  # fmt: skip
                            secondary += pref * in_out * _cross_secondary(src_layer, layer, ctx)
                scale = _FLUOR_FRACTION * _t_air_out(e_a)
                lines.append(
                    LineKernel(
                        f"{sym} {label}", e_a, (primary + secondary) * scale, secondary * scale
                    )
                )

    # Scatter: Rayleigh keeps the energy, Compton goes to λ + COMPTON_SHIFT_PM.
    e_c = HC_KEV_PM / (x + COMPTON_SHIFT_PM)
    mu_c = [_mu(layer, e_c) for layer in layers]
    rayleigh, compton = np.zeros_like(x), np.zeros_like(x)
    for li, layer in enumerate(layers):
        for dcs, e_out, mus_out, acc in (
            (xraylib.DCS_Rayl, e0, mu0, rayleigh),
            (xraylib.DCS_Compt, e_c, mu_c, compton),
        ):
            sigma = sum(
                w
                * np.array(
                    [dcs(xraylib.SymbolToAtomicNumber(s), e, _SCATTER_ANGLE_RAD) for e in e0]
                )
                for s, w in layer.composition
            )  # cm²/g/sr, unpolarised
            a, b = mu0[li] / _SIN_IN, mus_out[li] / _SIN_OUT
            acc += (
                above(li, mu0, _SIN_IN) * above(li, mus_out, _SIN_OUT)
                * OMEGA_SR * sigma / _SIN_IN * _film(a + b, m[li]) * _t_air_out(e_out)
            )  # fmt: skip

    for arr in (*(a for lk in lines for a in (lk.k, lk.k_secondary)), rayleigh, compton):
        arr.flags.writeable = False
    lam.flags.writeable = False
    return Kernels(lam, tuple(lines), rayleigh, compton)


def _resolve(sample):
    if isinstance(sample, Sample):
        return sample
    if sample not in SAMPLES:
        raise ValueError(f"unknown XRF sample {sample!r}: use one of {tuple(SAMPLES)}")
    return SAMPLES[sample]


def _t_in(lam_pm, params):
    return transmission(lam_pm, scan.ABSORBER, params.absorber_mg_cm2) * transmission(
        lam_pm, scan.AIR, _MG_CM2_PER_CM_AIR * AIR_IN_CM
    )


def _flux(kern, U_kV, params):
    """Φ̃ per mA in the tube's source units (``scan._photons_out`` pieces) on the kernel grid, then
    the four Mo line rates (Kα1, Kα2, Kβ1,3, Kβ2) at the end."""
    ka, kb = source.line_rates(U_kV, 1.0, params.line_to_cont)
    mo = np.array([r * f for r, comps in ((ka, MO_KA_COMPONENTS), (kb, MO_KB_COMPONENTS))
                   for _, f in comps])  # fmt: skip
    mo = mo * _t_in(_MO_LAMBDA_PM, params)
    return np.concatenate(
        [source.continuum(kern.lam_pm, U_kV, 1.0) * _t_in(kern.lam_pm, params), mo]
    )


@functools.lru_cache(maxsize=8)
def _gm_weighted_photons(params):
    """``scan._photons_out(scan.DIRECT_ANCHOR_U_KV)`` with every photon weighted by
    ``detector.gm_efficiency`` and the same trapezoid rule, split at the K, L edges of the
    counter's window and gas elements."""
    lam = _bracketed_grid(_edge_nodes(("O", "Al", "Si", "K", "Ne", "Ar", "Br")))
    total = np.trapezoid(
        source.continuum(lam, scan.DIRECT_ANCHOR_U_KV, 1.0)
        * scan._transmission(lam, params)
        * detector.gm_efficiency(lam),
        lam,
    )
    ka, kb = source.line_rates(scan.DIRECT_ANCHOR_U_KV, 1.0, params.line_to_cont)
    for rate, components in ((ka, MO_KA_COMPONENTS), (kb, MO_KB_COMPONENTS)):
        for lam_pm, fraction in components:
            total += (
                rate * fraction * float(scan._transmission(lam_pm, params))
                * float(detector.gm_efficiency(lam_pm))
            )  # fmt: skip
    return float(total)


def _scale(params):
    """Photons/s on the sample per source unit. The GM counter's reading at
    ``scan.DIRECT_ANCHOR_U_KV`` (``direct_per_s`` · ``tube_factor(21 kV, 1 mA)``, 18 cm of air) is
    ∫ Φ_GM(λ) ε_GM(λ) dλ + Σ Mo lines at that voltage, so one source unit is worth that reading /
    (that sum with ε_GM weights); independent of sample, U and I. Anchoring at 35 kV instead would
    mix ``tube_factor``'s ε = 1 extrapolation with the ε-weighted sum (×1.76 too much flux)."""
    reading = params.direct_per_s * scan.tube_factor(scan.DIRECT_ANCHOR_U_KV, 1.0, params)
    return reading / _gm_weighted_photons(params)


def _integral(kern, phi, k):
    n = len(kern.lam_pm)
    return np.trapezoid(phi[:n] * k[:n], kern.lam_pm) + float(phi[n:] @ k[n:])


def line_rates(sample, U_kV, I_mA, params=scan.DEFAULT):
    """Expected photon rates at the detector window as a list of ``Line(label, energy_keV,
    rate_per_s)``: the fluorescence lines of the sample, then the Mo Kα/Kβ Rayleigh and Compton
    lines (energy = fraction-weighted mean of the components). ``sample``: a name in ``SAMPLES``
    or a ``Sample``. Deterministic, linear in ``I_mA``; lines of an element whose edge lies above
    the tube voltage are exactly 0."""
    sample = _resolve(sample)
    scan._check_tube(U_kV, I_mA)
    kern = kernels(sample)
    n = len(kern.lam_pm)
    phi, amp = _flux(kern, U_kV, params), I_mA * _scale(params)
    out = [
        Line(lk.label, lk.energy_keV, float(amp * _integral(kern, phi, lk.k))) for lk in kern.lines
    ]
    for label, i0 in (("Mo Kα", 0), ("Mo Kβ", 2)):
        fracs = [f for _, f in _MO_COMPONENTS[i0 : i0 + 2]]
        for kind, k, shift in (
            ("Rayleigh", kern.rayleigh, 0.0),
            ("Compton", kern.compton, COMPTON_SHIFT_PM),
        ):
            energy = sum(
                f * HC_KEV_PM / (_MO_LAMBDA_PM[i0 + j] + shift) for j, f in enumerate(fracs)
            )
            rate = sum(amp * phi[n + i0 + j] * k[n + i0 + j] for j in range(2))
            out.append(Line(f"{label} {kind}", float(energy), float(rate)))
    return out


def secondary_fraction(sample, label, U_kV, params=scan.DEFAULT):
    """Secondary / primary rate of fluorescence line ``label`` (e.g. "Cu Kα") at ``U_kV``."""
    scan._check_tube(U_kV, 0.0)
    kern = kernels(_resolve(sample))
    lk = next(lk for lk in kern.lines if lk.label == label)
    phi = _flux(kern, U_kV, params)
    sec = _integral(kern, phi, lk.k_secondary)
    primary = _integral(kern, phi, lk.k) - sec
    return float(sec / primary) if primary > 0 else 0.0


def scattered_continuum(sample, U_kV, I_mA, params=scan.DEFAULT):
    """Rayleigh and Compton scatter of the tube continuum at the detector window:
    ``{"rayleigh": (energy_keV, rate_per_s_per_keV), "compton": (...)}``, energies ascending
    (closely spaced node pairs bracket the absorption edges). Compton is shifted by 2.426 pm."""
    sample = _resolve(sample)
    scan._check_tube(U_kV, I_mA)
    kern = kernels(sample)
    n = len(kern.lam_pm)
    phi, amp = _flux(kern, U_kV, params), I_mA * _scale(params)
    out = {}
    for kind, k, shift in (
        ("rayleigh", kern.rayleigh, 0.0),
        ("compton", kern.compton, COMPTON_SHIFT_PM),
    ):
        lam_d = kern.lam_pm + shift
        per_pm = amp * phi[:n] * k[:n]
        out[kind] = (HC_KEV_PM / lam_d[::-1], (per_pm * lam_d**2 / HC_KEV_PM)[::-1])
    return out


def mca_spectrum(sample, U_kV, I_mA, t_s, n_channels=512, gain=-2.5, params=scan.DEFAULT):
    """Expected MCA spectrum of the LD 559 938 for ``sample``: (counts per channel, live_time_s,
    channel_energy_keV) over ``t_s`` of real time. Lines and scatter continuum from ``line_rates``
    and ``scattered_continuum``, then ``detector.mca_counts``. Deterministic; Poisson-sample with
    ``detector.sample_counts(counts, 1.0, rng)``."""
    sample = _resolve(sample)
    lines = [(ln.energy_keV, ln.rate_per_s) for ln in line_rates(sample, U_kV, I_mA, params)]
    cont = list(scattered_continuum(sample, U_kV, I_mA, params).values())
    return detector.mca_counts(lines, cont, t_s, n_channels, gain)


def detected_line_counts(sample, U_kV, I_mA, t_s, n_channels=512, gain=-2.5, params=scan.DEFAULT):
    """Expected counts {label: counts} under each fluorescence line in the MCA over ``t_s`` of
    real time: window rate × ``detector.pin_efficiency`` × live time (the truth the line fits are
    compared with; same live time as ``mca_spectrum``)."""
    live = mca_spectrum(sample, U_kV, I_mA, t_s, n_channels, gain, params)[1]
    return {
        ln.label: ln.rate_per_s * float(detector.pin_efficiency(ln.energy_keV)) * live
        for ln in line_rates(_resolve(sample), U_kV, I_mA, params)
    }
