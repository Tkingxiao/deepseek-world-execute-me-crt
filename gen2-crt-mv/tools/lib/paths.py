"""tools/lib/paths.py — where this project's files live, on any machine.

Every Python tool in this generation imports ROOT from here instead of hardcoding
an absolute path, so a clone runs where it was checked out.

    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
    from paths import ROOT, input_path, ffmpeg_path

Overrides: MV_SONG, MV_LRC, MV_FFMPEG, FFMPEG.
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

# tools/lib/paths.py -> tools/lib -> tools -> <project root>
ROOT = Path(__file__).resolve().parents[2]

INPUT = ROOT / "input"                  # user-supplied song and lyrics
WORK = ROOT / "work"                    # scratch: decoded audio, timelines, patches
SRC = ROOT / "src"                      # the composition itself
DATA = WORK / "data"                    # timeline.json, audio.json
AUDIO = WORK / "audio"                  # decoded PCM


def input_path(env_key: str, default_name: str) -> Path:
    """An override from the environment, else input/<default_name>."""
    override = os.environ.get(env_key)
    return Path(override) if override else INPUT / default_name


def ffmpeg_path() -> str:
    """A full ffmpeg build. Playwright's bundled one is decode-only, so it is not
    consulted here: MV_FFMPEG / FFMPEG, then a project-local ffmpeg/, then PATH."""
    for key in ("MV_FFMPEG", "FFMPEG"):
        if os.environ.get(key):
            return os.environ[key]
    local = ROOT / "ffmpeg" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if local.exists():
        return str(local)
    found = shutil.which("ffmpeg")
    if found:
        return found
    return "ffmpeg"   # let the OS report the failure, with a clear message


def ensure(*dirs: Path) -> None:
    for d in dirs:
        Path(d).mkdir(parents=True, exist_ok=True)
