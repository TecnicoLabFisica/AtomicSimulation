# Constants and derived quantities

## Crystal: NaCl (face-centred cubic, cleaved along cube faces)
| Quantity | Value | Source |
|---|---|---|
| Lattice constant a₀ | 564.02 pm | Leaflet |
| Lattice plane spacing d = a₀/2 | 282.01 pm | Leaflet (2d = a₀) |

## Mo anode lines (weighted means of the fine-structure components)
| Line | E (keV) | ν (10¹⁸ Hz) | λ (pm) | Source |
|---|---|---|---|---|
| Kα | 17.443 | 4.2264 | 71.080 | Leaflet Table 1 |
| Kβ | 19.651 | 4.8287 | 63.095 | Leaflet Table 1 |
| Kα₁ | ≈ 17.479 | | ≈ 70.93 | (verify), for the Phase 11 doublet |
| Kα₂ | ≈ 17.374 | | ≈ 71.36 | (verify) |

The manual quotes rounded values: Kα 17.4 keV (71.1 pm) and Kβ 19.6 keV (63.1 pm).

## Absorption edges (not in the LD docs — verify with xraylib)
| Edge | E (keV) | λ (pm) | Role |
|---|---|---|---|
| Mo K | ≈ 20.00 | ≈ 62.0 | Characteristic lines appear only for U above ≈ 20 kV |
| Zr K | ≈ 17.998 | ≈ 68.9 | Lies between Kα and Kβ, so a Zr filter suppresses Kβ |

## Bragg angles: leaflet Table 2 (d = 282.01 pm)
| n | θ(Kα) | θ(Kβ) |
|---|---|---|
| 1 | 7.24° | 6.42° |
| 2 | 14.60° | 12.93° |
| 3 | 22.21° | 19.61° |

## Formulas
- Bragg: n λ = 2 d sin θ. Reflection exists only if n λ ≤ 2d = 564.02 pm.
- The path difference between adjacent planes is Δ = 2 d sin θ. Constructive interference occurs when Δ = n λ.
- Duane–Hunt limit: λ_min [pm] = h c / (e U) ≈ 1239.84 / U[kV]. At 35 kV, λ_min ≈ 35.4 pm,
  which puts the first-order θ_min ≈ 3.6°.
- E [keV] = 1239.84 / λ [pm].
- Jacobian from λ to θ: dλ/dθ = (2d/n) cos θ, with θ in rad.
- Non-paralyzable dead time: R_obs = R / (1 + R τ).
- 2:1 coupling: sensor angle = 2 × target angle (β_sensor = 2θ). The leaflet's plot axis β is the
  target angle, which equals θ.
