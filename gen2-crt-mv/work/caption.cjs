/* work/caption.cjs — is a caption readable on the picture it lands on?
 *
 * Sweeps the whole film and, for every sampled moment, asks the ink layer which
 * caption draws exist (current EN line, current ZH line, the dimmed line before
 * it). It then measures contrast *locally*: inside the tight box the text itself
 * occupies, p99 minus p25. A wide strip would be wrong in both directions —
 * bright picture elsewhere in the band would hide unreadable text, and a
 * key line arrives inverted (dark words on a lit bar), which is high contrast
 * but negative the other way round. p99 - p25 is positive in both cases and
 * ~0 only when the words really do dissolve into what is behind them.
 *
 *   node work/caption.cjs [step]
 */
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');
const STEP = Number(process.argv[2] || 0.5);
const BANDS = [['prev', 930], ['en', 972], ['zh', 1012]];

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const out = await p.evaluate(([bands, step]) => {
    window.__ink = [];
    MV.INK.stats = function (text, color, font, x, y) {
      window.__ink.push([text, color, font, Math.round(x), Math.round(y),
        MV.INK.texture === true]);
    };
    function box(x0, y0, w, h) {
      x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
      w = Math.max(1, Math.min(1920 - x0, Math.round(w)));
      h = Math.max(1, Math.min(1080 - y0, Math.round(h)));
      const im = MV.g.getImageData(x0, y0, w, h).data;
      const v = [];
      for (let i = 0; i < im.length; i += 4) {
        v.push(0.2126 * im[i] + 0.7152 * im[i + 1] + 0.0722 * im[i + 2]);
      }
      v.sort((a, c) => a - c);
      const q = (f) => v[Math.min(v.length - 1, Math.floor(f * v.length))];
      return { p25: q(0.25), p50: q(0.5), p99: q(0.99), gap: q(0.99) - q(0.25) };
    }
    const res = {};
    for (const [n, y] of bands) res[n] = { has: 0, gap: [], worst: 9e9, worstT: 0, worstTxt: '' };
    let frames = 0;
    for (let t = 0.5; t < MV.FRAMES / MV.FPS - 0.4; t += step) {
      window.__ink.length = 0;
      window.__draw(t);
      frames++;
      for (const [n, y] of bands) {
        for (const r of window.__ink) {
          if (Math.abs(r[4] - y) > 8) continue;
          if (r[5] === true) continue;   // the burn-in raster is texture, not a caption
          const txt = r[0].replace(/\s/g, '');
          if (!txt.length) continue;
          MV.g.font = r[2];
          const w = MV.g.measureText(r[0]).width;
          const size = parseFloat((r[2].match(/(\d+(?:\.\d+)?)px/) || [0, 20])[1]);
          const s = box(r[3] - w / 2 - 8, y - size * 0.95, w + 16, size * 1.25);
          res[n].has++;
          res[n].gap.push(s.gap);
          if (s.gap < res[n].worst) {
            res[n].worst = s.gap; res[n].worstT = Number(t.toFixed(2));
            res[n].worstTxt = r[0].slice(0, 24);
          }
        }
      }
    }
    for (const [n] of bands) {
      const a = res[n].gap.slice().sort((x, z) => x - z);
      res[n].p10 = Number((a[Math.floor(a.length * 0.1)] || 0).toFixed(1));
      res[n].med = Number((a[a.length >> 1] || 0).toFixed(1));
      res[n].worst = Number(res[n].worst.toFixed(1));
      delete res[n].gap;
    }
    return { frames: frames, bands: res };
  }, [BANDS, STEP]);
  console.log('swept ' + out.frames + ' frames at ' + STEP + ' s steps, ' +
    'gap = p99 - p25 inside the text box itself');
  console.log('band     draws    gap(p10 / median)   worst        worst line');
  for (const [n] of BANDS) {
    const r = out.bands[n];
    console.log(n.padEnd(7) + String(r.has).padStart(6) + '   ' +
      (r.p10.toFixed(1) + ' / ' + r.med.toFixed(1)).padEnd(20) +
      (r.worst.toFixed(1) + ' at t=' + r.worstT).padEnd(16) + JSON.stringify(r.worstTxt));
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
