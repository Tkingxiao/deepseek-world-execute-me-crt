# crt-anime-mv-skill

The **`crt-anime-mv`** agent skill. This directory *is* the skill root:
`SKILL.md` and `references/` sit at the top level, which is what the Agent Skills
loader and `npx skills` read when the folder is used directly as a skill.

The plugin manifests (`plugin.json`, `.claude-plugin/`, `.agents/plugins/`) point their
`skills` entry at `./` so the same folder also installs as a plugin.

```
crt-anime-mv-skill/
├─ SKILL.md            ← the skill entry point, at the root
├─ references/         ← the nine knowledge modules SKILL.md links to
├─ tools/              ← verify-skill.py, the pre-commit check
├─ plugin.json         ← plugin manifest (skills: ["./"])
├─ .claude-plugin/     ← Claude Code plugin + marketplace manifests
├─ .agents/plugins/    ← ChatGPT/Codex marketplace manifest
├─ README.md
└─ AGENTS.md
```

## Ground rules

- `SKILL.md` must stay at this directory's root. Moving it into a subfolder breaks
  direct loading — that was a real bug once.
- `references/` paths in `SKILL.md` are relative to this directory and must resolve.
- Keep the manifests in sync when name, description, license or version changes.
- Never commit generated media (renders, segments, audio).
- The folder holds **exactly one** skill. It documents external tools as notes on how they
  relate to this pipeline — the HyperFrames CLI (`references/hyperframes.md`), and the Hermes
  Agent `ascii-art` / `ascii-video` skills (`references/cmd-art.md`,
  `references/ascii-video.md`). It must not vendor or copy their skill files into
  `references/`, because `npx skills add . --list` would then report more than one skill.
- Those two modules name tools and upstream rules; the non-negotiables in `SKILL.md` still
  bind anything built from them (tempo is measured, text stays on the ink layer, sync is
  proven). Keep that framing whenever they are edited.

## Verify before committing

```bash
python tools/verify-skill.py
npx skills add . --list
```

`tools/verify-skill.py` checks all four manifests parse, every `references/*.md` cited from
`SKILL.md` resolves, the frontmatter version matches both plugin manifests, no stray
`SKILL.md` exists below the root, and `SKILL.md` sits at the root.

`npx skills add . --list` must report exactly one skill, `crt-anime-mv`.
