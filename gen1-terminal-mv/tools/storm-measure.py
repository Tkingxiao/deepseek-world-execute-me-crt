
"""storm-measure.py — ground truth on rendered frames.

Two numbers, both from the ink actually on screen:
  coverage = share of a grid of tube cells that contain EXECUTION glyph ink
             ("does the wall fill the screen?")
  red_share = share of coloured EXECUTION glyph pixels that are red
"""
from PIL import Image
import numpy as np, sys, os, glob, json

TUBE = (258, 48, 258 + 1276, 48 + 902)
CELL = 24          # a cell is "covered" if it holds glyph ink

def analyse(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im.crop(TUBE)).astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    v = np.maximum(np.maximum(r, g), b)
    glyph = v > 78                                   # above the tube wash; a dim
                                                     # token composites to ~v90
    red = glyph & (r > g + 45)
    green = glyph & (g > r + 45)
    H, W = glyph.shape
    gh, gw = H // CELL, W // CELL
    cells = glyph[:gh*CELL, :gw*CELL].reshape(gh, CELL, gw, CELL).any(axis=(1, 3))
    cov = 100.0 * cells.mean()
    rc, gc = int(red.sum()), int(green.sum())
    return {
        "file": os.path.basename(path),
        "coverage_pct": round(cov, 1),
        "red_share": round(100.0 * rc / max(1, rc + gc), 1),
        "red_px": rc, "green_px": gc,
    }

rows = [analyse(p) for p in sorted(glob.glob(os.path.join(sys.argv[1], "*.png")))]
print("frame            coverage%   red_share%   red_px   green_px")
for x in rows:
    print("%-16s %10.1f %12.1f %8d %10d" % (x["file"], x["coverage_pct"], x["red_share"], x["red_px"], x["green_px"]))
if rows:
    print()
    print("coverage : %.1f%% .. %.1f%%   (target ~80%%)" % (min(r["coverage_pct"] for r in rows), max(r["coverage_pct"] for r in rows)))
    print("red share: first %.1f%%  last %.1f%%   (target 80%% at the end)" % (rows[0]["red_share"], rows[-1]["red_share"]))
json.dump(rows, open(os.path.join(sys.argv[1], "_measure.json"), "w"), indent=1)
