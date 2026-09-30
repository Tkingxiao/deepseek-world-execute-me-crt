
/* final-contact-sheet.cjs — sample the finished video at the storyboard shot times */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
/* ask the shared resolver instead of hardcoding an install path */
const FF = require("./lib/ffmpeg.cjs").ffmpeg;
const FILE = process.argv[2] || path.join(ROOT, "render", "world-execute-me_1080p.mp4");
const OUT = path.join(ROOT, "render", "final_sheet.png");

/* representative times: one per storyboard shot */
const TIMES = [36,50,62,81,112.5,120,163,168,182,197,205,210];

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let e = ""; p.stderr.on("data", d => e += d);
    p.on("close", c => c === 0 ? res() : rej(new Error("exit " + c + " " + e.slice(-500))));
  });
}

(async () => {
  const tmp = path.join(ROOT, "build", "sheetsrc");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  await run(FF, ["-y", "-i", FILE, "-vf",
    "select='" + TIMES.map(t => "eq(n\\," + Math.round(t * 30) + ")").join("+") + "',scale=480:270",
    "-vsync", "0", "-frames:v", String(TIMES.length), path.join(tmp, "s%02d.png")]);
  const files = fs.readdirSync(tmp).filter(f => f.endsWith(".png")).sort();
  console.log("sampled " + files.length + " frames");
  const cols = 4, rows = Math.ceil(files.length / cols);
  const list = path.join(tmp, "list.txt");
  fs.writeFileSync(list, files.map(f => "file '" + path.join(tmp, f).replace(/\\/g, "/") + "'").join("\n"));
  await run(FF, ["-y", "-f", "concat", "-safe", "0", "-i", list,
    "-filter_complex", "tile=" + cols + "x" + rows, OUT]);
  console.log("wrote " + OUT);
})().catch(e => { console.error("ERR", e.message); process.exit(1); });