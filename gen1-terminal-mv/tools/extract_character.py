#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extract clean transparent-background character cutouts from a three-view anime
character sheet (pure white background).

Method
------
1. Background mask = BFS/scanline flood fill seeded from the image border using
   an RGB distance-to-white threshold (max abs channel distance).  A global
   "white -> transparent" key is NOT used, so enclosed white lace (headdress,
   apron trim, stockings) survives as opaque character pixels.
2. Alpha edge feathering: a 1-2px graded alpha ramp derived from how white the
   edge pixel is (removes the anti-aliased white fringe), followed by the
   mandated 1px 3x3 box blur on the alpha channel.
3. Split the sheet into the three views by projecting the foreground mask on x
   and finding the two background gaps.
4. Crop each view to its foreground bbox + 12px padding, save as PNG w/ alpha.
5. Also derive a bust crop (top 45%) and a head crop (top 32%) from the FRONT
   view, using that view's own foreground mask so the crops stay tight.
6. Verify: report w/h/alpha>10 ratio and connected-component count per view.
7. Write a verification contact sheet on a dark #101810 background.

No third-party dependency beyond numpy + Pillow.  The source JPEG is never
modified.
"""

import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from paths import ROOT as OUT_ROOT, p  # project root, wherever this was checked out

# Bring your own art: MV_CHARACTER_SHEET overrides, else input/character_sheet.jpg.
# No character illustration is redistributed with this repository.
SRC = os.environ.get("MV_CHARACTER_SHEET") or p("input", "character_sheet.jpg")
OUTDIR = os.path.join(str(OUT_ROOT), "assets", "character")
TOOLS_DIR = os.path.join(str(OUT_ROOT), "tools")

WHITE_TOL = 28      # max abs channel distance to pure white that still counts as background
PAD = 12            # padding around each view's foreground bbox, in px
RING = 2            # width of the graded alpha band next to the background
FEATHER = 1         # 1 = 3x3 box blur on alpha (1px feather)
MIN_SPECK = 50      # drop connected foreground blobs smaller than this (JPEG speckles)

DARK_BG = (0x10, 0x18, 0x10)  # #101810 contact sheet background
SHEET_W = 1260


# ---------------------------------------------------------------- flood fill
def flood_bg_from_border(near_white):
    """Scanline BFS flood fill of near_white seeded from all 4 image borders.

    Returns a bool array that is True for background (border-connected) pixels.
    Pure numpy + a python deque of run seeds; no scipy required.
    """
    h, w = near_white.shape
    out = np.zeros((h, w), dtype=bool)
    stack = deque()

    for x in range(w):
        if near_white[0, x]:
            stack.append((0, x))
        if near_white[h - 1, x]:
            stack.append((h - 1, x))
    for y in range(h):
        if near_white[y, 0]:
            stack.append((y, 0))
        if near_white[y, w - 1]:
            stack.append((y, w - 1))

    while stack:
        y, x = stack.pop()
        if out[y, x] or not near_white[y, x]:
            continue
        xl = x
        while xl - 1 >= 0 and near_white[y, xl - 1] and not out[y, xl - 1]:
            xl -= 1
        xr = x
        while xr + 1 < w and near_white[y, xr + 1] and not out[y, xr + 1]:
            xr += 1
        out[y, xl:xr + 1] = True
        for ny in (y - 1, y + 1):
            if 0 <= ny < h:
                row = near_white[ny, xl:xr + 1] & ~out[ny, xl:xr + 1]
                idx = np.flatnonzero(row)
                if idx.size:
                    brk = np.flatnonzero(np.diff(idx) > 1)
                    starts = [idx[0]] + [idx[i + 1] for i in brk]
                    for s in starts:
                        stack.append((ny, xl + int(s)))
    return out


def dilate4(mask, iterations=1):
    """4-neighbourhood binary dilation (iterative, numpy only)."""
    m = mask.copy()
    for _ in range(iterations):
        p = np.zeros_like(m)
        p[1:, :] |= m[:-1, :]
        p[:-1, :] |= m[1:, :]
        p[:, 1:] |= m[:, :-1]
        p[:, :-1] |= m[:, 1:]
        m = m | p
    return m


def box_blur3(a):
    """3x3 box blur on a float array (1px feather), edge-replicated."""
    p = np.pad(a, 1, mode="edge")
    acc = np.zeros_like(a)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            acc += p[dy:dy + a.shape[0], dx:dx + a.shape[1]]
    return acc / 9.0


def build_alpha(rgb):
    """rgb uint8 HxWx3 -> (alpha uint8 HxW, fg bool, bg bool)."""
    rgb16 = rgb.astype(np.int16)
    dist_white = 255 - rgb16.min(axis=2)          # 0 for pure/near white
    near_white = dist_white <= WHITE_TOL
    bg = flood_bg_from_border(near_white)
    fg = ~bg

    alpha = np.where(fg, 255.0, 0.0)

    # Graded ramp on the thin band of foreground pixels that touches the
    # background: a pixel that is still ~white there is anti-aliasing / JPEG
    # ringing and must fade out, otherwise it forms a white halo.
    band = fg & dilate4(bg, RING)
    ramp = np.clip((dist_white.astype(np.float32) - 10.0) / 60.0, 0.0, 1.0) * 255.0
    alpha = np.where(band, np.minimum(alpha, ramp), alpha)

    if FEATHER:
        alpha = box_blur3(alpha)
    return np.clip(alpha + 0.5, 0, 255).astype(np.uint8), fg, bg


# --------------------------------------------------------- connected parts
def label_components(mask):
    """8-connected component labelling via scanline BFS. Returns (labels, sizes)."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    sizes = [0]
    cur = 0
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if labels[sy, sx]:
            continue
        cur += 1
        size = 0
        stack = [(sy, sx)]
        while stack:
            y, x = stack.pop()
            if labels[y, x] or not mask[y, x]:
                continue
            xl = x
            while xl - 1 >= 0 and mask[y, xl - 1] and not labels[y, xl - 1]:
                xl -= 1
            xr = x
            while xr + 1 < w and mask[y, xr + 1] and not labels[y, xr + 1]:
                xr += 1
            labels[y, xl:xr + 1] = cur
            size += xr - xl + 1
            for ny in (y - 1, y, y + 1):
                if not (0 <= ny < h):
                    continue
                lo = max(0, xl - 1)
                hi = min(w, xr + 2)
                seg = mask[ny, lo:hi] & (labels[ny, lo:hi] == 0)
                idx = np.flatnonzero(seg)
                if idx.size:
                    brk = np.flatnonzero(np.diff(idx) > 1)
                    starts = [idx[0]] + [idx[i + 1] for i in brk]
                    for s in starts:
                        stack.append((ny, lo + int(s)))
        sizes.append(size)
    return labels, sizes


# ------------------------------------------------------------------ helpers
def bbox_of(mask):
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def crop_rgba(rgb, alpha, box, pad=PAD):
    """Crop box=(x0,y0,x1,y1) inclusive + pad, onto a transparent canvas."""
    h, w = alpha.shape
    x0, y0, x1, y1 = box
    X0, Y0 = x0 - pad, y0 - pad
    X1, Y1 = x1 + 1 + pad, y1 + 1 + pad
    cw, ch = X1 - X0, Y1 - Y0
    canvas = np.zeros((ch, cw, 4), dtype=np.uint8)
    sx0, sy0 = max(0, X0), max(0, Y0)
    sx1, sy1 = min(w, X1), min(h, Y1)
    dx0, dy0 = sx0 - X0, sy0 - Y0
    if sx1 > sx0 and sy1 > sy0:
        canvas[dy0:dy0 + (sy1 - sy0), dx0:dx0 + (sx1 - sx0), :3] = rgb[sy0:sy1, sx0:sx1]
        canvas[dy0:dy0 + (sy1 - sy0), dx0:dx0 + (sx1 - sx0), 3] = alpha[sy0:sy1, sx0:sx1]
    return canvas


def alpha_ratio(rgba, thr=10):
    return 100.0 * float((rgba[:, :, 3] > thr).sum()) / float(rgba.shape[0] * rgba.shape[1])


def save_rgba(path, rgba):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(path, "PNG", optimize=True)


def font(size):
    for name in ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size)
    except Exception:
        return ImageFont.load_default()


# -------------------------------------------------------------------- main
def main():
    os.makedirs(OUTDIR, exist_ok=True)
    os.makedirs(TOOLS_DIR, exist_ok=True)

    im = Image.open(SRC)
    rgb = np.asarray(im.convert("RGB"), dtype=np.uint8)
    h, w = rgb.shape[:2]
    print("source: %s  %dx%d" % (os.path.basename(SRC), w, h))

    alpha, fg, bg = build_alpha(rgb)
    print("background pixels: %d (%.2f%%)   foreground: %d (%.2f%%)"
          % (bg.sum(), 100.0 * bg.mean(), fg.sum(), 100.0 * fg.mean()))

    # ---- split into views via x projection of the foreground mask ----------
    col = fg.sum(axis=0)
    occupied = col > 0
    runs = []
    x = 0
    while x < w:
        if occupied[x]:
            s = x
            while x < w and occupied[x]:
                x += 1
            runs.append((s, x - 1))
        else:
            x += 1
    # drop tiny specks (JPEG noise) - a view is > 50px wide
    runs = [r for r in runs if r[1] - r[0] + 1 >= 50]
    print("column runs of non-background content: %s" % (runs,))
    assert len(runs) == 3, "expected 3 views, found %d" % len(runs)

    names = ["front", "side", "back"]
    report = []
    views = {}
    for name, (ra, rb) in zip(names, runs):
        band = np.zeros_like(fg)
        band[:, ra:rb + 1] = True
        m = fg & band
        labels, sizes = label_components(m)
        # drop 1-2px JPEG speckles so each view is a single connected silhouette
        sz = np.asarray(sizes, dtype=np.int64)
        keep = np.zeros(len(sizes), dtype=bool)
        keep[1:] = sz[1:] >= MIN_SPECK
        n_before = len([s for s in sizes[1:] if s > 0])
        dropped = [sizes[i] for i in range(1, len(sizes)) if not keep[i]]
        if dropped:
            # remove ONLY the speck pixels (never touch other views' alpha)
            removed = (labels > 0) & ~keep[labels]
            alpha[removed] = 0
            m = m & ~removed
            labels, sizes = label_components(m)
        order = sorted(range(1, len(sizes)), key=lambda i: -sizes[i])
        ncomp = len([s for s in sizes[1:] if s > 0])
        tiny = dropped
        print("      dropped %d speck component(s) %s -> %d component(s) remain"
              % (len(dropped), dropped, ncomp))
        box = bbox_of(m)
        y0, y1 = np.nonzero(m)[0].min(), np.nonzero(m)[0].max()
        print("%-5s cols %d..%d  bbox %s  components %d  sizes(top5) %s  tiny(<50px) %d"
              % (name, ra, rb, box, ncomp, [sizes[i] for i in order[:5]], len(tiny)))
        rgba = crop_rgba(rgb, alpha, box)
        views[name] = dict(rgba=rgba, box=box, mask=m, labels=labels, sizes=sizes,
                           ncomp=ncomp, tiny=tiny)
        out = os.path.join(OUTDIR, "fishmaid_%s.png" % name)
        save_rgba(out, rgba)
        report.append(("fishmaid_%s.png" % name, rgba.shape[1], rgba.shape[0],
                       alpha_ratio(rgba), ncomp))

    # ---- extra crops from the FRONT view ----------------------------------
    fb = views["front"]
    x0, y0, x1, y1 = fb["box"]
    fh = y1 - y0 + 1
    for label, frac in (("bust", 0.45), ("head", 0.32)):
        cut = y0 + max(1, int(round(fh * frac)))
        band = np.zeros_like(fg)
        band[y0:cut + 1, x0:x1 + 1] = True
        m = fb["mask"] & band
        box = bbox_of(m)
        rgba = crop_rgba(rgb, alpha, box)
        out = os.path.join(OUTDIR, "fishmaid_%s.png" % label)
        save_rgba(out, rgba)
        labels, sizes = label_components(m)
        ncomp = len([s for s in sizes[1:] if s > 0])
        print("front %-4s rows %d..%d (%.0f%% of %d) bbox %s -> %dx%d"
              % (label, y0, cut, frac * 100, fh, box, rgba.shape[1], rgba.shape[0]))
        report.append(("fishmaid_%s.png" % label, rgba.shape[1], rgba.shape[0],
                       alpha_ratio(rgba), ncomp))

    # ---- verification table ----------------------------------------------
    print("\n%-24s %6s %6s %8s %6s %s" % ("file", "w", "h", "alpha>10%", "comps", "check"))
    ok = True
    for fname, cw, ch, ratio, ncomp in report:
        if fname.startswith(("fishmaid_front", "fishmaid_side", "fishmaid_back")):
            good = 15.0 <= ratio <= 75.0
            ok = ok and good
            chk = "OK" if good else "OUT OF RANGE"
        else:
            chk = "OK"
        print("%-24s %6d %6d %7.2f%% %6d %s" % (fname, cw, ch, ratio, ncomp, chk))
    print("full-body alpha-ratio range check (15%%..75%%): %s" % ("PASS" if ok else "FAIL"))

    # ---- contact sheet ----------------------------------------------------
    items = [("fishmaid_front.png", views["front"]["rgba"]),
             ("fishmaid_side.png", views["side"]["rgba"]),
             ("fishmaid_back.png", views["back"]["rgba"])]
    extras = []
    for label in ("bust", "head"):
        p = os.path.join(OUTDIR, "fishmaid_%s.png" % label)
        extras.append(("fishmaid_%s.png" % label,
                       np.asarray(Image.open(p).convert("RGBA"))))

    f_lbl = font(17)
    f_ttl = font(22)
    row1_h = max(a.shape[0] for _, a in items)
    row2_h = max(a.shape[0] for _, a in extras)
    gap = 18
    top = 46
    sheet_h = top + row1_h + 34 + gap + row2_h + 30 + 34
    sheet = Image.new("RGB", (SHEET_W, sheet_h), DARK_BG)

    def blit(row_imgs, y, avail_w):
        total = sum(a.shape[1] for _, a in row_imgs) + gap * (len(row_imgs) - 1)
        scale = min(1.0, (avail_w - gap * (len(row_imgs) + 1)) / float(total))
        x = gap
        for name, a in row_imgs:
            img = Image.fromarray(a, "RGBA")
            if scale < 1.0:
                img = img.resize((max(1, int(img.width * scale)),
                                  max(1, int(img.height * scale))), Image.LANCZOS)
            sheet.paste(img, (x, y), img)
            d = ImageDraw.Draw(sheet)
            tw = d.textlength(name, font=f_lbl)
            d.text((x + (img.width - tw) / 2.0, y + img.height + 4), name,
                   font=f_lbl, fill=(210, 230, 210))
            x += img.width + gap
        return x

    d = ImageDraw.Draw(sheet)
    d.text((gap, 12), "fishmaid cutouts  -  composited over #101810  -  1px feathered alpha",
           font=f_ttl, fill=(230, 245, 230))
    y1b = top
    blit(items, y1b, SHEET_W)
    y2b = y1b + row1_h + 34 + gap
    blit(extras, y2b, SHEET_W)
    d.line([(0, y2b - 20), (SHEET_W, y2b - 20)], fill=(60, 80, 60), width=1)

    sheet_path = os.path.join(OUTDIR, "_contact_sheet.png")
    sheet.save(sheet_path, "PNG", optimize=True)
    print("\ncontact sheet: %s  %dx%d" % (sheet_path, sheet.width, sheet.height))
    print("done.")


if __name__ == "__main__":
    main()
