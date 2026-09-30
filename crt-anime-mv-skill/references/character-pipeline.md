# Character pipeline

Turn one character illustration into phosphor-tinted sprites that sit **inside** the tube.

## 1. Input requirements

- **RGBA PNG with a real alpha channel.** An opaque illustration on a white background is
  not usable: keying it out reliably is hard, and anything you miss shows as a white halo.
  If the user supplies an opaque image, say so and ask for a cutout (or key it very
  carefully and show them the result).
- A front-facing full-body view is ideal. Extra views are a bonus, not a requirement —
  other angles can be derived.

## 2. Trim and prepare alpha

```python
im = Image.open(src).convert("RGBA")
bb = im.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox()
im = im.crop(bb)
```

Then close small pinholes and soften the edge **once**:

```python
a = np.asarray(im.getchannel("A")).astype(np.float32)
filled = a > 40
a2 = np.where(filled | (box3(filled.astype(np.float32)) > 0.55), np.maximum(a, 255.0), a)
a2 = np.clip(box3(np.clip(a2, 0, 255)), 0, 255)     # single feather pass
```

**Feather exactly once.** Applying a blur or `max()` repeatedly fattens the silhouette a
little more each time — the headdress and hair visibly swell.

To kill a pale halo, treat near-white pixels with tolerance rather than keying all white:

```python
whiteish = (mn > 205) & ((mx - mn) < 22)
alpha = np.where(whiteish, alpha * 0.10, alpha)
```

This preserves genuinely white elements (lace, ribbons, stockings).

## 3. The alpha maths that must be normalised

The classic bug. This looks harmless and is catastrophic:

```python
a2 = np.clip(a ** 0.75, 0, 255)      # WRONG: a is 0..255
```

`255 ** 0.75 == 63.8`. The character is capped at 25% opacity and "disappears" into the
background — the user will describe it as "the character is unreadable".

Always normalise first:

```python
al = a.point(lambda v: min(255, int(255 * (v / 255.0) ** 0.60)))    # CORRECT
```

**Assert on it.** Cheap insurance against ever shipping the bug again:

```python
assert alpha_max == 255, "ALPHA CRUSHED - check the normalisation"
```

## 4. Phosphor tinting

Convert the artwork to a single-phosphor image while keeping luminance structure:

```python
FLOOR, GAMMA = 0.16, 0.70
TARGETS = {
    "green": ((0.22, 1.00, 0.53), 0.92),
    "cyan":  ((0.43, 0.94, 1.00), 0.88),
    "amber": ((1.00, 0.72, 0.42), 0.66),
    "white": ((0.91, 1.00, 0.95), 0.84),
}

lum = Image.merge("RGB", (r, g, b)).convert("L")
lut = [min(255, int(255.0 * gain * (FLOOR + (1 - FLOOR) * (v/255.0) ** GAMMA)))
       for v in range(256)]
tr = lum.point(lut).point(lambda v: int(v * rgb[0]))
# ... same for g, b
```

- **FLOOR** lifts the darkest areas so the character is not a black silhouette. Without a
  floor, dark hair and dark clothing vanish into the tube.
- **GAMMA < 1** brightens midtones, matching how phosphor saturates.
- **gain** is per-tint, because amber at the same gain as green looks blown out.

A flatter, more evenly-shaded illustration needs a **higher floor and gentler gamma** than
a heavily-shaded one. If the source changes style, re-check the exposure by rendering a
contact sheet of all four tints and eyeballing it.

## 5. Derive extra views

From a front view you can synthesise plausible companions — be honest that they are
derived, not drawn:

```python
back = front.transpose(Image.FLIP_LEFT_RIGHT)          # mirror
side = front.resize((int(w * 0.62), h), Image.LANCZOS) # horizontal squeeze
```

For a **bust** crop, find the neck from the alpha row profile rather than guessing a
percentage — it must be tight to every character:

```python
rows = (alpha > 40).sum(axis=1)
top = int(np.argmax(rows > 0))
upper = rows[top:top + int(h * 0.45)]
neck = top + int(np.argmin(upper[len(upper)//2:]) + len(upper)//2)
```

## 6. Compositing into the tube

- Draw with `globalCompositeOperation = "lighter"` so the character glows.
- Add two offset ghost copies at low alpha for phosphor bleed.
- Keep her alpha moderate (~0.2–0.5). At full alpha she looks pasted on; the tube's
  scanlines and vignette should read across her.
- Let her **pulse**: offset and scale slightly with the beat.

## 7. When the user supplies an eye close-up

If a dedicated eye sprite is supplied or requested, keep it on its own switch:

```js
const EYE_MODE = "canvas";   // "canvas" | "sprite"
```

so the choice can be flipped without touching the composition, and so a character-art
replacement never silently changes the eyes.

## 8. Reproducible script

Ship the prep script alongside the art. It should read from a fixed input path, write to a
fixed output folder, print a measured report (size, alpha max/mean, coverage %), and
**assert** the invariants. Anything less and a future replacement will silently regress.
