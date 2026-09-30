/* tools/lib/ffmpeg.cjs — locate a usable ffmpeg/ffprobe on this machine.
   Order: MV_FFMPEG env var -> the project's own ffmpeg/ folder -> PATH ->
   the common Windows install folder -> the build shipped with playwright.
   Never a hardcoded path: a script that only runs on the machine it was written
   on is not a tool. The playwright build is filtered out unless it can decode
   audio, see audioCapable. */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

/* tools/lib/ffmpeg.cjs -> tools/lib -> tools -> <project root> */
const ROOT = path.resolve(__dirname, "..", "..");

function exists(p) { try { return p && fs.existsSync(p); } catch (e) { return false; } }

function fromPath(name) {
  const dirs = (process.env.PATH || "").split(path.delimiter);
  const exts = process.platform === "win32" ? [".exe", ""] : [""];
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, name + e);
      if (exists(p)) return p;
    }
  }
  return null;
}

function fromPlaywright(name) {
  /* playwright ships ffmpeg next to its browsers; there is only ffmpeg, no ffprobe */
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), "AppData", "Local", "ms-playwright"),
    path.join(os.homedir(), ".cache", "ms-playwright"),
    path.join(os.homedir(), "Library", "Caches", "ms-playwright"),
  ].filter(Boolean);
  const want = name === "ffprobe" ? "ffprobe" : "ffmpeg";
  for (const r of roots) {
    if (!exists(r)) continue;
    let entries = [];
    try { entries = fs.readdirSync(r); } catch (e) { continue; }
    for (const d of entries) {
      if (d.indexOf(want) !== 0) continue;
      const base = path.join(r, d);
      let files = [];
      try { files = fs.readdirSync(base); } catch (e) { continue; }
      for (const f of files) {
        if (f.indexOf(want) === 0 && /(win64|\.exe|^ffmpeg$|^ffprobe$)/.test(f)) {
          const p = path.join(base, f);
          if (exists(p)) return p;
        }
      }
    }
  }
  return null;
}

function locate(name) {
  const envKey = name === "ffprobe" ? "MV_FFPROBE" : "MV_FFMPEG";
  const exe = name + (process.platform === "win32" ? ".exe" : "");
  const cands = [
    process.env[envKey],
    path.join(ROOT, "ffmpeg", exe),
    fromPath(name),
    fromPlaywright(name),
  ].filter(Boolean);
  return [...new Set(cands)].filter(exists);
}

/* playwright's ffmpeg is configured with --disable-everything and only carries image
   codecs, so it rejects a valid mp3 as "Invalid data found when processing input".
   That message blames the input file, so check the capability instead of believing it. */
function canDecodeMp3(p) {
  try {
    const out = execFileSync(p, ["-hide_banner", "-loglevel", "error", "-decoders"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000 });
    return out.split("\n").some((l) => /^mp3\w*$/.test((l.trim().split(/\s+/)[1] || "")));
  } catch (e) {
    return false;
  }
}

const ffprobe = locate("ffprobe")[0] || null;

const ffmpegCands = locate("ffmpeg");
let ffmpeg = null;
let audioCapable = false;
for (const c of ffmpegCands) {
  if (canDecodeMp3(c)) {
    ffmpeg = c;
    audioCapable = true;
    break;
  }
}
if (!ffmpeg) ffmpeg = ffmpegCands[0] || null;

if (!ffmpeg) {
  console.error("\n[FATAL] ffmpeg not found.");
  console.error("Install it, or drop ffmpeg.exe / ffprobe.exe into "
    + path.join(ROOT, "ffmpeg") + ",");
  console.error("or set MV_FFMPEG / MV_FFPROBE to the full paths.\n");
  process.exit(2);
}
if (!audioCapable) {
  console.error("[FATAL] ffmpeg at " + ffmpeg + " cannot decode audio (no mp3 decoder).");
  console.error("        Install a full build from ffmpeg.org and set MV_FFMPEG to it,");
  console.error("        or drop ffmpeg.exe / ffprobe.exe into " + path.join(ROOT, "ffmpeg") + ".");
}

module.exports = { ffmpeg, ffprobe, hasProbe: !!ffprobe, audioCapable };
