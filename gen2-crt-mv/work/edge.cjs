/* work/edge.cjs — is there a box around the picture?
 *
 * The brief says the glass is the world's boundary: no TV set, no bezel, no
 * inset panel. A bezel is exactly one thing in pixels — a dark ring at the
 * frame's outer edge while the middle stays bright. So measure that ring.
 *
 * For one moment per act it reports, in a 6 px strip at the middle of each of
 * the four screen edges, the p99 luma, and the picture's own p50 in the middle
 * of the frame. A bezel reads as edge ≈ 0 against a bright middle; the tube
 * reads as edge ≈ picture.
 *
 *   node work/edge.cjs [--film]      --film sweeps t 0..211 every 2 s instead
 */
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');

const PICKS = [
  ['P00_BOOT', 12.5], ['P01_CALL', 24.6], ['P02_GEOMETRY', 36.3],
  ['P03_CURRENT', 52.0], ['P04_STIMULATION', 68.3], ['P05_FLESH', 81.0],
  ['P06_TRANCE', 96.6], ['P07_ISOLATION', 113.6], ['P08_ERASURE', 122.0],
  ['P09_ERROR', 136.0], ['P10_COUNTDOWN', 155.0], ['P11_FINAL', 170.0],
  ['P12_LOVE', 184.0], ['P13_OUTRO', 198.0], ['P14_TERMINATE', 209.0],
];

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const r = await p.evaluate((picks) => {
    const W = 1920, H = 1080, B = 6;
    function strip(x, y, w, h) {
      const im = MV.g.getImageData(x, y, w, h).data;
      const v = [];
      for (let i = 0; i < im.length; i += 4) {
        v.push(0.2126 * im[i] + 0.7152 * im[i + 1] + 0.0722 * im[i + 2]);
      }
      v.sort((a, c) => a - c);
      return { p50: v[v.length >> 1], p99: v[Math.floor(v.length * 0.99)],
        max: v[v.length - 1] };
    }
    const rows = [];
    for (const [id, t] of picks) {
      window.__draw(t);
      rows.push({ id: id, t: t,
        top: strip(760, 0, 400, B), bot: strip(760, H - B, 400, B),
        left: strip(0, 440, B, 200), right: strip(W - B, 440, B, 200),
        mid: strip(760, 440, 400, 200) });
    }
    return { rows: rows, glass: MV.GLASS_R };
  }, PICKS);
  console.log('corner radius of the tube mask: ' + r.glass + ' px  (a bezel would be a ring at the edge)');
  console.log('act                t     edge p99: top   bot  left right   |  middle p50/p99');
  for (const x of r.rows) {
    const e = [x.top, x.bot, x.left, x.right];
    const lo = Math.min.apply(null, e.map((s) => s.p99));
    console.log(x.id.padEnd(17) + String(x.t).padStart(6) + '   ' +
      e.map((s) => s.p99.toFixed(1).padStart(6)).join(' ') +
      '   |  ' + x.mid.p50.toFixed(1).padStart(6) + ' /' + x.mid.p99.toFixed(1).padStart(6) +
      (lo < 2 ? '   <-- edge is dark' : ''));
  }
  const worst = Math.min.apply(null, r.rows.map((x) =>
    Math.min(x.top.p99, x.bot.p99, x.left.p99, x.right.p99)));
  console.log('\nweakest edge p99 across the whole sweep: ' + worst.toFixed(1));
  if (process.argv.includes('--film')) {
    const film = await p.evaluate(() => {
      const W = 1920, H = 1080, B = 6;
      function p99(x, y, w, h) {
        const im = MV.g.getImageData(x, y, w, h).data;
        const v = [];
        for (let i = 0; i < im.length; i += 4) {
          v.push(0.2126 * im[i] + 0.7152 * im[i + 1] + 0.0722 * im[i + 2]);
        }
        v.sort((a, c) => a - c);
        return v[Math.floor(v.length * 0.99)];
      }
      const out = [];
      for (let t = 0; t < MV.FRAMES / MV.FPS - 0.1; t += 2) {
        window.__draw(t);
        out.push([Number(t.toFixed(1)), Number(p99(760, 0, 400, B).toFixed(1)),
          Number(p99(760, H - B, 400, B).toFixed(1)), Number(p99(0, 440, B, 200).toFixed(1)),
          Number(p99(W - B, 440, B, 200).toFixed(1))]);
      }
      return out;
    });
    let darkest = 999, at = 0;
    for (const f of film) {
      const m = Math.min(f[1], f[2], f[3], f[4]);
      if (m < darkest) { darkest = m; at = f[0]; }
    }
    console.log('film sweep, ' + film.length + ' frames: darkest edge p99 ' +
      darkest.toFixed(1) + ' at t=' + at);
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
