
/* measure-red.cjs — ground truth: count the storm tokens by colour as they are
   drawn. The renderer routes text through M.glowText into the ink canvas, so both
   the screen context and the ink context are instrumented (wrapping both is what
   makes the interception take effect). The big counter is excluded by length. */
const { chromium } = require("playwright");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files", "--disable-web-security"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto("file:///D:/Code/mv/mv-world-execute/index.html", { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true && window.__imagesReady === true", null, { timeout: 30000 });

  const res = await page.evaluate(() => {
    const ink = window.MV.inkCanvas();
    const main = document.getElementById("screen");
    const gInk = ink.getContext("2d");
    const gMain = main.getContext("2d");
    const tally = { red: 0, green: 0, other: 0, otherSample: null };

    function wrap(g) {
      const orig = g.fillText.bind(g);
      g.fillText = function (s) {
        if (typeof s === "string" && s === "EXECUTION") {     /* length 9 = wall token */
          const c = String(g.fillStyle).toLowerCase();
          if (c.indexOf("ff4d5e") >= 0) tally.red++;
          else if (c.indexOf("39ff88") >= 0) tally.green++;
          else { tally.other++; if (!tally.otherSample) tally.otherSample = c; }
        }
        return orig.apply(null, arguments);
      };
      return orig;
    }
    const oMain = wrap(gMain);
    const oInk = wrap(gInk);
    [149.0, 151.5, 154.0, 156.5, 159.0, 161.5].forEach(t => window.__draw(t));
    gMain.fillText = oMain; gInk.fillText = oInk;
    return tally;
  });

  const tot = res.red + res.green + res.other;
  const pct = 100 * res.red / Math.max(1, tot);
  console.log("small EXECUTION tokens counted over 6 frames of the storm:");
  console.log("  red   : " + res.red);
  console.log("  green : " + res.green);
  console.log("  other : " + res.other + (res.otherSample ? " (" + res.otherSample + ")" : ""));
  console.log("  total : " + tot);
  console.log("  red share : " + pct.toFixed(1) + "%");
  console.log(pct >= 60 ? "PASS: at least 60% of the tokens are red" : "FAIL: below 60%");
  await browser.close();
  process.exit(pct >= 60 ? 0 : 1);
})();
