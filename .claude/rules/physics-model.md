---
paths:
  - "model/**"
---

# Python reference model rules

- `braggsim` is the **source of truth**. Its behaviour is what the web app must reproduce.
- Units are pm, keV, degrees, s, kV, mA, counts/s. Encode them in names (`lambda_pm`, `theta_deg`,
  `U_kV`) or state them in the docstring. Convert to radians only locally inside a function.
- Every function docstring cites where its physics comes from: leaflet table/equation, manual
  section, xraylib, or a standard reference. Facts from the PDFs come from the `bragg-reference` skill.
- Scan functions are **pure** and return the expected rate R̄(β) (float arrays, no randomness).
  Randomness lives only in `detector.sample_counts(R_bar, dt, rng)`, with an explicit `rng`
  (`numpy.random.Generator`). No global seeds, and never call `np.random.*` directly.
- Every empirical/fitted parameter (m, r_n, ε(λ), τ, leak, scale, Kα:Kβ, σ(s1, s2)) is a named
  constant with an entry in `model/PARAMETERS.md` giving its value, what it was fitted to, the date,
  and the notebook it came from.
- Handle physical edge cases explicitly: nλ > 2d (no reflection), U below the Mo K threshold
  (no lines), λ < λ_min (no continuum), I = 0, and angles outside the goniometer range.
- Tests assert against leaflet numbers (Tables 2–5) with the tolerance stated and justified.
  Use `pytest.approx` and give each test a name that says what physics it checks.
- Remember that PDF text extraction renders "°" as "8" (`7.248` = 7.24°). Check against the page.
- After changing anything that affects outputs, regenerate `artifacts/` and follow the
  `add-physics-feature` skill so the TS port stays in sync.
- Notebooks explore the model; they are not the model. Logic used twice moves into `braggsim`.
  Notebooks are committed stripped (nbstripout).
