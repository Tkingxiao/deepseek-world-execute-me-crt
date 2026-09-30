
/* count-ink.cjs — measure the lit-pixel area of the storm wall over time, to
   prove the background no longer accumulates as the counter climbs. */
const { chromium } = require("playwright");
const fs = require("fs");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

(async () => {
  const times = [];
  for (let t = 148.0; t <= 162.5; t += 1.0) times.push(+t.toFixed(2));
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files", "--disable-web-security"],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto("file:///D:/Code/mv/mv-world-execute/index.html", { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true && window.__imagesReady === true", null, { timeout: 30000 });

  const out = [];
  for (const t of times) {
    const lit = await page.evaluate((tt) => {
      window.__draw(tt);
      const cv = document.getElementById("screen");
      const g = cv.getContext("2d");
      /* sample only the tube area, ignoring the counter's bright core */
      const d = g.getImageData(258, 48, 1276, 902).data;
      let n = 0, red = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (gg > 90 || r > 90) n++;
        if (r > gg + 40 && r > 70) red++;
      }
      return { n, red, total: d.length / 4 };
    }, t);
    out.push({ t, litPct: +(100 * lit.n / lit.total).toFixed(3), redPct: +(100 * lit.red / lit.total).toFixed(3) });
  }
  await browser.close();
  const lits = out.map(o => o.litPct);
  const min = Math.min(...lits), max = Math.max(...lits);
  console.log("t      lit%    red%");
  out.forEach(o => console.log(String(o.t).padStart(6), String(o.litPct).padStart(7), String(o.redPct).padStart(7)));
  console.log("\nlit% min", min, "max", max, "growth", (max - min).toFixed(3), "px-pts");
  const first = lits[0], last = lits[lits.length - 1];
  console.log("first", first, "-> last", last, " ratio", (last / first).toFixed(2));
  const pass = last <= first * 1.45;
  console.log(pass ? "PASS: background ink stays bounded (no accumulation)"
                   : "FAIL: background still grows over time");
  process.exit(pass ? 0 : 1);
})();
