# LD Physics Leaflet P6.3.3.1: facts used by this project

Source: LD Physics Leaflet P6.3.3.1 (paraphrased facts only; the figure is not reproduced).

## Settings
- Collimator slit to target arm s₁ ≈ 5 cm; target arm to counter slit s₂ ≈ 6 cm (smaller s₂: more counts, worse
  resolution; too small and Kα/Kβ merge). Counter 559 01, NaCl crystal on the target stage.
- U = 35.0 kV, I = 1.00 mA, Δt = 10 s, Δβ = 0.1°, COUPLED, target limits 2° to 25° (231 steps, about 38.5 min).

## Fig. 4 features (shape targets; real data is `model/data/fig4_digitized.csv`)
- Steep rise toward 2° (log R ≈ 2.5); deep minimum near 3° (log R ≈ 0.7); bremsstrahlung hump near 5° (~800 /s).
- 1st order: Kβ 6.4° (~1500 /s), Kα 7.2° (~2600 /s, strongest). 2nd: Kβ 12.9° (~300 /s), Kα 14.6° (~700 /s).
  3rd: Kβ 19.6° (~90 /s), Kα 22.2° (~180 /s). Continuum falls from ~200 /s at 10° to ~10-15 /s at 25°.
- Peaks a few tenths of a degree wide; Kα and Kβ separated in every order.

## Table 5 values used by tests (d = 282.01 pm)
Measured means: λ(Kα) = 71.07 pm, λ(Kβ) = 63.08 pm; literature 71.08 and 63.09 pm.
Measured angles (Table 3): Kα 7.24°, 14.60°, 22.20°; Kβ 6.42°, 12.94°, 19.58°.
