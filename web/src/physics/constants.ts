// port of braggsim.constants. Sources: LD Physics Leaflet P6.3.3.1 (NaCl lattice, Mo line data in
// Table 1), CODATA 2018 (hc), xraylib (Mo K edge, Kβ/Kα ratio, K-line fine structure).

// NaCl monocrystal, LD P6.3.3.1: lattice constant and (200) lattice-plane spacing d = a0/2.
export const A0_NACL_PM = 564.02
export const D_NACL_PM = 282.01

// Mo characteristic lines, LD P6.3.3.1 Table 1.
export const MO_KA_KEV = 17.443
export const MO_KA_PM = 71.08
export const MO_KB_KEV = 19.651
export const MO_KB_PM = 63.095

// hc in keV·pm (CODATA 2018, exact SI value): E [keV] = HC_KEV_PM / λ [pm].
export const HC_KEV_PM = 1239.841984

// Mo K absorption edge (xraylib.EdgeEnergy(42, K_SHELL)): K lines need a tube voltage above it.
export const MO_K_EDGE_KEV = 19.9995

// Emitted Kβ/Kα photon ratio of Mo from xraylib radiative rates.
export const KB_KA_RATIO = 0.1935

// Fine structure as [λ in pm, fraction of the Kα or Kβ intensity] (xraylib LineEnergy, RadRate):
// Kα1, Kα2; Kβ1,3 (merged), Kβ2.
export const MO_KA_COMPONENTS: readonly (readonly [number, number])[] = [
  [70.932, 0.656],
  [71.36, 0.344],
]
export const MO_KB_COMPONENTS: readonly (readonly [number, number])[] = [
  [63.253, 0.8692],
  [62.102, 0.1308],
]
