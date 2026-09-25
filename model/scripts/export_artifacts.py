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
from braggsim import scan
from braggsim.constants import MO_K_EDGE_KEV
from braggsim.crystal import theta_from_lambda
from braggsim.filters import MU_RHO_GRID_PM, mu_rho_table, transmission
from braggsim.source import lambda_min_pm

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"
LEAFLET_BETAS = scan.coupled_betas(2.0, 25.0, 0.1)  # LD P6.3.3.1 measurement settings


def _floats(a):
    return [float(x) for x in np.asarray(a, dtype=float).ravel()]


def _dump(obj):
    obj = {"model_version": braggsim.__version__, **obj}
    return json.dumps(obj, sort_keys=True, indent=1, ensure_ascii=False, allow_nan=False) + "\n"


def _rate_case(description, beta_deg, U_kV, I_mA, params=scan.DEFAULT):
    beta = np.asarray(beta_deg, dtype=float)
    return {
        "function": "scan.expected_rate",
        "description": description,
        "inputs": {
            "beta_deg": _floats(beta),
            "U_kV": U_kV,
            "I_mA": I_mA,
            "params": dataclasses.asdict(params),
        },
        "expected": {"rate_per_s": _floats(scan.expected_rate(beta, U_kV, I_mA, params))},
    }


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
        ],
    }  # fmt: skip


def _fixtures():
    duane_hunt_deg = float(theta_from_lambda(lambda_min_pm(35.0)))
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
        "transmission": _transmission_case(),
        "tube_off_I0": _rate_case("Emission current 0: exactly zero", LEAFLET_BETAS, 35.0, 0.0),
        "tube_off_U0": _rate_case("Tube voltage 0: exactly zero", LEAFLET_BETAS, 0.0, 1.0),
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
        "tables/model_params.json": _dump(
            {
                "description": "scan.DEFAULT, fitted to leaflet Fig. 4 (model/PARAMETERS.md)",
                "params": dataclasses.asdict(scan.DEFAULT),
            }
        ),
    }
    for name, case in _fixtures().items():
        files[f"fixtures/{name}.json"] = _dump({"name": name, **case})
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
