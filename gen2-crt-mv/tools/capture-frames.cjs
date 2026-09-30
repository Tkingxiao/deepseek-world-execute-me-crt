/* tools/capture-frames.cjs — render a contiguous range of frames from the real
 * composition and write them as a numbered PNG sequence.
 *
 *   node tools/capture-frames.cjs --from 0 --to 299 --out work/render/w0
 *
 * The page exposes exactly one pure function of virtual time (window.__draw), so
 * a worker never touches the clock, the mouse or the audio element. Frame f is
 * drawn at t = f / fps and is what the audience sees during [f/fps,(f+1)/fps),
 * which is what keeps the picture locked to the song's own beat grid.
 *
 * Every frame is hashed as it is written so two runs can be compared byte for
 * byte before anyone trusts a parallel chunk.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHROME = process.env.CHROME_PATH ||
  require('./lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const FPS = Number(arg('fps', 30));
const OUT = path.resolve(String(arg('out', path.join(ROOT, 'work', 'render', 'w0'))));
const FROM = Number(arg('from', 0));
const TO = Number(arg('to', FROM));
const DIGEST = String(arg('digest', path.join(OUT, 'digest.json')));
const QUIET = !!arg('quiet', false);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // The real GPU (ANGLE/D3D11) rasterises this pipeline in 85 ms and is
  // byte-identical to itself; swiftshader takes 1030 ms and disagrees with it,
  // so the software renderer is not used for the master.
  const b = await chromium.launch({
    executablePath: CHROME,
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
      '--font-render-hinting=none', '--allow-file-access-from-files',
      '--disable-web-security',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--js-flags=--max-old-space-size=4096'],
  });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + (e && e.message)));

  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });

  // one warm pass: the first touch of a glyph size is rasterised by the browser
  await p.evaluate(() => { window.__draw(0); window.__draw(100); window.__draw(200); });

  const n = TO - FROM + 1;
  const t0 = Date.now();
  const hashes = [];
  let drawMs = 0, grabMs = 0;

  for (let f = FROM; f <= TO; f++) {
    const t = f / FPS;
    const r = await p.evaluate((tt) => {
      const st = window.__draw(tt);
      return { ms: st.ms, url: MV.OUT.toDataURL('image/png') };
    }, t);
    const buf = Buffer.from(r.url.slice(22), 'base64');
    const file = path.join(OUT, 'f' + String(f).padStart(6, '0') + '.png');
    fs.writeFileSync(file, buf);
    hashes.push(f + ' ' + crypto.createHash('sha1').update(buf).digest('hex'));
    drawMs += r.ms;
    if (!QUIET && (f - FROM) % 100 === 99) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write('  ' + (f - FROM + 1) + '/' + n + '  ' + el.toFixed(1) + 's  ' +
        ((f - FROM + 1) / el).toFixed(1) + ' fps\n');
    }
  }

  const wall = (Date.now() - t0) / 1000;
  const digest = {
    from: FROM, to: TO, fps: FPS, count: n,
    drawMsSum: Math.round(drawMs), wallSec: Number(wall.toFixed(2)),
    sha1: crypto.createHash('sha1').update(hashes.join('\n')).digest('hex'),
    hashes: hashes,
  };
  fs.writeFileSync(DIGEST, JSON.stringify(digest));

  await b.close();
  if (errs.length) {
    console.log('--- page errors (' + errs.length + ')');
    for (const e of errs.slice(0, 10)) console.log('  ' + e);
  }
  console.log('captured ' + n + ' frames  ' + wall.toFixed(1) + 's  ' +
    (n / wall).toFixed(1) + ' fps  draw ' + (drawMs / n).toFixed(1) + ' ms/frame');
  console.log('digest ' + digest.sha1 + '  -> ' + path.relative(ROOT, DIGEST));
  if (errs.length) process.exit(2);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
