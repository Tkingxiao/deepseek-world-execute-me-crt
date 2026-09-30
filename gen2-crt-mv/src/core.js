/* core.js — palette, deterministic randomness, beat grid, fonts, ink layer.
 *
 * Everything here is a pure function of virtual time t. No Date.now, no
 * performance.now, no Math.random anywhere in the draw path.
 */
(function (MV) {
  'use strict';

  // ------------------------------------------------------------------ palette
  // Not a palette, a script. See docs/DESIGN.md section 3.
  MV.C = {
    bg:      '#030805',
    phos:    '#39ff88',   // the machine's own colour. cursor, log, HUD, creature
    phosDim: '#1c7a44',
    phosMid: '#28b566',
    cyan:    '#6ef0ff',   // logic: every diagram and numeric readout
    cyanDim: '#1f6f7d',
    violet:  '#b98cff',   // interior states: dizzy, trance, love
    violetDim: '#5a3f8a',
    amber:   '#ffb86b',   // flesh. arrives once, at 74.045 s
    amberDim: '#8a5f36',
    red:     '#ff4d5e',   // death. NOT before 125.708 s
    redDim:  '#7d2430',
    white:   '#e8fff2',
  };

  MV.RED_GATE = 125.708;   // red is not allowed to exist before this time

  // ------------------------------------------------------------------ geometry of the world
  // There is no case. The picture IS the display of a CRT and the screen edge IS
  // the glass, so the tube covers the whole 1920 x 1080 frame: anything drawn
  // outside it would be a picture of a television, which is the one thing the
  // film may not contain. The only geometry left is the corner the glass falls
  // away at, which crt.js clips to.
  MV.SC = { x: 0, y: 0, w: 1920, h: 1080 };
  MV.GLASS_R = 54;                                      // the tube face's corner radius

  // the subtitle strip: two lines, lower middle, nothing else in it
  MV.SUB = { x: 420, y: 916, w: 1080, h: 120 };

  // ------------------------------------------------------------------ math
  MV.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  MV.lerp = function (a, b, u) { return a + (b - a) * u; };
  MV.mix = MV.lerp;
  MV.smooth = function (u) { u = MV.clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  MV.smoother = function (u) { u = MV.clamp(u, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
  MV.easeOut = function (u) { u = MV.clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); };
  MV.easeIn = function (u) { u = MV.clamp(u, 0, 1); return u * u; };
  MV.ramp = function (u, a, b) { return MV.clamp((u - a) / (b - a || 1e-9), 0, 1); };
  MV.taper = function (u, a, b, c, d) { return MV.smooth(MV.ramp(u, a, b)) * (1 - MV.smooth(MV.ramp(u, c, d))); };

  // ------------------------------------------------------------------ rng
  // mulberry32, seeded from the frame index so two runs hash identically.
  MV.rng = function (seed) {
    let a = (seed | 0) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let x = a;
      x = Math.imul(x ^ (x >>> 15), 1 | x);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  };

  // stateless 2D hash, for per-cell decisions that must be stable in space
  MV.hash2 = function (x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  MV.hash1 = function (n, s) { return MV.hash2(n, s, 0x9e3779b9); };

  // ------------------------------------------------------------------ fonts
  MV.F_MONO = 'Consolas, "Cascadia Mono", "Courier New", monospace';
  MV.F_CJK = 'NSimSun, "MS Gothic", SimSun, "Microsoft YaHei", monospace';

  // Every font change must also reach the ink context, or the ink layer measures
  // text with a stale font and positions drift (layout-and-legibility.md section 1).
  MV.mono = function (ctx, px, weight) {
    const f = (weight ? weight + ' ' : '') + px + 'px ' + MV.F_MONO;
    ctx.font = f;
    if (MV.INK.ctx) MV.INK.ctx.font = f;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (MV.INK.ctx) {
      MV.INK.ctx.textAlign = ctx.textAlign;
      MV.INK.ctx.textBaseline = ctx.textBaseline;
    }
    return ctx;
  };
  MV.monoCJK = function (ctx, px, weight) {
    const f = (weight ? weight + ' ' : '') + px + 'px ' + MV.F_CJK;
    ctx.font = f;
    if (MV.INK.ctx) MV.INK.ctx.font = f;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (MV.INK.ctx) {
      MV.INK.ctx.textAlign = ctx.textAlign;
      MV.INK.ctx.textBaseline = ctx.textBaseline;
    }
    return ctx;
  };

  // ------------------------------------------------------------------ ink layer
  MV.INK = {
    canvas: null,
    ctx: null,
    route: true,          // true -> readable text goes to the crisp layer
    fade: 1,              // the whole layer's opacity; P14 takes the glass to black
    stats: null,
    enable: function (canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
    },
    clear: function () {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.globalAlpha = 1;
      this.ctx.filter = 'none';
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.shadowBlur = 0;
      this.ctx.shadowColor = 'transparent';
    },
  };

  // Route text into the ink layer by wrapping fillText itself, so no call site
  // can forget. Picture-layer character art opts out locally and explicitly.
  MV.hookFillText = function (ctx) {
    const orig = ctx.fillText.bind(ctx);
    ctx.__rawFillText = orig;
    ctx.fillText = function (text, x, y, mw) {
      if (!MV.INK.route || !MV.INK.ctx) return orig(text, x, y, mw);
      const g = MV.INK.ctx;
      g.save();
      g.font = ctx.font;
      g.textAlign = ctx.textAlign;
      g.textBaseline = ctx.textBaseline;
      g.globalAlpha = ctx.globalAlpha;
      g.fillStyle = ctx.fillStyle;
      g.shadowColor = ctx.shadowColor;
      g.shadowBlur = ctx.shadowBlur;
      g.direction = ctx.direction;
      if (mw === undefined) g.fillText(text, x, y);
      else g.fillText(text, x, y, mw);
      g.restore();
      if (MV.INK.stats) MV.INK.stats(text, ctx.fillStyle, ctx.font, x, y);
    };
  };

  // Picture-layer glyph drawing that must NOT be routed (the glyph creature is
  // art, not words — it is supposed to bloom and smear).
  MV.picText = function (ctx, s, x, y) { ctx.__rawFillText(s, x, y); };

  /* An act that goes dark has to take its own words with it, and the words are
   * not on the picture layer — they are on the ink layer, which is composited
   * after the tube has already been damaged and graded. */
  MV.inkBlack = function (alpha) {
    const ik = MV.INK && MV.INK.ctx, cv = MV.INK && MV.INK.canvas;
    if (!ik || !cv || alpha <= 0.004) return;
    ik.save();
    ik.setTransform(1, 0, 0, 1, 0, 0);
    ik.globalAlpha = Math.min(1, alpha);
    ik.fillStyle = '#000000';
    ik.fillRect(0, 0, cv.width, cv.height);
    ik.restore();
  };

  MV.glowText = function (ctx, s, x, y, color, blur, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur || 0;
    ctx.fillText(s, x, y);
    ctx.restore();
  };

  MV.measure = function (ctx, s) { return ctx.measureText(s).width; };

  // ------------------------------------------------------------------ beat grid
  MV.T = null;   // timeline
  MV.A = null;   // audio payload

  MV.init = function (timeline, audio) {
    MV.T = timeline;
    MV.A = audio;
    const m = timeline.meta;
    MV.FPS = m.fps;
    MV.BEAT = m.beat;
    MV.OFF = m.beatOffset;
    MV.BAR = m.bar;
    MV.DUR = m.duration;
    MV.FRAMES = m.frames;
    MV.fps = m.fps;
    MV.beat = m.beat;
    MV.off = m.beatOffset;
    MV.bar = m.bar;
    MV.dur = m.duration;
    MV.frames = m.frames;
    MV.NB = timeline.beats.length;
    MV.beats = timeline.beats;
    MV.lines = timeline.lines;
    MV.sections = timeline.sections;
    MV.LOG_AT = 0;   // filled by ui.js: current line index for a given t
    MV.period = m.beat;
    if (MV.buildCues) MV.buildCues();
  };

  // continuous beat index; may be negative before the first beat
  MV.beatFloat = function (t) { return (t - MV.off) / MV.beat; };
  MV.beatIndex = function (t) { return Math.floor(MV.beatFloat(t)); };
  MV.beatPhase = function (t) { const b = MV.beatFloat(t); return b - Math.floor(b); };
  MV.barFloat = function (t) { return (t - MV.off) / MV.bar; };

  // Beat phase quantised to the nearest whole beat: how far t is, in beats, from
  // the nearest grid line (signed). Used to fire visuals *on* the beat.
  MV.gridDist = function (t) {
    const b = MV.beatFloat(t);
    return b - Math.round(b);
  };

  MV.energyAt = function (t) {
    const k = MV.clamp(MV.beatIndex(t), 0, MV.NB - 1);
    return MV.beats[k];
  };

  // decaying pulse fired on each beat, scaled by that beat's MEASURED onset.
  // A uniform sine here is what makes a video feel mechanical.
  MV.pulse = function (t, decay) {
    const f = MV.beatPhase(t);
    const e = MV.energyAt(t);
    const d = decay === undefined ? 0.55 : decay;
    return Math.exp(-f / d) * (0.30 + 0.70 * e.onset);
  };

  MV.bandAt = function (t, name) {
    return MV.energyAt(t)[name] || 0;
  };

  // beat number, but on the half-beat grid too (for things that land every 2 beats)
  MV.onBeat = function (t, every, width) {
    const b = MV.beatFloat(t);
    const k = Math.round(b);
    if (k % (every || 1) !== 0) return 0;
    const dd = Math.abs(b - k);
    return Math.exp(-(dd * dd) / (width || 0.012));
  };

  MV.sectionAt = function (t) {
    for (let i = 0; i < MV.sections.length; i++) {
      const s = MV.sections[i];
      if (t >= s.start && t < s.end) return s;
    }
    return MV.sections[MV.sections.length - 1];
  };

  MV.sectionProgress = function (t, s) {
    s = s || MV.sectionAt(t);
    return MV.clamp((t - s.start) / (s.end - s.start), 0, 1);
  };

  MV.sectionLocal = function (t, s) { return t - (s || MV.sectionAt(t)).start; };

  // find a lyric line whose text starts with `prefix` and begins near t
  MV.nearLine = function (t, prefix, window) {
    const w = window === undefined ? 0.5 : window;
    for (let i = 0; i < MV.lines.length; i++) {
      const L = MV.lines[i];
      if (L.text.indexOf(prefix) === 0 && Math.abs(t - L.tOn) < w) return L;
    }
    return null;
  };

  MV.near = function (t, prefix, window) { return MV.nearLine(t, prefix, window) !== null; };

  // ------------------------------------------------------------------ audio data
  MV.osc = function (t) {
    const i = Math.round(t * MV.A.oscRate);
    const n = MV.A.oscLo.length;
    const j = MV.clamp(i, 0, n - 1);
    return [MV.A.oscLo[j] / 120, MV.A.oscHi[j] / 120];
  };

  MV.spec = function (t, band) {
    const f = MV.clamp(Math.round(t * MV.A.specRate), 0, MV.A.spec[0].length - 1);
    return MV.A.spec[band][f] / 255;
  };

  MV.specSum = function (t, b0, b1) {
    let s = 0;
    for (let b = b0; b < b1; b++) s += MV.spec(t, b);
    return s / (b1 - b0);
  };

  // ------------------------------------------------------------------ geometry
  MV.dist = function (ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // clip a line to a rect (for drawing a curve inside the tube)
  MV.clipLine = function (x0, y0, x1, y1, r) {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy];
    const q = [x0 - r.x, r.x + r.w - x0, y0 - r.y, r.y + r.h - y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; }
      else {
        const rr = q[i] / p[i];
        if (p[i] < 0) { if (rr > t1) return null; if (rr > t0) t0 = rr; }
        else { if (rr < t0) return null; if (rr < t1) t1 = rr; }
      }
    }
    return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  };

  // ------------------------------------------------------------------ glyph palette
  // Density ramp for picture-layer character art, plus the structural sets.
  MV.RAMP = ' .`\'":;~-+=ilcvxoCO08B#%@';
  MV.RAMP_DENSE = ' .,:;+*oxO#%@';
  MV.RAMP_BLOCK = ' ░▒▓█';

  MV.BOX = {
    tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│',
    ltee: '├', rtee: '┤', ttee: '┬', btee: '┴', cross: '┼',
    dtl: '╔', dtr: '╗', dbl: '╚', dbr: '╝', dh: '═', dv: '║',
  };

  MV.GLYPH_SETS = {
    structure: '╔╗╚╝═║┌┐└┘─│├┤┬┴┼╭╮╰╯',
    blocks: '░▒▓█▄▀▌▐',
    geom: '◆●◉■▲△★✦⬢',
    marks: '·≡▼◄·∴∵',
  };

  // ------------------------------------------------------------------ digit font
  // 5x7 bitmap digits for the countdown. Bit 1 = lit.
  MV.DIGITS = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  };

  // draw a bitmap digit into the PICTURE layer as block glyphs
  MV.drawDigit = function (ctx, ch, x, y, cell, color, alpha, glyph) {
    const bm = MV.DIGITS[ch];
    if (!bm) return 0;
    const g = glyph || '█';
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = color;
    MV.mono(ctx, cell, 'bold');
    for (let r = 0; r < 7; r++) {
      let run = '';
      let runStart = -1;
      for (let c = 0; c <= 5; c++) {
        const on = c < 5 && bm[r][c] === '1';
        if (on) { if (runStart < 0) runStart = c; run += g; }
        else if (runStart >= 0) { MV.picText(ctx, run, x + runStart * cell, y + r * cell); run = ''; runStart = -1; }
      }
    }
    ctx.restore();
    return 5 * cell;
  };

  // ------------------------------------------------------------------ glyph validation
  // cmd-art.md trap 4: not every glyph in the ramp rasterizes in every font. A
  // blank or tofu glyph appears only in the frames nobody sampled, so prove it
  // once, at init, by rasterizing each candidate and comparing against a
  // guaranteed-missing codepoint.
  MV.validateGlyphs = function (font, chars) {
    const S = 32;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const shot = function (ch) {
      g.clearRect(0, 0, S, S);
      g.font = '28px ' + font;
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#fff';
      g.fillText(ch, 2, 26);
      return g.getImageData(0, 0, S, S).data;
    };
    const tofuRef = shot('\uFFFF');
    const blank = new Uint8ClampedArray(S * S * 4);
    const eq = function (a, b) {
      for (let i = 0; i < a.length; i += 4) if (a[i + 3] !== b[i + 3]) return false;
      return true;
    };
    const blankTofu = eq(tofuRef, blank);
    const ok = [], bad = [];
    for (const ch of chars) {
      if (ch === ' ') { ok.push(ch); continue; }   // space is meant to be blank
      const px = shot(ch);
      if (eq(px, blank)) bad.push([ch, 'blank']);
      else if (!blankTofu && eq(px, tofuRef)) bad.push([ch, 'tofu']);
      else ok.push(ch);
    }
    return { ok: ok.join(''), bad: bad };
  };

  MV.cells = function (font, px) {
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d');
    g.font = px + 'px ' + font;
    const adv = g.measureText('MMMMMMMMMM').width / 10;
    const m = g.measureText('M');
    const asc = m.actualBoundingBoxAscent || px * 0.72;
    const desc = m.actualBoundingBoxDescent || px * 0.20;
    return { adv: adv, h: asc + desc, asc: asc, desc: desc };
  };

  /* Rasterise every glyph the film can draw at every size it draws them, once,
   * before the first frame. Chrome builds its glyph cache lazily, so without
   * this the first frame at each new size costs a second and a half — which
   * lands on whichever shot happens to introduce it. */
  MV.warmFonts = function (chars, sizesMono, sizesCJK) {
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 160;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    let n = 0;
    for (const px of sizesMono) {
      g.font = px + 'px ' + MV.F_MONO;
      for (const ch of chars) { g.fillText(ch, 4, px + 4); n++; }
      g.font = 'bold ' + px + 'px ' + MV.F_MONO;
      for (const ch of chars) { g.fillText(ch, 4, px + 4); n++; }
    }
    const cjk = '\u7684\u4e00\u662f\u4e0d\u4e86\u4eba\u6211\u5728\u6709\u4ed6\u8fd9\u4e2a' +
      '\u4eec\u4e2d\u6765\u4e0a\u5927\u4e3a\u548c\u56fd\u5730\u5230\u4ee5\u8bf4\u65f6' +
      '\u8981\u5c31\u51fa\u4f1a\u53ef\u4e5f\u4f60\u5bf9\u751f\u80fd\u800c\u5b50\u90a3' +
      '\u5f97\u4e8e\u7740\u4e0b\u81ea\u4e4b\u5e74\u8fc7\u53d1\u540e\u4f5c\u91cc\u7528';
    for (const px of sizesCJK) {
      g.font = px + 'px ' + MV.F_CJK;
      for (const ch of cjk) { g.fillText(ch, 4, px + 4); n++; }
      g.font = 'bold ' + px + 'px ' + MV.F_CJK;
      for (const ch of cjk) { g.fillText(ch, 4, px + 4); n++; }
    }
    return n;
  };

})(window.MV = window.MV || {});
