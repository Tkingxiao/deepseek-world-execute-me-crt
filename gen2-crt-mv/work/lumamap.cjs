/* work/lumamap.cjs — coarse luma map of the composited frame, so a diagonal
 * band that only "looks like" an artefact in a screenshot can be measured.
 *   node work/lumamap.cjs 117.4 [off]     off = draw with the glass pass skipped */
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').split(path.sep).join('/');
const T = Number(process.argv[2] || 117.4);
const NOGLASS = process.argv.indexOf('off') >= 0;

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const out = await p.evaluate(([tt, noGlass]) => {
    if (noGlass) MV.CRT.glass = function () {};
    window.__draw(tt);
    const CW = 64, CH = 32, cw = Math.floor(1920 / CW), ch = Math.floor(1080 / CH);
    const rows = [];
    for (let r = 0; r < CH; r++) {
      let line = '';
      for (let c = 0; c < CW; c++) {
        const im = MV.g.getImageData(c * cw, r * ch, cw, ch).data;
        let s = 0, n = 0;
        for (let i = 0; i < im.length; i += 4) {
          s += 0.2126 * im[i] + 0.7152 * im[i + 1] + 0.0722 * im[i + 2]; n++;
        }
        const v = s / n;
        line += v < 1 ? ' ' : (v < 3 ? '.' : (v < 6 ? ':' : (v < 10 ? '-' :
          (v < 16 ? '=' : (v < 26 ? '+' : (v < 45 ? '*' : (v < 80 ? '#' : 'M')))))));
      }
      rows.push(line);
    }
    return rows;
  }, [T, NOGLASS]);
  console.log('t=' + T + (NOGLASS ? '  (glass pass skipped)' : '') +
    '   luma ramp: \' .:-=+*#M\'  == 0,3,6,10,16,26,45,80');
  for (const r of out) console.log('|' + r + '|');
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
