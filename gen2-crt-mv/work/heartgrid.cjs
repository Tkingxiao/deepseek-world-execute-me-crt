/* work/heartgrid.cjs — print the glyph grid MV.field would produce for a form in a
 * rect, using MV.field's own maths, so a "the heart doesn't look like a heart"
 * bug can be separated from a compositing bug.
 *   node work/heartgrid.cjs heart 894 475 132 114 11
 */
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').split(path.sep).join('/');
const NAME = process.argv[2] || 'heart';
const [X, Y, W, H, PX] = process.argv.slice(3, 8).map(Number);
const ISO = Number(process.argv[8] || 0.09);
const DROP = Number(process.argv[9] || 0.02);
const GAMMA = Number(process.argv[10] || 0.5);
const RAMP = ' .:-=+*xX#M';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const out = await p.evaluate(([name, X, Y, W, H, px, iso, drop, gamma, RAMP]) => {
    const g = MV.g;
    MV.mono(g, px, 'bold');
    const cw = g.measureText('M').width;
    const cell = { w: cw, h: px / 0.92 };
    const rect = MV.rectFor(name, X, Y, W, H);
    const prims = MV.form(name);
    const cols = Math.max(1, Math.floor(rect.w / cell.w));
    const rows = Math.max(1, Math.floor(rect.h / cell.h));
    const x0 = rect.x + (rect.w - cols * cell.w) / 2;
    const y0 = rect.y + (rect.h - rows * cell.h) / 2;
    const box = MV.formBox(name);
    const dens = new Float32Array(cols * rows);
    let maxF = 0;
    for (let r = 0; r < rows; r++) {
      const py = ((r + 0.5) / rows) * 2 - 1;
      for (let c = 0; c < cols; c++) {
        const px2 = ((c + 0.5) / cols) * 2 - 1;
        const f = MV.blobField(prims, px2, py);
        dens[r * cols + c] = f;
        if (f > maxF) maxF = f;
      }
    }
    const lines = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const f = dens[r * cols + c];
        if (f <= iso) { line += ' '; continue; }
        let q = (f - iso) / Math.max(maxF - iso, 1e-6);
        q = Math.pow(q, gamma);
        const h = MV.hash2(c, r, 4);
        if (h > drop + (1 - drop) * q) { line += ' '; continue; }
        let idx = Math.floor((0.18 + 0.82 * q) * (RAMP.length - 1));
        idx = MV.clamp(idx, 0, RAMP.length - 1);
        line += RAMP[idx] === ' ' ? ' ' : RAMP[idx];
      }
      lines.push(line);
    }
    return {
      cell: cell, rect: rect, cols: cols, rows: rows, maxF: maxF,
      x0: x0, y0: y0, box: box, lines: lines,
    };
  }, [NAME, X, Y, W, H, PX, ISO, DROP, GAMMA, RAMP]);
  console.log(NAME + '  target ' + X + ',' + Y + ' ' + W + 'x' + H + '  px ' + PX +
    '  iso ' + ISO + ' drop ' + DROP + ' gamma ' + GAMMA);
  console.log('  cell ' + out.cell.w.toFixed(2) + 'x' + out.cell.h.toFixed(2) +
    '  grid ' + out.cols + 'x' + out.rows + '  maxF ' + out.maxF.toFixed(2));
  console.log('  form box ' + JSON.stringify(out.box));
  console.log('  grid at ' + out.x0.toFixed(1) + ',' + out.y0.toFixed(1) +
    ' -> ' + (out.x0 + out.cols * out.cell.w).toFixed(1) + ',' +
    (out.y0 + out.rows * out.cell.h).toFixed(1));
  for (const l of out.lines) console.log('|' + l + '|');
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
