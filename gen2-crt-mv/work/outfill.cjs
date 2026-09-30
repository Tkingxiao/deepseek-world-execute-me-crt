/* work/outfill.cjs — same trick as findfill, but on the finished canvas: log
 * every big fill / drawImage on MV.g so a band or a wash can be traced to the
 * stage that drew it. Also reports vertical luma profile so static bands show up
 * as spikes.
 *
 *   node work/outfill.cjs 159.42 170.0
 */
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');

const TS = process.argv.slice(2).map(Number);

(async () => {
  const b = await chromium.launch({
    executablePath: CHROME,
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
      '--font-render-hinting=none', '--allow-file-access-from-files',
      '--disable-web-security', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('PAGEERROR: ' + (e && e.message)));
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 30000 });

  const res = await p.evaluate((TS2) => {
    const g = MV.g;
    const W = 1920, H = 1080;
    const out = [];
    for (const t of TS2) {
      const log = [];
      const origFR = g.fillRect, origDI = g.drawImage;
      g.fillRect = function (x, y, w, h) {
        if (Math.abs(w * h) >= 20000) log.push({ fn: 'fillRect', r: [Math.round(x), Math.round(y), Math.round(w), Math.round(h)], fill: String(g.fillStyle), a: +g.globalAlpha.toFixed(3), op: g.globalCompositeOperation });
        return origFR.apply(g, arguments);
      };
      g.drawImage = function () {
        log.push({ fn: 'drawImage', args: Array.prototype.slice.call(arguments).map((v) => (typeof v === 'number' ? Math.round(v) : String(v).slice(0, 12))), op: g.globalCompositeOperation });
        return origDI.apply(g, arguments);
      };
      window.__draw(t);
      g.fillRect = origFR; g.drawImage = origDI;
      // vertical luma profile, one column
      const col = g.getImageData(1200, 0, 1, H).data;
      const prof = [];
      for (let y = 0; y < H; y += 20) {
        let s = 0;
        for (let k = 0; k < 20; k++) {
          const i = (y + k) * 4;
          s += 0.2126 * col[i] + 0.7152 * col[i + 1] + 0.0722 * col[i + 2];
        }
        prof.push(Math.round(s / 20));
      }
      let peak = 0, pk = -1;
      for (let i = 0; i < prof.length; i++) if (prof[i] > peak) { peak = prof[i]; pk = i * 20; }
      out.push({ t: t, log: log, peak: peak, peakY: pk, prof: prof });
    }
    return out;
  }, TS);

  for (const r of res) {
    console.log('=== t=' + r.t.toFixed(2) + '   brightest 20px row at y=' + r.peakY + '  luma ' + r.peak);
    for (const e of r.log) console.log('   ' + e.fn.padEnd(9) + ' ' + JSON.stringify(e.r || e.args) + '  ' + (e.fill || '') + '  a=' + (e.a === undefined ? '' : e.a) + ' op=' + e.op);
    console.log('   profile y=0..1060 step20: ' + r.prof.join(' '));
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
