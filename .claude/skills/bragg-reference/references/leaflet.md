# LD Physics Leaflet P6.3.3.1 (paraphrased)

## Objectives
Investigate Bragg reflection at an NaCl monocrystal with Mo characteristic radiation, determine
λ(Kα) and λ(Kβ), confirm Bragg's law, and in doing so confirm the wave nature of X-rays.

## Principle
The Braggs (1913) modelled a crystal as parallel lattice planes. Each lattice point scatters a
Huygens spherical wavelet, and the wavelets from one plane superpose into a "reflected" front
(angle of incidence = angle of reflection, λ unchanged). Waves from adjacent planes add
constructively only when the path difference 2 d sin θ is a whole multiple n of λ. θ is the
**glancing angle**, measured from the plane and not from the normal.

## Apparatus
X-ray apparatus with a Mo tube and goniometer, an end-window GM counter (559 01), and an NaCl crystal.
The sensor arm moves at twice the crystal's angle (2θ coupling).

## Setup
- Collimator in its mount.
- Slit diaphragm of the collimator to the target arm: **s₁ ≈ 5 cm**, set with the goniometer guide rods.
- Target arm to the counter's slit (sensor seat): **s₂ ≈ 6 cm**. A smaller s₂ gives more counts but
  worse angular resolution. If s₂ is too small, Kα and Kβ can no longer be separated.
- The crystal lies flat on the target stage. NaCl is hygroscopic and fragile, so handle it by the short faces.
- Set the goniometer zero position before measuring.

## Measurement settings
U = 35.0 kV, I = 1.00 mA, Δt = 10 s per step, Δβ = 0.1°, COUPLED mode, target limits
**2° → 25°**. That is 231 steps × 10 s ≈ 38.5 min.

## Fig. 4: measured spectrum at 35 kV, 1 mA (qualitative features for calibration)
Axis: β = target angle 2°–25°. The leaflet shows linear R (1/s) and log₁₀ R.
- **Below ~3°**: the rate rises steeply toward 2° from the direct beam or scattering (log R ≈ 2.5 at 2°).
- **~3°**: a deep minimum (log R ≈ 0.7, a few counts/s). This is the Duane–Hunt cutoff of the continuum at λ_min.
- **~4–6°**: a broad bremsstrahlung hump peaking near 5° at roughly 800/s (log ≈ 2.9).
- **1st order**: Kβ at 6.4° reaches ~1500/s and Kα at 7.2° reaches ~2600/s. Both sit on the continuum. Kα is the strongest feature.
- Above the first order the continuum falls monotonically, from ~200/s at 10° to ~10–15/s at 25°.
- **2nd order**: Kβ at 12.9° reaches ~300/s (log ≈ 2.55) and Kα at 14.6° reaches ~700/s (log ≈ 2.85).
- **3rd order**: Kβ at 19.6° is about log ≈ 1.95 (~90/s) and Kα at 22.2° about log ≈ 2.25 (~180/s). They are small
  on the linear scale and clear on the log scale.
- Peaks are a few tenths of a degree wide. Kα and Kβ are well separated in every order.
Use these values only as shape targets. The real calibration data is `model/data/fig4_digitized.csv`.

## Results: Tables 3–5 (measured θ → λ with d = 282.01 pm)
| n | θ(Kα) | λ(Kα) pm | θ(Kβ) | λ(Kβ) pm |
|---|---|---|---|---|
| 1 | 7.24° | 71.08 | 6.42° | 63.07 |
| 2 | 14.60° | 71.09 | 12.94° | 63.15 |
| 3 | 22.20° | 71.04 | 19.58° | 63.01 |

| | λ(Kα) pm | λ(Kβ) pm |
|---|---|---|
| Mean of the orders | 71.07 | 63.08 |
| Literature | 71.08 | 63.09 |

The good agreement confirms Bragg's law and the wave nature of X-rays.

## Further note
Kα and Kβ are themselves multiplets, and the fine structure resolves at higher orders (LD leaflet P6.3.3.4).
