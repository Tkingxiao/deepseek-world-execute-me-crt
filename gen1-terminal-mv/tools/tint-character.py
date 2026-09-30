
from PIL import Image
import os, json, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from paths import p
BASE = p("assets", "character")
OUT  = os.path.join(BASE, "tinted")
os.makedirs(OUT, exist_ok=True)
#            R     G     B      exposure gain
TARGETS = {
    "green": ((0.22, 1.00, 0.53), 0.92),
    "cyan":  ((0.43, 0.94, 1.00), 0.88),
    "amber": ((1.00, 0.72, 0.42), 0.66),
    "white": ((0.91, 1.00, 0.95), 0.84),
}
SRCS = ["front", "side", "back", "bust", "head"]
SCALE = 2
FLOOR, GAMMA = 0.16, 0.70

def tint_image(img, rgb, gain):
    img = img.convert("RGBA")
    r, g, b, a = img.split()
    lum = Image.merge("RGB", (r, g, b)).convert("L")
    lut = [int(255.0 * gain * (FLOOR + (1.0 - FLOOR) * (v / 255.0) ** GAMMA)) for v in range(256)]
    lum = lum.point(lut)
    tr = lum.point(lambda v: int(v * rgb[0]))
    tg = lum.point(lambda v: int(v * rgb[1]))
    tb = lum.point(lambda v: int(v * rgb[2]))
    al = a.point(lambda v: min(255, int(255 * (v / 255.0) ** 0.6)))
    return Image.merge("RGBA", (tr, tg, tb, al))

n = 0
for name in SRCS:
    p = os.path.join(BASE, "fishmaid_%s.png" % name)
    im = Image.open(p).convert("RGBA")
    w, h = im.size
    if w * SCALE < 1400:
        im = im.resize((w * SCALE, h * SCALE), Image.LANCZOS)
    for k, (rgb, gain) in TARGETS.items():
        tint_image(im, rgb, gain).save(os.path.join(OUT, "fishmaid_%s_%s.png" % (name, k)), optimize=True)
        n += 1
print("regenerated", n, "tinted files")
