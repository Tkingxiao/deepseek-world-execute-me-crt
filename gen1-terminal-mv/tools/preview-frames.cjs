
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

(async () => {
  const times = (process.argv[2] || "").split(",").filter(Boolean).map(Number);
  const outDir = process.argv[3] || path.join(ROOT, "build", "preview");
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--disable-lcd-text",
           "--font-render-hinting=none", "--allow-file-access-from-files", "--disable-web-security"],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => { console.error("PAGEERROR:", e.message); process.exitCode = 4; });
  page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE:", m.text()); });
  await page.goto("file:///D:/Code/mv/mv-world-execute/index.html", { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true && window.__imagesReady === true", null, { timeout: 30000 });
  const fails = await page.evaluate("window.MV_IMG_FAILED || []");
  if (fails.length) console.error("MISSING IMAGES:", fails.join(","));
  for (const t of times) {
    await page.evaluate((tt) => window.__draw(tt), t);
    const buf = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    fs.writeFileSync(path.join(outDir, "t" + t.toFixed(2).padStart(8, "0").replace(".", "_") + ".png"), buf);
  }
  await browser.close();
  console.log("preview frames: " + times.length + " -> " + outDir);
})();
