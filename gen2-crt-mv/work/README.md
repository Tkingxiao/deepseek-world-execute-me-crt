# `work/` — the workshop of generation 2

Everything in this directory exists because a specific frame was wrong and could not be
diagnosed by looking at it. None of it is required to *render* the film; all of it is required
to *change* the film without breaking it. The scripts are small, single-purpose, and were
written against real failures — which is why they are kept rather than deleted.

Two things here are load-bearing for the documented workflow:

| File | Why it matters |
|---|---|
| `p00.txt` … `p14.txt` | the 14 act bodies as standalone patches. `splice.cjs` writes one back into `src/scenes.js`; `checksync.cjs` proves each is still byte-identical to the live code |
| `splice.cjs` | the only sanctioned way to rewrite one act instead of hand-editing a 6,500-line file |

> **These patch files contain the example song's lyrics.** They are a working record of the
> published film, not a redistribution of the song. See the licence section of the
> [root README](../README.md).

## Driving and inspecting the composition

| Script | What it answers |
|---|---|
| `shot.cjs` | render one moment of the composition to a PNG |
| `art.cjs` | draw every `MV.ART` figure and schematic symbol on one sheet, at film proportions, so a shape can be judged for recognisability before an act is written around it |
| `crop.cjs` | pixel-level zoom into a rendered frame — "is the glyph actually there, or am I looking at a 4× downscaled thumbnail of it?" |
| `px.cjs` | print the pixel at given coordinates, plus the brightest pixel in a 9×9 box around each — so a faint glyph cannot hide behind a thumbnail |
| `lumamap.cjs` | coarse luma map of the composited frame, so a diagonal band or a dark corner is visible at a glance |
| `layerpng.cjs` | dump the *un-composited* picture layer (`MV.gp`) as a PNG, to separate "the shape is wrong" from "the CRT pass ate it" |

## Text, zones and legibility

| Script | What it answers |
|---|---|
| `zone.cjs` | **gate 2.** Every act-drawn string that lands in the chrome's bands (HUD / caption strip / status line) |
| `bandscan.cjs` | which chrome bands the acts draw into, and when |
| `bandink.cjs` | what ink sits in the caption bands at given moments |
| `caption.cjs` | is a caption readable on the picture it lands on? |
| `findfill.cjs` | wraps the picture layer's `fillRect` / `fill` / `drawImage` and logs what fills where — for the "something is covering the text" class of bug |
| `outfill.cjs` | the same trick on the finished canvas, so a fill from any layer can be traced |
| `edge.cjs` | is there an unwanted box around the picture? |

## Lyrics and timing

| Script | What it answers |
|---|---|
| `lyr.cjs` | the lyric lines in a time window, with the translation — so an act can be written against what is actually being sung |
| `lines.cjs` | every lyric line whose cue falls in a time range |
| `dupkeys.cjs` | every lyric line whose first 24 characters repeat, and every `MV.cue()` key that would resolve ambiguously |
| `cue.cjs` | resolve a handful of `MV.cue()` calls against the loaded timeline |
| `cue2.cjs` | replay *every* `MV.cue()` / `MV.since()` call site through the page, so a key that does not resolve fails loudly instead of silently landing at 0 |
| `sync.cjs` | does the Chinese keep up with the English, frame by frame? |
| `sync2.cjs` | follow-up to `sync.cjs`: why did it report a ±1.6 s spread on completion? |
| `typecheck.cjs` | for every lyric line, when does the reveal finish, and does it finish before the line leaves? |
| `holdfoot.cjs` | measure the footprint of the caption-hold fix across the whole film |
| `keyflash.cjs` | the arrival flash of a key line, measured rather than eyeballed |

## Verification and measurement

| Script | What it answers |
|---|---|
| `checksync.cjs` | every `pNN.txt` patch is still byte-identical to its act body in `src/scenes.js` (`--write` re-syncs them) |
| `census.cjs` | sweep every act on a fine grid of virtual times and report what each one drew |
| `digdiff.cjs` | per-frame PNG digest diff between two captures — the determinism check |
| `psnr-scan.cjs` | where exactly did a given fix change the master? |
| `flashcalc.cjs` | reproduce P10's flash arithmetic in the page and print the intermediate values |
| `heartgrid.cjs` | the glyph grid `MV.field` would produce for a form, using `MV.field`'s own maths, so a "the heart doesn't look like a heart" bug can be separated from a compositing bug |
| `report-data.cjs` | the numbers that go into the verification report, measured on the real output |

## Conventions

- **Run them from the project root**: `node work/zone.cjs`. They resolve the project root from
  `__dirname`, so the working directory does not strictly matter, but the relative output paths
  in the docs assume root.
- **Nothing here may hardcode an absolute path.** The Chrome binary comes from
  [`../tools/lib/env.cjs`](../tools/lib/env.cjs); if you add a script, do the same.
- These scripts write into `work/shots/`, `work/render/`, `work/out/` and the other
  git-ignored subdirectories. Generated output is never committed.
