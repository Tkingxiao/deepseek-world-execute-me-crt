---
name: crt-anime-mv
description: >
  Produce a 1920x1080 beat-synced anime music video whose entire visual world is an
  old CRT phosphor terminal — green-on-black code, terminal-style lyric output,
  live mathematical diagrams, and an anime character composited out of the glass.
  Covers measuring the real tempo and per-beat energy from the audio, building a
  beat-locked timeline from an LRC file, tinting a transparent character cutout for
  a phosphor palette, separating crisp text from the degrading picture, designing
  glitch/post-processing, deterministic parallel frame rendering, and objective
  verification of sync and output. Also covers rendering the same composition with
  HyperFrames (HTML + CSS + GSAP via the `hyperframes` CLI) instead of Canvas 2D, including
  its FFmpeg/Chrome prerequisites and its `beats` tempo cross-check. Use when the user asks
  for a CRT / retro-terminal music video, a lyric video rendered as terminal output, a
  beat-synced anime MV, a coded-video MV from a song plus character art, or asks to
  build/restyle one — with Claude Code, Codex, or HyperFrames. Also covers the terminal
  character art this world is made of (FIGlet banners, boxes frames, image-to-ASCII,
  glyph palettes and their ANSI/width/determinism traps), and when the general
  `ascii-video` pipeline is the better tool than this one.
category: media
keywords: [music-video, crt, terminal, anime, beat-sync, lyrics, canvas, render, mv, hyperframes, gsap, html-video, ascii, ascii-art, terminal-art]
metadata:
  author: MV Studio
  version: "1.1.0"
license: MIT
---

# CRT Anime Music Video

Build a music video in which **a single old CRT terminal is the entire world**: everything —
code, lyrics, characters, even the "camera" — happens inside the glowing phosphor glass.

This skill encodes a production-proven pipeline. Follow it in order; each step produces
the input the next step needs.

## When to use

Use this skill when the deliverable is:

- a music video whose visual language is a CRT / retrowave / terminal / phosphor screen
- a lyric video where lyrics are rendered as **terminal output**, not subtitles
- an anime-styled MV built from a song plus a character illustration
- any "coded video" MV where the frames are generated programmatically and the cuts are
  locked to the music's measured beat

Do not use it for: talking-head editing, stock-footage montage, or AI text-to-video
generation. It produces code-rendered frames, not generative footage. And if the request is an
ASCII visualizer that is *not* one CRT terminal — a tunnel, a GIF, a portrait clip — that is
`references/ascii-video.md`, not this pipeline.

## Read the right module first

| Need | Read |
|---|---|
| Tempo detection, beat grid, lyric timing, LRC handling | `references/beat-and-timeline.md` |
| The CRT look: bezel, scanlines, bloom, chromatic split, freeze | `references/crt-visual-system.md` |
| Character art, alpha, phosphor tinting | `references/character-pipeline.md` |
| Deterministic frame rendering, parallelism, encoding | `references/render-pipeline.md` |
| Verification: how to prove sync, duration, loudness | `references/verification.md` |
| Layout zones, collision avoidance, text legibility | `references/layout-and-legibility.md` |
| Rendering from HTML + CSS + GSAP with HyperFrames instead of Canvas | `references/hyperframes.md` |
| Terminal character art: banners, frames, image→ASCII, glyph palettes | `references/cmd-art.md` |
| ASCII video as a medium: when the general `ascii-video` pipeline owns the job | `references/ascii-video.md` |

Two render paths produce the same film:

- **Canvas 2D** (default) — the pipeline below. Full per-pixel control of the CRT treatment.
- **HyperFrames** — author the same composition as HTML + DOM + GSAP and let the
  `hyperframes` CLI render it. Read `references/hyperframes.md` for when this is the better
  choice, its hard FFmpeg/Chrome prerequisites, and how its `beats` command cross-checks the
  tempo grid. Every non-negotiable below still applies on that path.

Two more modules cover neighbouring territory, and both document **external** skills rather
than vendoring them: `references/cmd-art.md` (the terminal character art this world is built
from — FIGlet banners, `boxes` frames, image-to-ASCII) and `references/ascii-video.md` (the
general ASCII-video pipeline, and when it should own the job instead of this skill). Both are
MIT and live in [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent); install
them with `npx skills add NousResearch/hermes-agent --skill ascii-art` / `--skill ascii-video`;
neither relaxes a non-negotiable below.

## Non-negotiables

These are the rules that separate a result that works from one that looks broken.
They each come from a real failure.

1. **Measure the tempo; never trust the stated BPM.** The brief's BPM is a hypothesis.
   Confirm it with autocorrelation and a fine phase scan, then verify there is no drift
   across the whole song. `references/beat-and-timeline.md`
2. **Drive motion from per-beat energy, not a uniform sine.** Extract onset strength and
   band energy for every beat; feed those into pulses, flashes and bar heights.
3. **Render text on its own layer, after every blur and glitch pass.** If text is drawn
   with the picture, CRT bloom and tearing destroy it. This is the single most common
   cause of "the words are unreadable". `references/layout-and-legibility.md`
4. **Alpha maths must be normalised.** Never raise a 0–255 channel directly to a power:
   `255 ** 0.75 == 63.8`, so the character becomes 25% opaque and "disappears".
   Always `255 * (v/255) ** gamma`.
5. **Never let a background element grow without bound.** A decorative layer whose
   density increases with elapsed time will eventually bury the foreground.
6. **Render frames from an explicit virtual time function**, never from
   `requestAnimationFrame`. Two runs must hash identically before you trust parallel
   chunking.
7. **Prove the result with measurements**, not impressions. Duration, frame count,
   loudness integrity, and a beat-modulation test. `references/verification.md`
8. **Check the render environment before promising a render.** The HyperFrames path needs a
   real FFmpeg/FFprobe and a working Chrome. Playwright's bundled ffmpeg is a stripped
   decode-only build and cannot encode H.264 — do not prop it up as a substitute.
   `references/hyperframes.md`

## Pipeline

```
song.mp3 + lyrics.lrc + character.png
        │
        ├─ 1  decode audio to raw PCM
        ├─ 2  spectral-flux onset envelope
        ├─ 3  tempo scan + phase lock  ────────────► bpm, offset
        │      (cross-check: `npx hyperframes beats`)
        ├─ 4  per-beat energy table    ────────────► onset, low, mid, high
        ├─ 5  parse LRC, snap onsets to the beat grid ──► timeline.json
        ├─ 6  character: crop, close alpha, tint x4 ────► tinted/*.png
        ├─ 7  build the composition (HTML + Canvas 2D, or HyperFrames HTML+GSAP)
        ├─ 8  deterministic parallel render ──────► segments
        ├─ 9  concat (CFR) + mux the original audio
        └─ 10 verify: duration, frames, loudness, beat modulation
```

Steps 1–6 and 10 are shared by both render paths. Only steps 7–9 differ: on the HyperFrames
path they become `hyperframes check` → `hyperframes render`, and the CLI supplies lint,
layout, contrast and motion gating. See `references/hyperframes.md`.

If a system ffmpeg or Chrome is unavailable, stay on the Canvas path — the HyperFrames path
cannot render without both.

## Composition model

Split every frame into **two layers**:

- **Picture layer** — shapes, diagrams, the character, the terminal frame. This layer
  receives the full CRT treatment: bloom, tearing, chromatic splitting, scanlines.
- **Ink layer** — *all* text. Composited after the post-processing so it stays crisp.
  Give it only a light glow and the scanline pass.

Route text into the ink layer by wrapping the canvas `fillText`, so no call site can
forget. See `references/layout-and-legibility.md`.

On the HyperFrames path there is no `fillText` to intercept: enforce the same rule
structurally by keeping all text in a DOM layer whose `z-index` is above every element that
carries a `filter`, `mix-blend-mode` or transform. `references/hyperframes.md`.

## Layout zones

Reserve fixed zones inside the tube and never let a scene violate them:

```
┌──────────────────────────────┬────────────────────────┐
│  character / equation        │  diagrams / data       │
│                              │                        │
├──────────────────────────────┤                        │
│  lyric log (terminal output) │                        │
├──────────────────────────────┴────────────────────────┤
│  HUD band — the only safe place for one-line footnotes │
└────────────────────────────────────────────────────────┘
```

Full-width elements (a diagnostic takeover, a giant word) must **clear the tube** before
drawing, so overlap is structurally impossible.

## Lyrics as terminal output

Not subtitles. Rules:

- each line is a log row that types out character by character
- a blinking block cursor sits at the end of the **currently executing** line
- the current line is brighter than the lines above it
- key lines (the shouted words) get a one-shot inverted flash
- line starts are snapped to the beat grid when the vocal onset is within ~120 ms of a
  beat; otherwise keep the true vocal time so the words never drift off the voice
- maths lines are accompanied by the matching diagram in the adjacent zone, same frame

## Deliverables

1. `render/<name>_1080p.mp4` — the video, audio passed through untouched
2. a design document: thesis, visual world, phase breakdown, storyboard with timecodes
3. a verification report with measured numbers
4. the reproducible pipeline (scripts + data), not just the output

## Done when

- `ffprobe`: 1920x1080, 30/1, duration equals the source audio, H.264 + AAC 48 kHz stereo
- frame count matches the timeline within concat tolerance
- no black runs outside head/tail, no freeze events
- audio loudness matches the source master within 0.5 LU and true peak < 1 dBFS
- a beat-modulation test shows the picture pulsing at the song's tempo, with a
  shifted-grid control measurably lower
- visual sampling across every section confirms no text is obscured
- on the HyperFrames path: `hyperframes check` reports no errors, and no unmarked layout or
  contrast warnings

Report measured numbers, never impressions. If something did not render, say so plainly.
