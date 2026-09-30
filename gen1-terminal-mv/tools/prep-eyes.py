
from PIL import Image
import numpy as np, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from paths import p
B = p("build", "eyes")
OUT = p("assets", "character")
im = Image.open(os.path.join(B, "eyes_alpha_lashsafe.png")).convert("RGBA")

# a tight box around the RIGHT eye only (the clean one), then mirror it for the left
BOX = [930, 355, 1345, 840]
crop = im.crop(tuple(BOX))
cw, ch = crop.size
print("tight crop", crop.size)

a = np.asarray(crop).astype(np.float32)
rgb, al = a[:,:,:3], a[:,:,3]
r, g, b = rgb[:,:,0], rgb[:,:,1], rgb[:,:,2]
mx = rgb.max(axis=2); mn = rgb.min(axis=2)
sat = (mx - mn) / np.maximum(mx, 1e-3)
skin = (r > 150) & (g > 148) & (b > 148) & (sat < 0.30)
out = rgb.copy(); out[skin] *= 0.06
lum = 0.299*out[:,:,0] + 0.587*out[:,:,1] + 0.114*out[:,:,2]
tint = np.stack([lum*0.42, lum*0.99, lum*1.00], axis=2)
res = np.clip(0.62*tint + 0.38*out, 0, 255)
# harden alpha a little so the eye reads solid on the tube
al2 = np.clip(al.astype(np.float32) * 1.25, 0, 255)
# feather the crop border so the rectangle never shows against the tube
yy, xx = np.mgrid[0:ch, 0:cw]
m = 26.0
fx = np.clip(np.minimum(xx, cw - 1 - xx) / m, 0, 1)
fy = np.clip(np.minimum(yy, ch - 1 - yy) / m, 0, 1)
al2 = al2 * (fx * fy) ** 0.85
eye = Image.fromarray(np.dstack([res, al2]).astype(np.uint8), "RGBA")

SC = 1.7
eye = eye.resize((int(cw*SC), int(ch*SC)), Image.LANCZOS)
left = eye.transpose(Image.FLIP_LEFT_RIGHT)
right = eye
left.save(os.path.join(OUT, "eye_left.png"), optimize=True)
right.save(os.path.join(OUT, "eye_right.png"), optimize=True)
meta = {"size": [eye.size[0], eye.size[1]], "sourceBox": BOX, "scale": SC,
        "left": "mirror of the right eye", "skin_pct": round(100.0*skin.sum()/(cw*ch), 1)}
json.dump(meta, open(os.path.join(OUT, "eyes_crt.json"), "w"), indent=1)
print(json.dumps(meta))

gap = 44
prev = Image.new("RGBA", (eye.size[0]*2 + gap + 60, eye.size[1] + 60), (5,16,10,255))
prev.alpha_composite(left, (20, 30))
prev.alpha_composite(right, (20 + eye.size[0] + gap, 30))
prev.convert("RGB").save(os.path.join(B, "eyes_pair_preview.png"))
print("pair preview", prev.size)
