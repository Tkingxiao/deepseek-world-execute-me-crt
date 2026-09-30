# Beat detection and timeline construction

Nothing in a beat-synced MV matters more than this. Get it wrong and every cut, pulse
and lyric lands slightly off — which reads as "amateur" without anyone being able to
name why.

## 1. Do not trust the stated BPM

Briefs say things like "130 BPM". Treat that as a hypothesis to be tested, because:

- masters are often a few tenths off (129.2, 130.4)
- a track can be nominally 130 and actually be 65 or 260 depending on the groove
- some tracks drift, or have a pickup bar that shifts the phase

Measure it. If the measurement disagrees with the brief, **use the measurement and say so**.

## 2. Decode to raw PCM first

Never analyse a compressed file directly through a library that re-decodes differently
each run. Decode once to raw float32 mono PCM and analyse that. 22050 Hz mono is plenty
for onset detection and keeps the analysis fast.

```bash
ffmpeg -i song.mp3 -f f32le -ac 1 -ar 22050 audio_mono22050.f32
```

If no system ffmpeg exists, read `render-pipeline.md` §4 before reaching for Playwright's —
that bundled build has no audio decoders at all and cannot open an mp3.

## 3. Build an onset envelope

Spectral flux, not RMS. RMS misses cymbals and transients; flux catches them.

1. STFT: NFFT 1024, hop 256 (≈86 frames/second at 22050 Hz)
2. Hann window
3. Group bins into ~96 log-spaced bands, take `log1p(sum of magnitudes)` per band
4. Flux = sum of positive frame-to-frame band differences
5. **Subtract a local moving average** (~0.35 s) and half-wave rectify — this removes the
   slow loudness envelope and leaves real onsets
6. Normalise to 0..1

Step 5 is what makes the difference between "beats detected" and "beats detected reliably
during quiet verses".

## 4. Find tempo by autocorrelation over a range

Autocorrelate the onset envelope over lags corresponding to 70–200 BPM. The top lag gives
a coarse tempo. Expect octave errors (65 vs 130) — resolve them by looking at which
candidate gives the strongest *phase-locked* score, not just the strongest autocorrelation.

## 5. Refine tempo and phase

For a fine scan, sweep tempo in small steps (0.005 BPM) across a ±5 BPM window around the
coarse estimate. For each candidate:

- the period is `60 / bpm * fps` frames
- search the phase offset over a full beat at ~1/20-beat resolution
- score = mean onset strength sampled at every grid line

Take the (tempo, phase) pair with the highest score. Real data from a 212 s track:

| candidate | score |
|---|---|
| **130.000** | **0.1786** |
| 129.995 | 0.1763 |
| 130.005 | 0.1699 |
| 129.5 | 0.0514 |

A good fit has a clear peak. If the top several candidates are within a few percent of
each other, the tempo is ambiguous — go back and reconsider the octave.

## 6. Prove there is no drift

Split the track in half. Re-run the phase search independently on each half. Compare each
half's best offset to the global offset, in beats:

- shift < 0.01 beat → rock solid, a single grid is safe
- shift of 0.1–0.5 beat → the track drifts; consider a per-section grid
- shift > 0.5 beat → you are locked to the wrong tempo

Do this before you render 6000 frames against a grid you have not validated.

## 7. Per-beat energy table

For every beat index, sample:

| field | meaning | use |
|---|---|---|
| `onset` | normalised flux at that beat | drives pulses, flashes, brightness |
| `low` / `mid` / `high` | band energy relative to a local average | bar heights, colour, motion amount |

Normalise each band by its own 95th percentile so the values are comparable across the
track. Then **every visual pulse reads from this table**, e.g.:

```js
// decaying pulse fired on each beat, scaled by that beat's measured onset
function pulse(t) {
  const x = beatIndex(t), frac = x - Math.floor(x);
  return Math.exp(-frac / 0.55) * (0.30 + 0.70 * energyAt(t).onset);
}
```

This is why the result feels musical: accents are not evenly spaced, they follow the
actual recording.

## 8. Parse the lyrics

LRC format: `[mm:ss.xx]text`. Build a sorted list of `{ t, text }`.

Classify each line:

- **key line** — all caps (PROTECTION, EXECUTION, LIMITATIONS…). These get the inverted
  flash treatment.
- **normal line** — everything else.

Compute each line's visible duration from the *next* line's onset, so the typewriter
speed adapts:

```js
const cps = clamp((text.length / duration) * 0.70, 10, 32);   // chars per second
```

The 0.70 keeps a margin so a long line finishes typing just before the next one starts.

## 9. Snap, but only when it helps

For each lyric onset, find the nearest grid line. If the distance is within **~120 ms**,
snap the line's start to the grid — those are the lines where the vocal really is on the
beat. Otherwise **keep the true vocal time**.

Snapping everything forces lines that were sung deliberately off-beat onto the grid, which
audibly drags the words off the voice. Snapping nothing throws away free tightness. A
one-third to one-half snap rate is typical and healthy.

Report the snap rate. If it is near 0% or near 100%, something is wrong with the grid.

## 10. Write the timeline artifact

One JSON file that everything downstream reads:

```json
{
  "meta": { "bpm": 130, "beat": 0.4615, "beatOffset": 0.1535, "fps": 30, "duration": 211.967, "frames": 6359 },
  "sections": [{ "id": "P3_CURRENT", "label": "...", "start": 44.452, "end": 59.223, "phase": 3 }],
  "beats":   [{ "k": 0, "t": 0.1535, "bar": 0, "downbeat": true }],
  "lines":   [{ "t": 29.709, "tOn": 29.709, "text": "...", "key": false, "section": "P2_VERSE" }]
}
```

Freeze it. Every render must use the same file, so a re-render is bit-comparable.
