
const { chromium } = require("playwright");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files", "--disable-web-security"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto("file:///D:/Code/mv/mv-world-execute/index.html", { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true && window.__imagesReady === true", null, { timeout: 30000 });
  const out = await page.evaluate(() => {
    window.__draw(150.0);
    const g = window.MV.inkCanvas().getContext("2d");
    const orig = g.fillText.bind(g);
    const seen = {};
    let n = 0;
    g.fillText = function (s) {
      n++;
      const key = String(s).slice(0, 22);
      seen[key] = (seen[key] || 0) + 1;
      return orig.apply(null, arguments);
    };
    [149.0, 151.5, 154.0].forEach(function (t) { window.__draw(t); });
    g.fillText = orig;
    return { total: n, seen: seen };
  });
  console.log("total fillText on ink ctx:", out.total);
  console.log(JSON.stringify(out.seen, null, 1).slice(0, 1500));
  await browser.close();
})();
