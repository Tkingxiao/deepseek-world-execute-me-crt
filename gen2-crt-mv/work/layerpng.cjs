/* work/layerpng.cjs — dump the un-composited picture layer (MV.gp) as a PNG, so a
 * shape question can be answered without the CRT passes in the way.
 *   node work/layerpng.cjs 117.5            -> work/shots/layer_117.5.png
 *   node work/layerpng.cjs 117.5 ink        -> also the ink layer
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').split(path.sep).join('/');
const T = Number(process.argv[2] || 117.5);
const INK = process.argv.indexOf('ink') >= 0;

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const out = await p.evaluate(([tt, wantInk]) => {
    window.__draw(tt);
    return { pic: MV.PIC.toDataURL('image/png'), ink: wantInk ? MV.INK.canvas.toDataURL('image/png') : '' };
  }, [T, INK]);
  const dir = path.join(ROOT, 'work', 'shots');
  const w = function (name, url) {
    if (!url) return;
    const f = path.join(dir, name);
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log(name);
  };
  w('layer_' + T + '.png', out.pic);
  if (INK) w('layer_' + T + '__ink.png', out.ink);
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
