"""Physical constants and Mo/NaCl data for the Bragg simulation.

Sources: LD Physics Leaflet P6.3.3.1 (NaCl lattice, Mo line data in Table 1), CODATA 2018 (hc),
xraylib (Mo K edge, Kβ/Kα radiative-rate ratio; hard-coded here, checked in
tests/test_constants.py).
"""

# NaCl monocrystal, LD P6.3.3.1: lattice constant and (200) lattice-plane spacing d = a0/2.
A0_NACL_PM = 564.02
D_NACL_PM = 282.01

# Mo characteristic lines, LD P6.3.3.1 Table 1.
MO_KA_KEV = 17.443
MO_KA_PM = 71.080
MO_KB_KEV = 19.651
MO_KB_PM = 63.095

# hc in keV·pm (CODATA 2018, exact SI value): E [keV] = HC_KEV_PM / λ [pm].
HC_KEV_PM = 1239.841984

# Mo K absorption edge: characteristic K lines are excited only above this tube voltage.
# xraylib.EdgeEnergy(42, K_SHELL).
MO_K_EDGE_KEV = 19.9995

# Emitted Kβ/Kα photon ratio of Mo: (KM3+KM2+KN3+KN2)/(KL3+KL2) radiative rates, xraylib.RadRate.
KB_KA_RATIO = 0.1935
