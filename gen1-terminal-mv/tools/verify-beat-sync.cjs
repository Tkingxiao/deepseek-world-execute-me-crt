
/* verify-beat-sync.cjs — proves the picture pulses on the measured beat grid */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
/* ask the shared resolver instead of hardcoding an install path */
const FF = require("./lib/ffmpeg.cjs").ffmpeg;
const FILE = process.argv[2] || path.join(ROOT, "render", "world-execute-me_1080p.mp4");
const BPM = 130, OFF = 0.1535, FPS = 30;

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let o = "", e = "";
    p.stdout.on("data", d => o += d);
    p.stderr.on("data", d => { e += d; if (e.length > 6e6) e = e.slice(-3e6); });
    p.on("close", c => res({ code: c, out: o, err: e }));
  });
}

(async () => {
  /* 1. per-frame average luma */
  const CROP = process.argv[3] || "crop=1276:902:258:48";
  /* song-time offset of the first analysed frame (0 for the full render) */
  const T0 = parseFloat(process.argv[4] || "0");
  const r = await run(FF, ["-hide_banner", "-nostats", "-i", FILE,
    "-vf", CROP + ",signalstats,metadata=print:key=lavfi.signalstats.YAVG",
    "-an", "-f", "null", "-"]);
  const ys = [...r.err.matchAll(/pts_time:([\d.]+)[\s\S]{0,200}?lavfi\.signalstats\.YAVG=([\d.]+)/g)]
    .map(m => ({ t: parseFloat(m[1]), y: parseFloat(m[2]) }))
    .sort((a, b) => a.t - b.t);
  if (ys.length < 100) { console.error("could not read per-frame luma (" + ys.length + ")"); process.exit(2); }

  const t0 = ys[0].t, t1 = ys[ys.length - 1].t;
  const N = ys.length;
  const mean = ys.reduce((a, b) => a + b.y, 0) / N;
  const sd = Math.sqrt(ys.reduce((a, b) => a + (b.y - mean) ** 2, 0) / N);

  /* 2. Goertzel: amplitude of the 130 BPM modulation and its phase on the grid */
  const f0 = BPM / 60;                  /* 2.1666 Hz */
  const dt = (t1 - t0) / (N - 1);
  let re = 0, im = 0;
  for (const s of ys) {
    const ph = 2 * Math.PI * f0 * (s.t - t0);
    re += (s.y - mean) * Math.cos(ph);
    im += (s.y - mean) * Math.sin(ph);
  }
  re = 2 * re / N; im = 2 * im / N;
  const amp = Math.hypot(re, im);
  const phaseSec = Math.atan2(im, re) / (2 * Math.PI * f0);   /* peak offset in seconds, within the clip */
  /* best phase: shift the grid by the measured offset and compare */
  /* convert the in-clip peak offset into song time and compare with the grid */
  const peakSong = T0 + phaseSec;
  const OFF2 = ((peakSong - OFF) % (1 / f0) + 1 / f0) % (1 / f0);

  /* 3. direct grid test: luminance averaged at beat vs off-beat times */
  const atTime = (t) => {
    const i = Math.round((t - t0) / dt);
    return (i >= 0 && i < N) ? ys[i].y : null;
  };
  const BEAT = 60 / BPM;
  let onSum = 0, onN = 0, offSum = 0, offN = 0;
  for (let k = Math.ceil((t0 + T0 - OFF) / BEAT); ; k++) {
    const bt = OFF + k * BEAT - T0;
    if (bt > t1) break;
    const a = atTime(bt);
    const b = atTime(bt + BEAT / 2);
    if (a != null) { onSum += a; onN++; }
    if (b != null) { offSum += b; offN++; }
  }
  const onMean = onSum / onN, offMean = offSum / offN;

  /* 4. same test against a deliberately wrong grid (off by half a beat) */
  let badSum = 0, badN = 0;
  for (let k = Math.ceil((t0 - OFF - BEAT / 2) / BEAT); ; k++) {
    const bt = OFF + BEAT / 2 + k * BEAT - T0;
    if (bt > t1) break;
    const a = atTime(bt);
    if (a != null) { badSum += a; badN++; }
  }
  const badMean = badSum / badN;

  const modPct = 100 * amp / mean;
  const lift = 100 * (onMean - offMean) / offMean;

  console.log("=== BEAT SYNC ANALYSIS ===");
  console.log("  frames analysed      : " + N + "  (" + t0.toFixed(2) + "s .. " + t1.toFixed(2) + "s)");
  console.log("  mean luma            : " + mean.toFixed(2) + "  sd " + sd.toFixed(2));
  console.log("  130 BPM modulation   : amplitude " + amp.toFixed(3) + "  = " + modPct.toFixed(2) + "% of mean");
  console.log("  residual phase error : " + (phaseSec * 1000).toFixed(1) + " ms");
  console.log("  implied beat offset  : " + (OFF2 * 1000).toFixed(1) + " ms (measured grid " + (OFF * 1000).toFixed(1) + " ms)");
  console.log("  luma ON  beat        : " + onMean.toFixed(2));
  console.log("  luma OFF beat (half) : " + offMean.toFixed(2));
  console.log("  on-beat lift         : " + lift.toFixed(2) + " %");
  console.log("  control (half-shift) : " + badMean.toFixed(2) + "  -> " +
              (100 * (badMean - onMean) / onMean).toFixed(2) + "% vs on-beat");

  const pass = modPct > 1.0 && lift > 1.0 && badMean < onMean;
  console.log("RESULT: " + (pass ? "PASS — the picture is measurably pulsing on the 130 BPM grid"
                                 : "FAIL — no significant beat-locked modulation"));
  fs.writeFileSync(ROOT + "\\render\\beat-sync.json",
    JSON.stringify({ N, mean, sd, amp, modPct, phaseMs: phaseSec * 1000, onMean, offMean, lift, badMean, pass }, null, 1));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error("ERROR", e); process.exit(3); });
