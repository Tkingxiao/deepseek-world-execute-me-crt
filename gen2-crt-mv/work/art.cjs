/* work/art.cjs — draw every ART figure and every schematic symbol on one sheet,
 * at the proportions the film uses, so the shapes can be judged for
 * recognisability before an act is written around them. */
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').split(path.sep).join('/');
const want = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files', '--disable-web-security'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const info = await p.evaluate((want) => {
    const g = MV.gp;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, 1920, 1080);
    const names = (want.length ? want
      : Object.keys(MV.ART).filter(k => /^[A-Z]/.test(k)))
      .filter(k => MV.ART[k] && MV.ART[k].rows);
    const out = [];
    const cols = 3, cw = 1920 / cols, ch = 300;
    names.forEach((n, i) => {
      const a = MV.ART[n];
      const col = i % cols, row = (i / cols) | 0;
      const box = { x: col * cw + 60, y: row * ch + 60, w: cw - 120, h: ch - 90 };
      const f = MV.ART.fit(g, a, box);
      MV.ART.draw(g, a, f.x, f.y, { cw: f.cw, ch: f.ch, px: f.px,
        color: '#39ff88', alpha: 1, glow: 6 });
      MV.mono(g, 16, 'bold');
      g.fillStyle = '#6ef0ff';
      g.fillText(n + '  ' + a.w + 'x' + a.h + '  pitch ' + f.cw.toFixed(1) + 'x' + f.ch.toFixed(1),
        col * cw + 60, row * ch + 40);
      out.push(n + ' ' + a.w + 'x' + a.h + ' pitch ' + f.cw.toFixed(1) + 'x' + f.ch.toFixed(1));
    });
    // schematics: the symbols are paths, so they get their own strip
    const sy = 900;
    g.save();
    g.strokeStyle = g.fillStyle = '#ffb86b';
    MV.mono(g, 16, 'bold');
    g.fillStyle = '#6ef0ff';
    g.fillText('schematics: acSource / switch(open,closed) / fuse / resistor / cap / bridge', 60, sy - 46);
    g.strokeStyle = g.fillStyle = '#39ff88';
    MV.ART.wire(g, 60, sy, 260, sy, { px: 20 });
    MV.ART.acSource(g, 300, sy, 34, { glow: 6 });
    MV.ART.wire(g, 334, sy, 420, sy, { px: 20 });
    MV.ART.switch(g, 460, sy, 24, 0, { glow: 6 });
    MV.ART.switch(g, 620, sy, 24, 1, { glow: 6 });
    MV.ART.fuse(g, 780, sy, 22, { glow: 6 });
    MV.ART.resistor(g, 960, sy, 24, 'h', { glow: 6 });
    MV.ART.cap(g, 1120, sy, 30, 'h', { glow: 6 });
    MV.ART.ground(g, 1240, sy - 20, 30, { glow: 6, px: 20 });
    MV.ART.bridge(g, 1500, sy, 26, { glow: 6 });
    MV.ART.bridgeLit(g, 1500, sy, 26, 0, { glow: 14 });
    MV.ART.bridgeLit(g, 1500, sy, 26, 2, { glow: 14 });
    g.restore();
    return out;
  }, want);
  await p.evaluate(() => {
    const g = MV.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, 1920, 1080);
    g.drawImage(MV.PIC, 0, 0);
  });
  await p.locator('canvas').first().screenshot({ path: path.join(ROOT, 'work', 'shots', 'art.png') });
  console.log(info.join('\n'));
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
