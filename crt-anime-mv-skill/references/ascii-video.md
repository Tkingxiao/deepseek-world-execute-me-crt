# ASCII video (the general medium) and how it relates to this skill

**`ascii-video`** is a production pipeline for ASCII-art video in general: any input (video,
audio, images, nothing at all) → coloured character video, MP4 / GIF / PNG sequence, no GPU.
This skill is one *specific aesthetic* built with the same primitives — a single CRT tube,
lyrics as terminal log output, cuts locked to measured beats.

## Provenance of this module

Upstream is the **`ascii-video` skill from Hermes Agent** ([NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent),
`skills/creative/ascii-video` — <https://github.com/NousResearch/hermes-agent/tree/main/skills/creative/ascii-video>,
v1.0.0, MIT, © 2025 Nous Research, author SHL0MS, Hermes Agent). It carries eight of its own
reference modules — architecture, composition, effects, inputs, scenes, optimization, plus
`shaders.md` and `troubleshooting.md`. Install them and read them at the source:

```bash
npx skills add NousResearch/hermes-agent --skill ascii-video -l    # what it offers
npx skills add NousResearch/hermes-agent --skill ascii-video       # install it
```

**This module is a comparison written around that skill, not a substitute for it.** It quotes
and adapts small passages from upstream — the `tonemap` function, the per-layer grid-density
table, the gamma/`canvas.mean()` thresholds and the per-frame performance budget — because the
numbers are the point. Those passages remain © 2025 Nous Research under the MIT licence; any
that were rewritten were rewritten for this pipeline's vocabulary. Everything else here, and
every measurement attributed to *this* skill, is original to this repository.

What follows is the comparison you actually need to make the call, and the four things worth
stealing either way.

## Which one owns the job

| Keep `crt-anime-mv` (this skill) | Switch to `ascii-video` |
|---|---|
| The world is one CRT terminal; lyrics are log output | The world is characters, but not a tube — tunnel, voronoi, aurora, mandala |
| Beat-locked anime MV from song + LRC + character art | Audio-reactive generative visualizer with no lyric track |
| Text must stay crisp; two-layer composition is the point | Text is minor or absent; the picture *is* the density |
| 1920x1080 30 fps H.264 + the original master | Portrait 1080x1920 / square 1080x1080, or a GIF deliverable (640x360 @ 15 fps) |
| Verification must prove musical sync | Footage→ASCII recreation of existing video, or pure procedural animation |

They compose, too: a CRT MV can borrow `ascii-video`'s value-field effects for the picture
layer and keep this skill's ink layer and beat grid untouched.

## Shared shape, different guarantees

`ascii-video`'s six stages map almost one-to-one onto this pipeline:

```
INPUT → ANALYZE → SCENE_FN → TONEMAP → SHADE → ENCODE
  │        │          │          │        │       └─ our steps 8–9 (render-pipeline.md)
  │        │          │          │        └─ our CRT post-processing (crt-visual-system.md)
  │        │          │          └─ adaptive tonemap — see below
  │        │          └─ per-scene function returning uint8 H,W,3 canvas
  │        └─ spectral flux → binary beat flag   ◄── the important difference
  └─ video / audio / image / nothing
```

**Its analysis is weaker than ours, on purpose.** Upstream detects beats with
`scipy.signal.find_peaks` on a smoothed spectral-flux envelope and emits a *binary onset flag
per frame*; it estimates no tempo, has no phase scan, no drift proof, and its synthetic mode is
literally `bpm=120`. That is fine for a generative visualizer and disqualifying for a lyric
video, where a cut that walks off the voice is the failure mode.

So: never substitute its analyzer for ours. Steps 1–5 of `SKILL.md` (tempo scan, phase lock,
per-beat energy table, LRC snapping) are what feed the timeline, exactly as
`beat-and-timeline.md` specifies. Non-negotiable #1 is not negotiable by another skill's
defaults.

Its `synthetic_features` is still useful in one place: as the **shifted-grid control** in
`verification.md` §5, since it gives you a grid you *know* is wrong.

## Four things worth stealing

### 1. Adaptive tonemap instead of linear gain

This is upstream's #1 visual rule, and it is the same *family* of bug as our non-negotiable #4
(`255 ** 0.75 == 63.8`). Multiplying an ASCII frame brightens nothing and clips everything.
Upstream ships the function below in its `SKILL.md` (MIT, © 2025 Nous Research); it is
reproduced here unchanged apart from the two trailing comments, which are ours:

```python
def tonemap(canvas, gamma=0.75):
    f = canvas.astype(np.float32)
    lo, hi = np.percentile(f[::4, ::4], [1, 99.5])   # our note: subsampled percentiles, cheap
    if hi - lo < 10: hi = lo + 10                    # our note: flat-frame guard, never /~0
    f = np.clip((f - lo) / (hi - lo), 0, 1) ** gamma
    return (f * 255).astype(np.uint8)
```

Order matters: `scene_fn → tonemap → feedback → shaders → ffmpeg`. Per-scene gamma, not one
global: 0.75 default, ~0.85 already-bright, ~0.55 solarize, ~0.50 posterize. Gate with
`canvas.mean() > 8` on sampled frames — a dark frame that *looks* fine in a thumbnail is a
black run in the film (our verification calls the same thing out).

### 2. `screen`, not `overlay`, for dark phosphor material

`overlay` darkens when the base is below 0.5, so on a near-black tube it multiplies twice:
`2 * 0.12 * 0.12 = 0.03`. A 12 %-grey code layer becomes 3 %, i.e. invisible. Upstream's fix —
use `screen` for anything dark — is exactly what our bloom pass needs, and the same trap
awaited in `blend_canvas` form: additive/screen brighten, multiply/darken, `colordodge` and
`linearlight` blow out unless you drop opacity to 0.3–0.5.

Its `blend_canvas(base, top, mode, opacity)` is a clean 20-mode pixel stack worth mirroring;
keep it *after* the tonemap so the layers composite in normalised space.

### 3. Per-layer grid density

`ascii-video` renders several character grids per frame instead of one. The measurements below
are upstream's (its `references/architecture.md`); the right-hand column is our reading of
them for this skill. At 1920x1080:

| Key | Font px | Grid (cols×rows) | Reads as |
|---|---|---|---|
| `xs` | 8 | 400×108 | dense data field — the code rain |
| `sm` | 10 | 320×83 | rain, starfields |
| `md` | 16 | 192×56 | balanced default |
| `lg` | 20 | 160×45 | **lyrics: readable at 1080p** |
| `xl` | 24 | 137×37 | titles, short quotes |
| `xxl` | 40 | 80×22 | giant one-word moments |

This is the disciplined version of "the tube is full of characters", and it is directly
compatible with our fixed zones: pick `lg` for the lyric log, and never let a denser layer
grow over it. It also gives the column budget that `cmd-art.md` asserts banners against.

### 4. Audio-vs-visual beat cross-check

Upstream keeps two independent beat sources and compares them:
`extract_beat_timestamps` (audio flux) and `extract_visual_beat_timestamps` (brightness jumps
above a threshold in the rendered picture), joined by
`sync_report(audio, visual, tolerance_ms=50)`. That is a good extra gate on top of
`verification.md` §5: the luma/Goertzel test proves modulation *at* the tempo; this proves the
visible flashes land *on* the actual onsets within ~50 ms. Cheap, objective, and it catches the
half-beat and double-beat errors the spectral test can score as "pulsing".

## Where it conflicts with this skill

- **Frame rate.** Its production profile is 1920x1080 @ **24** fps, CRF 20; this skill is 30/1
  and `ffprobe` asserts it. Borrow the technique, keep 30.
- **"Vary everything per section."** Its creative standard demands a different background
  effect, palette, colour strategy and shader intensity per scene. Our zones and ink layer are
  deliberately invariant. Resolve it as: **vary texture, keep structure.** Palette, glyph set,
  effect and shader depth may change per phase; the tube geometry, zone map and text layer may
  not.
- **Its QA is a frame check, not a proof.** "Render single frames at key timestamps, check
  `canvas.mean()`, is it visually coherent?" is the right *iteration* loop and the wrong
  *acceptance* gate. Non-negotiable #7 still owns acceptance: duration, exact frame count,
  loudness delta ≤ 0.5 LU, true peak < 1 dBFS, beat modulation against the shifted control.
- **`SCENE_FN` reads `t`.** So must ours — no wall clock, no `Math.random()`, no
  `Date.now()`; seed any PRNG from the frame index (non-negotiable #6). Its per-clip parallel
  rendering only reproduces if the frames do.

## Environment traps both pipelines share

- **ffmpeg pipe deadlock.** Never give a long-running ffmpeg `stderr=subprocess.PIPE`; the
  buffer fills at 64 KB and the render hangs with no message. Redirect stderr to a file and
  read it after. (Also: close `stdin`, then `wait()`.)
- **Cell height from metrics, not bbox.** On macOS Pillow, `textbbox()` returns the wrong
  glyph height for a grid cell. Use `font.getmetrics()` → `cell_height = ascent + descent`,
  or every row drifts a sub-pixel and the whole tube shimmers.
- **Not every glyph rasterizes.** Validate the palette once at init by rendering each char and
  rejecting blanks — the same check `cmd-art.md` demands.
- **A stripped ffmpeg is not ffmpeg.** Playwright's bundled build is decode-only: no
  `libx264`, no `aac`, no ffprobe. Both this path and HyperFrames need a real install
  (non-negotiable #8).
- **Perf budget, for planning a render.** Upstream's measured breakdown (`SKILL.md`,
  Performance Targets): character rendering is the bottleneck at 80–150 ms of a
  ~100–200 ms/frame total; effects are 2–15 ms, shaders 5–25 ms. Parallelism buys wall
  clock, not per-frame determinism.

## Done when

You have said, in one sentence, which of the two skills owns the deliverable — and if the
answer is `ascii-video`, the beat grid, the ink layer and `verification.md` came with it
anyway.
