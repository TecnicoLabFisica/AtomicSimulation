---
name: bragg-reference
description: Authoritative reference values and apparatus behaviour for the Bragg simulation — NaCl/Mo constants, leaflet P6.3.3.1 tables and Fig. 4 features, and the LD X-ray apparatus 554 800 control panel (keys, ranges, state machine, operating procedure), plus the EPN lab practices on the same apparatus (attenuation, Moseley, XRF of brass) and their accessories. Use whenever writing or reviewing physics code, tests, fixtures, the apparatus emulator, or educational text, instead of reading the copyrighted PDFs in refs/.
---

# Bragg reference

This skill holds paraphrased facts taken from two LD Didactic documents and three EPN lab guides. The originals are
kept locally in `refs/`, which is gitignored and must never be committed:

- **Leaflet**: LD Physics Leaflet P6.3.3.1, *Bragg reflection: diffraction of x-rays at a monocrystal*
  (`refs/practica_difraccion.pdf`, 6 pages). It was written for the older 554 811 apparatus with RS-232.
- **Manual**: LD Instruction sheet 554 800, *X-ray apparatus* (`refs/manual_equipo.pdf`, 12 pages).
  This is the hardware we emulate.
- **EPN lab guides** (Laboratorio de Física Atómica y Molecular): Práctica 1, attenuation (`refs/atenuacion_RX.pdf`);
  Práctica 5, Moseley's law (`refs/moseley_RX.pdf`); Práctica 6, XRF of brass (`refs/fluorescencia_RX.pdf`, pp. 1–3 only).

Load only the file you need:

| Need | File |
|---|---|
| Physical constants, Mo lines, edges, Bragg angles, derived formulas | `references/constants.md` |
| Leaflet: setup, measurement settings, Tables 1–5, what Fig. 4 looks like | `references/leaflet.md` |
| 554 800: keys, ranges, displays, interlock, modes, §11 procedures | `references/apparatus-554800.md` |
| EPN practices P1/P5/P6: settings, steps, analysis; accessories, detector 559 938, samples, coins | `references/practicas.md` |

Rules when using these facts:
- Cite them in code as `LD P6.3.3.1 Table 2`, `LD 554 800 §7 b3` or `EPN Práctica 5`.
- Anything marked **(verify)** is a literature value that is not in the LD docs. Confirm it with xraylib
  before hard-coding it, and record the source.
- If you need the original wording or a figure, open the PDF from `refs/` locally
  (`pdftotext -layout`, `pdftoppm`). The text layer renders "°" as "8", so `7.248` means 7.24°.
  Never copy the PDFs' text or figures into the repo.
