# gen2-crt-mv — the workspace of the second build

This is the **current delivered generation**: a 1920×1080 / 30 fps / 6359-frame music video in
which the entire frame is one CRT phosphor tube. Fifteen acts are composed frame by frame in
Canvas 2D; every word of text is composited on a separate *ink layer* above the CRT
post-processing so the bloom and tearing never touch it.

The design documents, storyboards, render output, audio and character art from this build are
**not** published — only the code that produced them. See the
[repository README](../README.md) for the licence situation, and note that this build's source
**embeds the example song's lyrics as strings** (`src/scenes.js`, `tools/gloss.py`).

---

## Layout

| Path | What it holds |
|---|---|
| [`src/`](src/) | the whole composition: `scenes.js` is the film, `core.js` the frame loop, `crt.js` the tube, `ui.js` the chrome, `field.js`/`art.js`/`ml.js` the drawing systems, `index.html` the preview page |
| [`tools/`](tools/) | the pipeline: analysis, the two gates, and the parallel renderer |
| [`tools/lib/env.cjs`](tools/lib/env.cjs) · [`tools/lib/paths.py`](tools/lib/paths.py) | **the only place that knows where anything lives.** Every external path resolves here, and every one has an environment override — see the root README's portability table |
| [`work/`](work/) | the workshop: scratch scripts, act patches, measurements. Never imported by a shipped command except where the README says so |
| `src/data/` | **generated, not in the repository** — `timeline.js` + `audio.js` are rebuilt from the song by the steps below |
| `input/` | **not in the repository** — your song and lyric file |

## Run it

```bash
npm install                              # playwright-core

# Put your sources in input/ (or point MV_SONG / MV_LRC elsewhere):
#   input/song.mp3        input/lyrics.lrc   [mm:ss.xx]

python tools/analyze.py                  # → work/data/{timeline,audio}.json
python tools/gloss.py                    # → src/data/timeline.js

# audio.js is plain numbers; there is no separate rebuild script:
node -e "const f=require('fs');f.mkdirSync('src/data',{recursive:true});f.writeFileSync('src/data/audio.js','window.MV_AUDIO='+f.readFileSync('work/data/audio.json','utf8')+';')"

node tools/check-gates.cjs               # gate 1: composition-level checks
node work/zone.cjs                       # gate 2: does any act draw into the chrome bands?
node tools/render-all.cjs --workers 6    # 6359 frames in parallel → concat → mux → work/out/
```

Open `src/index.html` in a browser for a preview without rendering (needs `src/data/`).

Requires Node 20+ and a **full** FFmpeg — Playwright's bundled build is decode-only and cannot
encode H.264. `node -e "console.log(require('./tools/lib/env.cjs').chrome())"` tells you which
browser the renderer will drive.

## The two gates

A coded picture fails in ways a screenshot review misses, so nothing is allowed to become a
video until both gates pass:

1. **`tools/check-gates.cjs`** drives the real composition and reads what it actually drew —
   which strings reached the ink layer, on which baseline, in which colour — plus the two
   colour-dramaturgy rules the design stakes itself on (red only after `RED_GATE`; the
   bilingual pair always stacked).
2. **`work/zone.cjs`** proves no act's ink lands in the chrome's bands (HUD, caption strip,
   status line), which is the failure that makes a frame unreadable.

## Editing the film

The only entry point for animation is [`src/scenes.js`](src/scenes.js). Individual acts are also
kept as patch files in `work/pNN.txt`, which `work/splice.cjs` writes back into `scenes.js`:

```bash
node work/splice.cjs p02.txt "P02 GEOMETRY" "P03 CURRENT"   # patch one act back in
node work/checksync.cjs                                     # every patch still byte-identical to scenes.js?
```

`work/README.md` documents what each of the workshop scripts is for.
