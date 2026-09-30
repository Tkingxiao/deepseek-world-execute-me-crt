/* mv-core.js — shared state + helpers (browser, no modules, no template literals) */
(function () {
  "use strict";
  var D = window.MV_DATA;
  var W = 1920, H = 1080, FPS = 30;
  var BPM = D.meta.bpm, BEAT = D.meta.beat, OFF = D.meta.beatOffset, BAR = BEAT * 4, DUR = D.meta.duration;
  var BEATS = D.beats, LINES = D.lines, SECTIONS = D.sections;
  var EBY = {};
  for (var q = 0; q < D.energy.length; q++) EBY[D.energy[q].k] = D.energy[q];

  /* screen rect (the lit part of the CRT) */
  var SC = { x: 258, y: 48, w: 1276, h: 902 };
  var SW = SC.w, SH = SC.h;

  var C = {
    bg: "#030805", bezel: "#0c0f0d", bezelHi: "#1d2320", bezelLo: "#050706",
    phos: "#39ff88", phosDim: "#1c7a44", phosDeep: "#0d3a22", phosGhost: "rgba(57,255,136,",
    cyan: "#6ef0ff", cyanDim: "#1f6f7d", cyanGhost: "rgba(110,240,255,",
    amber: "#ffb86b", amberDim: "#8a5c2c", red: "#ff4d5e", redDim: "#7a2029",
    white: "#e8fff2", violet: "#b98cff", ink: "#04120a"
  };
  var FONT = 'Consolas,"Cascadia Mono","DejaVu Sans Mono",monospace';
  var FONT_CJK = '"MS Gothic","Yu Gothic",SimHei,"Microsoft YaHei",sans-serif';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash01(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function easeOut(k) { return 1 - Math.pow(1 - clamp(k, 0, 1), 3); }
  function easeIn(k) { return Math.pow(clamp(k, 0, 1), 3); }
  function easeInOut(k) { k = clamp(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function easeOutBack(k) { var c1 = 1.70158, c3 = c1 + 1; k = clamp(k, 0, 1); return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }

  function beatIdx(t) { return (t - OFF) / BEAT; }
  function beatAt(t) { var k = Math.round(beatIdx(t)); return BEATS[clamp(k, 0, BEATS.length - 1)]; }
  function energyAt(t) { var k = Math.round(beatIdx(t)); return EBY[k] || { onset: 0.3, low: 0.5, mid: 0.5, high: 0.5, rms: 0.5 }; }
  function beatPhase(t) { var x = beatIdx(t); return x - Math.floor(x); }
  function barPhase(t) { var x = (t - OFF) / BAR; return x - Math.floor(x); }
  function barIndex(t) { return Math.floor((t - OFF) / BAR); }
  /* decaying per-beat pulse driven by measured onset strength */
  function pulse(t, decayBeats) {
    var x = beatIdx(t), frac = x - Math.floor(x), d = decayBeats || 0.55;
    var e = energyAt(t);
    return Math.exp(-frac / d) * (0.30 + 0.70 * (e.onset || 0.25));
  }
  function pulseAt(t, at, decaySec) { var dt = t - at; if (dt < 0) return 0; return Math.exp(-dt / (decaySec || 0.15)); }
  function isDownbeat(t) { var k = Math.round(beatIdx(t)); return (((k % 4) + 4) % 4) === 0; }
  function quantize(t, div) { var step = BEAT / (div || 1); return Math.round((t - OFF) / step) * step + OFF; }

  function sectionAt(t) { for (var i = 0; i < SECTIONS.length; i++) { var s = SECTIONS[i]; if (t >= s.start && t < s.end) return s; } return SECTIONS[SECTIONS.length - 1]; }
  function sectionProgress(t) { var s = sectionAt(t); return clamp((t - s.start) / (s.end - s.start), 0, 1); }
  function sectionLocal(t) { var s = sectionAt(t); return t - s.start; }
  function inSection(t, id) { return sectionAt(t).id === id; }
  function sectionById(id) { for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i]; return null; }

  function activeLine(t) {
    var lo = 0, hi = LINES.length - 1, res = -1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (LINES[m].tOn <= t) { res = m; lo = m + 1; } else hi = m - 1; }
    return res;
  }
  function lineSpan(i) { var L = LINES[i]; var nx = i + 1 < LINES.length ? LINES[i + 1].tOn : L.end; return Math.max(0.30, nx - L.tOn); }
  function typedCount(i, t) {
    var L = LINES[i], dur = lineSpan(i);
    var cps = Math.min(32, Math.max(10, (L.text.length / dur) * 0.70));
    return clamp(Math.floor((t - L.tOn) * cps), 0, L.text.length);
  }
  function lastLineTime(text) { for (var i = LINES.length - 1; i >= 0; i--) if (LINES[i].text === text) return LINES[i].t; return -1; }

  /* --- the ink layer: text drawn after all CRT blur/glitch passes --- */
  var _ink = null, _inkCtx = null, INK_MODE = true;
  function inkCtx() {
    if (!_ink) {
      _ink = document.createElement("canvas");
      _ink.width = W; _ink.height = H;
      _inkCtx = _ink.getContext("2d");
    }
    return _inkCtx;
  }
  /* Redirect every fillText on the picture context into the ink layer, so text
     stays crisp even when written with a bare ctx.fillText call. */
  function hookFillText(ctx) {
    if (ctx.__mvHooked) return;
    var orig = ctx.fillText.bind(ctx);
    ctx.fillText = function (text, x, y, mw) {
      if (!INK_MODE || !_inkCtx) return orig(text, x, y, mw);
      var g = _inkCtx;
      g.save();
      g.font = ctx.font;
      g.textAlign = ctx.textAlign;
      g.textBaseline = ctx.textBaseline;
      g.globalAlpha = ctx.globalAlpha;
      g.fillStyle = (typeof ctx.fillStyle === "string") ? ctx.fillStyle : "#ffffff";
      g.shadowColor = ctx.shadowColor;
      g.shadowBlur = ctx.shadowBlur;
      g.fillText(text, x, y, mw);
      g.restore();
      return undefined;
    };
    ctx.__mvHooked = true;
  }

  function inkBegin(ctx) {
    var c = inkCtx();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over"; c.filter = "none";
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.clearRect(0, 0, W, H);
    if (ctx) hookFillText(ctx);
    return c;
  }
  function inkCanvas() { inkCtx(); return _ink; }
  function inkEnd() { INK_MODE = false; }

  function mono(ctx, px, weight) {
    var f = (weight ? weight + " " : "") + px + "px " + FONT;
    ctx.font = f;
    if (_inkCtx) _inkCtx.font = f;
  }
  function monoCJK(ctx, px) {
    var f = px + "px " + FONT_CJK;
    ctx.font = f;
    if (_inkCtx) _inkCtx.font = f;
  }
  /* text is routed into the crisp ink layer unless INK_MODE is off */
  function glowText(ctx, text, x, y, color, blur, alpha) {
    var onInk = (INK_MODE && _inkCtx);
    var g = onInk ? _inkCtx : ctx;
    var a = (alpha === undefined ? 1 : alpha);
    if (onInk) { g.textAlign = ctx.textAlign; g.textBaseline = ctx.textBaseline; }
    g.save();
    g.shadowColor = color;
    g.shadowBlur = blur || 0;
    g.globalAlpha = a;
    g.fillStyle = color;
    g.fillText(text, x, y); g.fillText(text, x, y);
    g.restore();
  }
  function glowStroke(ctx, color, blur, width, fn) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width || 2;
    ctx.shadowColor = color; ctx.shadowBlur = blur || 12;
    ctx.beginPath(); fn(ctx); ctx.stroke(); ctx.stroke(); ctx.restore();
  }
  function glowFill(ctx, color, blur, fn) {
    ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = blur || 12;
    ctx.beginPath(); fn(ctx); ctx.fill(); ctx.fill(); ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function dashedLine(ctx, x1, y1, x2, y2, dash, gap) {
    ctx.save(); ctx.setLineDash([dash || 14, gap || 11]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }

  window.MV = {
    W: W, H: H, FPS: FPS, BPM: BPM, BEAT: BEAT, OFF: OFF, BAR: BAR, DUR: DUR,
    BEATS: BEATS, LINES: LINES, SECTIONS: SECTIONS, C: C, FONT: FONT, FONT_CJK: FONT_CJK,
    SC: SC, SW: SW, SH: SH,
    mulberry32: mulberry32, hash01: hash01, clamp: clamp, lerp: lerp, smooth: smooth,
    easeOut: easeOut, easeIn: easeIn, easeInOut: easeInOut, easeOutBack: easeOutBack,
    beatIdx: beatIdx, beatAt: beatAt, energyAt: energyAt, beatPhase: beatPhase, barPhase: barPhase,
    barIndex: barIndex, pulse: pulse, pulseAt: pulseAt, isDownbeat: isDownbeat, quantize: quantize,
    sectionAt: sectionAt, sectionProgress: sectionProgress, sectionLocal: sectionLocal,
    inSection: inSection, sectionById: sectionById,
    activeLine: activeLine, lineSpan: lineSpan, typedCount: typedCount, lastLineTime: lastLineTime,
    mono: mono, monoCJK: monoCJK, glowText: glowText, glowStroke: glowStroke, glowFill: glowFill,
    inkCtx: inkCtx, inkBegin: inkBegin, inkCanvas: inkCanvas, inkEnd: inkEnd,
    setInkMode: function (v) { INK_MODE = !!v; }, getInkMode: function () { return INK_MODE; },
    roundRect: roundRect, dashedLine: dashedLine
  };
})();
