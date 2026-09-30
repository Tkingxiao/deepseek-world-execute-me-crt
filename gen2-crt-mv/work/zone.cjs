/* work/zone.cjs — print every act-drawn string that lands in the chrome's bands */
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = require('../tools/lib/env.cjs').chrome();
const URL = 'file:///' + path.resolve(__dirname, '..', 'src', 'index.html').replace(/\\/g, '/');
const FROM = Number(process.argv[2] || 0.5);
const TO = Number(process.argv[3] || 212);

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--force-color-profile=srgb',
    '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none',
    '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const out = await p.evaluate(([from, to]) => {
    window.__ink = [];
    MV.INK.stats = function (text, color, font, x, y) {
      window.__ink.push([text, color, font, Math.round(x), Math.round(y)]);
    };
    const chrome = MV.drawChrome;
    MV.drawChrome = function () {};
    const hits = [];
    for (let t = from; t < to; t += 0.25) {
      window.__ink.length = 0;
      window.__draw(t);
      for (const r of window.__ink) {
        if (r[4] > 480) hits.push([Number(t.toFixed(2)), r[0].slice(0, 30), r[4],
          MV.sectionAt(t).id]);
      }
    }
    MV.drawChrome = chrome;
    const seen = {}, uniq = [];
    for (const h of hits) {
      const k = h[1] + '|' + h[2];
      if (seen[k]) continue;
      seen[k] = 1; uniq.push(h);
    }
    return { n: hits.length, uniq: uniq.slice(0, 40) };
  }, [FROM, TO]);
  console.log('act draws below y=480 (excluding chrome): ' + out.n);
  for (const u of out.uniq) console.log('  t=' + String(u[0]).padStart(6) + '  y=' +
    String(u[2]).padStart(4) + '  ' + u[3].padEnd(15) + '  ' + JSON.stringify(u[1]));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
