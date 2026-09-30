/* crop.cjs <png> <x> <y> <w> <h> [zoom] -> work/shots/<name>__crop.png
 * Pixel-level look at a rendered frame: "is the glyph actually there, or am I
 * looking at a four-times-downscaled thumbnail of it?" */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const CHROME = require('../tools/lib/env.cjs').chrome();

(async function () {
  const [png, x, y, w, h, z] = process.argv.slice(2);
  const zoom = parseFloat(z || '3');
  const buf = fs.readFileSync(png);
  const b64 = buf.toString('base64');
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  const out = await page.evaluate(async function (a) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + a.b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = Math.round(a.w * a.zoom);
    c.height = Math.round(a.h * a.zoom);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, a.x, a.y, a.w, a.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }, { b64: b64, x: +x, y: +y, w: +w, h: +h, zoom: zoom });
  const name = path.basename(png, '.png') + '__crop.png';
  const dest = path.join('work/shots', name);
  fs.writeFileSync(dest, Buffer.from(out.split(',')[1], 'base64'));
  console.log(dest);
  await browser.close();
})();
