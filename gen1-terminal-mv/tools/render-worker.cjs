
/* render-worker.cjs — renders a contiguous frame range and streams it to ffmpeg */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
/* ask the shared resolver instead of hardcoding install paths */
const FF = require("./lib/ffmpeg.cjs").ffmpeg;
const CHROME = require("./lib/env.cjs").chrome();
const FPS = 30;
const OFF = 0.1535;
const BEAT = 60 / 130;

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

(async () => {
  const startFrame = parseInt(arg("start"), 10);
  const endFrame = parseInt(arg("end"), 10);
  const out = arg("out");
  const mode = arg("mode", "png");          // png (default) | ts
  const width = parseInt(arg("w", "1920"), 10), height = parseInt(arg("h", "1080"), 10);

  /* in png mode 'out' is a directory of frames; in ts mode it is a file.
     Creating dirname() unconditionally left the png directory missing. */
  fs.mkdirSync(mode === "ts" ? path.dirname(out) : out, { recursive: true });

  let ff = null;
  const sink = mode === "ts" ? out + ".part" : out;
  if (mode === "ts") {
    /* a .part still held open means a previous run is alive; fail now instead of
       after the whole chunk finished rendering into it */
    try { fs.rmSync(sink, { force: true }); }
    catch (e) {
      console.error("cannot replace " + sink + " (locked by another process) - is a previous run still going?");
      process.exit(5);
    }
    ff = spawn(FF, [
      "-y", "-f", "image2pipe", "-vcodec", "png", "-r", String(FPS), "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-g", "15", "-keyint_min", "15", "-sc_threshold", "0",
      "-f", "mpegts", sink,
    ], { stdio: ["pipe", "ignore", "pipe"] });
    ff.stderr.on("data", () => {});
  }

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--disable-lcd-text",
           "--font-render-hinting=none", "--allow-file-access-from-files", "--disable-web-security"],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  let pageError = null;
  page.on("pageerror", (e) => { pageError = e.message; });
  page.on("console", (m) => { if (m.type() === "error") pageError = pageError || m.text(); });
  await page.goto("file:///D:/Code/mv/mv-world-execute/index.html", { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true && window.__imagesReady === true", null, { timeout: 60000 });

  const n = endFrame - startFrame;
  for (let i = 0; i < n; i++) {
    const t = (startFrame + i) / FPS;
    await page.evaluate((tt) => window.__draw(tt), t);
    const buf = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    if (mode === "ts") {
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    } else {
      fs.writeFileSync(path.join(out, "f" + String(startFrame + i).padStart(5, "0") + ".png"), buf);
    }
    if (i % 150 === 0) process.stdout.write(".");
  }
  console.log("");

  if (ff) {
    ff.stdin.end();
    const code = await new Promise((r) => ff.on("close", r));
    if (code !== 0) { console.error("FFMPEG FAILED", code); process.exit(3); }
  }
  await browser.close();
  if (pageError) { console.error("PAGE ERROR:", pageError); process.exit(4); }
  if (ff) {
    /* the finished name only appears once every step succeeded, so a killed or
       failed run cannot leave a truncated .ts that the parent would reuse */
    fs.renameSync(sink, out);
  }
  console.log("worker done " + startFrame + ".." + endFrame + " -> " + out);
})();
