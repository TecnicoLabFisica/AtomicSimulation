---
title: New Features — Lab Practices, Crystal Library, Materials Forge
aliases:
  - New features plan
  - Plan nuevas funciones
tags:
  - project/bragg-sim
  - physics/x-ray
  - plan
status: planning
created: 2026-10-14
updated: 2026-10-20
current_phase: L1
next_task: L1.8
last_session: 2026-10-20
parent: "[[Bragg-Simulation-Plan]]"
sources:
  - "EPN guide Práctica 1: X-ray attenuation vs absorber material and thickness (refs/atenuacion_RX.pdf)"
  - "EPN guide Práctica 5: Moseley's law and the Rydberg constant (refs/moseley_RX.pdf)"
  - "EPN guide Práctica 6: brass composition by X-ray fluorescence (refs/fluorescencia_RX.pdf, pp. 1–3)"
---

# New Features: Lab Practices, Crystal Library, Materials Forge

> [!abstract] Goal
> Grow the simulation from a single experiment (P6.3.3.1, Bragg at NaCl) into a small **X-ray lab** on the same
> emulated 554 800:
> 1. **Three new lab practices** from the EPN guides: attenuation (P1), Moseley's law (P5) and XRF of brass (P6).
> 2. A **crystal library**: pick NaCl, LiF, Si, calcite or mica (the crystals the lab uses) as the target.
> 3. A **Materials Forge**: design a lattice (cell, basis, cut plane) and get the spectrum it would produce.

**Contents:** [[#If you were sent here]] · [[#Status board]] · [[#How to work across sessions]] · [[#Ground rules]] ·
[[#Roadmap]] · [[#Part 0 — Groundwork]] · [[#Part I — Lab practices]] · [[#Part II — Crystal library]] ·
[[#Part III — Materials Forge]] · [[#Open questions]] · [[#Calibration anchors]] · [[#Risks]] · [[#Session log]]

---

## If you were sent here

> [!important] Claude: read this first when the user says "continue with Plan-New-Features" or "check what's done"
> This note is the **single source of truth** for this work. Don't rely on chat history.
> 1. **Where are we?** Check the frontmatter (`current_phase`, `next_task`), the [[#Status board]] and the newest entry in [[#Session log]].
> 2. **Check the claims against the repo** before building on them (ticks can drift):
>    - `git log --oneline --grep='\[<phase>\]'` lists the commits for a phase (every commit carries its phase ID, e.g. `[L1]`).
>    - Run the phase's **Verify** commands. If a ticked task fails them, untick it and note that in the log.
>    - `git status` shows uncommitted work from an interrupted session. The log's last entry says what it was.
> 3. **Continue** with `next_task`. If the user asked only to *check*, report: done ✅ / partial 🟨 / broken ❌ per task, and stop.
> 4. **Before you stop**, run the [[#How to work across sessions|end-of-session protocol]]. A session that leaves this note stale has not finished.

Task IDs are `<phase>.<n>` (e.g. `L1.3`). Commits, log entries and `/remember` notes all use them.

---

## Status board

> [!todo] Resume here
> **Next:** `L1.8`, the `pedagogy-reviewer` over L1.6 + L1.7; then close L1 (its "Done when" was accepted 2026-10-20).
> (Mirror of the frontmatter `next_task`. Update both at the end of every session.)

| Phase | Title | Status | Sessions | Depends on |
|---|---|---|---|---|
| G0 | Reference facts and scope | ✅ done | 1 | — |
| G1 | Accessories and shared physics | ✅ done | 3 | G0 |
| L1 | Práctica 5: Moseley's law | 🟨 S2 in progress (L1.8 next) | 2 | G1 |
| L2 | Práctica 1: attenuation | ⬜ todo | 2–3 | G1 |
| L3 | Práctica 6: X-ray fluorescence | ⬜ todo | 5–6 | G1 |
| C1 | Crystal engine and presets (Python) | ⬜ todo | 2 | G0 |
| C2 | Crystal selector (port and UI) | ⬜ todo | 2 | C1 |
| F1 | Forge engine (any element) | ⬜ todo | 2 | C1 |
| F2 | Forge UI | ⬜ todo | 2–3 | F1, C2 |
| F3 | Forge pedagogy | ⬜ todo | 1 | F2 |

Legend: ⬜ todo · 🟨 in progress · ✅ done · ⏸ blocked (say on what in the [[#Session log]]).

---

## How to work across sessions

> [!info] Session protocol (long tasks survive `/clear` and new sessions)
> **Start:** read [[#Status board]] → read the phase you resume (tasks, **Files**, **Verify**) and the newest [[#Session log]] entry → `.remember/now.md` is
> injected automatically → `graphify query "<topic>"` before reading code.
> **During:** one session = one **S#** block. Tick boxes as tasks finish, not at the end.
> **End:**
> 1. Tick the finished task IDs. Add an entry to [[#Session log]] using the template there.
> 2. Update the frontmatter (`current_phase`, `next_task`, `last_session`, `updated`) and the status table.
> 3. Run the phase's **Verify** commands and `graphify update .`. Record the result in the log entry.
> 4. Run `/remember` so the next session starts with the state.
> 5. Commit only when the user asks. Commit messages start with the phase ID: `[L1] feat: …`.

> [!tip] Who does what (from `CLAUDE.md`)
> Opus plans, reviews and orchestrates. Each **S#** block is briefed to a `sonnet` subagent with the goal, files,
> invariants and tests. After every physics change, run `physics-reviewer`. After apparatus changes run
> `apparatus-reviewer`, after UI changes `design-reviewer`, after tasks or copy `pedagogy-reviewer`.
> Skills: `add-physics-feature` (every physics change), `write-guided-task`, `bragg-ui` + `frontend-design`, `run-app`.

---

## Ground rules

These are the project invariants applied to the new work. Don't re-decide them per phase.

- **Python first.** Every new formula lands in `model/src/braggsim`, then fixtures, then the TS port (rel. tol 1e-9).
- **Expectation ≠ noise.** New detectors (GM direct beam, MCA channels) return expected rates. Poisson is a final step.
- **NaCl stays the calibrated anchor.** Existing fixtures for NaCl must stay unchanged (or change only by an explained
  model-version bump), and Fig. 4 must still match, linear *and* log.
- **Honest model.** Every new empirical number (foil thicknesses, detector resolution, background, direct-beam scale,
  Debye–Waller B per crystal) goes in `model/PARAMETERS.md` with value, source and date. If there is no data,
  say "assumption" and name who can measure it (lab staff).
- **Emulate the 554 800 and its accessories.** We do not emulate CASSY Lab or the PC software. We emulate a
  *minimal* MCA, only as far as the guide's procedure needs it.
- **Licensing.** The EPN guides stay in `refs/` (gitignored). In committed files we paraphrase and keep only numbers.
  We copy no figures (Fig. 1.1, 5.1 and 6.1 are LD drawings).
- **Phone budget.** Tables that only one feature needs (XRF kernels, Forge element tables) are lazy-loaded chunks.

---

## Roadmap

```mermaid
flowchart TD
    G0["G0 · Reference facts and scope"] --> G1["G1 · Accessories and shared physics"]
    G1 --> L1["L1 · Moseley (P5)"]
    G1 --> L2["L2 · Attenuation (P1)"]
    G1 --> L3["L3 · XRF of brass (P6)"]
    G0 --> C1["C1 · Crystal engine and presets"]
    C1 --> C2["C2 · Crystal selector"]
    C1 --> F1["F1 · Forge engine"]
    F1 --> F2["F2 · Forge UI"]
    C2 --> F2
    F2 --> F3["F3 · Forge pedagogy"]
    L1 -.uses.-> C2
```

> [!note] Recommended order
> G0 → G1 → L1 → L2 → C1 → C2 → F1 → F2 → F3 → L3.
> L1 and L2 reuse most of what exists, so they come first. **L3 (XRF)** is the biggest and fully independent
> (new detector, new physics), so it can move anywhere after G1 without blocking anything.

---

## Part 0 — Groundwork

### G0 — Reference facts and scope

**Why:** future sessions must not reread the PDFs. Store the facts once, paraphrased, where the skills can find them.

#### S1
- [x] **G0.1** Add `references/practicas.md` to the `bragg-reference` skill: for each practice, paraphrase the settings and
      steps. Numbers only, no verbatim text. Facts to capture:
  - **P1 attenuation:** collimator and GM counter; s₁ = s₂ = 5 cm.
    - Al absorbers 0.5 → 3.0 mm in 0.5 mm steps on the absorption accessory (554 834), selected by turning the target arm to ≈ 0°, 10° … 60°.
    - Δβ = 0 (exposure-timer mode); 21 kV, 0.05 mA (0.15 mA and 200 s with the Zr filter).
    - Material set polystyrene (the guide calls it C), Al, Fe, Cu, Zr, Ag, **0.4 mm** each (user decision 2026-10-14; the LD catalog says 0.5 mm), at 30 kV: 0.02 mA for the first three, 1 mA for the rest.
    - Background run at 0 kV / 0 mA for ≥ 100 s. Calibration hint: ≥ 950 /s unattenuated.
    - Analysis: T vs d, ln T vs d → μ, T and μ per material, μ vs Z.
  - **P5 Moseley:** NaCl, COUPLED, Δβ = 0.1°, β 3.7° → 7.5°, 35 kV, 1 mA, Δt = 5 s; Zr, Mo, Ag, In foils at the
    sensor, one scan per foil. Analysis: transmission spectra, K-edge λ vs Z, Rydberg constant and screening.
  - **P6 XRF:** X-ray energy detector on the sensor arm at 90°, target at 45°, s₁ = s₂ = 6 cm, 35 kV, 1 mA, MCA with 512
    channels and 180 s. Two-point energy calibration with Cu Kα (8.04 keV) and Pb Lα (10.55 keV).
    Samples: Cu, Zn, Pb, leaded brass, a coin. Analysis: identify the lines, Gaussian fits or deconvolution, mass fractions.
- [x] **G0.2** Add these lines to `CLAUDE.md` (scope paragraph): the project now covers the X-ray apparatus lab suite,
      and the new plan is this note.
- [x] **G0.3** Ask the lab staff the [[#Open questions]] and record the answers here.
- [x] **G0.4** Credit the EPN guides in the README to "Técnicos de Laboratorio del Departamento de Física de la EPN" (user, 2026-10-14).
- [x] **G0.5** Rename the app to **X-Ray Lab** (user, 2026-10-14): README title and intro, `web/index.html` `<title>`,
      `web/package.json` name (then `npm install` to refresh the lock), `CLAUDE.md` heading, app name in the i18n dictionaries if shown.
      The repo stays `TecnicoLabFisica/AtomicSimulation` (renaming it would break the Pages URL). The 554 800 suffix stays,
      e.g. `X-Ray Lab · 554 800`. Load `bragg-ui` if the change reaches a view.

**Done when:** a fresh session can brief any phase below without opening `refs/`.

**Files:** `.claude/skills/bragg-reference/references/practicas.md`, `CLAUDE.md`, `README.md`, `web/index.html`, `web/package.json`, this note

**Verify:** the file exists and holds no verbatim sentence from the guides; brief G1 in a fresh session without opening `refs/`;
after G0.5 `git grep -n 'Bragg reflection simulation\|bragg-sim-web'` finds only history docs (and this line), and `npm --prefix web run build` passes

### G1 — Accessories and shared physics

**Why:** all three practices change *what sits in the beam*, not the crystal physics. Build that once.

```mermaid
flowchart LR
    T["Mo tube"] --> COL["Collimator<br/>+ filter slot"] --> TH["Target holder:<br/>crystal · absorber wheel · XRF sample"] --> SA["Sensor arm:<br/>+ filter slot"] --> D["Detector:<br/>GM counter · energy detector"]
```

#### S1 — Python
- [x] **G1.1** `filters.py`: add the elements C, Al, Fe, Cu, Zr, Mo, Ag, In to `mu_rho.json` (still the same 1000-point λ grid).
      Note in `PARAMETERS.md` how far the grid smears each K edge (as already planned for Zr in Phase 11).
- [x] **G1.2** `scan.expected_rate(..., filters=())`: a tuple of `(material, areal_density_mg_cm2)` multiplying T(λ) before
      the detector. Placement (collimator or sensor) doesn't change T, so it's one argument. Default `()` keeps every
      existing fixture identical.
- [x] **G1.3** `scan.direct_rate(U_kV, I_mA, absorbers=(), filters=(), params)`: no crystal, sensor at 0°. It equals
      K_direct · ∫ S_U(λ) T_air T_abs(λ) dλ, then dead time. K_direct is a new empirical parameter. There is no EPN data
      (user, 2026-10-14), so the anchor is the guide's ≥ 950 /s at 21 kV / 0.05 mA (see [[#Calibration anchors]]).
- [x] **G1.4** `ModelParams.background_per_s` (natural GM background; value in [[#Calibration anchors]]). The `tube_off_*`
      fixtures then equal the background, not 0.
      Bump the model version and explain it in `PARAMETERS.md`.
- [x] **G1.5** Fixtures: one filter case, two direct-beam cases (with and without absorber), background.

> [!note] As built (2026-10-14), refining G1.1–G1.4
> - The absorbers live in their own lazy table `artifacts/tables/mu_rho_absorbers.json` (78 kB gzip; `tables.loadAbsorbers()` in TS).
>   `filters.ABSORBERS` = Polystyrene (the "C" absorber), Al, Fe, Cu, Zr, Mo, Ag, In; `check_filters` refuses any other material.
> - One argument for both: `direct_rate(U_kV, I_mA, filters=(), params)`. Wheel absorbers and foils are all `(material, mg/cm²)` filters.
> - Filters scale leak and scatter through the filtered `tube_factor` (an assumption for scatter).
> - Background 0.2/s is added before dead time. Scatter was re-split 5.54 → 5.34, so 35 kV / 1 mA is unchanged (1e-16).
> - `direct_per_s` = 2.97e5. It is valid only while Rτ ≲ 0.3; above that a real GM paralyses, so G1.7/L2 should warn.

#### S2 — Port and apparatus
- [x] **G1.6** TS port of the above. Vitest passes with every fixture.
- [x] **G1.7** `apparatus.ts`: a `setup` state: `holder` (crystal | absorberWheel | xrfSample | empty), `collimatorFilter`,
      `sensorFilter`, `detector` (gm | energy). Changing the setup requires the door to be open (interlock).
      With the absorber wheel, the target angle selects the absorber position (10° pitch; between positions the beam
      is partly blocked, as an assumption to confirm).
- [x] **G1.8** `apparatus-reviewer` pass.

> [!note] As built (2026-10-14), refining G1.7–G1.8
> - `holder` is `crystal | alWheel | materialWheel | empty` (554 834 has two plates). `xrfSample` and `detector: energy` are **deferred to L3**,
>   where their physics lands. `mount(setup)` works only with the doors open (which already implies HV off and idle); RESET keeps the setup.
>   The setup is frozen and read-only from outside.
> - Thicknesses are data in Python: `filters.FOILS_MM`, `filters.WHEELS_MM`, `areal_density_mg_cm2`, exported to `mu_rho_absorbers.json`
>   (`foils_mg_cm2`, `wheels_mg_cm2`) and read in TS as `FOILS_MG_CM2`/`WHEELS_MG_CM2` after `loadAbsorbers()`. This was the data half of L1.1 and L2.1.
> - No crystal: `direct_rate(..., sensor_deg)` gives the direct beam a Gaussian profile with the leak width (an assumption). A wheel slot is in the beam
>   within ±3° (`WHEEL_WINDOW_DEG`); between slots the frame blocks it (binary, an assumption to confirm with the lab).
> - The exposure timer runs with HV on even at 0 kV / 0 mA (P1 run 3, background); auto-scan steps still wait for emission. The counter reads
>   the GM background with HV off too.
> - `Apparatus.saturated`: Rτ > 0.3 (a simulation aid). The guide's own polystyrene reading in run 2a trips it (Rτ ≈ 0.32), which is kept as a teaching point.

#### S3 — Setup UI
- [x] **G1.9** A "Montaje / Setup" tray (bench card + 2D fallback) to place accessories. i18n ES/EN. Load `bragg-ui` first.
      As built: a native `<details>` section in the chamber card (`views/setup.ts`, reached by a 3D tap or the dock), holder +
      collimator/sensor filter selects, disabled while the door is closed; `loadAbsorbers()` runs on first open. A `saturated`
      line (a simulation aid) shows in the chamber and panel cards.
- [x] **G1.10** The 3D bench shows the wheel, foils and detector type (simple shapes; no LD drawings). The 2D goniometer
      (`views/goniometer.ts`) must stop drawing the crystal when the holder is a wheel or empty.
      As built: both views switch on `setup.holder` (crystal / 7-slot arc plate, slot k on the beam at β = 10k° / nothing) and draw
      foil bars at the collimator and the counter. Without the crystal the out-beam is the direct beam at 0°, from the new
      `Apparatus.transmittedRate()` (0 when the plate frame blocks). The detector type is deferred to L3 (only the GM exists).
- [x] **G1.11** `design-reviewer` pass. Applied: a shared `PLATE_R_CM = 2.5` (2D and 3D; an assumption) with a solid frame and tiles
      whose opacity follows mg/cm²; no θ/2θ arcs without a crystal; the beam ends at the plate; element captions on the foils; locked selects
      shown as plain readable values; the saturation hint moved below the sliders; a thin themed scrollbar; the grab handle at the plate (none when empty).
      Deferred: iOS zoom on focused `<select>` < 16 px (here and in `.scale select`; unverified on a device, needs a 16 px token), and the 3D plate,
      which stays edge-on from the default camera (a presence cue; the 2D card is where the slot is read).

**Done when:** pytest, artifact freshness, Vitest and the build are green. A Bragg scan with a Zr foil visibly
suppresses Kβ, and sensor at 0° with the wheel gives plausible direct-beam rates.

**Files:** `model/src/braggsim/{filters,scan}.py`, `model/PARAMETERS.md`, `artifacts/`, `web/src/physics/{filters,scan}.ts`, `web/src/apparatus/apparatus.ts`, `web/src/views/bench.ts` + a setup view, `web/src/pedagogy/i18n/`

**Verify:** [[#Verify|standard]] + `pytest model -k "filter or direct or background"`; `git diff --stat artifacts/fixtures` touches only the new fixtures, `tube_off_*` and the sub-35 kV fixtures (by ≈ 0.2·(1 − S(U))/s, the background); 35 kV / 1 mA unchanged to 1e-12; in the app a Zr foil suppresses Kβ

---

## Part I — Lab practices

### L1 — Práctica 5: Moseley's law and the Rydberg constant

**Physics:** each foil's K edge appears as a step in T(λ) = R_foil/R_open. For an absorption edge,
$1/\lambda_K = R_\infty (Z-\sigma)^2$, so $\sqrt{1/\lambda_K}$ vs Z is a line whose slope gives $R_\infty$ and whose intercept gives σ.

| Foil | Z | Thickness (mm) | K edge (keV) | λ_K (pm) | θ in NaCl, n = 1 |
|---|---|---|---|---|---|
| Zr | 40 | 0.05 | 17.998 | 68.89 | 7.02° |
| Mo | 42 | 0.1 | 20.000 | 62.00 | 6.31° |
| Ag | 47 | 0.05 | 25.514 | 48.59 | 4.94° |
| In | 49 | 0.3 | 27.940 | 44.37 | 4.51° |

Thicknesses: LD set of absorber foils 554 832 (answered 2026-10-14). LD's own version of this experiment scans 3° → 8°;
the EPN guide uses 3.7° → 7.5°. Both windows contain every edge.

%% values to verify with xraylib EdgeEnergy in S1; all edges fall inside the 3.7°–7.5° window %%

#### S1 — Python
- [x] **L1.1** Foil areal densities in `PARAMETERS.md` from the 554 832 thicknesses above × bulk density (cite the LD catalog).
- [x] **L1.2** `analysis.k_edge_deg(betas, R_open, R_foil)`: edge position from the steepest descent of T, with uncertainty.
      Test: the noise-free edge sits at θ(λ_K) within ≈ 0.03° (the grid smears it by ≤ 0.009°, physics review 2026-10-14).
      As built: T *rises* with β at the edge. A coarse split search, then a fit of the Gaussian-convolved step with its own plateau slope.
      The noise-free edge is low by 0.006–0.045°, not ≤ 0.03°: the instrument resolution plus the steep open spectrum beside the Mo lines,
      decomposed in `PARAMETERS.md` § Moseley analysis. The test bounds it at 0.06°. Δβ ≤ `MAX_EDGE_STEP_DEG` = 0.15°.
      Known deviation for `PARAMETERS.md`: foil K fluorescence (≈ 1–2 % of the absorbed flux) makes the foil look more transparent
      just above the edge (Zr ≈ 0.065 instead of 0.046). The edge position is unchanged, the depth is not. Near Mo, Kβ sits 0.11° above the edge.
- [x] **L1.3** `analysis.moseley_fit(Z, lambda_K_pm)` → R∞ and σ with errors.
- [x] **L1.4** Notebook `05_moseley.ipynb`: four foil scans with noise → edges → fit. Compare with (a) a fit of the tabulated
      xraylib edges and (b) LD's published example (R = 1.056 × 10⁷ m⁻¹, σ_K = 2.7; literature R∞ = 1.0974 × 10⁷ m⁻¹, σ_K ≈ 3.6).
- [x] **L1.5** Teacher key section in `docs/teacher-key.md` (`teacher_key.py`, seeded).

#### S2 — Web
- [x] **L1.6** Lab task `moseley-k-edges` (`write-guided-task`). Predict where the Ag edge falls relative to Zr, then scan
      open + 4 foils, export CSV. The success check is on the scans (window, Δβ, foils used), never on the student's R∞.
      As built: the app remembers every exported scan with the setup it was made with (`csv.exportedScans`; `lastScan.setup`),
      since the apparatus keeps only the last one. Met by one (U, I) group holding an open scan and all four foils, each COUPLED,
      steady, Δβ ≤ `MAX_EDGE_STEP_DEG`, covering 3.7–7.5° by its stored angles, with each edge passing the coarse test of
      `k_edge_deg` on the expected rates (≥ 5σ). New `constants.K_EDGE_KEV` (xraylib, Py → TS). A progress line in the card
      (`GuidedTask.progress`). CSV header and file name name the foil.
- [x] **L1.7** Explore overlay: edge markers per foil (hidden until the act step, as in Phase 9).
      As built: `spectrum.ts` `edgeMarkers(setup)` marks the K edge (n = 1) of each `K_EDGE_KEV` foil in the *stored* scan's
      setup: a `--label-2` hairline (the foil colour) with a long dash, labelled "Zr K" from the third row down, one row per foil.
      Gated by `showHints()` like the other overlays (none in Lab mode or TARGET scans; 2θ for SENSOR). The plot cursor is now
      a solid hairline so it can't pass for an edge. Mo K sits 0.11° from Kβ, so its label touches the Kβ line at 390 px (physical).
- [ ] **L1.8** `pedagogy-reviewer`.

**Done when:** a student can do the whole practice on a phone, and the key's R and σ_K agree with the fit of the tabulated edges
within the model's counting error plus its documented instrument bias (R −2.3 %, σ_K −0.57, 2026-10-20; `PARAMETERS.md`). Revised
2026-10-20 (accepted by the user the same day): the original "within the model's error" cannot hold, because the resolution bias is ≈ 2–3σ of one P5 measurement. Real K edges don't follow the simple Moseley formula exactly, so R comes out a few % below R∞,
as in LD's example. That shortfall is physics, and the teacher key should say so.

**Files:** `model/src/braggsim/analysis.py`, `model/notebooks/05_moseley.ipynb`, `model/scripts/teacher_key.py`, `docs/teacher-key.md`, `web/src/pedagogy/tasks/moseley-k-edges.ts`

**Verify:** [[#Verify|standard]] + `pytest model -k moseley`; run `05_moseley.ipynb` (R, σ_K vs the tabulated-edge fit); finish the task at 390 px (`run-app`)

### L2 — Práctica 1: attenuation vs thickness and material

**Physics:** Lambert's law $T = e^{-\mu d}$ holds for monochromatic X-rays. The tube beam is polychromatic, so at 21 kV
(mostly continuum, lines barely above U_K) ln T vs d **curves** (beam hardening). With the Zr filter the beam is
nearly Mo Kα and the line straightens. This is the main teaching point, and the model gives it for free by integrating over λ.
Dead time at ~1000 /s also bends the data a little, which is real and worth a note.

#### S1 — Python
- [ ] **L2.1** Absorber sets as data: the Al wheel (0, 0.5 … 3.0 mm) and the material wheel (polystyrene, Al, Fe, Cu, Zr, Ag,
      0.4 mm each). At 0.4 mm the Fe … Ag absorbers transmit far below 1 %, so background and dead time dominate their
      readings. That is real (it's why the guide raises I to 1 mA for them) and a teaching point, so don't hide it.
- [ ] **L2.2** Set `K_direct` and `background_per_s` from [[#Calibration anchors]] (no EPN data exists; mark both as anchored to
      published or guide values, not fitted to measurements).
- [ ] **L2.3** `analysis.attenuation_fit(d_mm, R, R0, background)` → μ with error. Notebook `06_attenuation.ipynb`: T vs d,
      ln T vs d with and without Zr, μ vs Z (log-log), compared with xraylib μ at Mo Kα.
- [ ] **L2.4** Check whether constant GM efficiency ε biases μ_eff. `physics-reviewer` decides whether ε(λ) is needed now.
      Preliminary (2026-10-14): not needed. ε(λ) is folded into the fitted Pyrex over 40–120 pm; the residual bias is ≈ 1.5–2 %.
      Add a test that μ_eff falls with d at 21 kV without a filter (6.91 → 5.38 cm²/g, 0.5 → 3 mm).

#### S2 — Web
- [ ] **L2.5** Exposure-timer workflow with the wheel: TARGET mode, ADJUST to each position, Δβ = 0, SCAN, REPLAY.
      Check that the existing 554 800 behaviour covers it, then fill the gaps.
- [ ] **L2.6** Tasks: `attenuation-thickness` (predict whether ln T vs d is straight), `attenuation-material` (μ vs Z), `background`.
- [ ] **L2.7** CSV export of exposure-mode results (one row per position).

**Done when:** ln T vs d is visibly curved without the Zr filter (beam hardening: μ_eff falls with d) and much straighter with it; the key's
μ(Al) with Zr is compared with the tabulated μ at Mo Kα (5.11 cm²/g) and the gap is explained, not hidden. The physics reviewer (2026-10-14) found
μ_eff/ρ with 0.05 mm Zr = 6.97 → 5.91 at 21 kV (lines ≈ 93× weaker than at 35 kV, so the passband is the soft 69–90 pm continuum) and
4.21 → 2.92 at 35 kV (hard continuum above the Zr edge leaks through). Which U gets closest is a teaching point. Verify the thickness of the
run-1b collimator Zr filter (0.05 mm is the 554 832 foil value). Keep the Pyrex ±20 % sensitivity (μ_eff ∓5–7 %) in notebook 06.

**Files:** `model/src/braggsim/{scan,analysis}.py`, `model/notebooks/06_attenuation.ipynb`, `web/src/pedagogy/tasks/attenuation-*.ts`, `web/src/pedagogy/csv.ts`

**Verify:** [[#Verify|standard]] + `pytest model -k attenuation`; run `06_attenuation.ipynb` (ln T vs d curved without Zr, straight with it)

### L3 — Práctica 6: brass composition by X-ray fluorescence

**Why it's big:** a new detector (energy-resolving), a new readout (MCA spectrum vs channel), and new physics
(fluorescence of the sample).

**Physics model (fundamental parameters, primary fluorescence):**
$$
I_{i,\text{line}} \propto w_i \int S_U(E)\,\frac{\tau_i(E)\,\omega_i\,p_\text{line}\,(1-1/J_i)}{\mu_s(E)/\sin\psi_1 + \mu_s(E_\text{line})/\sin\psi_2}\,dE
$$
with ψ₁ = ψ₂ = 45° (target at 45°, detector at 90°).
- Mass fractions w_i. Photo cross-section, yield and line fractions come from xraylib.
- Self-absorption in the bulk sample. Air between sample and detector.
- Detector: LD **559 938** Si-PIN (see [[#Open questions|answers]]): 150 µm Si, 0.8 mm dia., plastic window ≈ 40 µm
  graphite. Gaussian resolution $\text{FWHM}(E) = 2\sqrt{2\ln 2}\,\sqrt{\sigma_\text{el}^2 + F\varepsilon E}$ with
  σ_el ≈ 160 eV, F ≈ 0.15, ε = 3.8 eV (0.40 keV at 6.4 keV). **Dead time ≈ 250 µs per pulse**, so live time matters at 1 mA.
  The housing can fluoresce (Au L lines most often): an optional small term.
- Samples: pure Cu, Zn, Pb; leaded brass **CuZn39Pb3** (58 Cu / 39 Zn / 3 Pb, LD target-alloy set 554 848); optional CuZn36
  (64/36). Coin: the **Ecuador 1 centavo 2003** (user, 2026-10-14), a *layered* sample: Cu plating on a steel core.
  No mint publishes the plating; the estimate is ≈ 18 µm Cu (see [[#Calibration anchors]]). That is comparable to the
  attenuation length of Cu Kα in Cu (≈ 21 µm), so the core's Fe Kα comes through weakened, and how much depends on the plating.
- Rayleigh and Compton scatter of the Mo lines (Compton at 90° ≈ 16.9 keV).

Lines in play: Cu Kα 8.04 / Kβ 8.90, Zn Kα 8.63 / Kβ 9.57, Pb Lα 10.55 / Lβ 12.61 keV (Fe Kα 6.40 / Kβ 7.06 for the coin's core). At 0.4 keV
FWHM, Cu Kα and Zn Kα are only 0.59 keV apart and Cu Kβ sits on Zn Kα, which is why the guide asks for Gaussian fits or a deconvolution.

**Port strategy:** compute in Python an **excitation kernel** $K_{s,\text{line}}(E)$ per sample and per line (plus the
scatter kernels) on the source energy grid. Export it as a lazy table. TS multiplies by the already-ported
S_U(E) and sums, so U and I stay live and the browser needs no xraylib.

#### S1 — Python: sample physics
- [ ] **L3.1** `fluorescence.py`: kernels for the pure Cu, Zn and Pb samples, CuZn39Pb3, CuZn36 and the 2003 centavo
      (compositions in `PARAMETERS.md` with sources). The coin needs a two-layer sample: the plating attenuates the
      excitation and the core's lines, and it adds its own lines. **Include secondary fluorescence** in the bulk alloys:
      lines above the Cu K edge (8.98 keV: Zn Kβ, Pb L) excite Cu, and Pb L lines above 9.66 keV excite Zn. LD's own
      brass example shows the result: Cu is overestimated (61.6 % found vs 58 %), see [[#Calibration anchors]].
- [ ] **L3.2** Tests: line ratios vs xraylib, zero below the edge, linear in I.

#### S2 — Python: detector and MCA
- [ ] **L3.3** `detector.py`: 559 938 efficiency (window + 150 µm Si) and FWHM(E) from its instruction sheet, dead time (250 µs, live-time correction),
      channel mapping from the gain (512 channels), expected counts per channel. Escape peaks are optional: skip them unless visible.
- [ ] **L3.4** `analysis.gauss_fit_lines` and `analysis.composition(...)` with the pure-element standards
      ($w_i \approx A_i^\text{alloy}/A_i^\text{pure}$, first order). The notebook `07_xrf_brass.ipynb` shows the matrix-effect bias of this method.

#### S3 — Export and port
- [ ] **L3.5** `artifacts/tables/xrf_kernels.json` (lazy) and fixtures for 3 samples × 2 voltages. TS port and Vitest.

#### S4 — MCA view
- [ ] **L3.6** New view `web/src/views/mca.ts`: counts vs channel, live accumulation, settings (channels, gain, time),
      two-point energy calibration that switches the axis to keV, log toggle. Lab mode shows channels until the student calibrates.
      Load `bragg-ui` and use uPlot (already installed).
- [ ] **L3.7** Apparatus: with `detector = energy`, the 554 800 rate display is idle and the MCA counts. The sensor arm must be set
      to 90° *before* mounting (the guide's warning), so refuse the mount otherwise.

#### S5 — Tasks
- [ ] **L3.8** `xrf-calibration` (Cu, Pb → calibrate), `xrf-brass` (identify the lines, fit, composition; the check is on the
      data taken, never on the student's %), `xrf-coin`.
- [ ] **L3.9** Reviews: physics, apparatus, design, pedagogy.

**Done when:** the brass key composition, using the same first-order method as the students, shows the same bias as LD's
published example (Cu high, Zn low, Pb about right), and the
Cu/Zn/Pb spectra look like typical Si-PIN XRF spectra (line positions exact, Cu Kβ/Zn Kα blend visible).

**Files:** `model/src/braggsim/{fluorescence,detector,analysis}.py`, `model/notebooks/07_xrf_brass.ipynb`, `artifacts/tables/xrf_kernels.json`, `web/src/physics/fluorescence.ts`, `web/src/views/mca.ts`, `web/src/pedagogy/tasks/xrf-*.ts`

**Verify:** [[#Verify|standard]] + `pytest model -k "fluorescence or xrf"`; run `07_xrf_brass.ipynb`; `npm run build` shows the XRF kernels in a lazy chunk, main bundle unchanged

---

## Part II — Crystal library

### C1 — Crystal engine and presets (Python)

**Why:** today `crystal.py` hard-codes NaCl: `D_NACL_PM`, F = 4(f_Na + f_Cl), and the B fitted for NaCl. Generalize
it to *data* (cell, basis, cut plane) so the presets and the Forge share one engine.

**Model:**
- `Crystal` dataclass: `name`, cell `a_pm, b_pm, c_pm, alpha_deg, beta_deg, gamma_deg`, basis
  `[(Z, x, y, z, B_A2)]` (the B in Å² stays inside the function), cut plane `(h, k, l)`, `source` citation.
- $d_{hkl}$ from the reciprocal metric tensor (any crystal system; cubic is just a = b = c, 90°).
- $F(nh, nk, nl) = \sum_j f_j(q)\, e^{-B_j q^2}\, e^{2\pi i n(hx_j+ky_j+lz_j)}$, with $q = n/(2d)$.
- Order reflectivity across crystals: NaCl keeps its fitted scale. Other crystals scale by the kinematic mosaic-crystal
  ratio $\frac{|F|^2/(V^2\mu)}{(|F|^2/(V^2\mu))_\text{NaCl}}$ at the same λ (λ³ and LP are per-θ already). This is computed,
  not fitted, and documented as "assumes NaCl-like mosaicity".
- `MAX_ORDER` and the angular limits become per-crystal.

| Preset | Structure | Cut | Cell (pm) | d (pm) | θ(Mo Kα), n = 1 | Note |
|---|---|---|---|---|---|---|
| NaCl | rock salt | (100) | a = 564.02 | 282.01 | 7.24° | calibrated anchor (leaflet) |
| LiF | rock salt | (100) | a ≈ 402.7 | ≈ 201.4 | ≈ 10.2° | wider spread in θ |
| Si | diamond | (111) | a ≈ 543.1 | ≈ 313.6 | ≈ 6.5° | (222) almost forbidden |
| Calcite | rhombohedral (hex. setting) | (104) | a ≈ 499, c ≈ 1706 | ≈ 303.5 | ≈ 6.7° | cleavage plane; first non-cubic preset |
| Mica (muscovite 2M1) | monoclinic | (002) | a ≈ 520, b ≈ 903, c ≈ 2011, β ≈ 95.8° | ≈ 995 | ≈ 2.05° | many orders; n = 1 sits in the direct-beam leak region |

Crystal list: the lab's usual crystals (user, 2026-10-14). The LD catalog gives d = 282 pm for NaCl (554 78) and 201 pm for LiF.
KCl and KBr are no longer presets, but the Forge can still build them (F3).

%% ≈ values are from memory: S1 must fetch and cite each a and B (room temperature) from a primary source or a handbook. %%

#### S1
- [ ] **C1.1** Research and cite the cell, the basis (calcite: Ca, C, O positions; muscovite: full 2M1 basis), B per atom
      and the cut plane of the five presets (WebFetch; record the sources in `PARAMETERS.md`).
- [ ] **C1.2** Refactor `crystal.py` and `scan.py` to take a `crystal=NACL` argument. **Every existing fixture stays byte-identical.**
- [ ] **C1.3** Test: NaCl built through the generic engine equals the old `structure_factor_sq_rel` to 1e-12. Si(200) and
      Si(222) are near zero. Rock salt (111) cut: odd orders ∝ (f_A − f_B)².

#### S2
- [ ] **C1.4** Export `artifacts/tables/crystals.json` and per-crystal structure-factor tables. Fixtures: one scan per preset.
- [ ] **C1.5** Notebook `08_crystals.ipynb`: the same tube, the five presets, first three orders, linear and log.
- [ ] **C1.6** `physics-reviewer`.

**Done when:** pytest green, NaCl unchanged, and every preset scan is physically sensible (peaks at the table angles, plausible relative heights).

**Files:** `model/src/braggsim/{crystal,scan,constants}.py`, `model/PARAMETERS.md`, `artifacts/tables/crystals.json`, `model/notebooks/08_crystals.ipynb`

**Verify:** [[#Verify|standard]] + `pytest model -k crystal`; `git diff --stat artifacts/fixtures` shows **no** change to existing files, only new preset fixtures

### C2 — Crystal selector (port and UI)

#### S1 — Port
- [ ] **C2.1** TS port of the generic engine (`crystal.ts`). `D_NACL_PM` becomes an anchor constant, not the only d.
      Vitest on all preset fixtures.

#### S2 — UI and knock-on effects
- [ ] **C2.2** Crystal picker on the target holder (setup tray from G1). The door must be open to swap.
- [ ] **C2.3** Huygens panel, Explore overlays, the spectrum λ axis and the goniometer label all read the current crystal.
- [ ] **C2.4** Existing tasks declare `crystal: 'NaCl'` and lock the picker. New task: "predict θ(Kα) for LiF before scanning".
- [ ] **C2.5** L1 Moseley gains an optional "use LiF" variant (the guide notes that the angular window changes with the crystal).
- [ ] **C2.6** Design, apparatus and pedagogy reviews.

**Done when:** switching crystals updates everything consistently, and Lab mode shows only what a real bench shows (the crystal's name, not its d).

**Files:** `web/src/physics/{crystal,constants}.ts`, `web/src/views/{huygens,spectrum,goniometer,bench}.ts`, `web/src/pedagogy/`

**Verify:** [[#Verify|standard]]; in the app switch NaCl → LiF and check the peaks, the Huygens panel and the overlays move together; Lab mode shows the name only

---

## Part III — Materials Forge

> [!example] What the user does
> Start from a preset (or from scratch) → choose the lattice (cubic P/I/F, rock salt, CsCl, diamond, zincblende,
> hexagonal, general) → set a (b, c, angles if the system allows) → place atoms (element + fractional position) →
> choose the cut plane (hkl) → see d, the allowed and forbidden orders, density, and **the spectrum this crystal would give
> on the 554 800**, overlaid on NaCl.

### F1 — Forge engine (any element)

The engine already exists after C1. What's missing is **data for any element** in the browser.

#### S1 — Python
- [ ] **F1.1** Export `form_factors.json`: f₀(q) for Z = 1…92 on a fixed q grid (0 to ~6 Å⁻¹). Python reads the same table
      for forged crystals (the parity rule from Phase 5). Python may still use xraylib for presets until we verify that
      the table reproduces them to 1e-9.
- [ ] **F1.2** Export element μ/ρ for the reflectivity ratio. Budget **≤ 300 kB gzip for all Forge tables**, lazy-loaded.
      Consider an edge-aware coarse grid; the reflectivity ratio is less sensitive than the filter transmission.
- [ ] **F1.3** Derived quantities: density from the cell contents, μ of the crystal from the mixture rule, warnings
      (atoms closer than ~100 pm, nλ > 2d for every line, a cut plane with F ≈ 0 in every order).
- [ ] **F1.4** Tests: forging NaCl, LiF and Si from scratch equals the presets. Random forged crystals give fixtures for the port.

#### S2 — Port
- [ ] **F1.5** TS port and Vitest (presets plus ~5 random forged crystals, including a non-cubic one).

**Files:** `model/src/braggsim/crystal.py` (forge helpers), `artifacts/tables/form_factors.json`, `web/src/physics/crystal.ts`

**Verify:** [[#Verify|standard]] + `pytest model -k forge`; `gzip -c artifacts/tables/form_factors.json | wc -c` keeps the Forge tables ≤ 300 kB together

### F2 — Forge UI

#### S1
- [ ] **F2.1** `web/src/views/forge.ts` (lazy chunk): lattice picker, parameter sliders with numeric fields, basis table
      (element picker plus x, y, z), (hkl) picker, live d and orders table (allowed/forbidden, relative |F|²).
- [ ] **F2.2** Live "would-be spectrum" (uPlot, linear/log), overlaid on NaCl, plus a "Use on the bench" button that mounts the
      forged crystal (labelled *hypothetical* everywhere).

#### S2
- [ ] **F2.3** Optional unit-cell 3D view, reusing the three.js chunk of the bench (atoms as spheres, the cut plane as a translucent plane).
- [ ] **F2.4** Persistence: `localStorage` plus a share link (crystal encoded in the URL query) so teachers can hand out a crystal.
- [ ] **F2.5** Design and pedagogy reviews, checked on a phone at 390 px.

**Files:** `web/src/views/forge.ts`, `web/src/styles/`, `web/src/pedagogy/i18n/`

**Verify:** [[#Verify|standard]]; `npm run build` lists `forge` as its own chunk; a share link reopens the same crystal; check at 390 px (`run-app`)

### F3 — Forge pedagogy

- [ ] **F3.1** Explore tasks (`write-guided-task`):
  - "Design a crystal that puts Mo Kα (n = 1) at 10°": they discover d ≈ 204 pm, close to LiF.
  - "Why is Si (200) missing?" (diamond extinction).
  - "Cut KCl along (111): where did the odd orders go?" (f_K ≈ f_Cl).
  - "Make the Kα doublet resolvable in first order" (smaller d spreads θ).
- [ ] **F3.2** `pedagogy-reviewer`.

**Done when:** the four tasks can be completed on a phone and the reviewer finds no misconception risk.

**Files:** `web/src/pedagogy/tasks/forge-*.ts`

**Verify:** [[#Verify|standard]]; each task can be finished on a phone; `pedagogy-reviewer` reports no blocking finding

---

## Open questions

> [!question] Still open
> 10. **Absorption wheel positions (P1, run 2a):** the guide lists four positions (30°–60°) for the last three materials. Which one
>     is empty? Until the lab answers, assume the wheel order polystyrene, Al, Fe, Cu, Zr, Ag at 0°–50° and an open slot at 60°.
>     Evidence (apparatus review 2026-10-14): at the guide's 1 mA, an open slot anywhere in 30°–60° saturates the GM (true ≈ 2.8e5/s, Rτ ≈ 28),
>     so the guide presumably never measures the open slot at 1 mA. An open slot at 0° would fit the Al plate, but it contradicts "the first three materials at 0°–20°".

> [!success]- Answered 2026-10-14 (user + web research)
> 5. **Real data:** none from the EPN apparatus. Use published data from reliable sources → [[#Calibration anchors]].
> 6. **GM background:** no EPN measurement. Use the published value → [[#Calibration anchors]].
> 7. **Attribution:** the EPN guides are credited to "Técnicos de Laboratorio del Departamento de Física de la EPN" (G0.4).
> 8. **Naming:** rename the app to **X-Ray Lab** (G0.5).
> 9. **Coin:** use the **Ecuador 1 centavo 2003** (Cu-plated steel). The US cent is dropped.
> 1. **Thicknesses.**
>    - Material wheel (absorption accessory 554 834): **0.4 mm** each (user). The LD catalog says 0.5 mm; we use the user's value
>      and note the catalog value in `PARAMETERS.md`. The "C" absorber is **polystyrene** (LD catalog), not graphite.
>    - Al wheel: 0.5 … 3.0 mm in 0.5 mm steps.
>    - Moseley foils (set of absorber foils 554 832): Zr 0.05, Mo 0.1, Ag 0.05, In 0.3 mm (the set also has Al 0.5, Fe 0.5 and Cu 0.07 mm).
> 2. **Crystals:** NaCl, LiF, Si, calcite, mica (user) → [[#C1 — Crystal engine and presets (Python)|C1 presets]].
> 3. **Energy detector:** LD **559 938**, Si-PIN, Peltier-cooled. Active area 0.8 mm dia., Si ≈ 150 µm, plastic window ≈ 40 µm graphite
>    equivalent, range 2–60 keV, FWHM(E) = 2√(2 ln 2)·√(σ_el² + F·ε·E) with σ_el ≈ 160 eV, F ≈ 0.15, ε = 3.8 eV (0.40 keV at Fe Kα).
>    Non-linearity < 1 % (3–35 keV), dead time ≈ 250 µs per pulse, housing fluorescence possible (Au L most often).
>    Output to the MCA box 524 058. *Source:* LD instruction sheet 559 938; leybold-shop product page 559938.
> 4. **Samples.**
>    - Brass: LD's own brass XRF experiment (P7.5.1.2) uses the target-alloy set 554 848, with **CuZn39Pb3 = 58 Cu / 39 Zn / 3 Pb**
>      (the leaded brass), CuZn36 = 64/36 and stainless X5CrNi18-10 = 72 Fe / 18 Cr / 10 Ni. It calibrates with Cu Kα 8.04 and Pb Lα 10.56 keV,
>      and its peak-height method is first order: matrix effects (Zn K exciting Cu) bias it. *Source:* LD CASSY Lab help pages P7511/P7512;
>      Amptek XRF tutorial.
>    - Coin, considered and dropped by Q9: the **US cent, 1982 on** (US coins circulate in Ecuador). Core Zinc Alloy 190 (0.7–0.9 % Cu) with ≈ 8 µm pure Cu plating
>      (≈ 7.5 µm at the centre, about twice that at the rim); 97.5 Zn / 2.5 Cu overall; 2.5 g, 19.05 mm. *Source:* Wikipedia "Penny (United
>      States coin)"; CONECA, citing a Concurrent Technologies Corp. report; Stack's Bowers.
>    - Coin, chosen: the **Ecuador 1 centavo 2003** (KM# 104a), Cu-plated steel, magnetic, 2.35 g, 19 mm, 1.45 mm. Plating → [[#Calibration anchors]]. *Source:* Wikipedia "Ecuadorian centavo coins"; Numista 3003.

---

## Calibration anchors

> [!info] No EPN measurements exist (user, 2026-10-14)
> Every number below is published or derived from published data. In `PARAMETERS.md` each one is labelled
> "anchored to <source>", never "fitted to measurement".

| Quantity | Value used | Source / reasoning |
|---|---|---|
| GM background `background_per_s` | **0.2 /s** (range 0.1–0.5) | LD instruction sheet 559 01 (end-window counter): background ≤ 7 pulses/min (0.12 /s) *with* 50 mm Pb + 3 mm Al shielding. Inside the 554 800 the tube is less shielded, so we use a little more. Assumption within that range. |
| GM dead time | 100 µs (unchanged) | Same sheet: ≤ 90 µs. The model's τ = 100 µs is consistent. |
| Direct-beam scale `K_direct` | ≈ 950 /s at 21 kV, 0.05 mA, no absorber, collimator, s₁ = s₂ = 5 cm | EPN Práctica 1 (the guide's minimum count for skipping calibration) |
| Attenuation reference | xraylib μ/ρ × density at Mo Kα (and averaged over the filtered spectrum) | Schoonjans et al. 2011 |
| Moseley result | R = 1.056 × 10⁷ m⁻¹, σ_K = 2.7 (lit. 1.0974 × 10⁷, 3.6) | LD CASSY Lab help, "Moseley's law and determination of the Rydberg constant" |
| Brass XRF result | CuZn39Pb3 by the first-order method: 61.6 Cu / 35.6 Zn / 2.9 Pb (nominal 58/39/3); 3 equal-width Gaussians at 8.04, 8.64, 8.91 keV; densities Cu 8.96, Zn 7.10, Pb 11.34 g/cm³ | LD CASSY Lab help P7.5.1.2 |
| Centavo 2003 plating | **≈ 18 µm Cu** on steel (range 10–25 µm) | No mint publishes it. Analogue: the RCM copper-plated steel cent of the same size and mass (2.35 g, 19.05 mm, 1.45 mm) is 4.5 % Cu by mass, which gives ≈ 18 µm over the surface. The Ecuador 2003 coin was struck in Mexico, so this is an assumption. |

---

## Risks

> [!warning] Calibration debt
> Each practice adds empirical numbers: K_direct, background, foil thicknesses, detector FWHM, and the efficiency.
> Without lab data they are assumptions. Mark them that way in the UI teacher notes and in `PARAMETERS.md`, and never tune them to make a task "work".

> [!warning] Cross-crystal scale
> Only NaCl is calibrated (Fig. 4). Other crystals rely on the kinematic mosaic ratio. Real crystals differ in mosaicity
> and extinction (LiF and HOPG especially). Show peak *positions* as exact and *heights* as model estimates.

> [!warning] Bundle size
> XRF kernels and the Forge's element tables must stay out of the main bundle (lazy). Check `npm run build` sizes in every phase.

> [!warning] Scope creep
> Not in this plan (backlog for [[Bragg-Simulation-Plan#Phase 11 — Extensions]]): other anodes, Duane–Hunt, a custom
> XRF alloy editor, secondary fluorescence, a full CASSY Lab emulation.

---

## Verify

The standard check every phase runs (the phase sections add their own extras):

```bash
micromamba run -n atom-sim pytest model                          # includes the artifact freshness check
micromamba run -n atom-sim ruff check . && micromamba run -n atom-sim ruff format --check .
micromamba run -n atom-sim npm --prefix web run test
micromamba run -n atom-sim npm --prefix web run build             # tsc + bundle sizes
```

---

## Session log

Newest first. One entry per session. This is what the next session reads to know what happened.

> [!example]- Entry template
> ```
> ### YYYY-MM-DD · <phase> · tasks <IDs>
> - Done: <task IDs ticked, files touched>
> - Verify: <pytest N passed · vitest N passed · build OK/size> or <what failed>
> - Uncommitted: <yes/no, what>
> - Surprises / decisions: <anything that changed the plan; also edit the phase section>
> - Next: <task ID and first concrete step>
> ```

### 2026-10-20 · L1 · task L1.7
- Done: L1.7 (Sonnet): `edgeMarkers` + the overlay block in `spectrum.ts`, i18n `kEdge`, `web/tests/spectrum.test.ts` (3 cases),
  `components.md` spectrum bullet. Opus: label clamp, one row per foil, tighter test tolerance.
- Reviews: design (ship after fixes, all applied): the short label "Zr K" instead of "borde K del Zr" (it crossed Kα at 390 px and
  read "del Ag"), `lineWidth` set for the edges (inherited from uPlot when no Kα/Kβ marker is in view), solid plot cursor, `tokens.md`
  `--label-2` light = .72 as in `tokens.css`. The "grey Kα" at 1440 px was image downscaling, not a bug.
- Verify: Vitest 110 · build OK (main 80.0 kB gzip, +0.2 kB) · pytest and `artifacts/` untouched. Headless Firefox: Zr, Zr + Mo,
  Zr + Ag at 390 and 1440 px, light and dark, es and en; Lab mode shows none; SENSOR scan at 2θ.
- Uncommitted: no, committed with this entry (user).
- Surprises / decisions: the driver must set `localStorage.lang` (the app ignores the browser language); U starts at 5 kV, so
  set U and I before scanning.
- Next: L1.8, `pedagogy-reviewer` over L1.6 + L1.7.

### 2026-10-20 · L1 · task L1.6 (and L1.1–L1.5 committed)
- Done: L1.1–L1.5 committed as `d61588a` (user). L1.6 (Sonnet): `constants.K_EDGE_KEV` + test, TS port with `MAX_EDGE_STEP_DEG`,
  `EDGE_SPLIT_HALF_WINDOW_DEG`; `lastScan.setup`; export records and the setup in the CSV; `GuidedTask.progress`; task, ES/EN strings,
  11 Vitest cases; teacher-key success sentence. Opus fixes: records take the stored angles (a stopped scan no longer counts as the
  whole window), per-list memo (the check ran `expectedRate` every frame), and `main.ts` relabelled the Learn card's back link as "×"
  (pre-existing selector collision, now `.focus-card > [data-back]`).
- Reviews: physics (OK with nits, all applied but two). The edge check now ports the best-split loop (splitting once at θ_K was
  stricter than Python); wording fixes (transmission, not absorption, rises; −intercept/slope = σ_K; R deficit partly instrument;
  "photon energies above the K edge"); a below-edge test at 25 kV. Not done: an artifact-backed parity test for `K_EDGE_KEV`
  (same hand-port pattern as `MO_K_EDGE_KEV`; checked once by script: TS = Python = xraylib, identical), and the task uses
  `DEFAULT` params, as the app does.
- Verify: pytest 155 · ruff clean · Vitest 107 · build OK (main 79.8 kB gzip, +2.5 kB) · `artifacts/` unchanged · teacher key byte-stable.
  The whole task done in the real UI at 390 px (headless Firefox, 390 px iframe), light and dark: five CSVs named by foil, observe step reached.
- Uncommitted: no, committed with this entry (user).
- Surprises / decisions: snap Firefox cannot see `/tmp` (load the iframe page via `document.write`; downloads to `~/snap/firefox/common`).
- Next: L1.7, Explore overlay of the edge markers; then L1.8 `pedagogy-reviewer` over both.

### 2026-10-20 · L1 · tasks L1.1–L1.5 (and G1.11 committed)
- Done: G1.11 committed as `771efa6` (unpushed), with the topbar and document title renamed to X-Ray Lab (user). L1.1: foil ρ/ρx table in
  `PARAMETERS.md`. L1.2–L1.5 (Sonnet, two rounds): `analysis.k_edge_deg`, `moseley_fit` (with χ²/dof), `edge_wavelength_table`,
  `MAX_EDGE_STEP_DEG`, `constants.R_INF_PER_M`, 12 new tests, `05_moseley.ipynb`, and the Moseley section of the teacher key (additive).
- Reviews: physics (needs changes, all accepted). The erf + linear edge model was itself responsible for most of the In offset and depended on
  the window, so it was replaced by the convolved step with its own plateau slope. Coarse Δβ (≥ 0.16°) failed silently. The R < R∞ wording now
  separates relativity from screening, and the fluorescence wording is fixed (≈ 63 % re-emitted, 1–2 % reaches the counter).
- Result (seed 2026): R = 1.060 ± 0.011 × 10⁷ m⁻¹, σ_K = 2.87 ± 0.20. Noise-free 1.058 / 2.84; tabulated edges 1.084 / 3.41;
  LD 1.056 / 2.7. 1.3 % below R∞ is physics, the other 2.3 % is instrument bias.
- Verify: pytest 154 · ruff clean · notebook executes · `artifacts/` unchanged · Vitest 96 · build OK (main 77.3 kB gzip). Python only after G1.11.
- Uncommitted: yes, L1.1–L1.5.
- Surprises / decisions: the 0.03° edge tolerance and the original L1 "Done when" were not achievable; both were revised (see L1.2 and Done when).
  Open later: μ/ρ grid nodes at λ_K (moves the edges ≤ 0.009°; changes artifacts and the TS port).
- Next: L1.6, the `moseley-k-edges` Lab task. Load `write-guided-task`, then check the scans against `MAX_EDGE_STEP_DEG` and the 3.7–7.5° window.

### 2026-10-15 · G1 · task G1.11
- Done: design review (Opus) from 22 screenshots; fixes by a Sonnet implementer plus two follow-ups (the select font back to `inherit`, since
  17 px values outweighed 13 px labels; the scroll-into-view now runs after the async rebuild). Files: `views/{goniometer,bench,setup}.ts`,
  `styles/app.css`, `main.ts` (hint moved). Rejected: per-tile material labels on the plate (too small), equal select widths, canvas aspect (pre-existing).
- G1 "Done when", checked in the app: a 35 kV / 1 mA COUPLED scan 4–14° with a sensor Zr foil drops Kβ from ≈ 1300/s to ≈ 120/s (Kα 2500 → 1630).
- Verify: Vitest 96 · build OK (main 77.3 kB gzip; `mu_rho_absorbers` 72.6 kB and bench 142.5 kB are their own chunks). No Python changed.
- Uncommitted: yes, G1.11.
- Surprises / decisions: headless Firefox has a ≈ 500 px minimum window, so 390 px shots need the app in a 390 px iframe.
- Next: L1.1, then L1.2 (`analysis.k_edge_deg`). Load `add-physics-feature`.

### 2026-10-15 · G1 · task G1.10
- Done: `Apparatus.transmittedRate()` (and a private `direct()` shared with `expectedRate`), the holder and foil drawings in
  `views/goniometer.ts` and `views/bench.ts`, one new Vitest case.
- Verify: Vitest 96 · build OK (main 77.1 kB gzip, +0.3; `mu_rho_absorbers` 72.6 kB; bench 142.5 kB). No Python changed.
  Headless Firefox at 1440 px light and 390 px dark: crystal unchanged; Al plate at 0° passes the open slot, at ≈5° the frame blocks,
  at 30° the beam passes through slot 3; empty + Zr shows a straight beam and both foils. The 3D slot placement was checked with `localToWorld`.
- Uncommitted: yes, G1.10.
- Surprises / decisions: the plate is small and faint (2D r ≈ 1.4u; 3D r = 2.5 cm, faint in dark mode). That is for G1.11.
- Next: G1.11, the `design-reviewer` pass (plate contrast, the disabled select in dark mode).

### 2026-10-15 · G1 · task G1.9
- Done: `web/src/views/setup.ts` (`mountSetup`, the explore.ts shape), the chamber card markup and frame hook in `main.ts`, a `saturated`
  line in `panel.ts` and the chamber card, i18n keys (es/en), and `.setup` CSS (tokens only, a chevron on the summary).
- Verify: pytest 143 · ruff clean · Vitest 95 · build OK. `mu_rho_absorbers` is now its own chunk (72.6 kB gzip) and main is 76.8 kB gzip.
  Headless Firefox at 390 px (light) and 1440 px (dark): the Al/material plates mount with the door open, the selects lock with it closed,
  and the material plate at slot 0 (polystyrene) at 30 kV / 1 mA reads ≈ 9300/s with the saturated line in both cards.
- Not checked in the app: the "Zr foil suppresses Kβ" scan (the `zr_filter_35kV` fixture covers the physics). The design-reviewer pass is G1.11.
- Uncommitted: yes, G1.9.
- Surprises / decisions: the review caught `q('[data-saturated]')` resolving to the panel card's element (it comes first in the markup).
  The topbar still says "Reflexión de Bragg" (`titleShort`); G0.5 left it as the experiment's name.
- Next: G1.10. Draw the holder (crystal / plate with 7 slots / nothing) in the 2D goniometer and the 3D bench, and the foils at the collimator and sensor.

### 2026-10-14 · G1 · tasks G1.7, G1.8
- Done: Python `filters.FOILS_MM`/`WHEELS_MM`/`areal_density_mg_cm2`, `scan.direct_rate(..., sensor_deg)` (Gaussian profile, leak width),
  exported to `mu_rho_absorbers.json` and `direct_beam.json` (two new off-axis cases); `PARAMETERS.md` (absorber thicknesses and apparatus
  assumptions). TS: `tables.ts` (`FOILS_MG_CM2`, `WHEELS_MG_CM2`, `absorbersLoaded`), `scan.ts` (`directRate` sensorDeg), `apparatus.ts`
  (setup, `mount`, holder dispatch, `saturated`, the exposure timer on HV only, background with HV off, the wrapped exposure angle).
- Reviews: physics (no blockers; fixed the off-axis halo, unit names and docs) and apparatus G1.8 (blocking: the P1 background run never
  finished; fixed). See the G1 "As built" note.
- Verify: pytest 143 passed · ruff clean · export byte-stable · Vitest 95 passed · build OK (main 75.9 kB gzip). Fixtures: only `direct_beam.json`
  changed, additively. `mu_rho_absorbers` is still not its own chunk, because nothing calls `loadAbsorbers()` until G1.9.
- Uncommitted: yes, all of G1.7–G1.8 (G1 S1 + G1.6 are in `164ef2b`).
- Surprises / decisions: Q10 gained evidence (an open slot at 1 mA saturates the GM). L1.1 and L2.1 lose their data half (already exported).
- Next: G1.9, the setup tray. Load `bragg-ui`. Await `loadAbsorbers()`, call `mount()` with the door open, show `saturated` as a simulation aid. Then check the build for the absorber chunk.

### 2026-10-14 · G1 · tasks G1.1–G1.6
- Done: S1 (Python) and the S2 port. `filters.py` (`ABSORBERS`, `check_filters`), `scan.py` (`filters=` everywhere, `direct_rate`,
  `background_per_s`, `direct_per_s`, `_check_tube`), model 0.4.0, `PARAMETERS.md`, new fixtures `zr_filter_35kV`, `direct_beam`,
  more `transmission` and `rejected_inputs` cases, lazy `mu_rho_absorbers.json`. TS: `filters.ts`, `scan.ts`, `tables.ts` (`loadAbsorbers`),
  `fixtures.test.ts`. `docs/teacher-key.md` regenerated (last digits only, U_K 20.13 ± 0.43 kV).
- Verify: pytest 139 passed · ruff clean · export byte-stable · Vitest 85 passed · build OK (main 75.4 kB gzip, unchanged).
  The absorber chunk doesn't appear in the build yet, because nothing in the app imports `loadAbsorbers`. It should once G1.7 does.
- Physics review: no blockers. Applied: the material check (Python and TS), the `direct_per_s` anchor wording (a lower bound; τ sensitivity 1 %),
  the GM paralysis validity bullet, and the L2 "Done when" rewrite. Its L1/L2 notes went into L1.2 and L2.4.
- Uncommitted: yes, all of G1 S1 + G1.6
- Surprises / decisions: see the "As built" note in G1. The Verify line now expects the sub-35 kV fixtures to move by the background.
- Next: G1.7, the `setup` state in `apparatus.ts`. Call `loadAbsorbers()` and warn when the true direct rate makes Rτ > 0.3.

### 2026-10-14 · G0 · tasks G0.2, G0.5
- Done: `CLAUDE.md` heading is now "X-Ray Lab" and its scope paragraph points to this note. README title and intro,
  `web/index.html` title (`X-Ray Lab · 554 800`), `web/package.json` + lock name `xray-lab-web`. The app name is not in
  the i18n dictionaries, so nothing changed there. Kept `model/pyproject.toml`'s description: `braggsim` really is the P6.3.3.1 model.
- Verify: the rename grep finds only this note and pyproject (intended); lock diff = 2 name lines; `npm run build` OK (main 75 kB gzip).
- Uncommitted: no (committed as `[G0] docs: rename app to X-Ray Lab and widen CLAUDE.md scope`, not pushed)
- Next: G1.1. Add C, Al, Fe, Cu, Zr, Mo, Ag, In to `mu_rho.json` (`filters.py`, same 1000-point grid).

### 2026-10-14 · G0 · tasks G0.3, G0.4
- Done: Q5–9 answered (no EPN data, so published anchors; credit to the EPN lab technicians; rename to X-Ray Lab; 2003 centavo).
  Added [[#Calibration anchors]] (GM background, LD Moseley and brass example results, plating estimate) and propagated them
  to G1, L1, L2, L3. L3 now includes secondary fluorescence. L1's "done when" now compares against the tabulated-edge fit,
  not R∞. README credits the guides. `practicas.md` updated.
- Verify: docs only.
- Uncommitted: no (committed as `[G0] docs: record open-question answers and calibration anchors`)
- Next: G0.2 + G0.5

### 2026-10-14 · G0 · tasks G0.1
- Done: answered open questions 1–4 (user + web research, sources in [[#Open questions]]); propagated them to G0.1, L1, L2, L3, C1.
  G0.1: `.claude/skills/bragg-reference/references/practicas.md` and a pointer row in that skill's `SKILL.md`.
- Verify: docs only. No sentence copied from the guides (spot-checked against `pdftotext refs/*.pdf`).
- Uncommitted: no (two `[G0]` commits, not pushed)
- Surprises / decisions: the "C" absorber is polystyrene. The detector's dead time (250 µs) is large, so the MCA needs live time.
  Mica's first order sits at ≈ 2° (direct-beam region). The crystal presets are now NaCl, LiF, Si, calcite, mica.
- Next: G0.2 (`CLAUDE.md` scope lines), then G0.3 (Q5–9 to the lab staff)

### 2026-10-14 · planning
- Done: this plan written from the three EPN guides and the current codebase (model 0.3.x, Phases 0–9 complete).
- Verify: n/a (no code)
- Uncommitted: no (committed with the G0.1 session)
- Next: G0.1, the reference facts into `bragg-reference`; then ask the [[#Open questions]]

%% The frontmatter, status board and Session log are what the next session reads first. Keep them current. %%
