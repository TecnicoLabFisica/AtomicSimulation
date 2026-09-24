---
name: add-physics-feature
description: Step-by-step workflow for adding or changing any physics in the Bragg simulation (source, crystal, filter, detector, instrument, scan, analysis) so the Python reference model, generated artifacts, and TypeScript port stay in lock-step. Use for every physics change, even small ones like a new constant or an edge case.
---

# Add or change a physics feature

Python first, then artifacts, then TS. Never skip a step or reorder them.

## 1. Pin down the physics
- Write the equation, the units, the valid domain, and the source. Take LD facts from `bragg-reference`
  and anything else from xraylib or the literature.
- Name the edge cases: nλ > 2d, U < U_K, λ < λ_min, I = 0, angle out of range.
- If the change adds an empirical parameter, decide what data it will be fitted to.

## 2. Python, test-first (`model/`)
Use `superpowers:test-driven-development`.
1. Write a failing test in `model/tests/test_<module>.py`. Assert a physical fact, such as a leaflet table value,
   a limit, a scaling law (linear in I), or a symmetry. Do not assert an arbitrary number the code happens to output.
2. Implement the smallest pure function that passes. Give it units in the name or docstring and a source citation.
3. `micromamba run -n atom-sim pytest model -q` → green. Then run `ruff check`.
4. For a new empirical parameter, add an entry to `model/PARAMETERS.md`.
5. If the change is visible in the spectrum, re-run the relevant notebook and look at linear *and* log plots.

## 3. Artifacts
1. If the TS side will need to test this behaviour, add or extend a golden case in
   `model/scripts/export_artifacts.py`. Cover the default leaflet settings plus the edge the feature touches.
2. Regenerate: `micromamba run -n atom-sim python model/scripts/export_artifacts.py`.
3. Run it a **second time** and check `git diff --stat artifacts/` shows nothing new. The output must be byte-identical.
4. Bump the model version string if the outputs changed on purpose.

## 4. TypeScript port (`web/src/physics/`)
1. Port the function 1:1 (the `web-physics-port` rule applies): same name in camelCase, same units, same algorithm.
2. `micromamba run -n atom-sim npm --prefix web test` → every fixture passes at a 1e-9 relative tolerance.
3. If it involves noise, write a statistical test (mean/variance) and do not compare samples.

## 5. Review
Ask the `physics-reviewer` agent to review the diff. If the change is user-visible, also ask `pedagogy-reviewer`
whether the explanations or tasks need updating.

## Done when
pytest is green, the artifacts are regenerated and stable, Vitest is green, the reviewer has no blocking findings, and
`PARAMETERS.md` is up to date.
