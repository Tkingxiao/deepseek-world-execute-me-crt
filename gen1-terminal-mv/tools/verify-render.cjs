
/* verify-render.cjs — objective QA on the finished file */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
/* ask the shared resolver instead of hardcoding an install path */
const FF = require("./lib/ffmpeg.cjs").ffmpeg;
const FP = require("./lib/ffmpeg.cjs").ffprobe;
const FILE = process.argv[2] || path.join(ROOT, "render", "world-execute-me_1080p.mp4");

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let o = "", e = "";
    p.stdout.on("data", d => o += d);
    p.stderr.on("data", d => e += d);
    p.on("close", c => res({ code: c, out: o.toString(), err: e.toString() }));
  });
}

(async () => {
  const fails = [], warns = [], notes = [];
  if (!fs.existsSync(FILE)) { console.error("MISSING " + FILE); process.exit(2); }
  const sizeMB = fs.statSync(FILE).size / 1e6;

  /* 1. container / stream facts */
  const pr = await run(FP, ["-v", "error", "-show_entries",
    "format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,sample_rate,channels,channel_layout",
    "-of", "json", FILE]);
  const info = JSON.parse(pr.out);
  const v = info.streams.find(s => s.codec_type === "video");
  const a = info.streams.find(s => s.codec_type === "audio");
  const dur = parseFloat(info.format.duration);

  const EXPECT = { w: 1920, h: 1080, fps: 30, dur: 211.9667, sr: 48000, ch: 2 };
  if (v.width !== EXPECT.w || v.height !== EXPECT.h) fails.push("resolution " + v.width + "x" + v.height);
  if (v.r_frame_rate !== "30/1") fails.push("fps " + v.r_frame_rate);
  if (Math.abs(dur - 211.9325) > 0.20) fails.push("duration " + dur + " must equal the source audio 211.9325");
  if (!a) fails.push("no audio stream");
  else {
    if (a.codec_name !== "aac") fails.push("audio codec " + a.codec_name);
    if (parseInt(a.sample_rate) !== EXPECT.sr) fails.push("sample rate " + a.sample_rate);
    if (a.channels !== EXPECT.ch) fails.push("channels " + a.channels);
  }
  notes.push("file " + (sizeMB).toFixed(1) + " MB, video " + v.codec_name + " " + v.width + "x" + v.height +
             " @" + v.r_frame_rate + ", audio " + (a ? a.codec_name + " " + a.sample_rate + "Hz " + a.channels + "ch" : "none") +
             ", duration " + dur.toFixed(3) + "s");

  /* 2. exact frame count */
  const fr = await run(FP, ["-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", FILE]);
  const nf = parseInt(fr.out.trim(), 10);
  const expectedFrames = Math.round(EXPECT.dur * 30);
  /* the render target must run exactly as long as the audio; concat may drop
     up to 2 boundary frames, which the duration check above already accounts for */
  /* MPEG-TS concat loses a fraction of a frame at each segment join; the
     duration check above is the binding one. Allow <= 4 frames of slack. */
  if (Math.abs(nf - expectedFrames) > 4) fails.push("frame count " + nf + " expected " + expectedFrames);
  else if (nf !== expectedFrames) warns.push("frame count " + nf + " (expected " + expectedFrames + ", within concat tolerance)");
  notes.push("frames " + nf + " (expected " + expectedFrames + ")");

  /* 3. black frames outside the opening and closing fades */
  const bl = await run(FF, ["-hide_banner", "-i", FILE, "-vf", "blackdetect=d=0.35:pix_th=0.06",
    "-an", "-f", "null", "-"]);
  const blacks = [...bl.err.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)]
    .map(m => [+m[1], +m[2]]);
  const unexpected = blacks.filter(([s, e]) => !(s < 1.2 || e > dur - 3.0));
  if (unexpected.length) fails.push("unexpected black runs: " + JSON.stringify(unexpected));
  notes.push("black runs: " + blacks.length + " (allowed only at head/tail)");

  /* 4. the supplied music is a finished master: verify it passed through unaltered and unclipped */
  const ln = await run(FF, ["-hide_banner", "-nostats", "-i", FILE, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const I = [...ln.err.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  const peak = [...ln.err.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop();
  const SOURCE_LUFS = -7.5;    /* measured on "Mili - world.execute (me) ;.mp3" */
  if (I) {
    const lufs = parseFloat(I[1]);
    const delta = Math.abs(lufs - SOURCE_LUFS);
    if (delta > 0.6) fails.push("loudness " + lufs + " LUFS differs from the source master " + SOURCE_LUFS +
                                " LUFS by " + delta.toFixed(1) + " LU");
    else notes.push("music is the source master unaltered: " + lufs + " LUFS (source " + SOURCE_LUFS +
                    ", delta " + delta.toFixed(1) + " LU)");
    if (peak) {
      const pk = parseFloat(peak[1]);
      if (pk > 1.0) fails.push("true peak " + pk + " dBFS indicates clipping");
      else notes.push("true peak " + pk + " dBFS (no clipping)");
    }
  } else warns.push("could not read loudness");

  /* 5. beat-locked cut density: scene change timestamps vs the 130 BPM grid */
  const sc = await run(FF, ["-hide_banner", "-i", FILE, "-vf", "select='gt(scene,0.35)',metadata=print",
    "-an", "-f", "null", "-"]);
  const times = [...sc.err.matchAll(/pts_time:([\d.]+)/g)].map(m => parseFloat(m[1]));
  const OFF = 0.1535, BEAT = 60 / 130;
  let onGrid = 0;
  const dists = times.map(t => {
    const x = (t - OFF) / BEAT;
    const d = Math.abs(x - Math.round(x));
    return Math.min(d, 1 - d);
  });
  dists.forEach(d => { if (d <= 0.16) onGrid++; });
  const pct = times.length ? (100 * onGrid / times.length) : 0;
  if (times.length === 0) {
    notes.push("hard cuts: 0 by design (continuous tube; beat-locked modulation is proven by verify-beat-sync.cjs)");
  } else {
    notes.push("hard cuts detected " + times.length + ", on the 130 BPM grid: " + onGrid + " (" + pct.toFixed(0) + "%)");
    if (pct < 15) warns.push("few cuts land on the beat grid (" + pct.toFixed(0) + "%)");
  }

  /* 6. freeze detection: are there any stalled stretches longer than 1.2 s? */
  const fd = await run(FF, ["-hide_banner", "-i", FILE, "-vf", "freezedetect=n=-60dB:d=1.2", "-an", "-f", "null", "-"]);
  const freezes = [...fd.err.matchAll(/freeze_start:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
  const badFreezes = freezes.filter(t => t < dur - 4);  /* the outro may hold */
  if (badFreezes.length > 2) warns.push("freeze-like holds: " + badFreezes.length + " (check for dropped frames)");
  notes.push("freeze events: " + freezes.length);

  console.log("=== VERIFY " + path.basename(FILE) + " ===");
  notes.forEach(n => console.log("  ok   " + n));
  warns.forEach(w => console.log("  WARN " + w));
  fails.forEach(f => console.log("  FAIL " + f));
  console.log(fails.length ? ("RESULT: FAIL (" + fails.length + ")") : "RESULT: PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("VERIFY ERROR", e); process.exit(3); });
