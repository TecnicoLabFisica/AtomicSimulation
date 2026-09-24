---
paths:
  - "web/src/physics/**"
  - "web/tests/**"
---

# TypeScript physics port rules

- `web/src/physics/` is a **1:1 port** of `model/src/braggsim/`. Module per module, with the same
  names in camelCase (`theta_from_lambda` → `thetaFromLambda`), the same units, and the same argument
  order. Add a doc comment `// port of braggsim.crystal.theta_from_lambda`.
- **No new physics in TS.** If the port needs a behaviour Python lacks, add it to Python first
  (see the `add-physics-feature` skill).
- Lookup data (Zr transmission, GM efficiency, …) is loaded from `artifacts/tables/*.json` and
  never recomputed or hard-coded in TS.
- Keep the physics code free of the DOM and of UI code: pure functions only, importable from
  Vitest in Node.
- Vitest loads **every** file in `artifacts/fixtures/` and compares R̄(β) with relative tolerance
  1e-9 (absolute floor for values near 0). Any failure means the port is wrong or the artifacts
  are stale. Never loosen the tolerance to make a test pass.
- Noise (Poisson sampling) is tested **statistically**: mean and variance over many samples with
  a seeded PRNG. It is never compared sample-by-sample against Python.
- Performance matters (phones): precompute per-scan constants and avoid per-frame allocations,
  but not at the cost of diverging from the Python algorithm.
