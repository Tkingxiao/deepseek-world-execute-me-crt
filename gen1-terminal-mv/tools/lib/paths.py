"""tools/lib/paths.py — where this project's files live, on any machine.

Every Python tool in this generation imports ROOT from here instead of hardcoding
an absolute path, so a clone runs where it was checked out.

    from paths import ROOT, BUILD, ASSETS, INPUT, p

`sys.path` is extended with this file's directory by each tool before importing,
so `import paths` works whether the tool is run from the project root or anywhere
else.
"""
from __future__ import annotations

import os
from pathlib import Path

# tools/lib/paths.py -> tools/lib -> tools -> <project root>
ROOT = Path(__file__).resolve().parents[2]

BUILD = ROOT / "build"                  # scratch: decoded audio, analysis, previews
ASSETS = ROOT / "assets"                # generated character / math art
INPUT = ROOT / "input"                  # user-supplied song, lyrics, character art
RENDER = ROOT / "render"                # finished video
DATA = ROOT / "data"                    # timeline.json, beat-energy.json


def p(*parts: str) -> str:
    """Path under the project root, as a string (PIL and ffmpeg both want str)."""
    return str(ROOT.joinpath(*parts))


def env_path(key: str, default: Path) -> str:
    """An override from the environment, else the project-relative default."""
    return os.environ[key] if os.environ.get(key) else str(default)


def ensure(*dirs: Path) -> None:
    for d in dirs:
        Path(d).mkdir(parents=True, exist_ok=True)
