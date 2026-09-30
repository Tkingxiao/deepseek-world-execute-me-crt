/* work/sync2.cjs — why did sync.cjs report a ±1.6 s spread on completion?
 * Prints, for the lines that looked worst, the length of each language's drawn
 * string against the length of the timeline's own text, frame by frame.
 */
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');
const WANT = process.argv.slice(2).map(Number);

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const out = await p.evaluate((want) => {
    window.__ink = [];
    MV.INK.stats = function (text, color, font, x, y) {
      window.__ink.push([text, color, font, Math.round(x), Math.round(y),
        MV.INK.texture === true]);
    };
    const texts = (band) => window.__ink.filter((r) => Math.abs(r[4] - band) <= 8 &&
      r[5] !== true).map((r) => r[0]).join('');
    const rows = [];
    for (const L of window.MV_TIMELINE.lines) {
      if (want.indexOf(Number(L.tOn.toFixed(2))) < 0) continue;
      const win = Math.max(L.show || L.dur, L.dur);
      const full = L.text.replace(/\s/g, '');
      const gfull = (L.gloss || '').replace(/\s/g, '');
      const trace = [];
      let en1 = null, zh1 = null, enTxt = '', zhTxt = '';
      for (let t = Math.max(0, L.tOn - 0.2); t < L.tOn + win + 0.5; t += 1 / 30) {
        window.__ink.length = 0;
        window.__draw(t);
        const en = texts(972).replace(/\s/g, '');
        const zh = texts(1012).replace(/\s/g, '');
        if (en.length >= full.length && en1 === null) { en1 = t; enTxt = en; }
        if (gfull && zh.length >= gfull.length && zh1 === null) { zh1 = t; zhTxt = zh; }
        if (t > L.tOn + 0.1 && trace.length < 40) {
          trace.push([Number(t.toFixed(3)), en.length + '/' + full.length,
            zh.length + '/' + gfull.length, JSON.stringify(texts(1012).slice(0, 13))]);
        }
      }
      rows.push({ tOn: L.tOn, text: L.text, gloss: L.gloss, full: full.length,
        gfull: gfull.length, en1: en1, zh1: zh1, enTxt: enTxt, zhTxt: zhTxt,
        trace: trace });
    }
    return rows;
  }, WANT);
  for (const r of out) {
    console.log('=== tOn ' + r.tOn + '  ' + JSON.stringify(r.text) + ' / ' +
      JSON.stringify(r.gloss));
    console.log('    EN full=' + r.full + ' reached at ' + r.en1 + '  txt=' + JSON.stringify(r.enTxt));
    console.log('    ZH full=' + r.gfull + ' reached at ' + r.zh1 + '  txt=' + JSON.stringify(r.zhTxt));
    for (const x of r.trace) console.log('      ' + String(x[0]).padStart(7) + '  len ' +
      String(x[1]).padStart(9) + '  zh ' + String(x[2]).padStart(9) + '  ' + x[3]);
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
