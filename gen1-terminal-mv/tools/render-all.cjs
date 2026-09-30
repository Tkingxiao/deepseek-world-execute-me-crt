
/* render-all.cjs — chunked parallel render, concat, mux, verify */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
/* ask the shared resolver instead of hardcoding install paths */
const FF = require("./lib/ffmpeg.cjs").ffmpeg;
const FP = require("./lib/ffmpeg.cjs").ffprobe;
/* bring your own song: MV_SONG overrides, otherwise input/song.mp3 */
const SONG = process.env.MV_SONG || path.join(ROOT, "input", "song.mp3");
const FPS = 30;
const TOTAL = parseInt(process.env.MV_FRAMES || "6359", 10);
const CHUNKS = parseInt(process.env.MV_CHUNKS || "8", 10);
const TMP = path.join(ROOT, "build", "segments");
const OUTDIR = path.join(ROOT, "render");

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, Object.assign({ stdio: ["ignore", "pipe", "pipe"] }, opts || {}));
    let o = "", e = "";
    p.stdout.on("data", (d) => { o += d.toString(); process.stdout.write((opts && opts.echo) ? d : ""); });
    p.stderr.on("data", (d) => { e += d.toString(); });
    p.on("close", (c) => c === 0 ? resolve(o) : reject(new Error(cmd + " exit " + c + "\n" + e.slice(-2000))));
  });
}

/* a segment left behind by a killed run can still be tens of MB, so size proves
   nothing; ask the decoder how many frames are actually inside before trusting it */
async function segmentOk(file, wantFrames) {
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) return false;
  try {
    const o = await run(FP, ["-v", "error", "-count_frames", "-select_streams", "v:0",
      "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", file]);
    const got = parseInt(o.trim(), 10);
    if (Math.abs(got - wantFrames) <= 2) return true;
    console.log("incomplete segment " + path.basename(file) + " (" + got + " of " + wantFrames + " frames), re-rendering");
  } catch (e) {
    console.log("unreadable segment " + path.basename(file) + ", re-rendering");
  }
  return false;
}

(async () => {
  const only = process.argv.includes("--concat-only");
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(OUTDIR, { recursive: true });

  const bounds = [];
  const per = Math.ceil(TOTAL / CHUNKS);
  for (let i = 0; i < CHUNKS; i++) {
    const s = i * per, e = Math.min(TOTAL, (i + 1) * per);
    if (s < e) bounds.push([s, e]);
  }

  if (!only) {
    const t0 = Date.now();
    const procs = bounds.map(async ([s, e], i) => {
      const out = path.join(TMP, "seg" + String(i).padStart(2, "0") + ".ts");
      if (await segmentOk(out, e - s)) { console.log("skip existing " + out); return; }
      console.log("chunk " + i + " frames " + s + ".." + e);
      await run("node", ["tools/render-worker.cjs", "--start", String(s), "--end", String(e), "--mode", "ts", "--out", out]);
    });
    await Promise.all(procs);
    console.log("render wall time: " + ((Date.now() - t0) / 1000).toFixed(1) + " s with " + bounds.length + " chunks");
  }

  /* concat */
  const listFile = path.join(TMP, "list.txt");
  fs.writeFileSync(listFile, bounds.map((_, i) => "file '" + path.join(TMP, "seg" + String(i).padStart(2, "0") + ".ts").replace(/\\/g, "/") + "'").join("\n"));
  const silent = path.join(OUTDIR, "world-execute-me_silent.mp4");
  /* Re-encode on concat with an explicit constant frame rate. A stream-copy
     concat drops a frame at each segment boundary; normalising the timestamps
     restores them so the video stream has exactly the expected frame count. */
  await run(FF, ["-y", "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", "fps=" + FPS, "-c:v", "libx264", "-preset", "veryfast", "-crf", "17",
    "-pix_fmt", "yuv420p", "-r", String(FPS), silent]);
  console.log("concat (re-encoded, cfr) -> " + silent);

  /* a short concat is the one failure this pipeline used to hide: it still muxes
     and probes cleanly, so refuse to go on unless the frame count is right */
  const nfOut = await run(FP, ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=nb_frames", "-of", "default=nw=1:nk=1", silent]);
  const gotFrames = parseInt(nfOut.trim(), 10);
  if (!(Math.abs(gotFrames - TOTAL) <= 4)) {
    throw new Error("concat holds " + gotFrames + " frames, expected " + TOTAL +
                    " - a segment under " + TMP + " is incomplete; kept for inspection, run again to re-render it");
  }
  console.log("concat frames " + gotFrames + " / " + TOTAL);

  /* mux audio */
  const final = path.join(OUTDIR, "world-execute-me_1080p.mp4");
  await run(FF, ["-y", "-i", silent, "-i", SONG,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
    "-movflags", "+faststart", "-shortest", final]);
  console.log("mux -> " + final);

  const probe = await run(FP, ["-v", "error", "-show_entries",
    "format=duration,size:stream=index,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels",
    "-of", "json", final]);
  console.log(probe);
  fs.writeFileSync(path.join(ROOT, "render", "probe.json"), probe);

  /* the segments are only a cache for this one run: a leftover truncated .ts is
     exactly what got concatenated into a short video before, so a run that made
     it all the way here wipes them (a failed run keeps them for inspection) */
  try {
    let cleared = 0;
    for (const f of fs.readdirSync(TMP)) {
      if (/^seg\d+\.ts(\.part)?$/.test(f) || f === "list.txt") {
        fs.rmSync(path.join(TMP, f), { force: true });
        cleared++;
      }
    }
    console.log("cleared " + cleared + " cached segments in " + TMP);
  } catch (e) {
    console.log("cache cleanup skipped: " + e.message);
  }
  console.log("DONE");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
