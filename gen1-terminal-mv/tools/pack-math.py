
from PIL import Image
import os, json, math, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from paths import p

BASE = p("assets", "math")
OUT  = os.path.join(BASE, "sheets")
os.makedirs(OUT, exist_ok=True)

SCENES = [
    ("points_dim",     180),
    ("circle_circ",    180),
    ("sine_tangent",   180),
    ("infinity_limit", 180),
    ("love_equation",  240),
]
CELL_W, CELL_H = 580, 340

def content_bbox(folder, n):
    """union bbox of alpha>8, sampled"""
    x0, y0, x1, y1 = 10**9, 10**9, -1, -1
    step = max(1, n // 24)
    for i in range(0, n, step):
        p = os.path.join(folder, "f%05d.png" % i)
        if not os.path.exists(p):
            continue
        a = Image.open(p).convert("RGBA").getchannel("A")
        bb = a.point(lambda v: 255 if v > 8 else 0).getbbox()
        if bb:
            x0 = min(x0, bb[0]); y0 = min(y0, bb[1])
            x1 = max(x1, bb[2]); y1 = max(y1, bb[3])
    if x1 < 0:
        return None
    return (max(0, x0 - 16), max(0, y0 - 16), min(1920, x1 + 16), min(1080, y1 + 16))

report = {}
for name, n in SCENES:
    folder = os.path.join(BASE, name)
    bb = content_bbox(folder, n)
    if bb is None:
        report[name] = {"error": "no content"}; continue
    bw, bh = bb[2] - bb[0], bb[3] - bb[1]
    s = min(CELL_W / bw, CELL_H / bh)
    cw, ch = max(1, int(bw * s)), max(1, int(bh * s))
    cols = 15
    rows = math.ceil(n / cols)
    sheet = Image.new("RGBA", (cols * cw, rows * ch), (0, 0, 0, 0))
    for i in range(n):
        p = os.path.join(folder, "f%05d.png" % i)
        im = Image.open(p).convert("RGBA").crop(bb).resize((cw, ch), Image.LANCZOS)
        # glow pass: draw the frame plus a shifted copy for phosphor bloom
        cx = (i % cols) * cw
        cy = (i // cols) * ch
        sheet.alpha_composite(im, (cx, cy))
        glow = im.copy()
        glow.putalpha(im.getchannel("A").point(lambda v: int(v * 0.32)))
        sheet.alpha_composite(glow, (cx + 2, cy + 1))
        sheet.alpha_composite(glow, (cx - 2, cy - 1))
    out = os.path.join(OUT, name + ".png")
    sheet.save(out, optimize=True)
    report[name] = {"sheet": out, "cellW": cw, "cellH": ch, "cols": cols, "rows": rows,
                    "frames": n, "bytes": os.path.getsize(out), "bbox": bb}
    print(name, "->", cw, "x", ch, "grid", cols, "x", rows, "frames", n,
          "%.2f MB" % (os.path.getsize(out) / 1e6))

meta = {"cell": {"w": CELL_W, "h": CELL_H}, "scenes": report}
with open(os.path.join(BASE, "sheets", "meta.json"), "w") as f:
    json.dump(meta, f, indent=1)
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ("cellW","cellH","cols","rows","frames")} for k, v in report.items()}, indent=1))
