"""
Collect the rendered PNG frame sequences into their final asset folders,
verify frame counts, measure the alpha channel, and write preview images
composited onto a dark-green CRT background.

Run with the venv python (needs numpy + pillow).
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "lib"))
from paths import ROOT  # noqa: E402  (project root, wherever this was checked out)

RENDER = ROOT / "assets" / "math" / "_render2" / "images" / "scenes"
ASSETS = ROOT / "assets" / "math"

SCENES = [
    # (SceneName, output folder name, expected frames, preview name)
    ("PointsToDimension",    "points_dim",     180, "_preview_points_dim.png"),
    ("CircleToCircumference", "circle_circ",   180, "_preview_circle_circ.png"),
    ("SineWaveTangent",      "sine_tangent",   180, "_preview_sine_tangent.png"),
    ("ApproachInfinity",     "infinity_limit", 180, "_preview_infinity_limit.png"),
    ("LoveEquation",         "love_equation",  240, "_preview_love_equation.png"),
]

DARK_GREEN = (8, 26, 16)


def find_frames(scene: str):
    """manim names frames <output>0000.png (0-padded to 4 by default)."""
    direct = sorted(RENDER.glob(f"{scene}*.png"))
    if direct:
        return direct
    # fall back: search everywhere under _render
    return sorted((ROOT / "assets" / "math" / "_render2").rglob(f"{scene}*.png"))


def main() -> int:
    report = {}
    for scene, folder, expected, preview in SCENES:
        src = find_frames(scene)
        dst = ASSETS / folder
        if dst.exists():
            shutil.rmtree(dst)
        dst.mkdir(parents=True, exist_ok=True)

        # renaming the trailing digits to the required f%05d.png scheme
        imported = 0
        for idx, f in enumerate(src):
            target = dst / f"f{idx:05d}.png"
            try:
                shutil.copy2(f, target)
                imported += 1
            except Exception as exc:  # pragma: no cover
                print(f"  !! copy failed {f}: {exc}")
        present = sorted(dst.glob("f*.png"))

        entry = {
            "folder": str(dst),
            "source_files_found": len(src),
            "files_in_folder": len(present),
            "expected": expected,
            "count_ok": len(present) == expected,
        }

        if present:
            mid = present[len(present) // 2]
            im = Image.open(mid)
            entry["frame_mode"] = im.mode
            entry["frame_size"] = list(im.size)
            entry["mid_frame"] = mid.name

            if im.mode in ("RGBA", "LA") or "transparency" in im.info:
                a = np.asarray(im.convert("RGBA"))[:, :, 3].astype(np.float64)
                entry["alpha"] = {
                    "min": int(a.min()),
                    "max": int(a.max()),
                    "mean": round(float(a.mean()), 3),
                    "pct_fully_transparent": round(float((a == 0).mean() * 100), 3),
                    "pct_fully_opaque": round(float((a == 255).mean() * 100), 3),
                }
                # a couple more samples for confidence
                for label, f2 in (("first", present[0]),
                                  ("quarter", present[len(present) // 4]),
                                  ("threequarter", present[(3 * len(present)) // 4])):
                    a2 = np.asarray(Image.open(f2).convert("RGBA"))[:, :, 3]
                    entry.setdefault("alpha_samples", {})[label] = {
                        "file": f2.name,
                        "mean": round(float(a2.mean()), 3),
                        "max": int(a2.max()),
                    }
            else:
                entry["alpha"] = None
                entry["ALPHA_MISSING"] = True

            # ---- preview composited on a dark green background ----
            rgba = Image.open(mid).convert("RGBA")
            bg = Image.new("RGBA", rgba.size, DARK_GREEN + (255,))
            comp = Image.alpha_composite(bg, rgba).convert("RGB")
            comp.save(ASSETS / preview)
            entry["preview"] = str(ASSETS / preview)

        report[scene] = entry
        print(json.dumps({scene: entry}, indent=2))

    (ASSETS / "_verify_report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
