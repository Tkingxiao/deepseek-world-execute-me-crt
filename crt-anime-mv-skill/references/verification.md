# Verification

Subjective checks catch taste problems. These catch broken output. Run all of them
before calling a render done, and quote the numbers in the final report.

## 1. Container and stream facts

```bash
ffprobe -v error -show_entries \
  format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels \
  -of json final.mp4
```

Assert:

| check | expectation |
|---|---|
| resolution | matches the brief (1920x1080) |
| frame rate | `30/1` exactly, constant |
| duration | **equals the source audio**, within ~0.2 s |
| video codec | h264, yuv420p |
| audio codec | aac, 48000 Hz, 2 channels |

The duration check is the important one: it proves the picture was cut to the music rather
than padded.

## 2. Exact frame count

```bash
ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=nb_read_frames -of default=nw=1:nk=1 final.mp4
```

Expect `round(duration * fps)`, **allow a few frames of concat slack**. A stream-copy
concat loses a fraction of a frame per join. If you re-encode with `fps=30` on concat, the
count is exact; otherwise tolerate up to ~4 frames and say so rather than failing the build.

## 3. Black and freeze detection

```bash
ffmpeg -i final.mp4 -vf blackdetect=d=0.35:pix_th=0.06 -an -f null -
ffmpeg -i final.mp4 -vf freezedetect=n=-60dB:d=1.2 -an -f null -
```

Black runs are acceptable only in the head/tail fades. Any frozen stretch in the body means
dropped frames — a bug in the capture loop.

## 4. Audio integrity — do not "fix" the master

```bash
ffmpeg -i final.mp4 -af ebur128=peak=true -f null -
```

This is the check people get wrong. If you pass the user's master through untouched, the
output loudness **should equal the source**, not some streaming target. Measure the source
separately and compare:

| | value |
|---|---|
| source master | e.g. −7.5 LUFS |
| output | e.g. −7.8 LUFS |
| acceptable delta | ≤ 0.5 LU |

Also check true peak < 1.0 dBFS. Do **not** normalise a music video to −14 LUFS; that
target is for speech streaming and it will destroy a mastered track's dynamics. Fail the
build if the delta is large — that means you accidentally re-encoded the audio.

## 5. The beat-modulation test — the one that actually proves sync

Cut detection does not work here: a continuous CRT film has no hard cuts, so a
scene-change metric returns zero and tells you nothing.

Instead, prove the **picture brightness** modulates at the song's tempo:

1. Extract per-frame average luma of the *tube area only*:
   `ffmpeg -i final.mp4 -vf "crop=1276:902:258:48,signalstats,metadata=print:key=lavfi.signalstats.YAVG" -an -f null -`
2. Run a Goertzel filter at the tempo frequency `bpm/60` over the luma series → amplitude
   and phase.
3. Average luma at beat times vs at half-beat (off-beat) times.
4. **Control:** repeat step 3 against a deliberately half-beat-shifted grid.

Pass criteria:

- tempo modulation amplitude ≥ ~1% of mean luma
- on-beat mean luma measurably **higher** than off-beat
- the shifted control is measurably **lower** than the true grid

The control is what makes this a real test. Without it, any gently varying brightness
would "pass".

Real numbers from a passing render:

| metric | value |
|---|---|
| 130 BPM modulation | 3.95% of mean luma |
| residual phase error | 11 ms |
| on-beat luma | 45.75 |
| off-beat luma | 44.13 |
| on-beat lift | +3.68% |
| half-shift control | −3.55% vs true grid |

## 6. Bounded-density test

If the design has any repeating decorative layer, measure that its ink stays bounded over
time. Sample the lit-pixel fraction of the tube every second across the section:

```
t      lit%
148.0  8.537
155.0  9.463
162.0  7.506
```

Pass when the last sample is not materially above the first (e.g. `last <= first * 1.45`).
This is what catches the "background accumulates and buries the foreground" class of bug.

## 7. Token/sprite ratio checks

When a design specifies a proportion (e.g. "at least 60% of these tokens must be red"),
count it at the source rather than sampling pixels:

```js
// instrument the ink context the renderer actually draws through
const g = window.MV.inkCanvas().getContext("2d");
const orig = g.fillText.bind(g);
g.fillText = function (s) { /* tally by fillStyle */ return orig.apply(null, arguments); };
```

Caveat learned the hard way: wrap **both** the screen context and the ink context.
Wrapping only one can intercept nothing, because the renderer's text helper may write to
the other one. If your tally is zero, the instrumentation is wrong, not the feature.

## 8. Visual sampling

Render a contact sheet from the **finished video** at one timecode per storyboard shot:

```bash
ffmpeg -y -i final.mp4 -vf "select='eq(n\,450)+eq(n\,1500)',scale=480:270" -vsync 0 s%02d.png
ffmpeg -y -f concat -safe 0 -i list.txt -filter_complex "tile=4xN" sheet.png
```

Then actually look at it. Instruments cannot tell you that a character reads as a black
dome or that a label collides with a diode symbol.

## 9. Report

Quote measured numbers, and state the known trade-offs plainly, e.g.:

- "6357 frames vs 6359 expected — TS concat boundary slack; duration matches the audio"
- "audio is the source master unaltered, so loudness stays at −7.8 LUFS by design"
- "text no longer participates in tearing: legibility was prioritised"
