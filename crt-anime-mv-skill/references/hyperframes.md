# HyperFrames render path

This skill's default path renders the CRT `crt-anime-mv` on Canvas 2D. **HyperFrames by
HeyGen** renders the same film from HTML + CSS + GSAP instead. This module covers when to
choose it, how to set it up, how to drive it from the beat grid, and which of this skill's
non-negotiables still bind.

HyperFrames is an external tool, not part of this skill. Website: <https://hyperframes.heygen.com>.
Source: <https://github.com/heygen-com/hyperframes> (Apache-2.0, © HeyGen). The version these
notes were verified against is **0.8.79**.

## Provenance of this module

The environment table, the CLI flags, the failure transcripts and the beat-grid cross-check
below are **measurements taken on a real machine while building this film** — that is this
module's own contribution.

The sections on `check` and on the `*.motion.json` sidecar are different in kind: they
describe HyperFrames' own gates, and they follow HyperFrames' shipped skill documentation
(Apache-2.0, © HeyGen) — `skills/hyperframes-cli/references/lint-validate-inspect.md` and
`references/beats.md`. Passages there are quoted or closely paraphrased from that
documentation, and the CLI's contract is summarised rather than restated in our own words,
because a paraphrase of an exit-code contract is worse than the contract. Where this file
differs from the shipped HyperFrames docs, the docs win — treat this as a dated reading of
version 0.8.79, not as the specification. Everything such a passage asserts should be
re-checked with `npx hyperframes <cmd> --help` before you rely on it.

## When to use this path

| Choose Canvas 2D (the default pipeline) | Choose HyperFrames |
|---|---|
| You want the CRT post-processing exactly as specified in `crt-visual-system.md` | You want DOM text layout, real webfonts, and CSS transitions |
| You need per-pixel control (tear, grille, per-scanline phase) | You want the built-in lint / layout / contrast / motion gates to catch breakage for you |
| You cannot install FFmpeg or Chrome | You have, or can install, FFmpeg and Chrome |
| The picture is procedural art and diagrams | The picture is type, cards, captions, UI-like layers |

**This path has hard prerequisites.** Confirm them before promising a render — see
"Environment" below. If they are missing, stay on the Canvas path.

## Environment

```bash
npx --yes hyperframes@latest doctor
```

Verified on this machine (2026-09):

| Requirement | Status here | Notes |
|---|---|---|
| Node.js ≥ 22 | ✅ v24.15.0 | required |
| Chrome / Chromium | ✅ works | required for `render`, `check`, `beats`, `snapshot` |
| FFmpeg + FFprobe on `PATH` | ❌ **missing** | required for `render` (and `grade-compare`, `normalize-audio`) |
| Docker | ❌ missing | only for `render --docker` |
| whisper-cpp, Kokoro TTS | ❌ missing | optional; only for `transcribe` / `tts` |

Everything that only needs Chrome works without FFmpeg. Verified on this machine:
`lint` ✅, `check` ✅, `beats` ✅ (449 beats / 130 BPM), `snapshot` ✅ (PNG frames + contact
sheet). **`render` is the one command that actually needs a real FFmpeg.**

> **`doctor` reports a false negative for Chrome on Windows.** It probes the binary by
> running `chrome.exe --version` and that invocation times out
> (`signal SIGKILL, ETIMEDOUT`), so `doctor` prints `✗ Chrome`. The browser itself is fine —
> `check`, `beats` and `snapshot` all drive it successfully, and the GPU probe reports
> hardware WebGL. Do not conclude Chrome is missing from `doctor` alone; confirm with
> `npx hyperframes check`.

### The Playwright FFmpeg trap

`render-pipeline.md` says Playwright ships an ffmpeg you can borrow. **That will not work for
HyperFrames — and, as `render-pipeline.md` now documents, it will not work for the Canvas
path's encoding either.** Playwright's binary is built `--disable-everything` and contains
only the `mjpeg`/VP8 decoders, the `png`/VP8 encoders, and the `image2`/`webm` muxers:

```
ffmpeg version n7.0.1-playwright-build-1011
configuration: ... --disable-everything --enable-muxer=webm --enable-encoder=libvpx_vp8 ...
```

It has **no `libx264`, no `aac`, no audio decoders at all, no `psnr` filter, and no
ffprobe**. HyperFrames needs the encoder and ffprobe. Install a real build:

```powershell
winget install --id Gyan.FFmpeg -e
```

Then point HyperFrames at the binaries explicitly (this is the reliable route on Windows
when `PATH` has not propagated into the current shell):

```powershell
$env:HYPERFRAMES_FFMPEG_PATH  = "C:\path\to\ffmpeg.exe"
$env:HYPERFRAMES_FFPROBE_PATH = "C:\path\to\ffprobe.exe"
```

If Chrome really is the blocker, let HyperFrames fetch a supported build:

```bash
npx hyperframes browser ensure --force
$env:HYPERFRAMES_BROWSER_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

## Scaffold and wire the music track

Do not hand-write the project — `init` creates the structure the CLI expects and copies the
media in:

```bash
npx hyperframes init my-mv --audio input/song.mp3 --resolution landscape --skip-transcribe --non-interactive
```

That yields `index.html`, `hyperframes.json`, `meta.json`, `package.json`, and the copied
audio. Then add the music track as its **own** `<audio>` element and tag it, or `beats`
cannot find it:

```html
<audio id="music" data-timeline-role="music" data-start="0"
       data-duration="211.967" data-track-index="9" src="song.mp3"></audio>
```

`data-timeline-role="music"` (or an id of `music` / `bgm` / `soundtrack`) is what
`hyperframes beats` looks for. Without it the command exits with
"No music track found" and writes nothing.

Video is always `muted playsinline` in its own element, paired with a separate `<audio>`
element for its sound. Never put audio on the video element.

### Which HyperFrames workflow owns this

A CRT anime MV is a *beat-synced video driven by a music track*, which is HyperFrames' route
5: **`/music-to-video`**. That workflow owns its own audio-driven pipeline and its own
`audiomap.json` (beats, energy, sections) and, in HyperFrames' own words, its analyzer should
not be replaced by the `beats` utility.

So the division of labour is:

- when you are working **inside** the HyperFrames skill ecosystem, let `/music-to-video` own
  beat/energy extraction
- use `beats` (below) when you want a **quick independent cross-check** of a project's tempo,
  or when driving HyperFrames as a plain CLI from this skill
- use this skill's own `beat-and-timeline.md` scan for phase, drift proof and the per-beat
  energy table that feed the CRT visuals

To get the HyperFrames skills on disk, install them rather than copying them here:

```bash
npx hyperframes skills update      # install / update for your AI tools
npx hyperframes skills check       # report whether they are current
```

## The beat grid bridge

This is the most valuable integration point, and it makes a strong cross-check.

```bash
npx hyperframes beats . --json
# {"ok":true,"file":"beats/song.mp3.json","count":449,"bpm":130}
```

The artifact:

```json
{
  "version": 1,
  "audio": "song.mp3",
  "beats": [ { "time": 0.189, "strength": 0.782 }, { "time": 0.651, "strength": 0.783 } ]
}
```

Run this **and** the skill's own tempo scan (`beat-and-timeline.md`) and compare. Here both
independently returned **130 BPM** on `world.execute (me)`, which is real evidence the grid
is right rather than a second opinion about a stated brief. If they disagree, believe
neither until you resolve the octave.

Heads-up: `beats` analyzes in headless Chrome, so it needs Chrome even though it writes only
JSON. If Chrome is missing it fails and writes nothing — `npx hyperframes browser ensure`
first.

`beats/<audio>.json` is `time` + `strength` only. It has **no** phase, downbeat, section, or
per-band energy. So:

- get **phase and drift proof** from `beat-and-timeline.md` — that module's grid is the one
  that goes into the render
- derive **onset** from `strength`
- `low` / `mid` / `high` still come from the per-beat energy table
- key the two together by `floor(t / beat)` and assert the counts agree

To key the grid into GSAP, register one sample per frame — a single long tween does **not**
react to the music:

```js
// ✅ per-frame sampling
for (var f = 0; f < BEATS.totalFrames; f++) {
  tl.call(((fr) => () => drawBeat(fr))(BEATS.frames[f]), [], f / BEATS.fps);
}

// ❌ wrong — one tween, no reactivity
gsap.to(".tube", { scale: 1.2, duration: BEATS.totalDuration });
```

## Mapping the CRT world onto HTML

**Map the CRT composition model onto HyperFrames' vocabulary.** It maps almost one-to-one:

| This skill (`crt-visual-system.md`) | HyperFrames realisation |
|---|---|
| picture layer | a scene `<div>`; all blur/split/degrade via CSS `filter` |
| **ink layer** — all text, above post-processing | a **separate DOM layer, `z-index` above every filtered element** |
| tube inset `SC = {x:258,y:48,w:1276,h:902}` | a tube container with `overflow: hidden` and that geometry |
| scanlines / aperture grille | repeating-linear-gradient overlay, `pointer-events: none` |
| phosphor bloom | blurred duplicate with `mix-blend-mode: screen` (or SVG `feGaussianBlur`) |
| beat pump | `scale` / `--hud-glow` on the tube driven by `strength` |
| glitch level curve | one function returning 0..1 driving the CSS custom properties |
| lyric log | DOM rows; the executing line brighter, with a blinking block cursor |

Two translations that are easy to get wrong:

**The ink-layer rule is not optional, and it changes shape.** On Canvas the skill intercepts
`fillText` so no call site can forget. In the DOM there is nothing to intercept, so enforce it
structurally: put text in a container that is a sibling of the picture layer with a higher
`z-index`, and never apply `filter`, `mix-blend-mode`, or a transform to a text ancestor. A
blur on an ancestor of your lyrics smears them exactly like drawing them under the bloom.

**Animate visual properties only.** `opacity`, `x`, `y`, `scale`, `rotation`, `color`,
`backgroundColor`, `borderRadius`, transforms. Do **not** animate `display` or `visibility`,
and never call `video.play()` / `audio.play()` — the framework owns playback. Use `autoAlpha`
rather than `opacity` when you want a hard hide — but not on a clip/container element, where
HyperFrames' own guidance is to tween a child instead of the clip wrapper.

## Runtime contract

Break any of these and the capture silently produces wrong frames:

- every timeline is created `{ paused: true }` and registered:
  `window.__timelines["<composition-id>"] = tl`
- **register only once the build has finished.** What the capture engine needs is that
  `window.__timelines` is populated by the time it reads it after page load — so a build
  started from an `async` callback is fine *provided* the registration happens after that
  build completes. Deferring the registration itself into a later microtask (fire-and-forget
  `Promise` or `setTimeout` that assigns `window.__timelines` later) is what produces wrong or
  empty frames. Runtimes older than the current docs required the synchronous form outright;
  the reliable habit, and the one this pipeline uses, is to build and register synchronously
- duration comes from `data-duration`, not from the GSAP timeline length
- **no `repeat: -1`.** Compute a finite count:
  `repeat: Math.ceil(duration / cycle) - 1`
- no `data-layer` / `data-end` — they do not exist; use `data-track-index` / `data-duration`
- one composition root with `data-composition-id`; standalone `index.html` puts it directly
  in `<body>` (**not** inside `<template>` — that hides the content and breaks rendering)
- never animate video element dimensions — animate a wrapper div
- don't `gsap.set()` elements from later scenes; they aren't in the DOM yet. Use
  `tl.set(sel, vars, timePosition)` at or after that clip's `data-start`

### Determinism — the same rule as the Canvas path

`SKILL.md` non-negotiable #6 ("render from an explicit virtual time function") becomes: no
`Math.random()`, no `Date.now()`, no time-based logic. If you need pseudo-randomness, seed a
PRNG from the frame index (e.g. mulberry32). Everything must be a pure function of `t` so a
re-render reproduces the film and parallel chunks match.

## Text, captions, and lyrics

The lyric rules in `SKILL.md` ("Lyrics as terminal output") carry over unchanged in spirit —
typewriter reveal, a blinking cursor on the executing line, a one-shot inverted flash on key
lines, starts snapped to the grid only within ~120 ms. Two HyperFrames-specific mechanics:

```js
// fit dynamic copy instead of guessing a size
var r = window.__hyperframes.fitTextFontSize(text, {
  fontFamily: "JetBrains Mono", fontWeight: 700,
  maxWidth: 1600, minFontSize: 42,
});
el.style.fontSize = r.fontSize + "px";
```

Give every caption group a hard kill after its exit animation, or it lingers into the next
group:

```js
tl.to(groupEl, { autoAlpha: 0, duration: 0.12, ease: "power2.in" }, group.end - 0.12);
tl.set(groupEl, { autoAlpha: 0, visibility: "hidden" }, group.end);
```

Layout zone discipline from `layout-and-legibility.md` still applies — reserve the zones and
never let a scene violate them. In HyperFrames the mechanical enforcement is to build the
**end state first** as static HTML+CSS, then add `gsap.from()` entrances animating *into*
that position. Position at the hero frame; never position at the animated start state and
guess where it lands. For full-width moments, clear the tube first, exactly as before.

## Verification

`check` is the **required final gate**. It runs the linter, then audits runtime, layout,
motion and contrast in a single browser session. Do not chain a redundant standalone `lint`
immediately before it. (Everything from here to "What only this skill's verification can
prove" follows HyperFrames' own `lint-validate-inspect.md`; verify against
`npx hyperframes check --help` for your installed version.)

```bash
npx hyperframes lint .                    # fast static feedback while iterating
npx hyperframes check .                   # the gate
npx hyperframes check . --json            # agent-readable envelope
npx hyperframes check . --snapshots       # annotated overview frames + per-finding crops
npx hyperframes check . --at 1.5,4,7.25   # sample specific hero frames
npx hyperframes check . --samples 15      # denser sweep (default 9)
npx hyperframes check . --no-contrast     # only when iterating fast
```

`check` enforces, for free, two things this skill's `verification.md` demands by hand:

- **Text legibility** — it computes WCAG AA contrast behind every visible text element.
  Contrast failures are **gating errors** (not warnings), and each finding carries the
  sampled fg/bg colours, the measured vs required ratio, and a `suggestedColor` already
  chosen in the correct direction. Fix within the phosphor palette — brighten on the dark
  tube, never invent a new hue. Thresholds: 4.5:1 normal, 3:1 large (24px+, or 19px+ bold).
  This is the automated counterpart of "no text is obscured".
- **Layout collisions** — text overflowing its container or the canvas, objects covering
  text, children escaping clipping containers, each with a selector, bbox and sample time.
  Severity is **persistence-aware**: a transient seen at one sample demotes to info and does
  not gate; an issue held across samples gates the exit code.

Mark deliberate intent rather than fighting the auditor: `data-layout-allow-overflow`
(entrance/exit travel), `data-layout-allow-overlap` (deliberate layering — mark the specific
participant, not a scene wrapper), `data-layout-allow-occlusion`, and `data-layout-ignore`
(decorative). A CRT composition legitimately trips overflow during glitch passes, so expect
to mark those.

Note: `validate`, `inspect` and `layout` still run but are **deprecated** — `check` covers
all of them, and their findings degrade to stderr notices.

Then verify choreography. State the motion **intent** in a `*.motion.json` sidecar next to
the composition; `check` discovers it automatically and verifies it against the same seeked
timeline the renderer uses:

```json
{
  "duration": 6,
  "assertions": [
    { "kind": "appearsBy", "selector": "#headline", "bySec": 0.5 },
    { "kind": "before", "a": "#headline", "b": "#cta" },
    { "kind": "staysInFrame", "selector": ".card" },
    { "kind": "keepsMoving", "withinSelector": ".scene" }
  ]
}
```

| Assertion | Fails when |
|---|---|
| `appearsBy(selector, bySec)` | not visible (opacity ≥ 0.5) by `bySec` |
| `before(a, b)` | `a` does not first appear strictly before `b` |
| `staysInFrame(selector)` | once visible, its box leaves the canvas |
| `keepsMoving(withinSelector?)` | a fully-static window exceeds `maxStaticSec` (default 2 s) |

Findings are **errors by default**. A selector matching nothing reports
`motion_selector_missing` rather than passing silently, so a typo fails loudly. This is the
closest automated proxy for "watch the MP4", and it is the right replacement for eyeballing
a render.

> Older HyperFrames skill bundles documented a standalone
> `skills/hyperframes/scripts/animation-map.mjs`. **That script does not exist in 0.8.79.**
> Its job is now done by the `*.motion.json` sidecar above. Don't try to run it.

One more trap `check` enforces: if a 3 s+ composition shows **zero geometry change** across
every sample, `check` fails with `sweep_static` rather than passing. The classic cause is a
reveal that finishes early and then holds a static frame for the rest of the film. Opacity-only
reveals count as motion *while still in flight*, so spread the reveal across the timeline or
keep one element continuously alive — a blinking caret is idiomatic for a terminal. Do not
bolt on a meaningless slow drift just to satisfy the check.

### What only this skill's verification can prove

`check` cannot prove musical sync. The beat-modulation test in `verification.md` §5 is still
the acceptance gate: extract per-frame luma of the **tube area**, Goertzel the tempo
frequency, compare on-beat vs off-beat luma, and use the **half-beat-shifted control**. On
the HyperFrames path, `snapshot --at` at beat times gives you frames to eyeball (it works
without system FFmpeg), but the luma test on the finished MP4 is the one that counts — and
that one needs ffmpeg/ffprobe.

Also still required, unchanged: duration equals the source audio, exact frame count,
black/freeze detection, audio passed through untouched (delta ≤ 0.5 LU, true peak < 1 dBFS),
and the bounded-density test if any decorative layer repeats.

## Rendering

```bash
npx hyperframes render . --fps 30 --quality draft    # iterate
npx hyperframes render . --quality looks             # default (CRF 16)
npx hyperframes render . -o render/final_1080p.mp4 --quality delivery --workers auto
```

- `--quality`: `draft` → `looks` (default) → `delivery`
- `--workers auto` launches one Chrome per worker (~256 MB each); `--low-memory-mode` pins
  to 1 worker on ≤ 8 GB machines
- `--strict` fails the render on lint errors; `--strict-all` also on warnings
- `--fps` defaults to the root `data-fps`, else 30

**Without FFmpeg this command fails.** Measured on this machine, `render` starts, resolves
the browser, then exits **1**:

```
✗  FFmpeg not found
   FFmpeg is required to encode video.
✗  FFprobe not found
```

That is a preflight, not a partial render — install FFmpeg first. Do not burn time debugging
a composition over this message; it is purely environmental.

**Audio:** render with the music `<audio>` element in the composition so the original track
is carried, and then still verify with `verification.md` §4 that loudness matches the source.
If instead you mux by hand, copy the original audio stream — never re-encode a master.

## Gotchas that cost real time

- `beats` needs an existing composition **and** a tagged music element; it is not a
  standalone audio analyser
- Playwright's bundled ffmpeg is a stripped decode-only build — it cannot encode H.264. Do
  not point `HYPERFRAMES_FFMPEG_PATH` at it
- `hyperframes inspect` is deprecated in favour of `hyperframes check`
- `hyperframes doctor` reports Chrome as missing on Windows even when it works (see
  "Environment"). `check` is the real test
- `init` may try to reach GitHub for AI skills; set `HYPERFRAMES_SKIP_SKILLS=1` to opt out in
  CI or offline
- On Windows, `npx` writes an `npm warn Unknown user config "store-dir"` block to stderr.
  It is noise, not a failure — do not treat a non-empty stderr as a failed command
