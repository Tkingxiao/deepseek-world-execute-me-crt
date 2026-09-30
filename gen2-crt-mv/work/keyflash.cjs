/* work/keyflash.cjs — the arrival flash of a key line, measured.
 *
 * A key line lands as an event: an inverted block behind the words, both
 * languages drawn in the background colour on top of it. The block used to be
 * sized to the English only while the Chinese inverted with it, which made the
 * Chinese vanish for the length of the flash (found at t=77, gap 10.7). This
 * walks every key line and measures the contrast of both languages inside the
 * flash window, so the fix stays fixed.
 *
 *   node work/keyflash.cjs
 */
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const out = await p.evaluate(() => {
    window.__ink = [];
    MV.INK.stats = function (text, color, font, x, y) {
      window.__ink.push([text, color, font, Math.round(x), Math.round(y),
        MV.INK.texture === true]);
    };
    function gapAt(y) {
      const r = window.__ink.filter((z) => Math.abs(z[4] - y) <= 8 &&
        z[5] !== true && z[0].replace(/\s/g, '').length > 0);
      if (!r.length) return null;
      const d = r[r.length - 1];
      MV.g.font = d[2];
      const w = MV.g.measureText(d[0]).width;
      const size = parseFloat((d[2].match(/(\d+(?:\.\d+)?)px/) || [0, 20])[1]);
      const x0 = Math.max(0, Math.round(d[3] - w / 2 - 8));
      const y0 = Math.max(0, Math.round(y - size * 0.95));
      const ww = Math.max(1, Math.min(1920 - x0, Math.round(w + 16)));
      const hh = Math.max(1, Math.min(1080 - y0, Math.round(size * 1.25)));
      const im = MV.g.getImageData(x0, y0, ww, hh).data;
      const v = [];
      for (let i = 0; i < im.length; i += 4) {
        v.push(0.2126 * im[i] + 0.7152 * im[i + 1] + 0.0722 * im[i + 2]);
      }
      v.sort((a, c) => a - c);
      return { gap: v[Math.floor(v.length * 0.99)] - v[Math.floor(v.length * 0.25)],
        col: d[1] };
    }
    const keys = window.MV_TIMELINE.lines.filter((l) => l.key);
    const rows = [];
    for (const L of keys) {
      let worstEn = 9e9, worstZh = 9e9, at = 0;
      for (const dt of [0.02, 0.05, 0.08, 0.11, 0.14]) {
        window.__ink.length = 0;
        window.__draw(L.tOn + dt);
        const en = gapAt(972), zh = gapAt(1012);
        if (en && en.gap < worstEn) worstEn = en.gap;
        if (zh && zh.gap < worstZh) { worstZh = zh.gap; at = dt; }
      }
      rows.push({ t: Number(L.tOn.toFixed(2)), text: L.text, gloss: L.gloss,
        en: Number(worstEn.toFixed(1)), zh: Number(worstZh.toFixed(1)), at: at });
    }
    return rows;
  });
  let bad = 0;
  console.log('key line                 tOn      flash worst gap:  EN     ZH');
  for (const r of out) {
    const flag = (r.en < 40 || r.zh < 40) ? '   <-- low' : '';
    if (flag) bad++;
    console.log(JSON.stringify(r.text).slice(0, 24).padEnd(25) +
      String(r.t).padStart(7) + '   ' + String(r.en).padStart(7) + String(r.zh).padStart(7) +
      flag);
  }
  const minEn = Math.min.apply(null, out.map((r) => r.en));
  const minZh = Math.min.apply(null, out.map((r) => r.zh));
  console.log('\n' + out.length + ' key lines;  worst EN gap ' + minEn.toFixed(1) +
    ',  worst ZH gap ' + minZh.toFixed(1) + ';  ' + bad + ' below 40');
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
