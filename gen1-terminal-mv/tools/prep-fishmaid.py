# ---------------------------------------------------------------------------
# Character prep: same maths as the sheet pipeline (extract_character.py +
# tint-character.py). Only the input differs: this one expects a PNG that
# already carries a clean alpha channel, so no flood-fill mask is derived.
# ---------------------------------------------------------------------------
from PIL import Image
import numpy as np, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from paths import p

# Bring your own art: MV_CHARACTER overrides, else input/character.png.
# No character illustration is redistributed with this repository.
SRC  = os.environ.get("MV_CHARACTER") or p("input", "character.png")
BASE = p("assets", "character")
TINT = os.path.join(BASE, "tinted")
os.makedirs(TINT, exist_ok=True)

TARGETS = {
    "green": ((0.22, 1.00, 0.53), 0.92),
    "cyan":  ((0.43, 0.94, 1.00), 0.88),
    "amber": ((1.00, 0.72, 0.42), 0.66),
    "white": ((0.91, 1.00, 0.95), 0.84),
}
FLOOR, GAMMA = 0.16, 0.70        # original exposure constants
ALPHA_GAMMA  = 0.60              # original alpha curve

def alpha_lut():
    return [min(255, int(255 * (v / 255.0) ** ALPHA_GAMMA)) for v in range(256)]

def tint_image(img, rgb, gain):
    img = img.convert("RGBA")
    r, g, b, a = img.split()
    lum = Image.merge("RGB", (r, g, b)).convert("L")
    lut = [min(255, int(255.0 * gain * (FLOOR + (1.0 - FLOOR) * (v / 255.0) ** GAMMA)))
           for v in range(256)]
    lum = lum.point(lut)
    tr = lum.point(lambda v: int(v * rgb[0]))
    tg = lum.point(lambda v: int(v * rgb[1]))
    tb = lum.point(lambda v: int(v * rgb[2]))
    al = a.point(alpha_lut())
    return Image.merge("RGBA", (tr, tg, tb, al))

im = Image.open(SRC).convert("RGBA")
bb = im.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox()
im = im.crop(bb)
cw, ch = im.size

a = np.asarray(im.getchannel("A")).astype(np.float32)
def box3(m):
    p = np.pad(m, 1, mode="edge")
    return (p[:-2,:-2]+p[:-2,1:-1]+p[:-2,2:]+p[1:-1,:-2]+p[1:-1,1:-1]+p[1:-1,2:]+p[2:,:-2]+p[2:,1:-1]+p[2:,2:])/9.0
filled = (a > 40)
a2 = np.where(filled | (box3(filled.astype(np.float32)) > 0.55), np.maximum(a, 255.0), a)
a2 = np.clip(box3(np.clip(a2, 0, 255)), 0, 255)
im = Image.merge("RGBA", (*im.convert("RGB").split(), Image.fromarray(a2.astype(np.uint8), "L")))

front = im
back  = front.transpose(Image.FLIP_LEFT_RIGHT)
side  = front.resize((int(cw * 0.62), ch), Image.LANCZOS)

rows = (a2 > 40).sum(axis=1)
top  = int(np.argmax(rows > 0))
upper = rows[top:top + int(ch * 0.45)]
neck = top + int(np.argmin(upper[len(upper)//2:]) + len(upper)//2) if upper.size else top + int(ch * 0.34)
neck = max(neck, top + int(ch * 0.24))
bust = front.crop((0, max(0, top - 4), cw, min(ch, neck + int(ch * 0.06))))
head = front.crop((0, max(0, top - 4), cw, min(ch, top + int(ch * 0.32))))

views = {"front": front, "side": side, "back": back, "bust": bust, "head": head}
made = []
for name, v in views.items():
    for tk, (rgb, gain) in TARGETS.items():
        tint_image(v, rgb, gain).save(os.path.join(TINT, "fishmaid_%s_%s.png" % (name, tk)), optimize=True)
        made.append(name + "/" + tk)
front.save(os.path.join(BASE, "fishmaid_front.png"), optimize=True)
head.save(os.path.join(BASE, "fishmaid_head.png"), optimize=True)

def stat(p):
    al = np.asarray(Image.open(p).convert("RGBA"))[:, :, 3]
    return {"file": os.path.basename(p), "alpha_max": int(al.max()),
            "alpha_mean": round(float(al.mean()), 1),
            "pct_gt10": round(100 * float((al > 10).mean()), 1)}

checks = [stat(os.path.join(TINT, "fishmaid_front_%s.png" % k)) for k in TARGETS]
checks += [stat(os.path.join(TINT, "fishmaid_bust_%s.png" % k)) for k in ("green", "amber")]
report = {"source": SRC, "cropBox": list(bb), "size": [cw, ch], "tintedFiles": len(made), "checks": checks}
json.dump(report, open(os.path.join(BASE, "fishmaid_report.json"), "w"), indent=1)
print(json.dumps(report, indent=1))
assert all(c["alpha_max"] == 255 for c in checks), "ALPHA STILL CRUSHED"
print("ALPHA OK: every variant reaches full opacity")
