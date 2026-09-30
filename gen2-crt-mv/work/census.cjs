/* work/census.cjs — sweep every act on a fine grid of virtual times and report,
 * per act: mean/median picture glyphs, the fraction of frames with none, and the
 * worst frame cost. An act with a high empty fraction is an act whose character
 * art is not actually reaching the picture layer.
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
    '--font-render-hinting=none', '--allow-file-access-from-files', '--disable-web-security'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 30000 });

  // 0.4 s step across the whole film = ~530 frames
  const out = await p.evaluate(() => {
    const rows = [];
    const byAct = {};
    for (let t = 0.2; t < 211.9; t += 0.4) {
      let d;
      try { d = window.__diag(t); } catch (e) { d = { err: String(e.message), section: 'THREW' }; }
      rows.push({ t: t, sec: d.section, pic: d.picChars || 0, ink: d.inkChars || 0, ms: d.ms || 0 });
      const a = byAct[d.section] || (byAct[d.section] = { n: 0, pic: [], ink: [], ms: [], err: 0 });
      a.n++;
      if (!d.picChars) a.err++;
      a.pic.push(d.picChars || 0); a.ink.push(d.inkChars || 0); a.ms.push(d.ms || 0);
    }
    const med = (v) => { const s = v.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const sum = (v) => v.reduce((x, y) => x + y, 0);
    const acts = [];
    for (const k in byAct) {
      const a = byAct[k];
      acts.push({ act: k, n: a.n, meanPic: sum(a.pic) / a.n, medPic: med(a.pic),
        empty: a.err / a.n, meanInk: sum(a.ink) / a.n, maxMs: Math.max.apply(null, a.ms) });
    }
    return acts;
  });

  console.log('act              n   meanPic  medPic  empty%   meanInk  maxMs');
  for (const a of out) {
    console.log('  ' + a.act.padEnd(16) + String(a.n).padStart(3) +
      a.meanPic.toFixed(0).padStart(9) + a.medPic.toFixed(0).padStart(8) +
      (a.empty * 100).toFixed(0).padStart(7) + '%' +
      a.meanInk.toFixed(0).padStart(9) + a.maxMs.toFixed(0).padStart(7));
  }
  if (errs.length) { console.log('--- page errors'); for (const e of errs.slice(0, 10)) console.log('  ' + e); }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
