/* main.js — assemble the three canvases and expose one pure function of time.
 *
 *   window.__draw(t)   draws the whole frame for virtual time t and returns the
 *                      per-frame cost counters
 *
 * The picture is drawn on its own canvas, the words on a second one, and the two
 * are composited in the right order by crt.js. Nothing here reads the clock, the
 * mouse, the audio element or Math.random: two runs must hash identically before
 * parallel chunking is trustworthy.
 */
(function (MV) {
  'use strict';

  const W = 1920, H = 1080;

  function mk() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  }

  // --- the three surfaces
  MV.OUT = mk();                       // what the audience sees
  MV.g = MV.OUT.getContext('2d');
  MV.PIC = mk();                       // the picture layer: everything inside the tube
  MV.gp = MV.PIC.getContext('2d');
  MV.INKCP = mk();                     // the ink layer: every word, drawn after the damage
  MV.INK.enable(MV.INKCP);

  const stage = document.getElementById('stage');
  stage.appendChild(MV.OUT);
  const boot = document.getElementById('boot');
  if (boot) boot.remove();

  // ------------------------------------------------------------------ boot
  if (!window.MV_TIMELINE || !window.MV_AUDIO) {
    document.body.innerHTML = '<pre style="color:#f66;font:14px monospace">' +
      'MV_TIMELINE / MV_AUDIO missing — run tools/analyze.py first.</pre>';
    return;
  }

  MV.init(window.MV_TIMELINE, window.MV_AUDIO);
  MV.hookFillText(MV.gp);
  MV.CRT.init();
  MV.UI.buildLog();

  // ------------------------------------------------------------------ report
  const chars = MV.RAMP + MV.RAMP_DENSE + MV.RAMP_BLOCK +
    Object.keys(MV.BOX).map(function (k) { return MV.BOX[k]; }).join('') +
    Object.keys(MV.GLYPH_SETS).map(function (k) { return MV.GLYPH_SETS[k]; }).join('') +
    Object.keys(MV.DIGITS).join('') + ' \u2588\u258c\u2580\u2584_\u2502\u00b7\u2726\u2713\u220e\u221e';
  const v = MV.validateGlyphs(MV.F_MONO, chars);

  // every size the film can ask for, warmed once so no shot pays for it
  const sizesMono = [], sizesCJK = [];
  for (let px = 6; px <= 74; px++) sizesMono.push(px);
  for (let px = 10; px <= 34; px++) sizesCJK.push(px);
  const warmed = MV.warmFonts(chars, sizesMono, sizesCJK);
  window.MV_REPORT = {
    bpm: MV.T.meta.bpm,
    beat: MV.BEAT,
    offset: MV.OFF,
    duration: MV.DUR,
    frames: MV.FRAMES,
    fps: MV.FPS,
    sections: MV.sections.length,
    lines: MV.lines.length,
    logLines: MV.UI.logLines.length,
    cueCount: MV.EXEC_ALL.length,
    exec12: MV.EXEC12,
    fontMono: MV.cells(MV.F_MONO, 16),
    fontCJK: MV.cells(MV.F_CJK, 16),
    glyphsChecked: chars.length,
    glyphsMissing: v.bad,
    glyphsWarmed: warmed,
  };

  // ------------------------------------------------------------------ counters
  const st = { t: 0, picCalls: 0, picChars: 0, inkCalls: 0, inkChars: 0, ms: 0 };
  window.__frameStats = function () { return st; };

  // count what actually lands on the picture layer, glyph by glyph
  const raw = MV.gp.__rawFillText;
  MV.gp.__rawFillText = function (s, x, y) {
    st.picCalls++; st.picChars += s.length;
    return raw(s, x, y);
  };
  MV.INK.stats = function (text) { st.inkCalls++; st.inkChars += text.length; };

  // ------------------------------------------------------------------ the frame
  window.__draw = function (t) {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    t = MV.clamp(t, 0, MV.FRAMES / MV.FPS - 1e-9);
    st.t = t; st.picCalls = 0; st.picChars = 0; st.inkCalls = 0; st.inkChars = 0;

    const g = MV.g, gp = MV.gp;
    MV.INK.clear();

    MV.CRT.drawCase(gp, t);
    MV.CRT.tubeBase(gp);    gp.save();
    MV.CRT.tubePath(gp);
    gp.clip();
    MV.drawScene(gp, t);
    MV.CRT.collapse(gp, t);
    gp.restore();

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, W, H);
    g.drawImage(MV.PIC, 0, 0);

    MV.CRT.bloom(g, MV.PIC, t);
    MV.CRT.pump(g, t);
    MV.CRT.glitch(g, MV.PIC, t);
    MV.CRT.scan(g, t);
    MV.CRT.grain(g, t);
    MV.CRT.glass(g, t, false);
    MV.CRT.spill(g);
    MV.CRT.grade(g, t);
    MV.CRT.compositeInk(g, t);

    if (t0) st.ms = performance.now() - t0;
    return st;
  };

  // ------------------------------------------------------------------ photometry
  /* Mean and peak luma of the finished frame, plus the fraction of the frame
   * that is actually lit. Reported in the same units the verification pass uses. */
  window.__stats = function (t) {
    window.__draw(t);
    const g = MV.g;
    const im = g.getImageData(0, 0, W, H).data;
    let sum = 0, max = 0, lit = 0, n = W * H;
    const hist = new Array(16).fill(0);
    for (let i = 0; i < im.length; i += 4) {
      const y = 0.2126 * im[i] + 0.7152 * im[i + 1] + 0.0722 * im[i + 2];
      sum += y;
      if (y > max) max = y;
      if (y > 24) lit++;
      hist[Math.min(15, y >> 4)]++;
    }
    return { t: t, mean: sum / n, max: max, litFrac: lit / n, hist: hist };
  };

  // ------------------------------------------------------------------ diagnostics
  window.__diag = function (t) {
    const s = window.__draw(t);
    return {
      t: t, section: MV.sectionAt(t).id, beat: MV.beatFloat(t),
      picChars: s.picChars, picCalls: s.picCalls,
      inkChars: s.inkChars, inkCalls: s.inkCalls, ms: s.ms,
    };
  };

  window.__ready = true;
  MV.UI.ready = true;

})(window.MV = window.MV || {});
