---
name: run-app
description: How to launch and look at the Bragg simulation — the Jupyter notebooks of the Python model and the Vite dev server of the web app — in the atom-sim micromamba environment, including the viewport sizes to check. Use when asked to run, preview, screenshot or visually verify the project.
---

# Run the project

All commands use the `atom-sim` environment. Run long-lived servers in the background.

## Python model (Phases 1–5)
```bash
micromamba run -n atom-sim jupyter lab --no-browser model/notebooks   # notebooks
micromamba run -n atom-sim pytest model -q                             # tests
```
To check a notebook without opening it: `micromamba run -n atom-sim jupyter nbconvert --to notebook --execute --stdout <nb> > /dev/null`.

## Web app (Phase 6+; `web/` must exist)
```bash
micromamba run -n atom-sim npm --prefix web install        # first time / after package.json changes
micromamba run -n atom-sim npm --prefix web run dev        # Vite dev server → http://localhost:5173/<repo-name>/
micromamba run -n atom-sim npm --prefix web run build && micromamba run -n atom-sim npm --prefix web run preview
```
The base path comes from `vite.config.ts` (`base: '/<repo-name>/'`), so open the URL Vite prints.

## Visual check
Use the browser tooling (claude-in-chrome) to look at the app at these widths:
- **390 × 844** (phone), **820 × 1180** (tablet), and **1440 × 900** (desktop)
- in light and dark scheme, and once with reduced motion on.
Then hand the screenshots to the `design-reviewer` agent.

If `web/` or `model/` doesn't exist yet, say so. Don't scaffold it here, because scaffolding is Phase 0/6 work from the plan.
