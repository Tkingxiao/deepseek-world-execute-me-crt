/* tools/check-gates.cjs — the composition-level gates that a coded picture has
 * to pass before it is allowed to become a video.
 *
 *   node tools/check-gates.cjs
 *
 * Everything here is measured by driving the real composition and reading what
 * it actually drew: which strings reached the ink layer, on which baseline, in
 * which colour — plus the two colour dramaturgy rules the design stakes itself
 * on (red only after RED_GATE; the bilingual pair always stacked).
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_PATH ||
  require('./lib/env.cjs').chrome();
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'src', 'index.html').replace(/\\/g, '/');

const results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: ok, detail: detail });
  console.log((ok ? '  ok  ' : ' FAIL ') + name.padEnd(36) + detail);
}

(async () => {
  const b = await chromium.launch({
    executablePath: CHROME,
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text',
      '--font-render-hinting=none', '--allow-file-access-from-files',
      '--disable-web-security'],
  });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + (e && e.message)));
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });

  // record every string that reaches the ink layer, with its colour, baseline and
  // whether it is texture rather than words (see the band gate below)
  await p.evaluate(() => {
    window.__ink = [];
    const prev = MV.INK.stats;
    MV.INK.stats = function (text, color, font, x, y) {
      window.__ink.push([text, color, font, Math.round(x), Math.round(y),
        MV.INK.texture === true]);
      if (prev) prev(text, color, font, x, y);
    };
  });

  const report = await p.evaluate(() => {
    const lines = MV.UI.logLines;
    const isCJK = (s) => /[\u3400-\u9fff]/.test(s);
    const bad = [];
    const late = [];
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (!L.gloss) { bad.push([i, 'no gloss']); continue; }
      if (!isCJK(L.gloss)) { bad.push([i, 'gloss is not chinese']); continue; }
      // sample near the end of the line's real life: both languages must be complete
      const win = L.show || L.dur;
      const t = L.tOn + win - 0.03;
      window.__ink.length = 0;
      window.__draw(t);
      const ink = window.__ink.slice();
      /* Both languages live on fixed baselines inside the caption band: the
       * English row at SUB.y + 56, its translation at SUB.y + 96. Matching by
       * text alone finds the dimmed previous line first, whose baseline belongs
       * to a different line entirely. */
      const YEN = MV.SUB.y + 56, YZH = MV.SUB.y + 96;
      const onLine = (y) => ink.filter((r) => Math.abs(r[4] - y) <= 3);
      const en = onLine(YEN).filter((r) => r[0].indexOf(L.text.slice(0, 12)) >= 0);
      const zh = onLine(YZH).filter((r) => r[0].indexOf(L.gloss.slice(0, 10)) >= 0 && isCJK(r[0]));
      if (en.length === 0) {
        // maybe it was still typing: find out when the english completes
        let done = -1;
        for (let q = 0.1; q <= win + 0.4; q += 0.05) {
          window.__ink.length = 0;
          window.__draw(L.tOn + q);
          if (window.__ink.some((r) => Math.abs(r[4] - YEN) <= 3 &&
            r[0].indexOf(L.text) >= 0)) { done = q; break; }
        }
        late.push(['en', i, L.text.slice(0, 18), Number(done.toFixed(2)), L.dur]);
        continue;
      }
      if (zh.length === 0) {
        let done = -1;
        for (let q = 0.1; q <= win + 0.4; q += 0.05) {
          window.__ink.length = 0;
          window.__draw(L.tOn + q);
          if (window.__ink.some((r) => Math.abs(r[4] - YZH) <= 3 &&
            r[0].indexOf(L.gloss) >= 0)) { done = q; break; }
        }
        late.push(['zh', i, L.gloss, Number(done.toFixed(2)), L.dur]);
        continue;
      }
      const dy = zh[0][4] - en[0][4];
      if (!(dy > 8 && dy < 90)) bad.push([i, 'pair not stacked (dy ' + dy + ')']);
    }
    return {
      n: lines.length, bad: bad.slice(0, 8), badCount: bad.length,
      late: late.slice(0, 8), lateCount: late.length,
    };
  });
  check('every displayed line has a stacked translation',
    report.badCount === 0,
    report.n + ' lines, ' + report.badCount + ' mis-stacked' +
    (report.badCount ? '  e.g. ' + JSON.stringify(report.bad.slice(0, 4)) : ''));
  check('both languages finish before the line leaves',
    report.lateCount === 0,
    report.lateCount + ' lines still typing at the end  e.g. ' +
    JSON.stringify(report.late.slice(0, 3)));

  // --- red is reserved: the accent must not appear before RED_GATE
  const red = await p.evaluate(() => {
    window.__redAt = function (t) {
      window.__draw(t);
      const im = MV.g.getImageData(0, 0, 1920, 1080).data;
      let n = 0, tot = 0;
      for (let i = 0; i < im.length; i += 4 * 7) {
        const r = im[i], g = im[i + 1], b2 = im[i + 2];
        tot++;
        /* Amber #ffb86b has g > b and only 28% separation; the red accent
         * #ff4d5e has b > g and 70%. Comparing r against g and b alone
         * classified the amber readouts as red. */
        if (r > 48 && (r - g) > 0.5 * r && b2 > g) n++;
      }
      return n / tot;
    };
    const out = [];
    for (let t = 4; t < MV.sections[MV.sections.length - 1].end - 1; t += 1.5) {
      out.push([Number(t.toFixed(2)), window.__redAt(t)]);
    }
    return { gate: MV.RED_GATE, out: out };
  });
  const before = red.out.filter((r) => r[0] < red.gate - 0.5);
  const after = red.out.filter((r) => r[0] > red.gate + 0.5);
  const maxBefore = Math.max(...before.map((r) => r[1]));
  const meanAfter = after.reduce((s, r) => s + r[1], 0) / after.length;
  check('no red accent before RED_GATE', maxBefore < 0.0015,
    'gate ' + red.gate.toFixed(3) + 's  max before ' + (maxBefore * 100).toFixed(3) +
    '% of pixels, mean after ' + (meanAfter * 100).toFixed(3) + '%');
  check('red is present after RED_GATE', meanAfter > 0.004,
    'mean after ' + (meanAfter * 100).toFixed(3) + '%');

  // --- brightness still modulates at the tempo after the gate (video is not flattened)
  const mod = await p.evaluate(() => {
    const t0 = MV.RED_GATE + 2, t1 = MV.sections[MV.sections.length - 1].end - 3;
    const ys = [];
    for (let f = Math.round(t0 * MV.FPS); f < Math.round(t1 * MV.FPS); f++) {
      window.__draw(f / MV.FPS);
      const im = MV.g.getImageData(258, 48, 1276, 902).data;
      let s = 0, n = 0;
      for (let i = 0; i < im.length; i += 4 * 11) {
        s += 0.2126 * im[i] + 0.7152 * im[i + 1] + 0.0722 * im[i + 2]; n++;
      }
      ys.push(s / n);
    }
    return ys;
  });
  const m = mod.reduce((s, y) => s + y, 0) / mod.length;
  const w = 2 * Math.PI * (130.0058 / 60) / 30, cw = Math.cos(w), sw = Math.sin(w);
  let q1 = 0, q2 = 0;
  for (const y of mod) { const q0 = 2 * cw * q1 - q2 + y; q2 = q1; q1 = q0; }
  const amp = 2 * Math.hypot(q1 - q2 * cw, q2 * sw) / mod.length;
  check('tube brightness modulates at 130 BPM', amp / m * 100 >= 1.0,
    'amplitude ' + (amp / m * 100).toFixed(2) + '% of mean luma ' + m.toFixed(2) +
    '  (' + mod.length + ' frames)');

  // --- a cursor is present in the current line for most of the film
  const cur = await p.evaluate(() => {
    let withCursor = 0, n = 0;
    for (let t = 20; t < 205; t += 2) {
      window.__ink.length = 0;
      window.__draw(t);
      n++;
      if (window.__ink.some((r) => r[0].indexOf('\u2588') >= 0 ||
        r[0].indexOf('\u258c') >= 0 || r[0].indexOf('\u2590') >= 0)) withCursor++;
    }
    return { withCursor: withCursor, n: n };
  });
  check('the cursor is on the tube', cur.withCursor / cur.n > 0.5,
    cur.withCursor + '/' + cur.n + ' sampled frames carry a caret');

  // --- the acts must keep their own words out of the chrome's bands
  /* Ink on ink is the one collision the picture layer cannot save you from: the
   * text is composited after every blur and glitch pass, so two strings on the
   * same baseline simply overwrite each other. The bands moved when the lyric log
   * became a caption plate, so they are measured here rather than written down:
   * draw the chrome alone and collect its baselines, then draw the acts with the
   * chrome silenced and require that no act baseline lands on a chrome band. */
  const zones = await p.evaluate(() => {
    const chrome = MV.drawChrome;
    const scene = MV.drawScene;
    const t0 = 0.5, t1 = MV.FRAMES / MV.FPS - 0.5;
    const bands = [];
    MV.drawScene = function (g, t) { MV.INK.clear(); chrome(g, t); };
    for (let t = t0; t < t1; t += 0.25) {
      window.__ink.length = 0;
      window.__draw(t);
      for (const r of window.__ink) bands.push([Math.round(r[4]), r[0].slice(0, 16)]);
    }
    MV.drawScene = scene;
    const uy = [], uniqB = [], seenB = {};
    for (const b of bands) {
      const k = '' + b[0];
      if (seenB[k]) continue;
      seenB[k] = 1; uniqB.push(b); uy.push(b[0]);
    }
    MV.drawChrome = function () {};
    const bad = [];
    let texturing = 0;
    for (let t = t0; t < t1; t += 0.5) {
      window.__ink.length = 0;
      window.__draw(t);
      for (const r of window.__ink) {
        // a full-frame raster (the burn-in stain) is texture, not a label: it is
        // drawn at a flat low alpha under the chrome, and a stain crossing a
        // baseline does not compete with the words the way a second label does.
        // Counted and reported rather than silently dropped.
        if (r[5] === true) { texturing++; continue; }
        const y = r[4];
        // a glyph occupies roughly 22 px above its baseline and 8 below
        for (let i = 0; i < uy.length; i++) {
          if (y > uy[i] - 22 && y < uy[i] + 8) {
            bad.push([Number(t.toFixed(1)), r[0].slice(0, 24), y, uy[i]]);
            break;
          }
        }
      }
    }
    MV.drawChrome = chrome;
    const seen = {};
    const uniq = [];
    for (const b of bad) {
      const k = b[0] + '|' + b[1];
      if (seen[k]) continue;
      seen[k] = 1; uniq.push(b);
    }
    return { n: bad.length, bands: uniqB.slice(0, 12), nb: uniqB.length,
      uniq: uniq.slice(0, 10), tex: texturing };
  });
  check('act labels clear of every chrome band', zones.n === 0,
    zones.nb + ' chrome baselines ' + JSON.stringify(zones.bands.map((b) => b[0])) +
    ', ' + zones.n + ' act label(s) on them, ' + zones.tex + ' texture draw(s) excused' +
    (zones.n ? '  e.g. ' + JSON.stringify(zones.uniq.slice(0, 4)) : ''));

  check('no page errors', errs.length === 0, errs.length + ' message(s)' +
    (errs.length ? '  ' + errs[0].slice(0, 120) : ''));

  await b.close();
  const failed = results.filter((r) => !r.ok);
  console.log('  gates ' + results.length + '   failed ' + failed.length);
  if (failed.length) process.exit(1);
  console.log('  ALL GATES PASSED');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
