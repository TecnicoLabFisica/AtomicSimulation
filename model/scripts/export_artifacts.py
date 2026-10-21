"""Export the data the web app loads and the golden cases its physics port must reproduce.

    python model/scripts/export_artifacts.py

artifacts/tables/    runtime data for the browser: μ/ρ on the fixed λ grid, the fitted parameters.
artifacts/fixtures/  one golden case per file: ``inputs`` → ``expected`` from the Python reference
                     model; Vitest compares R̄(β) at 1e-9 relative (web-physics-port rule).

The output is deterministic (sorted keys, shortest round-trip floats), so running the script twice
gives byte-identical files; tests/test_artifacts.py fails when the committed files are stale.
Files the script no longer produces are deleted.
"""

import dataclasses
import json
from pathlib import Path

import numpy as np
import xraylib

import braggsim
from braggsim import analysis, scan
from braggsim.constants import MO_K_EDGE_KEV, MO_KA_PM, MO_KB_PM
from braggsim.crystal import (
    NACL,
    PRESETS,
    cell_scale,
    d_pm,
    density_g_cm3,
    extinction_table,
    mu_per_cm_table,
    structure_factor_sq_rel,
    structure_factor_sq_rel_crystal,
    theta_from_lambda,
)
from braggsim.filters import (
    ABSORBERS,
    FOILS_MM,
    MU_RHO_GRID_PM,
    WHEELS_MM,
    areal_density_mg_cm2,
    mu_rho_table,
    transmission,
)
from braggsim.source import lambda_min_pm

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"
LEAFLET_BETAS = scan.coupled_betas(2.0, 25.0, 0.1)  # LD P6.3.3.1 measurement settings


def _floats(a):
    return [float(x) for x in np.asarray(a, dtype=float).ravel()]


def _dump(obj):
    obj = {"model_version": braggsim.__version__, **obj}
    return json.dumps(obj, sort_keys=True, indent=1, ensure_ascii=False, allow_nan=False) + "\n"


def _rate_case(
    description,
    beta_deg,
    U_kV,
    I_mA,
    params=scan.DEFAULT,
    sensor_deg=None,
    filters=(),
    crystal=NACL,
):
    beta = np.asarray(beta_deg, dtype=float)
    inputs = {"beta_deg": _floats(beta), "U_kV": U_kV, "I_mA": I_mA,
              "params": dataclasses.asdict(params)}  # fmt: skip
    if sensor_deg is not None:
        sensor_deg = np.asarray(sensor_deg, dtype=float)
        inputs["sensor_deg"] = _floats(sensor_deg)
    if filters:
        inputs["filters"] = [[m, d] for m, d in filters]
    return {
        "function": "scan.expected_rate",
        "description": description,
        "inputs": inputs,
        "expected": {
            "rate_per_s": _floats(
                scan.expected_rate(beta, U_kV, I_mA, params, sensor_deg, filters, crystal)
            )
        },
    }


def _direct_case(description, U_kV, I_mA, filters=(), sensor_deg=0.0):
    return {
        "description": description,
        "inputs": {"U_kV": U_kV, "I_mA": I_mA, "filters": [[m, d] for m, d in filters],
                   "sensor_deg": sensor_deg, "params": dataclasses.asdict(scan.DEFAULT)},
        "expected": {"rate_per_s": scan.direct_rate(U_kV, I_mA, filters, sensor_deg=sensor_deg)},
    }  # fmt: skip


def _transmission_case():
    # Grid nodes and midpoints, the grid ends, beyond them (end values held) and the brackets
    # of the Ar K (386.7 pm) and K K (343.7 pm) edges. 10 mg/cm²: nothing underflows.
    g = MU_RHO_GRID_PM
    lam = np.r_[20.0, g[0], g[:-1:97], np.sqrt(g[:-1:97] * g[1::97]), 343.7, 386.7, g[-1], 700.0]
    return {
        "function": "filters.transmission",
        "description": "T(λ) through 10 mg/cm²: log–log interpolation of the μ/ρ table",
        "cases": [
            {"inputs": {"lambda_pm": _floats(lam), "material": m, "areal_density_mg_cm2": 10.0},
             "expected": {"transmission": _floats(transmission(lam, m, 10.0))}}
            for m in (scan.AIR, scan.ABSORBER)
        ]
        + [  # absorbers: 1 mg/cm² of metal, 10 of polystyrene (min T stays far above underflow)
            {"inputs": {"lambda_pm": _floats(lam), "material": m, "areal_density_mg_cm2": d},
             "expected": {"transmission": _floats(transmission(lam, m, d))}}
            for m in ABSORBERS
            for d in (10.0 if m == "Polystyrene" else 1.0,)
        ],
    }  # fmt: skip


def _rejected_case():
    # Inputs just outside each limit: the port must refuse exactly what Python refuses, so a limit
    # constant drifting between the two copies fails a test. (NaN cannot be written to JSON.)
    tube = {"U_kV": 35.0, "I_mA": 1.0}
    rate, betas = "expected_rate", "coupled_betas"
    cases = [
        (rate, "β above the coupled range", {"beta_deg": [85 + 1e-9], **tube}),
        (rate, "β below the coupled range", {"beta_deg": [-5 - 1e-9], **tube}),
        (rate, "U above 35 kV", {"beta_deg": [7.2], "U_kV": 35 + 1e-9, "I_mA": 1.0}),
        (rate, "U negative", {"beta_deg": [7.2], "U_kV": -1e-9, "I_mA": 1.0}),
        (rate, "I above 1 mA", {"beta_deg": [7.2], "U_kV": 35.0, "I_mA": 1 + 1e-9}),
        (rate, "sensor above +170°", {"beta_deg": [7.2], **tube, "sensor_deg": [170 + 1e-9]}),
        (rate, "sensor below −10°", {"beta_deg": [7.2], **tube, "sensor_deg": [-10 - 1e-9]}),
        (rate, "lengths differ", {"beta_deg": [7.2, 7.3], **tube, "sensor_deg": [14]}),
        (
            rate,
            "negative filter areal density",
            {"beta_deg": [7.2], **tube, "filters": [("Zr", -1.0)]},
        ),
        (
            rate,
            "filter material without a table",
            {"beta_deg": [7.2], **tube, "filters": [("Ni", 1.0)]},
        ),
        ("direct_rate", "U above 35 kV (direct beam)", {"U_kV": 35 + 1e-9, "I_mA": 1.0}),
        (betas, "upper limit below lower", {"lo_deg": 25.0, "hi_deg": 2.0, "step_deg": 0.1}),
        (betas, "Δβ = 0", {"lo_deg": 2.0, "hi_deg": 25.0, "step_deg": 0.0}),
        (betas, "too many steps", {"lo_deg": -5.0, "hi_deg": 85.0, "step_deg": 1e-4}),
    ]
    out = []
    for fn, description, inputs in cases:
        try:
            getattr(scan, fn)(**inputs)
        except ValueError as e:
            out.append({"function": f"scan.{fn}", "description": description, "inputs": inputs,
                        "expected": {"error": type(e).__name__}})  # fmt: skip
        else:
            raise AssertionError(f"scan.{fn} accepted {inputs}")
    return {"function": "rejected", "description": "Inputs the model refuses", "cases": out}


def _crystal_tables():
    """Everything the port needs for ``expected_rate(..., crystal=X)`` without xraylib.

    r_n(params) = k · f_sq_rel[n−1] · exp(−2 B (n²−1) s_1²) with k = cell_scale, times
    exp(2 B_fit / (2 d_NaCl)²) when ``fitted_debye_waller`` is false, B = params.debye_waller_pm2
    when it is true and 0 otherwise (scan.ModelParams.order_strengths). The μ_X(λ) tables are the
    very ones Python interpolates log–log (crystal.mu_per_cm_table), so mu_factor agrees exactly;
    the same holds for ``extinction`` (crystal.extinction_table, already rounded to 7 digits).
    """
    out = {}
    for name, c in PRESETS.items():
        out[name] = {
            "a_pm": c.a_pm, "b_pm": c.b_pm, "c_pm": c.c_pm,
            "alpha_deg": c.alpha_deg, "beta_deg": c.beta_deg, "gamma_deg": c.gamma_deg,
            "cut": list(c.cut),
            "d_pm": d_pm(c),
            "density_g_cm3": density_g_cm3(c),
            "reflectivity_model": c.reflectivity_model,
            "mosaic_fwhm_deg": c.mosaic_fwhm_deg,
            "extinction": [_floats(row) for row in extinction_table(c)],
            "fitted_debye_waller": c.fitted_debye_waller,
            "source": c.source,
            "max_order": scan.max_order(c),
            "cell_scale": cell_scale(c),
            "f_sq_rel": list(structure_factor_sq_rel_crystal(c, scan.max_order(c))),
            "mu_per_cm": _floats(mu_per_cm_table(c)),
        }  # fmt: skip
    return out


def _crystal_fixtures():
    """One 35 kV, 1 mA coupled scan per non-NaCl preset, orders 1–3 of Mo Kα/Kβ in the window."""
    out = {}
    for name, c in PRESETS.items():
        if c is NACL:
            continue
        d = d_pm(c)
        lo = 1.5 if name == "muscovite" else round(float(theta_from_lambda(MO_KB_PM, 1, d)) - 1, 1)
        hi = (
            8.0 if name == "muscovite" else round(float(theta_from_lambda(MO_KA_PM, 3, d)) + 1.5, 1)
        )
        case = _rate_case(
            f"{name}, 35 kV, 1 mA, coupled {lo:g}° → {hi:g}°, Δβ = 0.05° (orders 1–3 of Mo Kα/Kβ)",
            scan.coupled_betas(lo, hi, 0.05), 35.0, 1.0, crystal=c,
        )  # fmt: skip
        case["inputs"]["crystal"] = name
        out[f"crystal_{name.lower()}_35kV_1mA"] = case
    out.update(_crystal_fixtures_wide())
    return out


def _crystal_fixtures_wide():
    """Crystals off the 35 kV, 1 mA, unfiltered, coupled default: low kV, detached sensor, tail."""
    out = {}
    lif, calcite, mus = PRESETS["LiF"], PRESETS["calcite"], PRESETS["muscovite"]

    def add(key, crystal_key, case):
        case["inputs"]["crystal"] = crystal_key
        out[key] = case

    zr = (("Zr", areal_density_mg_cm2("Zr", 0.05)),)
    add(
        "crystal_lif_20kV_zr_filter",
        "LiF",
        _rate_case(
            "LiF, 20 kV (below the Mo K edge: continuum only), 1 mA, Zr 0.05 mm, "
            "coupled 5° → 30°, Δβ = 0.25° (orders 1–2 window)",
            scan.coupled_betas(5.0, 30.0, 0.25), 20.0, 1.0, filters=zr, crystal=lif,
        ),
    )  # fmt: skip
    th = float(theta_from_lambda(MO_KA_PM, 1, d_pm(calcite)))
    sensor = np.r_[
        2 * th - 0.3, 2 * th - 0.1, 2 * th, 2 * th + 0.1, 2 * th + 0.3, 0.0, 120.0, 2 * th
    ]
    beta = np.r_[np.full(7, th), th + 1.0]
    add(
        "crystal_calcite_detached_sensor",
        "calcite",
        _rate_case(
            "calcite, 35 kV, 1 mA: target at order-1 Kα θ, sensor at 2θ ± 0.3° and far off; "
            "last point target 1° off with the sensor at 2θ",
            beta, 35.0, 1.0, sensor_deg=sensor, crystal=calcite,
        ),
    )  # fmt: skip
    add(
        "crystal_muscovite_35kV_high_orders",
        "muscovite",
        _rate_case(
            "muscovite, 35 kV, 1 mA, coupled 60° → 85°, Δβ = 0.5° (high-order tail, "
            f"max_order {scan.max_order(mus)})",
            scan.coupled_betas(60.0, 85.0, 0.5), 35.0, 1.0, crystal=mus,
        ),
    )  # fmt: skip
    return out


def _prominence_case():
    """Expected line prominence (weak-signal aid): NaCl, Si (extinct orders), a filter, no line."""
    zr = (("Zr", areal_density_mg_cm2("Zr", 0.05)),)
    mus = PRESETS["muscovite"]
    rows = [
        ("NaCl", NACL, 4.0, 24.0, 35.0, 1.0, 1.0, ()),
        ("Si", PRESETS["Si"], 4.0, 40.0, 35.0, 1.0, 1.0, ()),
        ("Si", PRESETS["Si"], 4.0, 24.0, 35.0, 0.05, 1.0, ()),
        ("calcite", PRESETS["calcite"], 3.0, 30.0, 30.0, 0.5, 10.0, zr),
        ("muscovite", mus, 1.0, 12.0, 35.0, 1.0, 1.0, ()),
        ("NaCl", NACL, 1.0, 3.0, 35.0, 1.0, 1.0, ()),  # no line in the window: 0
        ("NaCl", NACL, 2.0, 40.0, 15.0, 1.0, 1.0, ()),  # below the K edge
    ]
    cases = []
    for name, c, lo, hi, u_kv, i_ma, dt, filters in rows:
        cases.append(
            {
                "inputs": {"crystal": name, "beta_lo_deg": lo, "beta_hi_deg": hi, "U_kV": u_kv,
                           "I_mA": i_ma, "dt_s": dt, "filters": [[m, d] for m, d in filters],
                           "params": dataclasses.asdict(scan.DEFAULT)},
                "expected": {
                    "sigma": analysis.line_prominence_sigma(lo, hi, u_kv, i_ma, dt, filters, c),
                    "strongest_rate_per_s": analysis.strongest_line_rate_per_s(
                        lo, hi, u_kv, i_ma, filters, c
                    ),
                },
            }
        )  # fmt: skip
    return {
        "function": "analysis.line_prominence_sigma",
        "description": "Expected prominence (σ) and strongest-line rate of the Mo K lines",
        "cases": cases,
    }


def _fixtures():
    duane_hunt_deg = float(theta_from_lambda(lambda_min_pm(35.0)))
    ka_deg = float(theta_from_lambda(MO_KA_PM))
    sweep = scan.coupled_betas(2 * ka_deg - 1.0, 2 * ka_deg + 1.0, 0.02)
    rocking = np.r_[ka_deg + np.arange(-0.6, 0.61, 0.02), ka_deg + 360.0, -ka_deg]
    return {
        "leaflet_35kV_1mA": _rate_case(
            "Leaflet Fig. 4 settings: 2°→25°, Δβ = 0.1°, 35 kV, 1 mA", LEAFLET_BETAS, 35.0, 1.0
        ),
        "below_k_edge_19kV": _rate_case(
            "Below the Mo K edge: continuum only, no lines", LEAFLET_BETAS, 19.0, 1.0
        ),
        "at_k_edge": _rate_case(
            "U exactly at the Mo K edge: lines still off (they need U > U_K)",
            LEAFLET_BETAS,
            MO_K_EDGE_KEV,
            1.0,
        ),  # fmt: skip
        "above_k_edge_25kV_0.3mA": _rate_case(
            "Weak lines just above the K edge, reduced current", LEAFLET_BETAS, 25.0, 0.3
        ),
        "edge_angles": _rate_case(
            "Arm limits, the other crystal face (β < 0), β ≈ 0 and the 35 kV Duane–Hunt angle",
            [
                -5.0,
                -0.05,
                0.0,
                0.005,
                0.05,
                duane_hunt_deg - 0.02,
                duane_hunt_deg,
                duane_hunt_deg + 0.05,
                85.0,
            ],
            35.0,
            1.0,
        ),  # fmt: skip
        "full_range_coarse": _rate_case(
            "Whole coupled range in 0.5° steps: far tails stay finite thanks to scatter",
            scan.coupled_betas(-5.0, 85.0, 0.5),
            35.0,
            1.0,
        ),  # fmt: skip
        "low_voltage_10kV": _rate_case(
            "10 kV: continuum onset at 12.7° where the absorber cuts deep, no lines",
            scan.coupled_betas(2.0, 40.0, 0.2),
            10.0,
            1.0,
        ),  # fmt: skip
        "higher_orders_20_to_45deg": _rate_case(
            "Beyond the leaflet range: 3rd to 6th order (4th-order Kα at 30.27°)",
            scan.coupled_betas(20.0, 45.0, 0.1),
            35.0,
            1.0,
        ),  # fmt: skip
        "voltage_series": {
            "function": "scan.expected_rate",
            "description": "20, 25, 30 kV: leak and scatter scale with the tube factor S(U)",
            "cases": [
                _rate_case(f"{U:g} kV", scan.coupled_betas(0.0, 25.0, 0.25), U, 1.0)
                for U in (20.0, 25.0, 30.0)
            ],
        },
        "sensor_sweep_fixed_target": _rate_case(
            "Target fixed at 1st-order Kα, sensor swept across 2θ (sensor_deg given)",
            np.full_like(sweep, ka_deg),
            35.0,
            1.0,
            sensor_deg=sweep,
        ),
        "target_sweep_fixed_sensor": _rate_case(
            "Sensor fixed at 2θ(Kα), target swept through the rocking curve and wrapped past 360°",
            rocking,
            35.0,
            1.0,
            sensor_deg=np.full_like(rocking, 2 * ka_deg),
        ),
        "transmission": _transmission_case(),
        "zr_filter_35kV": _rate_case(
            "Zr foil 0.05 mm (32.6 mg/cm²) between the Mo lines: Kβ cut far more than Kα",
            LEAFLET_BETAS,
            35.0,
            1.0,
            filters=(("Zr", 32.6),),
        ),
        "direct_beam": {
            "function": "scan.direct_rate",
            "description": "EPN Práctica 1: counter in the direct beam, no crystal, with absorbers",
            "cases": [
                _direct_case("21 kV, 0.05 mA, open (EPN anchor ≥ 950/s)", 21.0, 0.05),
                _direct_case("Al 1.0 mm", 21.0, 0.05, (("Al", 270.0),)),
                _direct_case("Zr 0.05 mm + Cu 0.4 mm", 30.0, 1.0, (("Zr", 32.6), ("Cu", 358.4))),
                _direct_case("Tube off: natural background only", 0.0, 0.05),
                _direct_case("Off-axis 1.5° (Gaussian profile, leak width)", 21.0, 0.05, (), 1.5),
                _direct_case("Off-axis 3°", 21.0, 0.05, (), 3.0),
            ],
        },
        "tube_off_I0": _rate_case(
            "Emission current 0: natural background only", LEAFLET_BETAS, 35.0, 0.0
        ),
        "tube_off_U0": _rate_case(
            "Tube voltage 0: natural background only", LEAFLET_BETAS, 0.0, 1.0
        ),
        "sigma_narrow": _rate_case(
            "Sharper resolution σ = 0.05° (short convolution kernel)",
            LEAFLET_BETAS,
            35.0,
            1.0,
            scan.DEFAULT.replace(sigma_deg=0.05),
        ),  # fmt: skip
        "sigma_wide": _rate_case(
            "Coarser resolution σ = 0.3° (Kα and Kβ start to merge)",
            LEAFLET_BETAS,
            35.0,
            1.0,
            scan.DEFAULT.replace(sigma_deg=0.3),
        ),  # fmt: skip
        "coupled_betas": {
            "function": "scan.coupled_betas",
            "description": "Scan angles: step not dividing the range, float noise, negative start",
            "cases": [
                {
                    "inputs": {"lo_deg": lo, "hi_deg": hi, "step_deg": step},
                    "expected": {"beta_deg": _floats(scan.coupled_betas(lo, hi, step))},
                }
                for lo, hi, step in [
                    (2.0, 25.0, 0.1),
                    (2.0, 25.0, 0.3),
                    (-5.0, 10.0, 0.1),
                    (0.0, 0.5, 0.25),
                    (80.0, 85.0, 0.3),
                    (7.2, 7.2, 0.1),
                ]
            ],
        },  # fmt: skip
        "rejected_inputs": _rejected_case(),
        "line_prominence": _prominence_case(),
    }


def build():
    """All artifact files as {path relative to artifacts/: text}."""
    files = {
        "tables/mu_rho.json": _dump(
            {
                "description": "Mass attenuation μ/ρ (cm²/g) on lambda_pm; interpolate log–log, "
                "hold the end values outside (braggsim.filters.transmission)",
                "source": f"xraylib {xraylib.__version__} CS_Total_CP",
                "lambda_pm": _floats(MU_RHO_GRID_PM),
                "mu_rho_cm2_g": {m: _floats(mu_rho_table(m)) for m in (scan.AIR, scan.ABSORBER)},
            }
        ),
        "tables/mu_rho_absorbers.json": _dump(
            {
                "description": "Mass attenuation μ/ρ (cm²/g) of the absorbers on the grid "
                "of mu_rho.json; same interpolation (braggsim.filters.transmission)",
                "source": f"xraylib {xraylib.__version__} CS_Total_CP",
                "mu_rho_cm2_g": {m: _floats(mu_rho_table(m)) for m in ABSORBERS},
                "foils_mg_cm2": {
                    m: round(areal_density_mg_cm2(m, t), 6) for m, t in FOILS_MM.items()
                },
                "wheels_mg_cm2": {
                    w: [
                        None if slot is None else [slot[0], round(areal_density_mg_cm2(*slot), 6)]
                        for slot in slots
                    ]
                    for w, slots in WHEELS_MM.items()
                },
            }
        ),
        "tables/structure_factor.json": _dump(
            {
                "description": "|F_n|²/|F_1|² of NaCl (2n 0 0), n = 1 … MAX_ORDER, atoms at rest; "
                "r_n multiplies it by exp(−2B (s_n² − s_1²)) (scan.ModelParams.order_reflectivity)",
                "source": f"xraylib {xraylib.__version__} FF_Rayl",
                "f_sq_rel": list(structure_factor_sq_rel(scan.MAX_ORDER)),
            }
        ),
        "tables/crystals.json": _dump(
            {
                "description": "Crystal presets (braggsim.crystal.PRESETS). r_n = k f_sq_rel[n−1] "
                "exp(−2B(n²−1)s_1²), s_1 = 1/(2 d_pm): k = cell_scale (× exp(2 B_fit/(2 d_NaCl)²) "
                "if not fitted_debye_waller; B_fit = params.debye_waller_pm2, in pm², s in pm⁻¹), "
                "B = params.debye_waller_pm2 if fitted_debye_waller else 0 "
                "(scan.ModelParams.order_strengths). mu_factor is applied only for non-NaCl "
                "crystals, per order at λ_n = 2d sinθ/n on the θ grid before the Gaussian "
                "convolution, and per line component at its own λ. "
                "mu_per_cm = linear attenuation in 1/cm "
                "on lambda_pm of mu_rho.json (log–log interpolation, ends held); mu_factor = "
                "mu_per_cm[NaCl] / mu_per_cm[X] per λ. Non-NaCl crystals are also multiplied by "
                "extinction_ratio = y_X,n(λ)/y_NaCl,1(λ) at the same λ (crystal.extinction_ratio) "
                "and k uses exp(2 B_th/(2 d_NaCl)²) with B_th = 130 pm² (1.3 Å², NaCl thermal) "
                "instead of B_fit. extinction[n−1] = y of order n on the first len(row) nodes of "
                "lambda_pm of mu_rho.json (λ ≤ 2d sin85°/n plus one node; NaCl has order 1 only, "
                "the reference y); interpolate log y vs log λ, end values held",
                "source": f"xraylib {xraylib.__version__} CS_Total, FF_Rayl, AtomicWeight",
                "crystals": _crystal_tables(),
            }
        ),
        "tables/model_params.json": _dump(
            {
                "description": "scan.DEFAULT, fitted to leaflet Fig. 4 (model/PARAMETERS.md)",
                "params": dataclasses.asdict(scan.DEFAULT),
            }
        ),
    }
    for name, case in _fixtures().items():
        files[f"fixtures/{name}.json"] = _dump({"name": name, **case})
    # Own folder: the TS fixture test globs fixtures/*.json only (C2.1: move up then).
    for name, case in _crystal_fixtures().items():
        files[f"fixtures/crystals/{name}.json"] = _dump({"name": name, **case})
    return files


def main():
    files = build()
    for old in ARTIFACTS.rglob("*.json"):
        if old.relative_to(ARTIFACTS).as_posix() not in files:
            old.unlink()
    for rel, text in files.items():
        path = ARTIFACTS / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")  # LF on Windows too
    print(f"wrote {len(files)} files to {ARTIFACTS}")


if __name__ == "__main__":
    main()
