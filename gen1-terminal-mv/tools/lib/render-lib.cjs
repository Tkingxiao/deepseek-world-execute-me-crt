
"use strict";
const fs = require("fs");
const path = require("path");

/* tools/lib/render-lib.cjs -> tools/lib -> tools -> <project root> */
const ROOT = path.resolve(__dirname, "..", "..");
const W = 1920, H = 1080, FPS = 30;

const T = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "timeline.json"), "utf8"));
const E = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "beat-energy.json"), "utf8"));

const BPM = T.meta.bpm, BEAT = T.meta.beat, OFF = T.meta.beatOffset, BAR = BEAT * 4, DUR = T.meta.duration;
const BEATS = T.beats, LINES = T.lines, SECTIONS = T.sections;
const EBY = new Map(E.beats.map((b) => [b.k, b]));

// ---------- palette ----------
const C = {
  bg: "#030805",
  bezel: "#0d0f0e",
  bezelHi: "#1b201d",
  phos: "#39ff88",
  phosDim: "#1c7a44",
  phosDeep: "#0d3a22",
  cyan: "#6ef0ff",
  cyanDim: "#1f6f7d",
  amber: "#ffb86b",
  red: "#ff4d5e",
  white: "#e8fff2",
  violet: "#b98cff",
  glowGreen: "rgba(57,255,136,",
  glowCyan: "rgba(110,240,255,",
  glowAmber: "rgba(255,184,107,",
};
const FONT = 'Consolas,"Cascadia Mono","DejaVu Sans Mono",monospace';
const FONT_CJK = '"MS Gothic","Yu Gothic",SimHei,"Microsoft YaHei",sans-serif';

// ---------- deterministic rng ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash01(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); }
function rngRange(r, a, b) { return a + r() * (b - a); }

// ---------- math ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const easeIn = (k) => Math.pow(clamp(k, 0, 1), 3);
const easeInOut = (k) => { k = clamp(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; k = clamp(k, 0, 1); return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const easeOutElastic = (k) => { const c4 = (2 * Math.PI) / 3; k = clamp(k, 0, 1); return k === 0 ? 0 : k === 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * c4) + 1; };

// ---------- beat ----------
function beatIdx(t) { return (t - OFF) / BEAT; }
function beatAt(t) { const k = Math.round(beatIdx(t)); return BEATS[Math.max(0, Math.min(BEATS.length - 1, k))]; }
function energyAt(t) { const k = Math.round(beatIdx(t)); const e = EBY.get(k); return e || { onset: 0, low: 0.5, mid: 0.5, high: 0.5, rms: 0.5 }; }
// phase inside the current beat, 0..1
function beatPhase(t) { const x = beatIdx(t); return x - Math.floor(x); }
function barPhase(t) { const x = (t - OFF) / BAR; return x - Math.floor(x); }
// decaying pulse fired on each beat; decay in beats
function pulse(t, decayBeats, scale) {
  const x = beatIdx(t); const frac = x - Math.floor(x);
  const d = decayBeats || 0.55;
  const v = Math.exp(-frac / d);
  const e = energyAt(t);
  const amp = scale === undefined ? 1 : scale;
  return v * (0.35 + 0.65 * (e.onset || 0.3)) * amp;
}
function pulseAt(t, atTime, decaySec) {
  const dt = t - atTime; if (dt < 0) return 0;
  return Math.exp(-dt / (decaySec || 0.15));
}
function isDownbeat(t) { const k = Math.round(beatIdx(t)); return ((k % 4) + 4) % 4 === 0 && Math.abs(t - (OFF + k * BEAT)) < BEAT * 0.5; }
function beatTimesBetween(a, b) { const out = []; for (const bt of BEATS) if (bt.t >= a && bt.t <= b) out.push(bt); return out; }
function quantize(t, div) { const step = BEAT / (div || 1); return Math.round((t - OFF) / step) * step + OFF; }

// ---------- sections ----------
function sectionAt(t) { for (const s of SECTIONS) if (t >= s.start && t < s.end) return s; return SECTIONS[SECTIONS.length - 1]; }
function sectionProgress(t) { const s = sectionAt(t); return clamp((t - s.start) / (s.end - s.start), 0, 1); }
function inSection(t, id) { const s = sectionAt(t); return s.id === id; }

// ---------- lyrics ----------
// index of the line that is currently being sung (last line whose tOn <= t)
function activeLine(t) {
  let lo = 0, hi = LINES.length - 1, res = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (LINES[m].tOn <= t) { res = m; lo = m + 1; } else hi = m - 1; }
  return res;
}
function lineVisibleDuration(i) {
  const L = LINES[i];
  const next = i + 1 < LINES.length ? LINES[i + 1].tOn : L.end;
  return Math.max(0.25, next - L.tOn);
}
// how many characters of line i are revealed at time t
function typedCount(i, t) {
  const L = LINES[i];
  const dur = lineVisibleDuration(i);
  const cps = Math.min(30, Math.max(9, (L.text.length / dur) * 0.72));
  return clamp(Math.floor((t - L.tOn) * cps), 0, L.text.length);
}

// ---------- text ----------
function mono(ctx, px, weight) { ctx.font = (weight ? weight + " " : "") + px + "px " + FONT; }
function monoCJK(ctx, px) { ctx.font = px + "px " + FONT_CJK; }
function glowText(ctx, text, x, y, color, blur, alpha) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = blur;
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}
function glowStroke(ctx, color, blur, width, fn) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width || 2;
  ctx.shadowColor = color; ctx.shadowBlur = blur || 14;
  ctx.beginPath(); fn(ctx); ctx.stroke();
  ctx.stroke(); ctx.restore();
}
function glowFill(ctx, color, blur, fn) {
  ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = blur || 14;
  ctx.beginPath(); fn(ctx); ctx.fill(); ctx.fill(); ctx.restore();
}

// ---------- drawing primitives ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// dashed asymptote line
function dashedLine(ctx, x1, y1, x2, y2, dash, gap) {
  ctx.save(); ctx.setLineDash([dash || 14, gap || 12]); ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}

// ---------- CRT post fx (operate on the main canvas) ----------
function makeNoiseCanvas(seed, w, h) {
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : null;
  return cv;
}
// static/grain drawn with deterministic per-frame values
function drawGrain(ctx, t, amount, w, h) {
  const n = Math.floor(1400 * amount);
  ctx.save();
  const r = mulberry32(Math.floor(t * 60) * 7919 + 13);
  ctx.globalAlpha = 0.06 * amount;
  ctx.fillStyle = "#bfffd8";
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}
function drawScanlines(ctx, w, h, alpha, offset) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 0.16 : alpha;
  ctx.fillStyle = "#000000";
  const off = offset || 0;
  for (let y = off; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}
function drawRGBMask(ctx, w, h, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 0.10 : alpha;
  const cell = 3;
  for (let x = 0; x < w; x += cell) {
    ctx.fillStyle = "#ff0000"; ctx.fillRect(x, 0, 1, h);
    ctx.fillStyle = "#00ff00"; ctx.fillRect(x + 1, 0, 1, h);
    ctx.fillStyle = "#0000ff"; ctx.fillRect(x + 2, 0, 1, h);
  }
  ctx.restore();
}
function vignette(ctx, w, h, strength) {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.95);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.65, "rgba(0,0,0," + 0.28 * strength + ")");
  g.addColorStop(1, "rgba(0,0,0," + 0.82 * strength + ")");
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
}
// glow bloom around bright areas
function bloom(ctx, w, h, blur, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  ctx.filter = "blur(" + blur + "px)";
  ctx.drawImage(ctx.canvas, 0, 0, w, h);
  ctx.restore();
}

module.exports = {
  ROOT, W, H, FPS, T, E, BPM, BEAT, OFF, BAR, DUR, BEATS, LINES, SECTIONS, EBY, C, FONT, FONT_CJK,
  mulberry32, hash01, rngRange, clamp, lerp, smooth, easeOut, easeIn, easeInOut, easeOutBack, easeOutElastic,
  beatIdx, beatAt, energyAt, beatPhase, barPhase, pulse, pulseAt, isDownbeat, beatTimesBetween, quantize,
  sectionAt, sectionProgress, inSection, activeLine, lineVisibleDuration, typedCount,
  mono, monoCJK, glowText, glowStroke, glowFill, roundRect, dashedLine,
  drawGrain, drawScanlines, drawRGBMask, vignette, bloom,
};
