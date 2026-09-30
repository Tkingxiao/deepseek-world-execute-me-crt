# Put your source material here

This directory is **git-ignored**: nothing in it is ever committed. The scripts look here when
no environment override is set.

Generation 2 expects:

| File | Required | Notes |
|---|---|---|
| `song.mp3` | yes | the master. `MV_SONG` overrides |
| `lyrics.lrc` | yes | `[mm:ss.xx]text`. Generation 2 snaps each cue to the beat grid only when the vocal lands within ~120 ms of a beat, so an accurate LRC matters. `MV_LRC` overrides |

No character art is needed: generation 2 can draw the protagonist, or read one from the
composition's own art layer.

The example film this code produced is **not** reproducible from this repository — its song and
lyrics are third-party works and are not redistributed. Bring your own.
