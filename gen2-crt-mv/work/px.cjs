/* px.cjs <png> x,y x,y ... -> prints the pixel at each point, and the brightest
 * pixel in a 9x9 box, so a faint glyph cannot hide behind a thumbnail. */
const fs = require('fs');
const { chromium } = require('playwright-core');
const CHROME = require('../tools/lib/env.cjs').chrome();

(async function () {
  const png = process.argv[2];
  const pts = process.argv.slice(3).map(function (s) {
    const p = s.split(',');
    return { x: +p[0], y: +p[1] };
  });
  const b64 = fs.readFileSync(png).toString('base64');
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const res = await page.evaluate(async function (a) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + a.b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return a.pts.map(function (p) {
      const d = g.getImageData(p.x - 4, p.y - 4, 9, 9).data;
      let best = [0, 0, 0], bi = 0;
      for (let i = 0; i < d.length; i += 4) {
        const s = d[i] + d[i + 1] + d[i + 2];
        if (s > bi) { bi = s; best = [d[i], d[i + 1], d[i + 2]]; }
      }
      const dd = g.getImageData(p.x, p.y, 1, 1).data;
      return { at: [p.x, p.y], px: [dd[0], dd[1], dd[2]],
        max: best, ar: best[0] - best[1] };
    });
  }, { b64: b64, pts: pts });
  res.forEach(function (r) {
    console.log('(' + r.at + ')  px=' + r.px + '  brightest9=' + r.max + '  r-g=' + r.ar);
  });
  await browser.close();
})();
