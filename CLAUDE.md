# Bragg reflection simulation (LD P6.3.3.1 · X-ray apparatus 554 800)

Browser-based, physics-driven, **educational** simulation of Bragg reflection of Mo Kα/Kβ X-rays at an
NaCl monocrystal, emulating the LD X-ray apparatus **554 800** with goniometer in 2:1 coupled mode.
Runs on almost any device (GitHub Pages). Private now, **will be published as open source**.

Full project plan, architecture and phase checklist: `Bragg-Simulation-Plan.md` (read it when starting a
phase; do not re-derive its decisions). Source documents live in `refs/` (gitignored, copyrighted) —
use the `bragg-reference` skill instead of reading the PDFs.

## Environment & commands

Everything runs in the micromamba env **`atom-sim`** (`environment.yml`). Prefix commands with
`micromamba run -n atom-sim` (or activate it). Commands marked † exist only once that phase is done.

```bash
micromamba create -f environment.yml                     # first time
micromamba run -n atom-sim pip install -e ./model
micromamba run -n atom-sim pytest model                  # Python tests
micromamba run -n atom-sim ruff check . && ruff format . # lint / format
micromamba run -n atom-sim python model/scripts/export_artifacts.py   # † regenerate artifacts/
micromamba run -n atom-sim npm --prefix web run dev|test|build        # † web app, Vitest, build
```

## Non-negotiable invariants

1. **Python owns the truth, TypeScript owns the experience.** `model/src/braggsim` is the reference;
   `web/src/physics` is a 1:1 port. New physics goes into Python first, never TS first.
2. **`artifacts/` is generated.** Never hand-edit; change the model and re-run `export_artifacts.py`.
   Output must be byte-identical across runs.
3. **Expectation ≠ noise.** Every scan function returns the deterministic expected rate R̄(β).
   Poisson sampling is one separate final step. Cross-language tests compare R̄ only (rel. tol 1e-9).
4. **Units:** pm, keV, degrees, s, kV, mA, counts/s. Put the unit in the name or docstring
   (`lambda_pm`, `theta_deg`). Radians only inside a function, never across an API.
5. **Emulate the 554 800** (the lab hardware), not the 554 811 described in the leaflet.
6. **Honest model.** Every empirical parameter is documented in `model/PARAMETERS.md` with value,
   what it was fitted to, and date. Never tune a parameter to hide a physical discrepancy.
7. **No UI work before Phase 3's spectrum matches leaflet Fig. 4** (linear *and* log).

## Style

- Code, comments, commit messages, and docs: **English**. UI strings: through the i18n dictionary,
  **Spanish (default) + English**. Never hard-code user-facing text in views.
- Visual design: elegant, simple, Apple-like, yet a real instrument. Always load the `bragg-ui`
  skill before touching `web/src/views`, `web/src/styles` or `web/src/pedagogy`.
- Open-source hygiene: see `.claude/rules/open-source.md` (always loaded).

## Project Claude config

Rules (`.claude/rules/`, path-scoped): `physics-model` (model/), `web-physics-port` (web/src/physics,
web/tests), `design-system` (views/styles/pedagogy), `open-source` (always).

Skills (`.claude/skills/`):
- `bragg-reference`: paraphrased facts from the leaflet and the 554 800 manual (values, keys, procedure).
- `add-physics-feature`: the Python → fixture → TS port → Vitest workflow for any physics change.
- `calibrate-model`: the Phase 3 fit against digitized Fig. 4.
- `bragg-ui`: the design system (tokens, motion, components). Use together with `frontend-design`.
- `write-guided-task`: template for Explore/Lab mode tasks (predict → act → observe → explain).
- `run-app`: start Jupyter / the dev server and look at the result.

Agents (`.claude/agents/`, read-only reviewers; call them after meaningful changes in their area):
`physics-reviewer`, `apparatus-reviewer`, `design-reviewer`, `pedagogy-reviewer`.

## Before going public (checklist)

- [x] LD PDFs (once committed under `start/`) purged from history on 2026-09-24. Before publishing,
      re-check: `git log --all --stat -- '*.pdf'` must print nothing.
- [x] LICENSE files: MIT (code) + CC BY 4.0 (educational content/docs); README cites LD sources.
- [ ] No absolute local paths, tokens or `settings.local.json` in history.
