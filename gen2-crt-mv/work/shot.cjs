/* work/shot.cjs — render one moment of the composition to a PNG.
 *   node work/shot.cjs 88.25 work/shots/x.png [--gpu]
 * Uses the real GPU by default: the software rasteriser disagrees with it on
 * pixels, so a shot taken on swiftshader would not be a shot of the master. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');
const times = process.argv.slice(2).filter(a => !a.startsWith('--')).map(Number);
const outDir = path.join(ROOT, 'work', 'shots');
fs.mkdirSync(outDir, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files',
    '--disable-web-security'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + (e && e.message)));
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  for (const t of times) {
    const d = await p.evaluate((tt) => {
      const s = window.__draw(tt);
      return { sec: MV.sectionAt(tt).id, pic: s.picChars, ink: s.inkChars, ms: Math.round(s.ms) };
    }, t);
    const name = 't' + String(t).replace('.', '_') + '.png';
    await p.locator('canvas').first().screenshot({ path: path.join(outDir, name) });
    console.log(t.toFixed(2).padStart(8) + '  ' + d.sec.padEnd(16) +
      'pic ' + String(d.pic).padStart(6) + '  ink ' + String(d.ink).padStart(6) +
      '  ' + d.ms + 'ms  -> work/shots/' + name);
  }
  if (errs.length) console.log('ERRORS:\n  ' + errs.slice(0, 6).join('\n  '));
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
