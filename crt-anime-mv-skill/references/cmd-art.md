# Terminal character art (banners, frames, image→ASCII)

This skill's world is a terminal, so **type is a material, not a caption**. This module is
about making words look like they came out of the box: banner faces, framed blocks,
image-to-ASCII conversion, and the glyph palette to draw with — and about the four ways that
terminal art quietly breaks a CRT render.

Upstream is the **`ascii-art` skill from Hermes Agent** ([NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent),
`optional-skills/creative/ascii-art` — <https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/ascii-art>,
v4.0.0, MIT, © 2025 Nous Research, author 0xbyt4, Hermes Agent). It is a *tool catalog*, and
it stays upstream — this module records what it means for this pipeline and pins the decisions
that came from a broken render. Install it; do not copy it in:

```bash
npx skills add NousResearch/hermes-agent --skill ascii-art -l    # what it offers
npx skills add NousResearch/hermes-agent --skill ascii-art       # install it
```

## Where terminal art belongs in this composition

| Moment | Use | Zone (`SKILL.md` § Layout zones) |
|---|---|---|
| Title / cold open | FIGlet-style banner face | full-width, after clearing the tube |
| Section titles ("PHASE 02 // SYNC") | compact banner or `boxes` frame | HUD band |
| A lyric that is *shouted* | one-shot block-inverted banner row | lyric log |
| The character resolving out of the glass | image→ASCII of the cutout | character zone |
| Decor inside the code rain | box-drawing / block-element glyphs | diagrams zone |
| Credits | `boxes` framed block | full-width tail |

Everything that is *readable words* goes to the **ink layer** (non-negotiable #3). A banner is
text, so it never gets bloom, tearing or chromatic split — give it the light glow and the
scanline pass only, or you get an unreadable 3D word instead of a title card.

## Tool map

All local CLI or free endpoints, **no API keys**.

| Tool | What it's for | Local? | Notes for this pipeline |
|---|---|---|---|
| `pyfiglet` | text → banner face, 571 FIGlet fonts | yes (`pip`) | primary; `-w` bounds the width |
| `asciified` REST | same, 250+ fonts, zero install | **network** | prototype only — never during a render |
| `cowsay` | message in a bubble + creature | yes | joke beat at most; the bubble is fixed geometry |
| `boxes` | decorative frame around any text, 70+ designs | yes | `-a c` centers; good for section headers |
| `toilet` | banner faces **with ANSI color** | yes | color is stripped — see trap 1 |
| `ascii-image-converter` | image → ASCII (color/braille/negative) | yes | the image→ASCII route for the character |
| `jp2a` | JPEG → ASCII, `--colors` | yes | fallback when Go/snap is unavailable |
| `ascii.co.uk/art/<subject>` | pre-made art | network | third-party; see trap 4 |
| `qrenco.de`, `wttr.in` | QR / weather as ASCII | network | easter eggs, baked in advance |

Font choices that survive this tube: `slant` and `big` for wide titles, `doom` and `block` for
short (1–8 char) high-impact words, `small` / `mini` when the line must fit the HUD band,
`cyberlarge` and `3-d` for the one dramatic moment. Short text wants a detailed font; long text
wants a compact one — that is the whole selection rule.

```bash
python -m pyfiglet "WORLD.EXECUTE" -f slant -w 60
python -m pyfiglet --list_fonts
echo "PHASE 02 // SYNC" | boxes -d stone -a c
ascii-image-converter character.png -d 40,20 -n    # dimensions first, color off
```

## Four traps that cost real time

### 1. ANSI color does not survive — and must not be asked to

`toilet --gay`, `ascii-image-converter -C` and `jp2a --colors` emit **escape sequences**, not
pixels. They are correct on a console and meaningless inside a frame buffer you are compositing
yourself. Worse, a stray escape sequence reaches `fillText` as literal `^[` garbage.

Strip escapes at load, and re-derive colour from the phosphor palette instead
(`character-pipeline.md` owns the tinting):

```python
import re
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
rows = [ANSI.sub("", line) for line in banner_text.splitlines()]
```

Glyphs in, colour from `crt-visual-system.md`. That is the correct division of labour.

### 2. The tube is the width budget, not the terminal

The picture tube interior is 1276 px wide (`crt-visual-system.md`). A FIGlet face generated for
an 80-column console is wider than the tube at the lyric font size, and a banner that overflows
is clipped silently — you find out at the frame check, not in the log.

Generate to the zone, then assert it:

```python
cols_in_tube = int(SC.w / MONO_W_PX)          # usable character columns
assert all(len(r) <= cols_in_tube for r in rows), [len(r) for r in rows]
```

If it fails, regenerate narrower (`pyfiglet -w`, or `ascii-image-converter -d W,H`) — do not
shrink the font, or the banner stops matching the surrounding lyric type.

### 3. Bake every glyph before the render (determinism #6)

`pyfiglet`, `cowsay` and `boxes` are pure functions of their input: deterministic, so safe.
The HTTP tools (`asciified`, `qrenco.de`, `wttr.in`, `ascii.co.uk`) are **not** — they can rate
limit, change output, or hang, and a network call inside a per-frame path turns a parallel chunk
render into a lottery.

So pre-bake: generate once, write to `assets/banners/*.txt`, and have the composition load
static text. `timeline.json` may reference a baked banner; nothing in the render path may fetch
a URL.

```bash
python -m pyfiglet "WORLD.EXECUTE" -f slant -w 60 > assets/banners/title.txt
```

### 4. Pre-made web art is someone's drawing

`ascii.co.uk` art is authored by people. Upstream asks that signatures and initials be
preserved; treat it the same way you treat the character illustration — check the licence
before it goes into a video that ships, and keep it out of the deliverable if it cannot be
cleared. Use it for layout previews and internal timing.

Also validate that the glyphs actually render. Box-drawing (`╔═║┌─│┼╭╮╰╯`), block elements
(`░▒▓█▄▀▌▐`) and the geometric set (`◆●◉■▲△★✦⬢`) are not in every monospace font. At init,
rasterize each character once and reject the ones that come back blank or as tofu; a missing
glyph appears only in the frames nobody sampled.

Max widths worth respecting when hand-authoring glyphs: ~60 columns for a banner, ~15 lines for
a banner block, ~25 for a scene — beyond that the shape stops reading as a picture.

## Decision flow

1. Words as a big face → `pyfiglet`; if it cannot be installed, `asciified` **at bake time**
2. A message in a bubble for one joke beat → `cowsay`
3. Frame it → `boxes` (composes with either: `pyfiglet … | boxes -d stone`)
4. Colour / texture on the face → do it with the phosphor palette, not with ANSI
5. A picture made of characters → `ascii-image-converter`, dimensions set first
6. A specific object (dragon, rocket, skull) → `ascii.co.uk`, licence-checked
7. None of the above → hand-author from the Unicode palette, and validate the glyphs

## Done when

- every banner row fits its zone's column budget, asserted, not eyeballed
- no escape sequences anywhere in the loaded text
- every glyph in every baked asset rasterizes in the render font (zero tofu)
- the text is on the ink layer and still legible after the scanline pass
- all network-derived art exists as a file on disk before the first frame renders
