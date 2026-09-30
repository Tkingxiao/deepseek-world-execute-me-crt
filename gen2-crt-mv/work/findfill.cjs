/* work/findfill.cjs — wrap the picture layer's fillRect/fill/drawImage and log
 * every call big enough to matter, with its style, alpha and composite. Finds
 * what floods the tube at a given timecode.
 *
 *   node work/findfill.cjs 159.4
 */
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');

const T = Number(process.argv[2] || 159.4);

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

  const res = await p.evaluate((t) => {
    const gp = MV.PIC.getContext('2d');
    const log = [];
    const AREA = 60000;
    const wrap = (name, area) => {
      const orig = gp[name];
      gp[name] = function () {
        const a = area ? area.apply(null, arguments) : 0;
        if (a >= AREA) {
          log.push({
            fn: name, area: Math.round(a),
            fill: String(gp.fillStyle), alpha: gp.globalAlpha, op: gp.globalCompositeOperation,
            args: Array.prototype.slice.call(arguments).map((v) => (typeof v === 'number' ? Math.round(v) : String(v).slice(0, 24))),
          });
        }
        return orig.apply(gp, arguments);
      };
    };
    wrap('fillRect', (x, y, w, h) => Math.abs(w * h));
    wrap('fill', () => 1920 * 1080);
    wrap('drawImage', () => 1920 * 1080);
    const rgbAt = (x, y) => {
      const d = gp.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    window.__draw(t);
    const pts = [[100, 100], [960, 540], [1800, 1000], [960, 120], [960, 150]];
    return { t: t, log: log, rgb: pts.map((q) => ({ at: q, v: rgbAt(q[0], q[1]) })) };
  }, T);

  console.log('--- big fills on the picture layer at t=' + res.t.toFixed(1));
  for (const r of res.log) {
    console.log('  ' + r.fn.padEnd(9) + ' area ' + String(r.area).padStart(8) +
      '  ' + r.fill.padEnd(24) + ' a=' + r.alpha.toFixed(2) + ' op=' + r.op +
      '  ' + JSON.stringify(r.args));
  }
  console.log('--- rgb at sample points');
  for (const q of res.rgb) console.log('  (' + q.at.join(',') + ')  rgba ' + q.v.join(', '));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
