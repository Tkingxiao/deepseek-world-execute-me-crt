/* work/flashcalc.cjs — reproduce P10's flash arithmetic in the page and print
 * every term, so the blame is on a number and not on a guess.
 *
 *   node work/flashcalc.cjs 159.4
 */
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');

const T = Number(process.argv[2] || 159.4);
const TARM = Number(process.argv[3] || 158.9);

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

  const res = await p.evaluate(({ t, tArm }) => {
    const digits = ['EIN', 'DOS', 'TROIS', 'NE', 'FEM', 'LIU'];
    const cn = [];
    for (let i = 0; i < 6; i++) cn.push(MV.cue(digits[i], tArm - 0.6));
    const strikes = [];
    let flash = 0;
    for (let i = 0; i < MV.EXEC12.length; i++) {
      const d = t - MV.EXEC12[i];
      const term = Math.exp(-Math.abs(d) / 0.085) * (d > -0.05 ? 1 : 0.2);
      strikes.push({ at: +MV.EXEC12[i].toFixed(3), d: +d.toFixed(3), term: +term.toFixed(5) });
      flash += term;
    }
    const afterStrikes = flash;
    let nf = 0;
    const counts = [];
    for (let i = 0; i < 6; i++) {
      const d = t - cn[i];
      const term = Math.exp(-Math.abs(d) / 0.05) * (d > -0.05 ? 0.55 : 0.1);
      counts.push({ word: digits[i], at: +cn[i].toFixed(3), d: +d.toFixed(3), term: +term.toFixed(5) });
      nf += term;
    }
    const nfClamped = MV.clamp(nf, 0, 0.8);
    const total = afterStrikes + nfClamped;
    return {
      t: t, tArm: tArm, exec12: MV.EXEC12.length, strikes: strikes, afterStrikes: afterStrikes,
      counts: counts, nf: nf, nfClamped: nfClamped, total: total,
      alpha: MV.clamp(MV.clamp(total, 0, 1.4), 0, 1) * 0.5,
      execAllCount: MV.EXEC_ALL.length,
      execAllHead: MV.EXEC_ALL.slice(0, 20).map((x) => +x.toFixed(3)),
      execAllTail: MV.EXEC_ALL.slice(-8).map((x) => +x.toFixed(3)),
    };
  }, { t: T, tArm: TARM });

  console.log('t=' + res.t + '  tArm=' + res.tArm + '  EXEC12 n=' + res.exec12 +
    '  EXEC_ALL n=' + res.execAllCount);
  console.log('  exec_all head ' + res.execAllHead.join(' '));
  console.log('  exec_all tail ' + res.execAllTail.join(' '));
  console.log('  strikes:');
  for (const s of res.strikes) if (s.term > 0.0001) console.log('    ' + s.at + '  d=' + s.d + '  term ' + s.term);
  console.log('  after strikes flash = ' + res.afterStrikes.toFixed(5));
  console.log('  countdown:');
  for (const s of res.counts) console.log('    ' + s.word.padEnd(6) + ' at ' + s.at + '  d=' + s.d + '  term ' + s.term);
  console.log('  nf ' + res.nf.toFixed(5) + ' -> clamp ' + res.nfClamped.toFixed(5) +
    '   total ' + res.total.toFixed(5) + '   alpha ' + res.alpha.toFixed(4));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
