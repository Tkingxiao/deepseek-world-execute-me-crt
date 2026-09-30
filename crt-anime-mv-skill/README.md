# crt-anime-mv

An **agent skill** that builds a beat-synced 1080p anime music video whose entire visual
world is an old CRT phosphor terminal.

This directory is the skill root — `SKILL.md` sits at the top level, so the folder can be
loaded directly or installed as a plugin. It lives inside a larger repository that also
holds the two productions this skill was distilled from (source code only; the design
documents, renders, audio and character art are not published):

| Sibling path | What it is |
|---|---|
| `../gen2-crt-mv/` | the current build (v4): the whole frame *is* the tube — 15 acts in `../gen2-crt-mv/src/scenes.js`, ink layer, two gates in `tools/` and `work/` |
| `../gen1-terminal-mv/` | the earlier build: fixed zones (HUD / STAGE / PANEL / LOG / STATUS), tinted character cutout, Manim math sheets |
| `../prompts/` | the initial brief given to DeepSeek for each build, one file per generation |
| `../LICENSE`, `../THIRD_PARTY_NOTICES.md` | what the MIT grant covers, and the upstream sources with their URLs and licenses |

Every non-negotiable in `SKILL.md` came from a failure that happened in one of those two.

## Fused from

This skill was written **by DeepSeek**, fused from the practice of the following upstream
skills. Their files are not vendored here — this repo absorbs their methods and credits them,
with the URL and the license of each source as read from GitHub on 2026-09-30:

| Source skill | Upstream · license | What it contributed |
|---|---|---|
| `creative-music-video-director` | [FrameCoreWorks/framecore-works-claude-skills](https://github.com/FrameCoreWorks/framecore-works-claude-skills) · proprietary, all rights reserved | lead with a one-sentence thesis before any shot list |
| `storyboard-director` | [kevinchin12/storyboard-director](https://github.com/kevinchin12/storyboard-director) · MIT | acts + timecodes + an acceptance shot per act, as a table you can execute |
| `video-prompt-architect` | [FrameCoreWorks/framecore-works-codex-chatgpt-workflow-kit](https://github.com/FrameCoreWorks/framecore-works-codex-chatgpt-workflow-kit) · Apache-2.0 | layered prompt structure: identity block → sequence → section → shot |
| `any2video` | [chanktb/any2video](https://github.com/chanktb/any2video) · MIT | the input contract: one song, one LRC, one transparent cutout, and the run is reproducible |
| `manim-skills` | [adithya-s-k/manim_skill](https://github.com/adithya-s-k/manim_skill) · MIT | pre-render math animation with Manim, pack it into sprite sheets, keep a Canvas fallback |
| `motion-video-skill` | [bestagentkits/motion-video-skill](https://github.com/bestagentkits/motion-video-skill) · MIT | motion driven by measured tempo and per-beat energy, never a uniform sine |
| `hyperframes-workflow` | [FrameCoreWorks/framecore-works-codex-chatgpt-workflow-kit](https://github.com/FrameCoreWorks/framecore-works-codex-chatgpt-workflow-kit) · Apache-2.0 | the HTML + CSS + GSAP render path and its lint / layout / contrast / motion gates |
| `find-skills` | [WhizZest/find-skills](https://github.com/WhizZest/find-skills) · **no `LICENSE` file** (its README claims MIT, but links to a file that does not exist) | discovery and install conventions: `npx skills add`, one skill per directory, `--list` to check |
| `framecore-works-claude-skills` | [FrameCoreWorks/framecore-works-claude-skills](https://github.com/FrameCoreWorks/framecore-works-claude-skills) · proprietary, all rights reserved | the packaging shape: `plugin.json` plus `.claude-plugin/` and `.agents/plugins/` manifests kept in sync |

Two of those upstreams grant no rights at all — one is explicitly proprietary, the other ships no
`LICENSE` file. Nothing from either is redistributed here: what is credited above is the level of
idea and workflow, not their text. See `../THIRD_PARTY_NOTICES.md` for the full reading, and
`../LICENSE` for what this repository's MIT does and does not cover.

## Install / use

```bash
npx skills add .
npx skills add . --list     # must report exactly one skill: crt-anime-mv
python tools/verify-skill.py
```

## Layout

| Path | Contents |
|---|---|
| `SKILL.md` | the pipeline, the non-negotiables, deliverables, done-when checks |
| `references/beat-and-timeline.md` | measuring real tempo, phase lock, drift proof, per-beat energy, LRC snapping |
| `references/crt-visual-system.md` | bezel, bloom, scanlines, aperture grille, chromatic split, tearing, the beat pump |
| `references/character-pipeline.md` | alpha handling, the normalisation bug, phosphor tinting, view derivation |
| `references/layout-and-legibility.md` | the ink layer, fixed zones, collision-proofing, the accumulation trap |
| `references/render-pipeline.md` | virtual-time rendering, determinism, parallel chunking, concat and mux |
| `references/verification.md` | duration, frame count, audio integrity, the beat-modulation test, bounded density |
| `references/hyperframes.md` | the HyperFrames render path: HTML + CSS + GSAP, the `beats` tempo cross-check, FFmpeg/Chrome prerequisites, runtime contract, CLI gates |
| `references/cmd-art.md` | terminal character art: FIGlet banners, `boxes` frames, image→ASCII, the ANSI / width / determinism / glyph traps |
| `references/ascii-video.md` | ASCII video as a medium: how its 6-stage pipeline compares, and the four things worth stealing from it |
| `tools/verify-skill.py` | the pre-commit check: manifests parse, cited references resolve, one skill only |

## Two render paths

The default is **Canvas 2D** — full per-pixel control of the CRT post-processing.

**[HyperFrames](https://hyperframes.heygen.com)** ([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes),
Apache-2.0) is the alternative:
author the same composition as HTML + CSS + GSAP and render it with the `hyperframes` CLI,
which brings lint, layout, contrast and motion gates of its own. It requires a real
FFmpeg/FFprobe and Chrome — `npx hyperframes doctor` before you commit to it. Note that
Playwright's bundled ffmpeg is a stripped decode-only build and is **not** a usable
substitute. See `references/hyperframes.md`.

## Related external skills

`references/cmd-art.md` and `references/ascii-video.md` document two **external** Hermes Agent
skills rather than copying them in: **`ascii-art`** (pyfiglet / cowsay / boxes / TOIlet /
image-to-ASCII — the character art this world is made of) and **`ascii-video`** (the general
ASCII-video pipeline, and when it should own a job this skill shouldn't). Both live in
[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) (MIT), and both
install with the skills CLI:

```bash
npx skills add NousResearch/hermes-agent --skill ascii-art
npx skills add NousResearch/hermes-agent --skill ascii-video
```

Neither one relaxes this skill's non-negotiables: `ascii-video` estimates no tempo and proves
no sync, so the beat grid and the verification gate stay here.

## In one paragraph

The pipeline measures the song's real tempo and per-beat energy, locks a timeline to it,
turns lyrics into terminal log output, composites a phosphor-tinted character out of the
glass, keeps every word crisp by rendering text on a layer above all post-processing, and
renders the frames deterministically in parallel — then proves the result with objective
tests rather than impressions.

## License

**MIT — for this skill's own text and scripts only.** See `../LICENSE`, whose `SCOPE OF THIS
LICENSE` section states what the grant does not reach.

- **Almost** nothing from the **Fused from** upstreams is redistributed here — no file, and no
  prompt string. What was taken is method: pipeline shape, the checks worth running, packaging
  conventions. Each upstream keeps the license listed in that table. Two of them (the
  FrameCoreWorks claude-skills repository, and `find-skills`, which ships no `LICENSE` file at
  all) grant no rights, so this skill claims none in them. `../THIRD_PARTY_NOTICES.md` records
  the URLs, the licenses and the date they were read.
- **Two reference modules do quote from upstream, and it is marked.** `references/ascii-video.md`
  reproduces a six-line `tonemap()` function, a grid-density table and some performance figures
  from the Hermes Agent `ascii-video` skill (MIT, © 2025 Nous Research); `references/hyperframes.md`
  follows HyperFrames' own shipped skill docs for its `check` and `*.motion.json` sections
  (Apache-2.0, © HeyGen). Both carry an inline provenance notice at the point of use, and both
  upstream licenses permit the reuse. The itemised list is in `../THIRD_PARTY_NOTICES.md`
  under *Quoted material*. `references/cmd-art.md` quotes no upstream text — only facts about the
  tools it names.
- Music and lyrics used in a production remain © their owners. **This skill's reference modules
  quote no lyrics**; the example sources in the sibling generations embed lyric strings, and
  those are not licensed by the MIT grant. See the warning at the top of `../README.md`.
- Character art used in any production remains the property of its illustrator.

## Version

`1.1.0` — manifests, frontmatter and this file are kept in sync; `tools/verify-skill.py` fails
the build if they drift.
