# Layout and legibility

Most revision requests on a project like this are layout collisions and unreadable text.
Design so they cannot happen.

## 1. Text must be a separate layer

The single most important rule. Draw text **after** every blur, tear and chromatic pass.

Why: bloom is a blur of the whole frame. Anything drawn before it — including text — gets
smeared. At low glitch levels it looks "soft"; at high levels the words become light
blobs and the viewer says **"the text is unreadable"**.

Implementation: route **all** text into a second canvas. Do not rely on remembering to
change each call site — intercept `fillText` itself:

```js
function hookFillText(ctx) {
  const orig = ctx.fillText.bind(ctx);
  ctx.fillText = function (text, x, y, mw) {
    if (!INK_MODE) return orig(text, x, y, mw);
    const g = inkCtx();
    g.save();
    g.font = ctx.font; g.textAlign = ctx.textAlign; g.textBaseline = ctx.textBaseline;
    g.globalAlpha = ctx.globalAlpha; g.fillStyle = ctx.fillStyle;
    g.shadowColor = ctx.shadowColor; g.shadowBlur = ctx.shadowBlur;
    g.fillText(text, x, y, mw);
    g.restore();
  };
}
```

Also route the helper (`glowText`) directly, and keep `IN inkCtx.font = ctx.font` in
sync inside `mono()`/`monoCJK()` — otherwise the ink layer measures with a stale font.

Then composite the ink layer near the end:

```js
ctx.globalAlpha = 0.30; ctx.filter = "blur(6px)";
ctx.drawImage(ink, 0, 0);          // a little glow, so it still reads as phosphor
ctx.filter = "none";
ctx.globalAlpha = 1;
ctx.drawImage(ink, 0, 0);          // the crisp pass
// then ONE scanline pass over the text so it belongs to the tube
```

Trade-off, state it honestly: text in the ink layer no longer tears with the picture.
Legibility wins. If the user wants torn text, give them a flag.

## 2. Fixed zones

Define zones once and make every scene respect them:

```js
const R_LEFT  = { x: tube.x + 30,       y: tube.y + 76,  w: tube.w * 0.50, h: 452 };
const R_LOG   = { x: tube.x + 30,       y: tube.y + 548, w: tube.w * 0.48, h: tube.h - 588 };
const R_RIGHT = { x: tube.x + tube.w * 0.535, y: tube.y + 96, w: tube.w * 0.435, h: tube.h - 250 };
```

- **left upper** — character or the central equation
- **left lower** — the lyric log
- **right** — diagrams, data, code
- **status band** — the thin strip between the HUD line and the top of every zone: the only
  place a one-line footnote can go without risking a collision

## 3. Three techniques that make collisions structurally impossible

**(a) Bounded elements.** Give any list a hard bottom limit and stop drawing past it:

```js
for (let i = 0; i < rows.length; i++) {
  const y = startY + i * 32;
  if (y > limit) break;                    // never enter the zone below
}
```

**(b) Clearing the tube.** For a genuinely important full-width moment (a diagnostic
takeover, a giant word), wipe the tube first. Then nothing can overlap it:

```js
roundRect(tube); ctx.fillStyle = "#030a06"; ctx.fill();
```

**(c) Carving out a protected band.** When a background layer is busy, skip the region the
foreground needs:

```js
const cy = tube.y + tube.h * 0.42;
if (Math.abs(y - cy) < 96) continue;       // keep the big counter clear
```

## 4. The accumulation trap

A decorative background whose element count **grows with elapsed time** will eventually
bury the foreground. This happened with a storm of repeated words: the row count was
`floor(elapsed / halfBeat)`, so by the end of a 15 s section ~330 bright tokens covered the
tube and hid the counter they were meant to frame.

Fix: make it a **fixed-size band that scrolls**. Per-cell blinking can stay random, but the
*expected* number of lit cells per row is constant, so total ink never grows:

```js
const ROWS = 8;
const scroll = (elapsed * speed) % rowH;
for (let r = 0; r <= ROWS + 1; r++) {
  const y = top + r * rowH - scroll;
  if (y < top - rowH || y > bottom) continue;
  // ... draw the row
}
```

Measure it (see `verification.md`) to prove density is bounded.

## 5. Legible lyric logs

- The current line: larger, brighter, with a blinking block cursor and a glowing left bar.
- Previous lines: **alpha floor around 0.55**, and a *light* glow. An aggressive glow on
  every row turns the column into a smear — a real revision request was literally
  "reduce the glow, I can't read the lyrics".
- Colour: dim the history by moving to a mid green, not by fading alpha alone.
- Cap visible rows (6–8) and age them out.

## 6. Text over images

Any text drawn over artwork needs a plate:

```js
ctx.fillStyle = "rgba(20,0,4,0.55)";
ctx.fillRect(x - 10, y - size * 0.82, w + 20, size * 1.06);
```

## 7. Per-row collision audit

Before every render, walk the section list and check the y-extents of every element you
draw in each zone. It takes a minute and catches the whole class of bug. If you can, make
it a script that prints a table of element extents per scene.

## 8. Non-Latin text

If the design uses a second language, register a real CJK font. Latin monospace fonts fall
back to tofu boxes:

```js
const FONT_CJK = '"MS Gothic","Yu Gothic",SimHei,"Microsoft YaHei",sans-serif';
```

Ink-layer routing must emit both fonts to the ink context or measurements drift.
