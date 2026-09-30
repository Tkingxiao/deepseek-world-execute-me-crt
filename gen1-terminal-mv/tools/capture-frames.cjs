
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.MV_CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

(async () => {
  const [url, tStart, n, outDir, prefix] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--disable-lcd-text",
           "--font-render-hinting=none", "--disable-font-subpixel-positioning",
           "--allow-file-access-from-files", "--disable-web-security"],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 3; });
  page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE-ERR", m.text()); });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction("typeof window.__draw === 'function'", null, { timeout: 15000 });
  const t0 = parseFloat(tStart);
  const count = parseInt(n, 10);
  for (let i = 0; i < count; i++) {
    await page.evaluate((tt) => { window.__draw(tt); }, t0 + i / 30);
    const shot = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    fs.writeFileSync(path.join(outDir, prefix + String(i).padStart(5, "0") + ".png"), shot);
  }
  await browser.close();
  console.log("captured " + count + " frames -> " + outDir);
})();
