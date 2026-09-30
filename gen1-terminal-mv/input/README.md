# Put your source material here

This directory is **git-ignored**: nothing in it is ever committed. The scripts look here when
no environment override is set.

Generation 1 expects:

| File | Required | Notes |
|---|---|---|
| `song.mp3` | yes | the master. `MV_SONG` overrides. Any format FFmpeg can decode works, but the analysis steps assume a normal music master |
| `lyrics.lrc` | yes | `[mm:ss.xx]text`, one line per cue. `MV_LRC` overrides |
| `character.png` | for the character pipeline | **RGBA with a real alpha channel.** An opaque illustration on a white background is not usable — keying it out reliably is hard and anything missed leaves a white halo. `MV_CHARACTER` overrides |
| `character_sheet.jpg` | alternative to the above | a three-view sheet on a pure white background, for `tools/extract_character.py`. `MV_CHARACTER_SHEET` overrides |

The example film this code produced is **not** reproducible from this repository: its song and
its character art are third-party works and are not redistributed. Bring your own, or the
pipeline will run but there will be nothing to render.
