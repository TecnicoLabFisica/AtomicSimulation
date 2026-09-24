# Bragg reflection simulation

A browser-based, physics-driven and educational simulation of **Bragg reflection of Mo Kα/Kβ X-rays
at an NaCl monocrystal**. It follows the experiment LD P6.3.3.1 on the LD X-ray apparatus **554 800**,
with the goniometer in 2:1 coupled mode. It is meant to run on almost any device through GitHub Pages.

> **Status:** early development (Phase 0: scaffolding). There is no web app yet.

## Architecture

**Python owns the truth, TypeScript owns the experience.** A Python reference model (`model/`)
computes the physics and exports JSON artifacts. The TypeScript web app (`web/`, planned) ports the
model 1:1 and must reproduce those artifacts in its tests.

```mermaid
flowchart LR
    PY["Python reference model<br/>model/src/braggsim"] -->|export_artifacts.py| ART[("artifacts/<br/>tables + fixtures")]
    ART -->|tables| P["TypeScript port<br/>web/src/physics"]
    ART -->|golden fixtures| T["Vitest"]
    T -.checks.-> P
    P --> APP["Apparatus emulator + views"] -->|vite build| GH["GitHub Pages"]
```

Design rule: every scan function returns the **deterministic expected count rate** R̄(β).
Poisson counting noise is a separate, final step.

## Setup

Requires [micromamba](https://mamba.readthedocs.io/) (or conda/mamba).

```bash
micromamba create -f environment.yml
micromamba run -n atom-sim pip install -e ./model
micromamba run -n atom-sim pre-commit install
micromamba run -n atom-sim pytest model
```

`xraylib` comes from conda-forge through `environment.yml`, not from pip.

## References

- LD Didactic, *Physics Leaflet P6.3.3.1: Bragg reflection: diffraction of X-rays at a monocrystal*.
- LD Didactic, *Instruction sheet 554 800: X-ray apparatus*.
- T. Schoonjans et al., *The xraylib library for X-ray–matter interactions. Recent developments*,
  Spectrochim. Acta B 66 (2011) 776–784. <https://github.com/tschoonj/xraylib>

The LD documents are copyrighted and are not included in this repository. We use only
paraphrased facts and numerical values from them, and we cite them wherever they are used.

## License

- Code: [MIT](LICENSE).
- Educational content we create (texts, guided tasks, figures): [CC BY 4.0](LICENSE-CONTENT).
