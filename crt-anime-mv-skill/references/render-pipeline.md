# Deterministic render pipeline

## 1. Expose one virtual-time function

```js
window.__draw = function (t) { /* draw the whole frame for time t */ };
```

**Never** drive the composition from `requestAnimationFrame` or a clock. Every visual must
be a pure function of `t`. This buys three things:

- frame N is always the same picture, so a re-render reproduces the film
- any frame can be rendered in isolation for review
- chunks can be rendered out of order, in parallel, by separate processes

## 2. Prove determinism before parallelising

Render the same short range twice, in two separate browser sessions, and compare file
hashes:

```bash
node tools/capture-frames.cjs <url> 3.0 4 out_a f
node tools/capture-frames.cjs <url> 3.0 4 out_b f
node tools/cmp-dirs.cjs out_a out_b      # must print "N/N identical"
```

If they differ, the cause is almost always:

- a `Date.now()` / `performance.now()` dependency
- per-frame randomness without a seed (seed every RNG from `floor(t * fps)`)
- a font or image that had not finished loading on one run

Fix these before chunking. Parallel rendering amplifies non-determinism into visible
flicker at every chunk boundary.

## 3. Frame capture in the browser

Playwright driving Chrome. Two settings matter a lot:

```js
const browser = await chromium.launch({
  executablePath: CHROME,                         // reuse the user's installed Chrome
  args: ["--force-color-profile=srgb", "--hide-scrollbars",
         "--disable-lcd-text", "--font-render-hinting=none",
         "--allow-file-access-from-files", "--disable-web-security"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction("window.__ready === true && window.__imagesReady === true");
for (let i = 0; i < n; i++) {
  await page.evaluate((t) => window.__draw(t), startFrame / 30 + i / 30);
  const buf = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
}
```

- `--font-render-hinting=none` and `--disable-lcd-text` make glyph rasterisation stable
  across machines.
- Gate the first frame on an explicit readiness flag that is only set once every image has
  loaded, or you will capture blank/partial frames.
- Prefer the user's installed Chrome via `executablePath`; fall back to a downloaded
  Chromium only if none is found.

## 4. Getting ffmpeg without installing ffmpeg

If system ffmpeg is unavailable, **playwright ships one**:

```
%LOCALAPPDATA%\ms-playwright\ffmpeg-*\ffmpeg-win64.exe
```

**Check what that binary can actually do before relying on it.** The Playwright build is
compiled `--disable-everything` and is dramatically narrower than a normal ffmpeg. Verified
on `ffmpeg-1011` (`n7.0.1-playwright-build-1011`), it contains exactly:

- decoders: `mjpeg`, `libvpx` (VP8)
- encoders: `png`, `libvpx` (VP8)
- muxers: `image2`, `webm`
- filters: `pad`, `crop`, `scale`
- **no audio decoders or encoders of any kind**

It exists so Playwright can turn its own recorded WebM video into PNG frames. Measured
against what this pipeline needs:

| | Playwright build | Needed by this pipeline |
|---|---|---|
| `libx264` (H.264) | ❌ absent | steps 5–7 (segment, concat, mux) |
| `aac` | ❌ absent | muxing the audio |
| any audio decoder | ❌ absent | cannot even read `song.mp3` |
| `ffprobe` | ❌ not shipped | all of `verification.md` |
| mp3 demuxer/decoder | ❌ absent | `beat-and-timeline.md` §2 |
| VP8/WebM, png, mjpeg | ✅ present | — |

So it **cannot** substitute for a real ffmpeg anywhere in this skill. `-c:v libx264` fails
with `Unrecognized option 'preset'`, and `-i song.mp3 ... -f f32le` fails with
`Invalid data found when processing input`. Install a full build instead
(`winget install --id Gyan.FFmpeg -e`), and never point `HYPERFRAMES_FFMPEG_PATH` at this
binary (`references/hyperframes.md`).

## 5. Stream frames straight into ffmpeg

Do not write thousands of PNGs to disk unless you need them. Pipe them:

```js
const ff = spawn(FF, [
  "-y", "-f", "image2pipe", "-vcodec", "png", "-r", "30", "-i", "-",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18",
  "-pix_fmt", "yuv420p", "-g", "15", "-keyint_min", "15", "-sc_threshold", "0",
  "-f", "mpegts", outPath,
], { stdio: ["pipe", "ignore", "pipe"] });

for (...) {
  const buf = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
}
ff.stdin.end();
```

Regular keyframes (`-g 15`, closed GOP) make the segments concatenable.

Pipe writes back-pressure, so honour the `drain` event; otherwise ffmpeg's pipe buffer
fills and frames are silently lost.

## 6. Chunk in parallel

Split the frame range into N contiguous chunks and run N worker processes, each with its
own browser and its own ffmpeg, each writing an MPEG-TS segment.

- **8 chunks** is a reasonable default on a modern desktop. Browser rendering is the
  bottleneck, not CPU count.
- Measure and report wall time.
- A 6359-frame 1080p render at 30 fps takes roughly **7–8 minutes** across 8 workers.
- Watch memory: each worker holds a Chrome instance (~0.5–1 GB).

## 7. Concat and mux

```bash
# concat, re-encoded to a constant frame rate
ffmpeg -y -f concat -safe 0 -i list.txt -vf fps=30 -c:v libx264 -preset veryfast -crf 17 \
       -pix_fmt yuv420p -r 30 silent.mp4

# mux the ORIGINAL audio back in, untouched
ffmpeg -y -i silent.mp4 -i input/song.mp3 -map 0:v:0 -map 1:a:0 \
       -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart final.mp4
```

Two details:

- **Re-encode on concat, do not stream-copy.** A stream-copy concat drops a fraction of a
  frame at each segment join (a 6359-frame render can come out 6355). Normalising with
  `-vf fps=30` restores constant frame rate and the correct count.
- **Pass the music through untouched.** Re-encoding the user's master changes its loudness
  and can clip it. Copy the original audio track.

## 8. Font loading in the browser

Register CJK/system fonts explicitly. Also make the ink context re-apply the font
whenever the picture context's font changes, or the ink layer measures text with a stale
font and positions drift.

## 9. Housekeeping

- clean the segment directory at the start of every run, or a stale segment silently
  re-enters the concat
- on failure, do not delete segments — you want to inspect them
- log per-chunk start/end frame numbers so a bad chunk is identifiable
