
/* storm-iter.cjs — render just the EXECUTION section through the real encode
   settings, so tuning is done against what the viewer actually sees.
   h264 4:2:0 subsampling costs saturated red more than anything else, so a
   preview PNG measurement overstates the red share of the delivered video. */
const { spawn } = require("child_process");
const fs = require("fs"), path = require("path");
const ROOT = process.cwd();
const { ffmpeg: FF } = require("./lib/ffmpeg.cjs");
const CHROME = process.env.MV_CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(ROOT, "build", "storm-iter");
const S = parseInt(process.argv[2] || "4429", 10);
const N = parseInt(process.argv[3] || "450", 10);

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const ff = spawn(FF, ["-y", "-f", "image2pipe", "-vcodec", "png", "-r", "30", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-g", "15", "-keyint_min", "15", "-sc_threshold", "0", path.join(OUT, "storm.mp4")],
    { stdio: ["pipe", "ignore", "pipe"] });
  ff.stderr.on("data", () => {});
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--disable-lcd-text",
           "--font-render-hinting=none", "--allow-file-access-from-files", "--disable-web-security"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto("file:///" + path.join(ROOT, "index.html").replace(/\\\\/g, "/"), { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true && window.__imagesReady === true", null, { timeout: 60000 });
  for (let i = 0; i < N; i++) {
    await page.evaluate((t) => window.__draw(t), (S + i) / 30);
    const buf = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  await browser.close();
  /* pull one frame per second out of the ENCODED file */
  await new Promise((res, rej) => {
    const p = spawn(FF, ["-y", "-v", "error", "-i", path.join(OUT, "storm.mp4"),
      "-vf", "fps=1", path.join(OUT, "e%02d.png")], { stdio: "ignore" });
    p.on("close", c => c === 0 ? res() : rej(new Error("extract failed")));
  });
  console.log("encoded section ready: " + path.join(OUT, "storm.mp4"));
})();
