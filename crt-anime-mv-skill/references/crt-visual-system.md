# The CRT visual system

Everything is seen through the glass of one old terminal. The frame is not a screen —
it is **a physical object in a dark room**: a plastic case, a curved tube, a power LED,
two knobs, and a brand plate.

## Draw order

Getting this order wrong is the most common structural mistake.

```
1  the case            (room light, bezel body, black inner mask)
2  tube content        ← picture layer; text is intercepted into the ink layer
3  phosphor bloom      blur the tube content and add it back
4  beat pump           the whole face lifts on each measured onset
5  glitch passes       tear / chromatic split
6  scanlines + grille + grain + vignette   (tube only)
7  glass overlay       reflection gradient, corner highlight, LED, knobs, brand plate
8  full-frame grade    faint green lift, frame scanlines, outer vignette
9  ink layer           ALL TEXT, crisp, on top
```

Steps 2 and 9 are the two-layer split. Steps 1 and 7 must be **separated**: if the bezel is
drawn in one call before the tube, the opaque case wipes the picture.

## Screen geometry

Keep the tube inset from the frame so the case is visible:

```js
const SC = { x: 258, y: 48, w: 1276, h: 902 };   // at 1920x1080
```

Everything drawn inside clips to this rect. Never draw scene content outside it.

## The post-processing passes

**Phosphor bloom.** Blur a copy of the tube content and composite it with `lighter`. Do
this *before* scanlines so the scanlines stay visible on top.

```js
ctx.globalCompositeOperation = "lighter";
ctx.globalAlpha = 0.20 + 0.10 * pulse(t);
ctx.filter = "blur(11px)";
ctx.drawImage(canvas, SC.x, SC.y, W, H, SC.x - 4, SC.y - 4, W + 8, H + 8);
ctx.filter = "none";
```

**Scanlines.** One dark line every 3 px, with the phase rolling slowly:

```js
const roll = Math.floor((t * 26) % 3);
for (let y = SC.y - 3 + roll; y < SC.y + SC.h; y += 3) ctx.fillRect(SC.x, y, SC.w, 1);
```

**Aperture grille.** RGB subpixel stripes at very low alpha (~0.07). Do not overdo it, or
the picture turns muddy.

**Chromatic split.** Offset tinted copies horizontally by 3–18 px, scaled by the glitch
amount. Cheap and hugely effective.

**Tear.** Save a snapshot; for N random horizontal bands, redraw the band shifted
sideways and add a bright 1.5 px line. The count should scale with the glitch level.

**Grain.** Deterministic per-frame noise — seed from `floor(t * 60)` so it never flickers
between renders.

**Vignette.** A radial gradient darkening the tube corners.

## The beat pump

This is what makes the whole picture feel like it is breathing with the music, and it is
worth adding even if the scene already pulses:

```js
const a = pulse(t, 0.28);
ctx.globalAlpha = 0.11 * a;  ctx.fillStyle = phos;
ctx.fillRect(tube);                                  // face lifts
// plus a refresh band travelling down the tube
```

Measure the result afterwards — see `verification.md`.

## Glitch level as a curve, not a constant

Define one function that returns 0..1 for the whole timeline, and drive every degradation
effect from it. Raise it deliberately across the song and pin spikes to specific lyrics:

```js
function glitchLevel(t) {
  let L = 0;
  if (section(t) === "CHORUS")  L = 0.25 + 0.30 * sectionProgress(t);
  if (section(t) === "COLLAPSE") L = 0.25 + 0.60 * sectionProgress(t);
  if (near("Trapped in", 0.5))   L += 0.5;    // spike on the word
  if (near("ISOLATION", 0.6))    L += 0.7;
  return clamp(L, 0, 1);
}
```

Because it is one function, the degradation is a **performance**, not noise.

## Freeze frames as punctuation

Holding a single frame for 3–8 frames on a stressed lyric reads as the machine seizing up.
Implement it as a real hold in the render loop, not as a slow-down.

## Palette

```js
const C = {
  bg:      "#030805",   phos:     "#39ff88",   phosDim:  "#1c7a44",
  cyan:    "#6ef0ff",   cyanDim:  "#1f6f7d",   amber:    "#ffb86b",
  red:     "#ff4d5e",   violet:   "#b98cff",   white:    "#e8fff2",
};
```

**Keep one accent reserved.** If warm amber appears only in the final act, its arrival is
an event. If it appears throughout, it is decoration and means nothing.

## Anti-patterns

- Text drawn in the picture layer → destroyed by bloom. **Always use the ink layer.**
- Bezel drawn before content in one call → picture erased.
- Uniform sine pulses instead of measured onsets → feels mechanical.
- A decorative layer that accumulates with time → eventually buries the foreground.
- Glitch at a constant level → reads as a filter, not as drama.
