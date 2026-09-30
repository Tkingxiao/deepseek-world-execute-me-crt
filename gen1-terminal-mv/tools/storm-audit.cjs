
/* storm-audit.cjs — measures the storm straight from the ink layer pixels.
   Ground truth for both questions: what fraction of the tube is covered by
   EXECUTION glyphs, and what share of those glyphs are red. */
const { chromium } = require("playwright");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files", "--disable-web-security"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto("file:///D:/Code/mv/mv-world-execute/index.html", { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true && window.__imagesReady === true", null, { timeout: 30000 });

  const res = await page.evaluate(() => {
    const SC = { x: 258, y: 48, w: 1276, h: 902 };
    const out = [];
    for (const t of [148.5, 150.5, 153.0, 155.5, 158.0, 160.5, 162.0, 162.5]) {
      window.__draw(t);
      const ink = window.MV.inkCanvas();
      const g = ink.getContext("2d");
      const d = g.getImageData(SC.x, SC.y, SC.w, SC.h).data;
      let glyph = 0, red = 0, green = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i+3];
        if (a < 40) continue;                 /* real ink only */
        glyph++;
        const r = d[i], gg = d[i+1];
        if (r > gg + 40) red++;               /* red glyph pixel */
        else if (gg > r + 40) green++;        /* phosphor-green glyph pixel */
      }
      const tot = d.length / 4;
      out.push({
        t,
        covPct: +(100 * glyph / tot).toFixed(1),
        redPct: +((100 * red) / Math.max(1, red + green)).toFixed(1),
        whitePx: glyph - red - green,
      });
    }
    return out;
  });

  console.log("time    ink-cov%   red%   (white px = counter/numerals)");
  res.forEach(r => console.log(String(r.t).padStart(6), String(r.covPct).padStart(9), String(r.redPct).padStart(6), String(r.whitePx).padStart(10)));
  console.log("\ncoverage : " + Math.min(...res.map(r=>r.covPct)) + "% .. " + Math.max(...res.map(r=>r.covPct)) + "%   (target ~80%)");
  console.log("red end  : " + res[res.length-1].redPct + "%   (target 80%)");
  await browser.close();
})();
