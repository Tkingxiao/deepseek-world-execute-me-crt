# gen1-terminal-mv — the first build

The **earlier generation**: a beat-synced 1080p music video staged as a *zoned* CRT terminal.
Five fixed regions — HUD / STAGE / PANEL / LOG / STATUS — sit inside the glass; lyrics scroll
through the LOG band as terminal output; a transparent character illustration is cut out,
phosphor-tinted in four colours and composited into the tube; mathematical figures are
pre-rendered with Manim and packed into sprite sheets, with a Canvas fallback if Manim is
absent.

Its difference from generation 2 is one sentence: **generation 1 puts a CRT inside the frame;
generation 2 makes the CRT the entire frame.**

Design documents, storyboards, render output, audio and character art from this build are not
published — only the code. See the [repository README](../README.md) for the licence situation:
this generation's source also embeds the example song's lyrics as strings.

---

## Layout

| Path | What it holds |
|---|---|
| [`src/`](src/) | the composition: `mv-core.js` (frame loop and CRT passes), `mv-terminal.js` (terminal chrome), `mv-scenes.js` (the film), `mv-math.js` (math figure drawing), `mv-images.js`, `mv-sheet-meta.js` |
| [`tools/`](tools/) | the pipeline: audio analysis, timeline construction, character prep, the renderer and the two verifiers |
| [`tools/lib/paths.py`](tools/lib/paths.py) · [`tools/lib/env.cjs`](tools/lib/env.cjs) · [`tools/lib/ffmpeg.cjs`](tools/lib/ffmpeg.cjs) | **the only place that knows where anything lives.** Every external path resolves here, each with an environment override — see the root README's portability table |
| [`manim/`](manim/) | the Manim scenes and the collect/verify step that turns them into sprite sheets |
| `input/` | **not in the repository** — your song, lyric file and character art |
| `assets/`, `build/`, `render/`, `data/` | **generated, not in the repository** |

## Run it

```bash
npm install playwright                   # headless rendering, reusing system Chrome

# Put your sources in input/ (or point the MV_* variables elsewhere):
#   input/song.mp3                    the master
#   input/lyrics.lrc                  [mm:ss.xx]
#   input/character.png               RGBA with a real alpha channel — required

python tools/prep-fishmaid.py            # cut out + tint the character (green/cyan/amber/white)
python tools/pack-math.py                # (optional) Manim frames -> sprite sheets; falls back to Canvas
node tools/decode-audio.mjs              # mp3 -> raw PCM
node tools/analyze-audio.mjs             # autocorrelation + phase scan -> BPM / offset
node tools/beat-energy.mjs               # per-beat onset and low/mid/high band energy
node tools/build-timeline.mjs            # LRC + beat grid -> data/timeline.json
node tools/gen-data.cjs                  # -> src/data.js        (generated, not committed)
node tools/gen-sheet-meta.cjs            # -> src/mv-sheet-meta.js (generated, not committed)
node tools/render-all.cjs                # 8 parallel workers -> concat -> mux -> render/
node tools/verify-render.cjs             # objective QC: duration / frame count / loudness
node tools/verify-beat-sync.cjs          # beat modulation, with a shifted-grid control
```

Requires Node 20+ and a **full** FFmpeg — Playwright's bundled build is decode-only. The
resolver in [`tools/lib/ffmpeg.cjs`](tools/lib/ffmpeg.cjs) deliberately rejects it and says why,
rather than letting it fail later with a misleading "invalid data" error on a valid MP3.

To open `index.html` in a browser you need `src/data.js` and `src/mv-sheet-meta.js`, which the
steps above generate.

## Character pipeline

Two entry points, depending on what you have:

- **[`tools/prep-fishmaid.py`](tools/prep-fishmaid.py)** — you already have a PNG with a clean
  alpha channel. Trims, closes pinholes, feathers once, tints four ways.
- **[`tools/extract_character.py`](tools/extract_character.py)** — you have a three-view sheet
  on a white background. Flood-fills the background from the borders (so enclosed white lace
  survives as opaque), feathers the anti-aliased fringe, splits the views, and derives bust and
  head crops.

Both share the same tinting maths and the same trap: the alpha channel must be **normalised**
before it is raised to a power. `255 ** 0.75 == 63.8`, so an un-normalised gamma caps the
character at 25 % opacity and it appears to vanish. The scripts assert on it.

## Verification

```bash
node tools/verify-render.cjs [file]      # ffprobe: 1920x1080, 30/1, duration == source audio,
                                         # frame count, and loudness delta vs the master
node tools/verify-beat-sync.cjs [file]   # per-frame luma of the tube area, Goertzel at the tempo,
                                         # on-beat vs off-beat, against a half-beat-shifted control
```

`verify-beat-sync.cjs` is the one that actually proves sync: a continuous CRT film has no hard
cuts, so a scene-change metric returns zero and proves nothing. The shifted-grid control is
what makes the test meaningful — without it, any gently varying brightness would pass.

Diagnostics that read their input from `build/`: `tools/contact-sheet.py` (preview grid),
`tools/sheet-dbg.py`, `tools/detect-eyes.py`, `tools/prep-eyes.py`, `tools/tint-check.py`,
`tools/storm-measure.py`, `tools/octave_test.py`, `tools/pipe-test.cjs` (a 45-frame
PNG-into-ffmpeg smoke test).
