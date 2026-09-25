"""Digitize Fig. 4 of LD Physics Leaflet P6.3.3.1 into model/data/fig4_digitized.csv.

Fig. 4 shows the measured Bragg spectrum (U = 35 kV, I = 1 mA, Δβ = 0.1°, Δt = 10 s) as two
screenshots, linear and log10. They are raster images inside the PDF, so the curve is traced
pixel by pixel and sampled at the measurement grid β = 2.0°, 2.1°, …, 25.0°.

Needs the leaflet at refs/practica_difraccion.pdf (local only, never committed) and poppler's
``pdfimages``. Only the resulting data points are committed.

    micromamba run -n atom-sim python model/scripts/digitize_fig4.py [--overlay DIR]
"""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import matplotlib.image as mpimg
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "refs" / "practica_difraccion.pdf"
OUT = ROOT / "model" / "data" / "fig4_digitized.csv"
BETAS = np.round(np.arange(20, 251) / 10, 1)

# Pixel calibration read off the grid lines of each 640×477 screenshot:
# β = (x − x0) / px_per_deg; value = v0 + (y0 − y) · per_px;
# plot box x ∈ [x_lo, x_hi], y ∈ [y_top, y_bottom).
PANELS = {
    "linear": dict(image=0, x0=97, px_per_deg=106 / 5, y0=293, v0=1000.0, per_px=1000 / 113.5,
                   x_lo=98, x_hi=626, y_top=80, y_bottom=406),
    "log": dict(image=1, x0=97, px_per_deg=102.8 / 5, y0=364, v0=1.0, per_px=0.5 / 55,
                x_lo=98, x_hi=610, y_top=80, y_bottom=404),
}  # fmt: skip


def extract_images(tmp):
    subprocess.run(["pdfimages", "-f", "4", "-l", "4", "-png", str(PDF), f"{tmp}/fig4"], check=True)
    return [mpimg.imread(f"{tmp}/fig4-{i:03d}.png") for i in (0, 1)]


def trace_curve(img, p):
    """Pixels of the curve: the largest 8-connected dark component inside the plot box."""
    gray = img if img.ndim == 2 else img[..., 0]
    dark = np.zeros(gray.shape, bool)
    box = (slice(p["y_top"], p["y_bottom"]), slice(p["x_lo"], p["x_hi"] + 1))
    dark[box] = gray[box] < 0.4
    labels, _ = ndimage.label(dark, structure=np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return labels == np.argmax(sizes)


def sample(curve, p):
    """Vertex y (pixels) at each β: top of the run at a local max, bottom at a local min."""
    center = lambda x: np.nonzero(curve[:, x])[0].mean() if curve[:, x].any() else np.nan  # noqa: E731
    out = []
    for beta in BETAS:
        x = round(p["x0"] + beta * p["px_per_deg"])
        ys = np.nonzero(curve[:, x])[0]
        if ys.size == 0 or ys.max() >= p["y_bottom"] - 1:  # gap, or clipped at the axis bottom
            out.append(np.nan)
            continue
        left, right = center(x - 2), center(x + 2)
        if left > ys.min() and right > ys.min() and ys.size > 2:
            out.append(ys.min())
        elif left < ys.max() and right < ys.max() and ys.size > 2:
            out.append(ys.max())
        else:
            out.append(ys.mean())
    return np.array(out, dtype=float)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--overlay", type=Path, help="write PNG overlays of the traced points here")
    args = ap.parse_args()
    if not PDF.exists():
        sys.exit(f"Leaflet not found at {PDF.relative_to(ROOT)} (local copy, gitignored).")

    with tempfile.TemporaryDirectory() as tmp:
        images = extract_images(tmp)

    rows = []
    for panel, p in PANELS.items():
        img = images[p["image"]]
        y = sample(trace_curve(img, p), p)
        value = p["v0"] + (p["y0"] - y) * p["per_px"]
        rate = value if panel == "linear" else 10**value
        rows += [(b, r, panel) for b, r in zip(BETAS, rate, strict=True) if np.isfinite(r)]
        if args.overlay:
            import matplotlib.pyplot as plt

            fig, ax = plt.subplots(figsize=(12.8, 9.54), dpi=100)
            ax.imshow(img, cmap="gray")
            ax.plot(p["x0"] + BETAS * p["px_per_deg"], y, ".", color="#eb6834", ms=3)
            ax.set_axis_off()
            args.overlay.mkdir(parents=True, exist_ok=True)
            fig.savefig(args.overlay / f"fig4_{panel}_overlay.png", bbox_inches="tight")
            plt.close(fig)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w") as f:
        f.write(
            "# Digitized from LD Physics Leaflet P6.3.3.1, Fig. 4 (NaCl, Mo tube, U = 35 kV,\n"
            "# I = 1 mA, Δβ = 0.1°, Δt = 10 s) by model/scripts/digitize_fig4.py.\n"
            "# panel=linear: R off the linear plot; panel=log: 10**(log10 R) off the log plot.\n"
            "# Pixel resolution: linear ≈ 9 /s, log ≈ 2 % of R. Omitted: points where the curve\n"
            "# touches the axis bottom (linear R ≲ 30 /s; log R ≈ 0.6 near β = 2.8°) and the\n"
            "# linear segment β < 2.8°, which the tracer sees as detached. The log panel covers\n"
            "# all of them and is the one to fit.\n"
        )
        f.write("beta_deg,rate_per_s,panel\n")
        for b, r, panel in rows:
            f.write(f"{b:.1f},{r:.4g},{panel}\n")
    print(f"wrote {len(rows)} points to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
