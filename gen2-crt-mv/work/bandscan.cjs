/* work/bandscan.cjs — which chrome bands do the acts draw into, and when?
 * Replicates gate 7 but reports a breakdown instead of a verdict.
 *   node work/bandscan.cjs
 */
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').split(path.sep).join('/');

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  await p.evaluate(() => {
    window.__ink = [];
    const prev = MV.INK.stats;
    MV.INK.stats = function (text, color, font, x, y) {
      window.__ink.push([text, color, font, Math.round(x), Math.round(y)]);
      if (prev) prev(text, color, font, x, y);
    };
  });
  const out = await p.evaluate(() => {
    const chrome = MV.drawChrome, scene = MV.drawScene;
    const t0 = 0.5, t1 = MV.FRAMES / MV.FPS - 0.5;
    const bands = [], seenB = {};
    MV.drawScene = function (g, t) { MV.INK.clear(); chrome(g, t); };
    for (let t = t0; t < t1; t += 0.25) {
      window.__ink.length = 0;
      window.__draw(t);
      for (const r of window.__ink) {
        const k = Math.round(r[4]);
        if (seenB[k]) continue;
        seenB[k] = 1; bands.push([k, r[0].slice(0, 14)]);
      }
    }
    MV.drawScene = scene;
    MV.drawChrome = function () {};
    const hit = {};                      // band y -> { n, tmin, tmax, ex }
    for (let t = t0; t < t1; t += 0.5) {
      window.__ink.length = 0;
      window.__draw(t);
      for (const r of window.__ink) {
        const y = r[4];
        for (let i = 0; i < bands.length; i++) {
          const uy = bands[i][0];
          if (y > uy - 22 && y < uy + 8) {
            const h = hit[uy] || (hit[uy] = { n: 0, tmin: 1e9, tmax: 0, ex: [] });
            h.n++;
            if (t < h.tmin) h.tmin = t;
            if (t > h.tmax) h.tmax = t;
            if (h.ex.length < 3) h.ex.push([Number(t.toFixed(1)), y, r[0].slice(0, 20), r[1]]);
            break;
          }
        }
      }
    }
    MV.drawChrome = chrome;
    return Object.keys(hit).map(function (k) {
      return { band: Number(k), n: hit[k].n, tmin: hit[k].tmin, tmax: hit[k].tmax, ex: hit[k].ex };
    });
  });
  console.log('act ink inside a chrome band:');
  for (const h of out) {
    console.log('  band y=' + h.band + '  ' + h.n + ' draw(s)  t ' + h.tmin.toFixed(1) +
      '..' + h.tmax.toFixed(1));
    for (const e of h.ex) console.log('      t=' + e[0] + ' y=' + e[1] + ' "' + e[2] + '" ' + e[3]);
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
