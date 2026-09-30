/* work/bandink.cjs <t...> — what ink sits in the caption bands at these moments */
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');
const TS = process.argv.slice(2).map(Number);
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  if (process.argv[2] === '--trace') {   // trace the two caption bands frame by frame
    const from = Number(process.argv[3]), to = Number(process.argv[4]);
    const rows = await p.evaluate(([t0, t1]) => {
      window.__ink = [];
      MV.INK.stats = function (text, color, font, x, y) {
        window.__ink.push([text, color, font, Math.round(x), Math.round(y),
          MV.INK.texture === true]);
      };
      const out = [];
      for (let t = t0; t <= t1 + 1e-9; t += 1 / 30) {
        window.__ink.length = 0;
        window.__draw(t);
        const at = (band) => window.__ink.filter((r) => Math.abs(r[4] - band) <= 8 &&
          r[5] !== true).map((r) => r[0]).join('|');
        out.push([Number(t.toFixed(3)), at(972), at(1012)]);
      }
      return out;
    }, [from, to]);
    for (const r of rows) console.log(String(r[0]).padStart(8) + '  EN ' +
      JSON.stringify(r[1]) + '   ZH ' + JSON.stringify(r[2]));
    await b.close();
    return;
  }
  for (const t of TS) {
    const out = await p.evaluate((tt) => {
      window.__ink = [];
      MV.INK.stats = function (text, color, font, x, y) {
        window.__ink.push([text, color, font, Math.round(x), Math.round(y)]);
      };
      window.__draw(tt);
      const rows = [];
      for (const r of window.__ink) {
        if (r[4] > 900) rows.push([r[1], r[2], Math.round(r[3]), r[4], r[0].slice(0, 26)]);
      }
      return rows;
    }, t);
    console.log('=== t=' + t + '   ' + out.length + ' ink draw(s) below y=900');
    for (const r of out.slice(0, 10)) console.log('    ' + String(r[2]).padStart(5) + ',' +
      String(r[3]).padStart(5) + '  ' + r[0] + '  ' + r[1].replace(/\d+px /, '') + '  ' +
      JSON.stringify(r[4]));
    if (out.length > 10) console.log('    ... ' + (out.length - 10) + ' more');
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
