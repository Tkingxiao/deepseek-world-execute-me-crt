# Third-party sources, dependencies and their licences

This repository is two music-video builds written by DeepSeek, plus the `crt-anime-mv` agent
skill distilled from them. The MIT `LICENSE` at the repository root covers **only this
repository's own material** — the source code, the tools, these documents and the skill's
text. It grants nothing in the works listed here; each stays under its own terms, recorded
below with the URL it was read from.

Two separate things are credited here, and it matters which is which:

- **Method** — pipeline shape, prompt structure, the checks worth running, the conventions
  for packaging a skill. Ideas are not copyrightable, and for those sources this repository
  contains **no file and no copied text**.
- **Quoted material** — a small number of passages, code blocks, tables and constants in
  `crt-anime-mv-skill/references/` that are quoted or closely adapted from upstream
  documentation. These carry inline attribution at the point of use, and the upstream
  licence (MIT or Apache-2.0) permits the reuse. **They are the reason this file exists at
  all**, and they are listed explicitly in "Quoted material" below.

Licence terms below were read from each repository's own `LICENSE` file, its README, and the
npm registry; see "How this list was verified" at the end for the date and the method.

## The nine credited upstream skills

These are named in the initial briefs ([`prompts/gen1_提示词.txt`](prompts/gen1_提示词.txt),
[`prompts/gen2_提示词.txt`](prompts/gen2_提示词.txt)); this pipeline was fused from their practice.

| Source skill | Repository | Licence | Taken as method |
|---|---|---|---|
| `creative-music-video-director` | <https://github.com/FrameCoreWorks/framecore-works-claude-skills> | **Proprietary — "All rights reserved"** | thesis before shot list |
| `storyboard-director` | <https://github.com/kevinchin12/storyboard-director> | MIT | acts + timecodes + per-act acceptance shot |
| `video-prompt-architect` | <https://github.com/FrameCoreWorks/framecore-works-codex-chatgpt-workflow-kit> (`.agents/skills/video-prompt-architect/`) | Apache-2.0 | layered prompt structure: identity → sequence → section → shot |
| `any2video` | <https://github.com/chanktb/any2video> | MIT | the input contract: one song + one LRC + one transparent cutout |
| `manim-skills` | <https://github.com/adithya-s-k/manim_skill> (also mirrored as <https://github.com/Quantumplations/manim_skill>) | MIT | pre-render math with Manim, pack into sheets, keep a fallback |
| `motion-video-skill` | <https://github.com/bestagentkits/motion-video-skill> | MIT | motion driven by measured tempo and per-beat energy |
| `hyperframes-workflow` | <https://github.com/FrameCoreWorks/framecore-works-codex-chatgpt-workflow-kit> (`.agents/skills/hyperframes-workflow/`) | Apache-2.0 | the HTML + CSS + GSAP path and its lint / layout / contrast / motion gates |
| `find-skills` | <https://github.com/WhizZest/find-skills> | **no `LICENSE` file; the README declares MIT** — see below | discovery / install conventions: `npx skills add`, `--list` |
| `framecore-works-claude-skills` | <https://github.com/FrameCoreWorks/framecore-works-claude-skills> | **Proprietary — "All rights reserved"** | packaging shape: `plugin.json` + `.claude-plugin/` + `.agents/plugins/`, versions kept in sync |

Names are given as they appear in the briefs; where a repository's spelling differs, the URL
above is the authority.

### Where a licence grants nothing, or is unclear

- **`FrameCoreWorks/framecore-works-claude-skills`** ships a `LICENSE` that says the opposite
  of open source: *"No part of this repository may be copied, reproduced, modified,
  distributed, published, sublicensed, or used … without prior written permission."* This
  repository contains **none of its content** — no file, no copied text. The credit row
  acknowledges only that a director-style music-video skill of that shape exists in that
  ecosystem, which is an idea and not a protected expression. If you want certainty rather
  than a reading of idea/expression, either delete that row from this file and from
  `README.md`, or obtain written permission from FrameCore Works.
- **`WhizZest/find-skills`** has **no `LICENSE` file** in the repository (its default branch
  is `master`, and `LICENSE`, `LICENSE.md` and `LICENSE.txt` are all absent), so GitHub
  detects no licence. Its **README does declare MIT** — "📄 License — MIT License — See
  [LICENSE](LICENSE) file for details" — but that link points at a file which does not exist.
  The honest reading is *a stated intent to be MIT, with the notice itself broken*. Only two
  facts are reflected in this repository: the shape of a public CLI invocation
  (`npx skills add … --list`) and the one-skill-per-directory convention. Neither is that
  repository's protected expression, and no file of it is redistributed. If you need a clean
  chain of title, treat this one as unresolved.

## Quoted material — passages reused with attribution

Both upstreams in this section are permissively licensed, and the reuse is compliant **because
the attribution travels with the text**. Each is also marked inline in the module itself, at
the point of use.

| Local module | Quoted or adapted from | Licence | What was reused |
|---|---|---|---|
| `crt-anime-mv-skill/references/ascii-video.md` | Hermes Agent `ascii-video` skill, `SKILL.md` and `references/architecture.md`, `references/troubleshooting.md`, `references/composition.md` — <https://github.com/NousResearch/hermes-agent/tree/main/skills/creative/ascii-video> | MIT · © 2025 Nous Research | the six-line `tonemap()` function (reproduced, with two added comments), the per-layer grid-density table, the `2 * 0.12 * 0.12 = 0.03` blend arithmetic, the `canvas.mean() > 8` gate, the `cell_height = ascent + descent` rule, the gamma set, and the per-frame performance budget |
| `crt-anime-mv-skill/references/hyperframes.md` | HyperFrames shipped skill docs `skills/hyperframes-cli/references/lint-validate-inspect.md` and `references/beats.md` — <https://github.com/heygen-com/hyperframes> | Apache-2.0 · © HeyGen | the description of `check` as the final gate and what it audits, the WCAG contrast thresholds and persistence-aware severity rules, the `data-layout-allow-*` markers, the `validate` / `inspect` / `layout` deprecation note, the `*.motion.json` sidecar example and its assertion table, the `sweep_static` behaviour, and the `/music-to-video` hand-off. Passages were edited and abridged for this pipeline's vocabulary — i.e. changed, as Apache-2.0 §4(b) requires be stated |

`crt-anime-mv-skill/references/cmd-art.md` quotes **no** upstream text: it names tools
(`pyfiglet`, `cowsay`, `boxes`, `toilet`, `ascii-image-converter`, `jp2a`), their flags, their
font counts and a few limits, all of which are facts about those tools. The Hermes Agent
`ascii-art` skill is credited inline as its source.

## External tools this pipeline calls

Not sources of method, and not redistributed; dependencies a user installs. None of their
code is in this repository.

| Tool | Licence | How it is used |
|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) · <https://hyperframes.heygen.com> | Apache-2.0 · © HeyGen | alternative render path, documented in `crt-anime-mv-skill/references/hyperframes.md`; invoked via its own CLI. Its skill docs are quoted there — see above |
| Hermes Agent `ascii-art` / `ascii-video` skills · <https://github.com/NousResearch/hermes-agent> | MIT · © 2025 Nous Research | terminal character art and the general ASCII-video pipeline, documented in `references/cmd-art.md` and `references/ascii-video.md`; install with `npx skills add NousResearch/hermes-agent --skill …`. The `ascii-video` module quotes upstream — see above |
| Playwright / `playwright-core` · <https://github.com/microsoft/playwright> | Apache-2.0 | headless deterministic frame rendering, declared in each generation's `package.json` |
| FFmpeg · <https://ffmpeg.org> | LGPL-2.1+ or GPL-2.1+ depending on the build flags you configure | decode + concat + mux, called as an external binary |
| Manim · <https://github.com/ManimCommunity/manim> | MIT | optional math-animation pre-render step in generation 1 |
| NumPy · <https://github.com/numpy/numpy> | BSD-3-Clause (its `LICENSE.txt` also carries notices for bundled code) | audio analysis in the Python tools |
| Pillow · <https://github.com/python-pillow/Pillow> | MIT-CMU (HPND) | character cutout, alpha and tint work in generation 1 |

## Not licensed here, and not present

- The song *world.execute(me);* and its lyrics: © **Mili**. No audio and no LRC file is in
  this repository. Note that the sources embed lyric fragments and bilingual subtitles as
  strings, so the terminal can type them — that is a trace of the example render, not a
  redistribution right. See the licence section of [`README.md`](README.md).
- The character artwork: © its illustrator. Not in this repository. The prep scripts read
  from `input/`, which is git-ignored.

## How this list was verified

Licences were read from each repository's own `LICENSE` file and README via raw GitHub URLs,
and cross-checked against the npm registry for the published packages. The checks run on
**2026-09-30**; `find-skills` was re-checked for this revision (its `LICENSE` is still absent
from `master`). The `api.github.com` licence endpoint was rate-limited from the machine that
ran the check, so raw files were used instead — which is the stronger source anyway, since it
is what the repository actually ships.

If you are relying on any row above for a legal decision, re-read the upstream licence
yourself; this file is a record of a reading, not a legal opinion.
