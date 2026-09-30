/* lines.cjs a b — every lyric line whose cue falls in [a,b) */
const path = require('path');
const { chromium } = require('playwright-core');
const CHROME = require('../tools/lib/env.cjs').chrome();
const URL = 'file:///' + path.resolve(__dirname, '..', 'src', 'index.html').split(path.sep).join('/');
(async function () {
  const a = parseFloat(process.argv[2]), b = parseFloat(process.argv[3]);
  const br = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  const p = await br.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const out = await p.evaluate(function (r) {
    return MV.lines.filter(function (L) { return L.text && L.tOn >= r[0] && L.tOn < r[1]; })
      .map(function (L) { return [L.tOn.toFixed(3), L.text, L.gloss, L.dur.toFixed(2)]; });
  }, [a, b]);
  for (const r of out) console.log(r[0].padStart(8), JSON.stringify(r[1]), '|', JSON.stringify(r[2]), r[3]);
  await br.close();
})();
