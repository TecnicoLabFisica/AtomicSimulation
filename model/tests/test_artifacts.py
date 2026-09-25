import json
import math
import runpy
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "export_artifacts.py"
EXPORT = runpy.run_path(str(SCRIPT))
ARTIFACTS = EXPORT["ARTIFACTS"]


def _close(a, b, rel=1e-12):
    """Same JSON structure and strings; floats within ``rel`` (exact zeros stay exact)."""
    if isinstance(a, dict):
        return isinstance(b, dict) and a.keys() == b.keys() and all(_close(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return isinstance(b, list) and len(a) == len(b) and all(map(_close, a, b))
    if isinstance(a, float) and isinstance(b, float):
        return math.isclose(a, b, rel_tol=rel, abs_tol=0)
    return a == b


def test_close_catches_real_changes():
    assert _close({"a": [1.0, {"b": 0.0}]}, {"a": [1.0 + 1e-15, {"b": 0.0}]})
    assert not _close({"a": [1.0]}, {"a": [1.0 + 1e-9]})
    assert not _close({"a": [0.0]}, {"a": [1e-300]})
    assert not _close({"a": "x"}, {"a": "y"})


def test_export_is_deterministic():
    assert EXPORT["build"]() == EXPORT["build"]()


def test_committed_artifacts_are_fresh():
    # Fails after any change to the model's outputs: re-run model/scripts/export_artifacts.py.
    # numpy's SIMD exp/log/sin differ by an ulp between CPUs, so floats are compared at 1e-12:
    # ≈ 1000× above that noise and 1000× below the port tolerance.
    built = EXPORT["build"]()
    on_disk = {p.relative_to(ARTIFACTS).as_posix(): p for p in ARTIFACTS.rglob("*.json")}
    assert sorted(on_disk) == sorted(built)
    stale = [
        rel
        for rel, text in built.items()
        if not _close(json.loads(on_disk[rel].read_text("utf-8")), json.loads(text))
    ]
    assert not stale, f"stale artifacts {stale}: run model/scripts/export_artifacts.py"
