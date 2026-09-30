/* work/sync.cjs — does the Chinese keep up with the English, frame by frame?
 *
 * Both captions are cut by ceil(len * k / room) from one shared step counter k,
 * so the claim to verify is a claim about frames, not about code. This walks the
 * whole film on the master's own frame grid (t = f / 30, f = 0 .. 6357) and, for
 * every frame, reads the strings actually drawn on the caption band and asks the
 * deck itself (UI.logAt) which line is current. Then:
 *
 *   1. first character: the frame the English appears on vs the Chinese;
 *   2. last character: the frame each reaches full length, or null when the deck
 *      has already swapped to the next line;
 *   3. revealed fraction, per frame: |zh/lenZh − en/lenEn| — a shorter string is
 *      cut into fewer visible steps, so the step *frames* legitimately differ.
 *      The bound is what matters, and "the Chinese never lags" means the bound
 *      has to be symmetric and small.
 *   4. caption gaps: runs of frames with an empty band. UI.logAt switches to the
 *      next line 0.06 s before it starts typing, so a swap can open a hole.
 *
 *   node work/sync.cjs
 */
const { chromium } = require('playwright-core');
const path = require('path');
const { pathToFileURL } = require('url');
const CHROME = process.env.CHROME_PATH ||
  require('../tools/lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = pathToFileURL(path.join(ROOT, 'src', 'index.html')).href;

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: [
    '--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
    '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const out = await p.evaluate(() => {
    window.__ink = [];
    MV.INK.stats = function (text, color, font, x, y) {
      window.__ink.push([text, color, font, Math.round(x), Math.round(y),
        MV.INK.texture === true]);
    };
    const raw = (band) => window.__ink.filter((r) => Math.abs(r[4] - band) <= 8 &&
      r[5] !== true).map((r) => r[0]).join('').replace(/\s/g, '');
    const strip = (s) => s.replace(/\s/g, '');
    const src = MV.UI.logLines;
    const lines = src.map((L) => ({
      tOn: Number(L.tOn.toFixed(3)), text: L.text, gloss: L.gloss,
      nEn: strip(L.text).length, nZh: L.gloss ? strip(L.gloss).length : 0,
      firstEn: null, firstZh: null, doneEn: null, doneZh: null,
      fracMin: undefined, fracMax: undefined, behind: 0, enFrames: 0, zhFrames: 0 }));
    /* A frame is attributed to the line whose own reveal clock produces exactly
     * the strings on the glass — the deck's internals are not trusted. */
    const match = (i, t, en, zh) => {
      const L = src[i];
      if (!L) return false;
      const pe = strip(L.text.slice(0, MV.UI.typed(L, t)));
      if (en !== pe) return false;
      const pz = L.gloss ? strip(L.gloss.slice(0, MV.UI.typedGloss(L, t))) : '';
      return zh === pz;
    };
    const gaps = [];
    let run = 0, miss = 0, enOnly = 0, zhOnly = 0, frames = 0;
    for (let f = 0; f < MV.FRAMES; f++) {
      const t = f / MV.FPS;
      window.__ink.length = 0;
      window.__draw(t);
      frames++;
      const en = raw(972), zh = raw(1012);
      if (!en.length && !zh.length) { run++; continue; }
      if (run) { gaps.push({ at: Number(t.toFixed(2)), line: MV.UI.logAt(t), frames: run }); run = 0; }
      const cur = MV.UI.logAt(t);
      let hit = -1;
      if (match(cur, t, en, zh)) hit = cur;
      else if (match(cur - 1, t, en, zh)) hit = cur - 1;
      if (hit < 0) { miss++; continue; }
      const L = lines[hit];
      if (en.length) {
        L.enFrames++;
        if (L.firstEn === null) L.firstEn = f;
        if (en.length >= L.nEn && L.doneEn === null) L.doneEn = f;
      }
      if (zh.length) {
        L.zhFrames++;
        if (L.firstZh === null) L.firstZh = f;
        if (zh.length >= L.nZh && L.doneZh === null) L.doneZh = f;
      }
      if (en.length && !zh.length) enOnly++;
      if (zh.length && !en.length) zhOnly++;
      if (L.nZh) {
        const d = zh.length / L.nZh - en.length / L.nEn;
        if (L.fracMin === undefined || d < L.fracMin) L.fracMin = d;
        if (L.fracMax === undefined || d > L.fracMax) L.fracMax = d;
        if (d < -1e-9) L.behind++;
      }
    }
    if (run) gaps.push({ at: null, line: -1, frames: run });
    return { lines: lines, gaps: gaps, miss: miss, enOnly: enOnly, zhOnly: zhOnly,
      frames: frames, fps: MV.FPS };
  });

  const withZh = out.lines.filter((L) => L.nZh > 0);
  const started = withZh.filter((L) => L.firstEn !== null && L.firstZh !== null);
  const startDiff = started.map((L) => L.firstZh - L.firstEn);
  const startBad = started.filter((L) => L.firstZh !== L.firstEn);
  const completed = withZh.filter((L) => L.doneEn !== null && L.doneZh !== null);
  const doneBad = completed.filter((L) => L.doneEn !== L.doneZh);
  const halfDone = withZh.filter((L) => (L.doneEn === null) !== (L.doneZh === null));
  const never = withZh.filter((L) => L.doneEn === null);
  const signed = withZh.filter((L) => L.fracMin !== undefined);
  const worst = signed.slice().sort((a, c) => a.fracMin - c.fracMin)[0];
  const best = signed.slice().sort((a, c) => c.fracMax - a.fracMax)[0];
  const behindFrames = signed.reduce((s, L) => s + L.behind, 0);
  const behindLines = signed.filter((L) => L.behind > 0);
  const capFrames = signed.reduce((s, L) => s + L.enFrames, 0);

  console.log('walked ' + out.frames + ' frames at ' + out.fps + ' fps  (' +
    (out.frames / out.fps).toFixed(3) + ' s)  ' + out.lines.length + ' logged lines, ' +
    withZh.length + ' of them with a translation');
  console.log('');
  console.log('first character  same frame on ' + (started.length - startBad.length) + '/' +
    started.length + ' lines' + (startBad.length ? '  —  ' + startBad.length + ' DIFFER' : '') +
    '   (frame delta ' + Math.min.apply(null, startDiff) + '..' + Math.max.apply(null, startDiff) + ')');
  for (const L of startBad.slice(0, 8)) {
    console.log('   t=' + L.tOn + '  ' + JSON.stringify(L.text) + ' en f' + L.firstEn +
      '  zh f' + L.firstZh);
  }
  console.log('last character   same frame on ' + (completed.length - doneBad.length) + '/' +
    completed.length + ' lines that finish on screen' +
    (doneBad.length ? '  —  ' + doneBad.length + ' DIFFER' : '') +
    (halfDone.length ? '   [' + halfDone.length + ' half-finished]' : ''));
  for (const L of doneBad.slice(0, 8)) {
    console.log('   t=' + L.tOn + '  ' + JSON.stringify(L.text) + ' en f' + L.doneEn +
      '  zh f' + L.doneZh + '  (' + (L.doneZh < L.doneEn ? 'zh first, ' +
      (L.doneEn - L.doneZh) + 'f = ' + ((L.doneEn - L.doneZh) / out.fps).toFixed(2) + 's'
      : 'EN FIRST') + ')');
  }
  const enFirst = doneBad.filter((L) => L.doneEn < L.doneZh);
  console.log('                 of those, the Chinese finishes first on ' +
    (doneBad.length - enFirst.length) + ', the English first on ' + enFirst.length +
    ' (a shorter string runs out of characters sooner on the same clock)');
  console.log('never completed  ' + never.length + ' line(s) (deck swaps first)' +
    (never.length ? '  first: t=' + never[0].tOn + ' ' + JSON.stringify(never[0].text) : ''));
  console.log('revealed fraction  zh/lenZh − en/lenEn, every frame of every line:');
  console.log('                   min ' + worst.fracMin.toFixed(3) + ' at t=' + worst.tOn +
    ' ' + JSON.stringify(worst.text) + ' / ' + JSON.stringify(worst.gloss) +
    '  (' + worst.nEn + ' en vs ' + worst.nZh + ' zh chars)');
  console.log('                   max ' + best.fracMax.toFixed(3) + ' at t=' + best.tOn +
    ' ' + JSON.stringify(best.text) + ' / ' + JSON.stringify(best.gloss) +
    '  (' + best.nEn + ' en vs ' + best.nZh + ' zh chars)');
  console.log('                   frames with the Chinese behind the English: ' + behindFrames +
    ' of ' + capFrames + ' caption frames, on ' + behindLines.length + '/' + withZh.length + ' lines');
  const charsWorst = signed.slice().sort((a, c) => (a.fracMin * a.nZh) - (c.fracMin * c.nZh))[0];
  console.log('                   worst deficit ' +
    (charsWorst.fracMin * charsWorst.nZh).toFixed(2) + ' of a glyph at t=' + charsWorst.tOn +
    ' ' + JSON.stringify(charsWorst.text) + ' / ' + JSON.stringify(charsWorst.gloss));
  for (const L of behindLines.slice(0, 6)) {
    console.log('   t=' + L.tOn + '  ' + JSON.stringify(L.text) + ' / ' + JSON.stringify(L.gloss) +
      '  min ' + L.fracMin.toFixed(3) + '  (' + L.nEn + ' en vs ' + L.nZh + ' zh)');
  }
  console.log('band coverage    en-only frames ' + out.enOnly + ', zh-only frames ' + out.zhOnly +
    ', frames matching neither language clock ' + out.miss);
  const over = out.gaps.filter((g) => g.frames > 0);
  const hist = {};
  for (const g of over) hist[g.frames] = (hist[g.frames] || 0) + 1;
  console.log('caption gaps     ' + over.length + ' gap(s), runs of frames: ' +
    Object.keys(hist).sort((a, c) => a - c).map((k) => k + 'f×' + hist[k]).join(' '));
  for (const g of over.filter((x) => x.frames > 2).slice(0, 8)) {
    console.log('   t=' + g.at + '  ' + g.frames + ' frames  before line ' + g.line);
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
