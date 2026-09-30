
from PIL import Image, ImageDraw
import numpy as np, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from paths import p
B = p("build", "eyes")
alph = Image.open(os.path.join(B, "eyes_alpha.png")).convert("RGBA")
W, H = alph.size
arr = np.asarray(alph).astype(np.int16)
r, g, b, a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]
lum = 0.299*r + 0.587*g + 0.114*b

# eyelashes are near-black and opaque; the hair is a medium blue.
lash = (lum < 78) & (a > 140) & (np.abs(b - r) < 45)
print("lash px", int(lash.sum()), "of", W*H)

cols = lash.sum(axis=0)
# split into two blobs by finding the gap around the image centre
mid = W // 2
band = max(20, W // 12)
gap = int(np.argmin(cols[mid-band:mid+band])) + mid - band
print("centre gap at column", gap)

def blob(x0, x1):
    sub = lash[:, x0:x1]
    cx = sub.sum(axis=0)
    idx = np.nonzero(cx > max(3, cx.max()*0.10))[0]
    if len(idx) == 0: return None
    bx0, bx1 = int(idx.min())+x0, int(idx.max())+x0
    sub2 = lash[:, bx0:bx1+1]
    ry = sub2.sum(axis=1)
    iy = np.nonzero(ry > max(2, ry.max()*0.12))[0]
    return [bx0, int(iy.min()), bx1, int(iy.max())]

L = blob(0, gap); R = blob(gap, W)
print("lash boxes", L, R)

def grow(bx, up=0.55, down=1.05, side=0.14):
    x0,y0,x1,y1 = bx
    w = x1-x0+1; h = y1-y0+1
    return [max(0,int(x0-w*side)), max(0,int(y0-h*up)),
            min(W,int(x1+w*side)), min(H,int(y1+h*down))]
EL, ER = grow(L), grow(R)
union = [min(EL[0],ER[0]), min(EL[1],ER[1]), max(EL[2],ER[2]), max(EL[3],ER[3])]
print("eye boxes", EL, ER)
print("union", union, "w", union[2]-union[0], "h", union[3]-union[1])

dbg = alph.copy(); d = ImageDraw.Draw(dbg)
for bx in (EL, ER):
    d.rectangle(bx, outline=(255,60,60,255), width=6)
d.rectangle(union, outline=(60,255,140,255), width=8)
dbg.convert("RGB").save(os.path.join(B, "_detect_box.png"))
json.dump({"EL":EL,"ER":ER,"union":union,"size":[W,H]}, open(os.path.join(B,"_eyebox.json"),"w"), indent=1)
print("wrote _detect_box.png")
