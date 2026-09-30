/* work/report-data.cjs — the numbers that go into docs/REPORT.md, measured on
 * the real composition (no estimates):
 *   - per act: pic chars, ink chars, median frame ms at a representative moment
 *   - per act: chrome legibility — the luma gap between the ink on each of the
 *     five chrome baselines and the picture sitting behind it
 *   - whole film: luma floor/ceiling, so an accidentally dead or blown frame
 *     cannot hide
 *   node work/report-data.cjs */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');

/* one representative moment per act, chosen where the act is at its busiest and
 * brightest — the hardest case for the chrome to stay readable over. */
const PICKS = [
  ['P00_BOOT', 12.5], ['P01_CALL', 24.6], ['P02_GEOMETRY', 36.3],
  ['P03_CURRENT', 52.0], ['P04_STIMULATION', 68.3], ['P05_FLESH', 81.0],
  ['P06_TRANCE', 96.6], ['P07_ISOLATION', 113.6], ['P08_ERASURE', 122.0],
  ['P09_ERROR', 136.0], ['P10_COUNTDOWN', 155.0], ['P11_FINAL', 170.0],
  ['P12_LOVE', 184.0], ['P13_OUTRO', 198.0], ['P14_TERMINATE', 209.0],
];
const BANDS = [['hud', 44], ['prev', 930], ['en', 972], ['zh', 1012], ['status', 1046]];

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files',
    '--disable-web-security'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + (e && e.message)));
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  await p.evaluate((bands) => { window.__BANDS = bands; }, BANDS);
  await p.evaluate(() => {
    window.__lum = function (x, y, w, h) {
      const im = MV.g.getImageData(x, y, w, h).data;
      const v = [];
      for (let i = 0; i < im.length; i += 4) {
        v.push(0.2126 * im[i] + 0.7152 * im[i + 1] + 0.0722 * im[i + 2]);
      }
      v.sort((a, c) => a - c);
      const q = (f) => v[Math.min(v.length - 1, Math.floor(f * v.length))];
      return { p50: q(0.5), p99: q(0.99), p10: q(0.10), min: v[0], max: v[v.length - 1] };
    };
  });

  const FILMONLY = process.argv.indexOf('--film-only') >= 0;
  const rows = [];
  console.log('act                t      pic chars  ink chars   ms   ' +
    BANDS.map((x) => x[0].padStart(6)).join(''));
  for (const [id, t] of (FILMONLY ? [] : PICKS)) {
    const d = await p.evaluate((tt) => {
      const s = window.__draw(tt);
      const bands = {};
      for (const [n, y] of window.__BANDS) {
        const r = window.__lum(40, Math.max(0, y - 30), 1840, 40);
        bands[n] = Number((r.p99 - r.p50).toFixed(1));
      }
      const full = window.__lum(258, 48, 1276, 902);
      return { sec: MV.sectionAt(tt).id, pic: s.picChars, ink: s.inkChars,
        bands: bands, floor: Number(full.p10.toFixed(1)), ceil: Number(full.p99.toFixed(1)) };
    }, t).catch(async (e) => { throw e; });
    // median of five timed draws
    const ms = [];
    for (let i = 0; i < 5; i++) {
      const v = await p.evaluate((tt) => { window.__draw(tt); return window.__frameStats().ms; }, t);
      ms.push(v);
    }
    ms.sort((a, c) => a - c);
    const med = Math.round(ms[2]);
    rows.push({ id: id, t: t, pic: d.pic, ink: d.ink, ms: med, bands: d.bands,
      floor: d.floor, ceil: d.ceil, sec: d.sec });
    console.log(id.padEnd(17) + String(t).padStart(6) + String(d.pic).padStart(11) +
      String(d.ink).padStart(11) + String(med).padStart(5) + '  ' +
      BANDS.map((x) => String(d.bands[x[0]]).padStart(6)).join(''));
  }

  const film = await p.evaluate(() => {
    let lo = 999, hi = -1, loT = 0, hiT = 0;
    for (let t = 0.5; t < MV.FRAMES / MV.FPS - 0.5; t += 1.0) {
      window.__draw(t);
      const r = window.__lum(258, 48, 1276, 902);
      if (r.p10 < lo) { lo = r.p10; loT = t; }
      if (r.p99 > hi) { hi = r.p99; hiT = t; }
    }
    return { lo: Number(lo.toFixed(1)), loT: Number(loT.toFixed(1)),
      hi: Number(hi.toFixed(1)), hiT: Number(hiT.toFixed(1)) };
  });

  const file = path.join(ROOT, 'work', FILMONLY ? 'film-range.json' : 'report-data.json');
  fs.writeFileSync(file,
    JSON.stringify({ rows: rows, film: film, bands: BANDS,
      picband: [258, 48, 1276, 902], errs: errs.slice(0, 8) }, null, 1));
  console.log('\nfilm p10 luma floor ' + film.lo + ' at t=' + film.loT +
    '   p99 luma ceiling ' + film.hi + ' at t=' + film.hiT);
  console.log('page errors: ' + errs.length + (errs.length ? '  ' + errs[0].slice(0, 120) : ''));
  console.log('wrote ' + path.relative(ROOT, file));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
