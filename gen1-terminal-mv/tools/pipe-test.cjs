/* tools/pipe-test.cjs — does streaming PNG frames straight into ffmpeg work here?
 *
 *   node tools/pipe-test.cjs [frames]
 *
 * A 45-frame smoke test: drives the real composition with window.__draw and pipes
 * each screenshot into ffmpeg's image2pipe, exactly as the render workers do, so a
 * broken ffmpeg/back-pressure combination is found in seconds instead of after a
 * render. Writes build/pipe-test.mp4. No absolute paths: see tools/lib/env.cjs.
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { ROOT, chrome, ffmpeg } = require("./lib/env.cjs");

const CHROME = chrome();
const FRAMES = parseInt(process.argv[2] || "45", 10);
const OUT = path.join(ROOT, "build", "pipe-test.mp4");
const URL = "file:///" + path.join(ROOT, "index.html").split(path.sep).join("/");

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const ff = spawn(ffmpeg, ["-y", "-f", "image2pipe", "-vcodec", "png", "-r", "30", "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", OUT],
    { stdio: ["pipe", "inherit", "pipe"] });
  let err = "";
  ff.stderr.on("data", (d) => { err += d.toString(); });

  const browser = await chromium.launch({ executablePath: CHROME, args: [
    "--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true && window.__imagesReady === true", null, { timeout: 30000 });

  for (let i = 0; i < FRAMES; i++) {
    await page.evaluate((t) => window.__draw(t), 16 + i / 30);
    const buf = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    /* honour back-pressure, or ffmpeg's pipe buffer fills and frames vanish */
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on("close", r));
  await browser.close();
  console.log("ffmpeg exit", code, "->", path.relative(ROOT, OUT));
  if (code !== 0) console.log(err.slice(-1200));
  process.exit(code === 0 ? 0 : 1);
})();
