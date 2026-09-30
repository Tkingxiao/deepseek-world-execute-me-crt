/* scenes.js — the fifteen acts, plus the drawing primitives they share.
 *
 * Everything here draws on the PICTURE layer: it is inside the tube, it gets the
 * bloom, the beat pump, the tears and the scanlines. Text drawn here is routed
 * to the ink layer by the intercepted fillText, so the words stay readable while
 * the picture around them falls apart. Character art opts out explicitly.
 *
 * All cues come from the LRC's measured times, never from an even subdivision.
 */
(function (MV) {
  'use strict';

  const C = MV.C, UI = MV.UI, Z = UI.Z, SC = MV.SC, ART = MV.ART;
  const W = 1920, H = 1080;
  const STAGE = Z.STAGE, PANEL = Z.READ;
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ cues
  // Built once, after MV.init has loaded the timeline. Scenes.js is evaluated
  // before main.js calls init, so this cannot run at module scope.
  const CUE_LIST = [];

  let EXEC_ALL = [], EXEC12 = [];

  MV.buildCues = function () {
    for (let i = 0; i < MV.lines.length; i++) {
      if (!MV.lines[i].text) continue;
      CUE_LIST.push(MV.lines[i]);
    }
    EXEC_ALL = MV.exact('EXECUTION');
    MV.EXEC_ALL = EXEC_ALL;
    EXEC12 = EXEC_ALL.filter(function (x) { return x >= 147.6 && x < 158.5; });
    MV.EXEC12 = EXEC12;
  };

  /* Cues are looked up by the opening words of the line. Two traps live here.
   * The chorus sings the same words twice, so an optional second argument takes
   * the earliest occurrence at or after that time; without it P11's cage closed
   * at 69.8 s, in the middle of act 4.
   *
   * A key that matches nothing throws. The earlier version returned 0, which
   * quietly placed the act at the top of the film — and did exactly that for the
   * six keys in this file that are longer than the 24-character index it used. */
  MV.cue = function (key, from) {
    const t0 = from || 0;
    for (let i = 0; i < CUE_LIST.length; i++) {
      const L = CUE_LIST[i];
      if (L.tOn >= t0 && L.text.indexOf(key) === 0) return L.tOn;
    }
    throw new Error('MV.cue: no lyric begins with ' + JSON.stringify(key) +
      (t0 ? ' at or after ' + t0 + 's' : ''));
  };
  MV.since = function (t, key) { return t - MV.cue(key); };
  MV.exact = function (text) {
    const out = [];
    for (let i = 0; i < CUE_LIST.length; i++) if (CUE_LIST[i].text === text) out.push(CUE_LIST[i].tOn);
    return out;
  };


  // ------------------------------------------------------------------ raster
  /* Draw a scalar field as characters. fn(u, v) -> 0..1, u and v across the
   * rect. Identical neighbouring glyphs are batched into one fillText, which is
   * what keeps a 3000-cell soup affordable. */
  MV.raster = function (g, rect, cell, fn, o) {
    o = o || {};
    const cw = cell.w, chh = cell.h;
    const cols = Math.max(1, Math.floor(rect.w / cw));
    const rows = Math.max(1, Math.floor(rect.h / chh));
    const x0 = rect.x + (rect.w - cols * cw) / 2;
    const y0 = rect.y + (rect.h - rows * chh) / 2;
    const ramp = o.ramp || MV.RAMP_DENSE;
    const thr = o.threshold === undefined ? 0.08 : o.threshold;
    const a0 = o.alpha === undefined ? 1 : o.alpha;
    if (a0 <= 0.004) return 0;
    const jit = o.jitter === undefined ? 0 : o.jitter;
    const seed = o.seed || 13;
    const budget = o.budget || 4200;
    MV.mono(g, Math.round((o.px || chh * 0.95)), o.weight);
    const prev = MV.INK.route;
    const prevTex = MV.INK.texture;
    MV.INK.route = o.ink === true;
    // texture, not words: a full-frame raster is allowed to cross a chrome band,
    // where a label is not. The gate reads this flag back and reports the draws
    // it excused, so the exception stays visible.
    MV.INK.texture = o.ink === true;
    // a raster that has to survive the tube going dark is drawn through the same
    // hook the words use, so it lands on the ink layer instead of the picture
    const put = o.ink === true
      ? function (s, x, y) { g.fillText(s, x, y); }
      : function (s, x, y) { MV.picText(g, s, x, y); };
    g.save();
    g.globalAlpha = a0;
    g.fillStyle = o.color || C.phos;
    if (o.glow) { g.shadowColor = o.color || C.phos; g.shadowBlur = o.glow; }
    let ink = 0;
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * chh;
      let run = '', runStart = -1;
      for (let c = 0; c <= cols; c++) {
        let ch = '';
        if (c < cols && ink < budget) {
          const v = fn((c + 0.5) / cols, (r + 0.5) / rows, c, r);
          if (v > thr) {
            let idx = Math.floor(v * (ramp.length - 1) +
              (jit ? (MV.hash2(c, r, seed + o.hs) - 0.5) * jit * 7 : 0));
            idx = MV.clamp(idx, 0, ramp.length - 1);
            ch = ramp[idx];
            if (ch === ' ') ch = '';
          }
        }
        const last = run ? run.charAt(run.length - 1) : '';
        if (ch !== last || ch === '') {
          if (run) { put(run, x0 + runStart * cw, y); ink += run.length; run = ''; }
          run = ch; runStart = c;
        } else run += ch;
      }
    }
    g.restore();
    MV.INK.route = prev;
    MV.INK.texture = prevTex;
    return ink;
  };

  /* ----------------------------------------------------------------- ground
   * The loss landscape is an asset of the film rather than of one act: P13 pulls
   * the camera out of it and P14 keeps its afterimage on the dead glass, so the
   * same ground is built once and both acts stand on it. Basin 0 is the valley
   * the whole film has been sliding into — the widest, the only one whose floor
   * sits at zero, and therefore the one that drains half the frame. */
  function terrainB() {
    if (MV.__tb) return MV.__tb;
    const ALL = [[0, 0, 620, 380, 0, 0.7]];
    for (let j = 0; j < 35; j++) {
      if (j === 17) continue;                 // the valley owns this cell
      const gx = j % 7, gy = (j / 7) | 0;
      const h1 = MV.hash2(j, 3, 11), h2 = MV.hash2(j, 7, 11);
      const h3 = MV.hash2(j, 13, 11), h4 = MV.hash2(j, 29, 11);
      const h5 = MV.hash2(j, 41, 11);
      ALL.push([
        (gx - 3) * 620 + (h1 - 0.5) * 170,
        (gy - 2) * 300 + (h2 - 0.5) * 120,
        280 + h3 * 150, 190 + h4 * 130,
        0.30 + h5 * 1.10, h4 * 5.3,
      ]);
    }
    /* A candidate that cannot hold its own floor is not a basin, it is a wrinkle
     * on somebody else's flank — and the film is not allowed to count those.
     * Taking one candidate off the map can only raise the ground under the
     * others, so a single pass settles it. */
    MV.__tb = ALL;
    const B = ALL.slice();
    for (let j = 1; j < ALL.length; j++) {
      const b = ALL[j], d = b[4];
      b[4] = 1e6;
      const elsewhere = MV.ground(960 + b[0], 536 + b[1]);
      b[4] = d;
      if (elsewhere <= d + 0.02) B.splice(B.indexOf(b), 1);
    }
    MV.__tb = B;
    return B;
  }
  MV.basins = terrainB;
  MV.GW = { j: 0, q: 0, dx: 0, dy: 0, rx: 1, ry: 1, gap: 0 };
  /* Height of the ground at a world point: the minimum over every basin of an
   * anisotropic cone. min() hands you the ridgelines for free, and it is the
   * ridges that make this read as ground rather than as a heap of blobs.
   * Leaves the winning basin in MV.GW so a caller can ask how deep it is. */
  MV.ground = function (wx, wy) {
    const B = terrainB(), G = MV.GW;
    let m = 1e9, m2 = 1e9, jw = 0, qw = 0;
    for (let j = 0; j < B.length; j++) {
      const b = B[j];
      const dx = wx - 960 - b[0], dy = wy - 536 - b[1];
      const q = Math.hypot(dx / b[2], dy / b[3]) *
        (1 + 0.10 * Math.sin(dx * 0.0102 + b[5]) * Math.cos(dy * 0.0129 - b[5]));
      const f = q * q + b[4];
      if (f < m) { m2 = m; m = f; jw = j; qw = q; }
      else if (f < m2) m2 = f;
    }
    const w = B[jw];
    G.j = jw; G.q = qw;
    G.dx = wx - 960 - w[0]; G.dy = wy - 536 - w[1];
    G.rx = w[2]; G.ry = w[3];
    // how far the runner-up basin is: zero on a divide, and the divide network
    // is the map's real structure, so the raster wants to know about it
    G.gap = m2 - m;
    return m;
  };
  /* The contour map of that ground. A band is a fixed number of SCREEN pixels
   * wide wherever it falls, which is the one thing a plain cos(sqrt(F)) cannot
   * give you: a height becomes a distance only after you divide by the slope. */
  MV.groundMap = function (g, rect, cell, cam, o) {
    o = o || {};
    const K = o.k || 8.0, BAND = o.band || 6.0;
    return MV.raster(g, rect, cell, function (u, v) {
      const wx = cam.x + (rect.x + u * rect.w - 960) * cam.z;
      const wy = cam.y + (rect.y + v * rect.h - 536) * cam.z;
      const f = MV.ground(wx, wy);
      const ph = Math.sqrt(f) * K;
      const near = Math.abs(ph - Math.round(ph));
      const G = MV.GW;
      let slope = 0;
      if (f > 0.0004 && G.q > 0.004) {
        const gq = Math.hypot(G.dx / (G.rx * G.rx), G.dy / (G.ry * G.ry)) / G.q;
        slope = K * gq * G.q / Math.sqrt(f) * cam.z;
      }
      // the bands carry the height; the divides carry the structure, so they
      // are drawn from the top of the same ramp — bold lines over fine ones
      let out = 0;
      if (slope >= 0.004) {
        const dp = near / slope;
        if (dp < BAND) out = (1 - dp / BAND) * 0.62;
      }
      if (o.ridge) {
        const rl = 1 - G.gap / 0.075;
        if (rl > 0) out = Math.max(out, 0.76 + 0.24 * rl);
      }
      return out;
    }, {
      ramp: o.ramp || MV.RAMP_DENSE, color: o.color || C.phosDim,
      alpha: o.alpha, threshold: o.threshold === undefined ? 0.05 : o.threshold,
      px: o.px || Math.round(cell.h * 0.9), glow: o.glow || 0, seed: o.seed || 5,
      budget: o.budget || 5200, ink: o.ink === true,
    });
  };

  /* Rasterise a metaball silhouette. Same contract as MV.field but with a
   * height clamp for the glyph, so a shape can be drawn into any box. */
  MV.creature = function (g, rect, cell, prims, o) {
    o = o || {};
    // the field is sampled over a square region however wide the box is, or a
    // tall creature drawn into a wide zone comes out squashed
    const asp = o.aspect === undefined ? rect.w / rect.h : o.aspect;
    return MV.raster(g, rect, cell, function (u, v) {
      return MV.blobField(prims, (u * 2 - 1) * asp, v * 2 - 1);
    }, {
      ramp: o.ramp || ' .:;+=xX$&#%@', threshold: o.threshold === undefined ? 0.55 : o.threshold,
      color: o.color, alpha: o.alpha, glow: o.glow, seed: o.seed,
      jitter: o.jitter === undefined ? 0.25 : o.jitter, px: Math.round(cell.h * 0.94),
      weight: 'bold',
    });
  };

  // ------------------------------------------------------------------ curves
  MV.plot = function (g, r, fn, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const n = o.samples || 220;
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = o.color || C.cyan;
    g.lineWidth = o.width || 1.6;
    if (o.glow) { g.shadowColor = o.color || C.cyan; g.shadowBlur = o.glow; }
    if (o.dash) g.setLineDash(o.dash);
    g.beginPath();
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const v = fn(u);
      if (v === null || v === undefined || !isFinite(v)) { pen = false; continue; }
      const x = r.x + u * r.w;
      const y = r.y + r.h * (1 - v);
      if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
    }
    g.stroke();
    g.restore();
  };

  MV.area = function (g, r, fn, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const n = o.samples || 220;
    const base = o.base === undefined ? 0 : o.base;
    g.save();
    g.globalAlpha = a;
    g.fillStyle = o.color || C.cyan;
    if (o.glow) { g.shadowColor = o.color || C.cyan; g.shadowBlur = o.glow; }
    g.beginPath();
    g.moveTo(r.x, r.y + r.h * (1 - base));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      let v = fn(u);
      if (!isFinite(v)) v = base;
      g.lineTo(r.x + u * r.w, r.y + r.h * (1 - v));
    }
    g.lineTo(r.x + r.w, r.y + r.h * (1 - base));
    g.closePath();
    g.fill();
    g.restore();
  };

  MV.axes = function (g, r, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const y0 = r.y + r.h * (o.y0 === undefined ? 0.5 : o.y0);
    const x0 = r.x + r.w * (o.x0 === undefined ? 0.06 : o.x0);
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = o.color || C.cyanDim;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(r.x, y0 + 0.5); g.lineTo(r.x + r.w, y0 + 0.5);
    g.moveTo(x0 + 0.5, r.y); g.lineTo(x0 + 0.5, r.y + r.h);
    g.stroke();
    // ticks
    const tick = o.ticks || 16;
    for (let i = 0; i <= tick; i++) {
      const x = r.x + (i / tick) * r.w;
      const big = i % 4 === 0;
      g.beginPath();
      g.moveTo(x + 0.5, y0);
      g.lineTo(x + 0.5, y0 + (big ? 7 : 4));
      g.stroke();
    }
    if (o.labels) {
      MV.mono(g, 12);
      g.globalAlpha = a * 0.8;
      g.fillStyle = o.color || C.cyanDim;
      for (let i = 0; i <= tick; i += 4) {
        g.fillText(o.labels(i / tick), r.x + (i / tick) * r.w - 8, y0 + 22);
      }
    }
    g.restore();
  };

  // ------------------------------------------------------------------ data widgets
  /* 32 columns of the real spectrum. Peak caps are computed from the past half
   * second rather than stored, so this stays a pure function of t. */
  MV.spectrum = function (g, r, t, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const N = o.bands || 32;
    const bw = r.w / N;
    g.save();
    g.globalAlpha = a;
    for (let b = 0; b < N; b++) {
      const v = MV.spec(t, b);
      let pk = v;
      for (let k = 1; k <= 8; k++) pk = Math.max(pk, MV.spec(t - k * 0.0625, b));
      const h = MV.clamp(v * v * 1.6, 0, 1) * r.h;
      const hh = MV.clamp(pk * pk * 1.6, 0, 1) * r.h;
      const x = r.x + b * bw;
      const f = b / N;
      g.globalAlpha = a * 0.85;
      g.fillStyle = o.color || (f < 0.45 ? C.phos : (f < 0.8 ? C.cyan : C.violet));
      g.fillRect(x + 1, r.y + r.h - h, bw - 2, h);
      g.globalAlpha = a * 0.9;
      g.fillStyle = C.white;
      g.fillRect(x + 1, r.y + r.h - hh - 2, bw - 2, 1.5);
    }
    g.globalAlpha = a * 0.5;
    g.strokeStyle = C.cyanDim;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(r.x, r.y + r.h + 0.5); g.lineTo(r.x + r.w, r.y + r.h + 0.5);
    g.stroke();
    g.restore();
  };

  /* Perspective floor. Fixed line counts: the rows scroll by advancing a phase,
   * not by adding rows, so the ink can never grow without bound. */
  MV.gridFloor = function (g, r, t, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const hz = r.y + r.h * (o.horizon === undefined ? 0.34 : o.horizon);
    const vpx = r.x + r.w / 2;
    const spread = o.spread === undefined ? 1.7 : o.spread;
    const rows = o.rows || 15;
    const cols = o.cols || 13;
    const speed = o.speed === undefined ? 0.55 : o.speed;
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = o.color || C.cyanDim;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i <= rows; i++) {
      const z = i + (t * speed) % 1;
      const y = hz + (r.y + r.h - hz) * (0.35 / z + 0.02);
      if (y > r.y + r.h) continue;
      g.moveTo(r.x, y + 0.5); g.lineTo(r.x + r.w, y + 0.5);
    }
    for (let i = -cols; i <= cols; i++) {
      const u = i / cols;
      g.moveTo(vpx + u * spread * r.w * 0.5, r.y + r.h);
      g.lineTo(vpx, hz + 0.5);
    }
    g.stroke();
    g.globalAlpha = a * 1.6;
    g.strokeStyle = o.color || C.cyan;
    g.beginPath();
    g.moveTo(r.x, hz + 0.5); g.lineTo(r.x + r.w, hz + 0.5);
    g.stroke();
    g.restore();
  };

  // a 3-row character person, the thing that sits on its own tangent
  MV.mini = function (g, x, y, h, color, alpha, lean, glow) {
    if (alpha <= 0.004) return;
    const px = Math.round(h);
    const adv = px * 0.60;
    MV.mono(g, px, 'bold');
    const rows = [' o ', lean > 0 ? '/|\\' : '/|\\', lean > 0 ? '/ \\' : ' \\/'];
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
    for (let i = 0; i < 3; i++) {
      const sh = (i === 2 ? lean * 1.5 : (i === 1 ? lean * 0.7 : 0));
      MV.picText(g, rows[i], x - adv * 1.5 + sh * adv, y + i * px * 1.05);
    }
    g.restore();
  };

  // ------------------------------------------------------------------ shared
  function rsz(r, k, dy) {
    const w = r.w * k, h = r.h * k;
    return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2 + (dy || 0), w: w, h: h };
  }
  function cx(r) { return r.x + r.w / 2; }
  function cy(r) { return r.y + r.h / 2; }

  /* Colours travel as hex strings, so the few acts that need to drain one into
   * another (colour leaving the picture when the vision goes) mix them here. */
  function mixHex(a, b, k) {
    if (k <= 0) return a;
    if (k >= 1) return b;
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(MV.lerp((pa >> 16) & 255, (pb >> 16) & 255, k));
    const g2 = Math.round(MV.lerp((pa >> 8) & 255, (pb >> 8) & 255, k));
    const b2 = Math.round(MV.lerp(pa & 255, pb & 255, k));
    return '#' + ((1 << 24) | (r << 16) | (g2 << 8) | b2).toString(16).slice(1);
  }

  function word(g, s, x, y, px, color, alpha, o) {
    o = o || {};
    MV.mono(g, px, o.weight === undefined ? 'bold' : o.weight);
    const w = g.measureText(s).width;
    UI.text(g, s, o.center ? x - w / 2 : x, y, color, alpha,
      { glow: o.glow, align: o.center ? 'left' : undefined });
    return w;
  }

  function banner(g, s, r, t, color, alpha, glow) {
    // a boxed warning strip: the words are text, the box is part of the frame
    MV.mono(g, 30, 'bold');
    const w = g.measureText(s).width;
    const x = cx(r) - w / 2 - 26;
    const y = cy(r) - 26;
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.strokeRect(x + 0.5, y + 0.5, w + 52, 52);
    g.restore();
    MV.mono(g, 13);
    const bw = g.measureText('W').width;
    UI.text(g, '\u250c' + '\u2500'.repeat(Math.floor(w / bw) + 4) + '\u2510', x, y + 2,
      color, alpha * 0.6);
    UI.text(g, '\u2514' + '\u2500'.repeat(Math.floor(w / bw) + 4) + '\u2518', x, y + 52,
      color, alpha * 0.6);
    UI.text(g, s, cx(r) - w / 2, y + 37, color, alpha, { glow: glow });
  }

  // ================================================================== P00 BOOT
  function P00(g, t, s, u, l) {
    const WH = C.white, PH = C.phos, CY = C.cyan, AM = C.amber;
    const tLine = 0.185, tProt = 2.954, tLay = 3.877;
    const tObj = 6.380, tFill = 7.446, tInit = 10.091;
    const tWorld = 11.095, tSim = 13.891;

    /* ---------------------------------------------------------------- the body
     * The machine's self-image is a humanoid, and it is built on camera out of
     * primitives, because that is the whole argument of the song: the body is a
     * construct and nothing inside it is. Five groups -- head with its two eyes,
     * torso, the two upper arms, the two forearms, the two legs -- each with its
     * own rect, so a group can travel while the shape inside it stays itself.
     * It is a kit on the floor for "lay down your pieces" and a body again for
     * "object creation", and every later act gets to take it apart. */
    const HUM = MV.form('humanoid');
    const GROUPS = [[0, 8, 9], [1], [2, 3], [4, 5], [6, 7]];
    const NAMES = ['head', 'torso', 'arms', 'forearms', 'legs'];
    // the body is filled with a ramp whose densest glyph is solid: '@' and '%'
    // have holes in them and turned every mass into a ring
    const BR = ' .:-=+*xX#M';

    // a primitive's real footprint: rx/ry rotated into an axis-aligned box
    const boxOf = function (idx) {
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (let k = 0; k < idx.length; k++) {
        const p = HUM[idx[k]];
        const ca = Math.abs(Math.cos(p.rot)), sa = Math.abs(Math.sin(p.rot));
        const hx = Math.sqrt(p.rx * p.rx * ca * ca + p.ry * p.ry * sa * sa);
        const hy = Math.sqrt(p.rx * p.rx * sa * sa + p.ry * p.ry * ca * ca);
        x0 = Math.min(x0, p.x - hx); x1 = Math.max(x1, p.x + hx);
        y0 = Math.min(y0, p.y - hy); y1 = Math.max(y1, p.y + hy);
      }
      return { x0: x0, x1: x1, y0: y0, y1: y1, w: x1 - x0, h: y1 - y0 };
    };
    const FULL = boxOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const BH = 852;                                  // body height on screen
    const BS = BH / FULL.h;                          // normalised unit -> px
    const BODY = { x: 960 - FULL.w * BS * 0.5, y: 26, w: FULL.w * BS, h: BH };
    const toPx = function (b) {
      return { x: BODY.x + (b.x0 - FULL.x0) * BS, y: BODY.y + (b.y0 - FULL.y0) * BS,
        w: b.w * BS, h: b.h * BS };
    };
    const GBOX = GROUPS.map(boxOf);
    const PLACE = GBOX.map(toPx);

    /* The kit: the same body opened along the line from its own centre to each
     * piece, because that is what "lay down your pieces" is for a machine that
     * is assembled out of eight of them. An exploded fan still reads as a body
     * -- the viewer can see which part came from where, and the empty socket is
     * drawn behind it -- while a row of parts on the floor is a row of ellipses,
     * which is what "abstract" meant here. A piece is only ever translated and
     * scaled by one shared factor: a part that changes aspect stops being a part
     * of this body, and that was the other half of the complaint. */
    const PIECES = [
      { p: [0, 8, 9], name: 'head', push: 0.46 },
      { p: [1], name: 'torso', push: 0.00 },
      { p: [2], name: 'upper arm', push: 0.62 },
      { p: [3], name: 'upper arm', push: 0.62 },
      { p: [4], name: 'forearm', push: 0.80 },
      { p: [5], name: 'forearm', push: 0.80 },
      { p: [6], name: 'leg', push: 0.34 },
      { p: [7], name: 'leg', push: 0.34 },
    ];
    const PBOX = PIECES.map(function (q) { return boxOf(q.p); });
    const PHOME = PBOX.map(toPx);
    const BCX = (FULL.x0 + FULL.x1) * 0.5, BCY = (FULL.y0 + FULL.y1) * 0.5;
    const KIT = { x: 150, y: 136, w: 1620, h: 720 };     // where the kit may hang
    const EX = PIECES.map(function (q, i) {
      const b = PBOX[i];
      const cx = (b.x0 + b.x1) * 0.5, cy = (b.y0 + b.y1) * 0.5;
      if (q.push <= 0) return { cx: cx, cy: cy, b: b };
      const dx = cx - BCX, dy = cy - BCY;
      const n = Math.sqrt(dx * dx + dy * dy) || 1;
      return { cx: cx + dx / n * q.push, cy: cy + dy / n * q.push, b: b };
    });
    let ex0 = 9, ex1 = -9, ey0 = 9, ey1 = -9;
    for (let i = 0; i < EX.length; i++) {
      const e = EX[i];
      ex0 = Math.min(ex0, e.cx - e.b.w * 0.5); ex1 = Math.max(ex1, e.cx + e.b.w * 0.5);
      ey0 = Math.min(ey0, e.cy - e.b.h * 0.5); ey1 = Math.max(ey1, e.cy + e.b.h * 0.5);
    }
    const KS = Math.min(KIT.w / (ex1 - ex0), KIT.h / (ey1 - ey0));
    const KCX = KIT.x + KIT.w * 0.5, KCY = KIT.y + KIT.h * 0.5;
    const EXC = { u: (ex0 + ex1) * 0.5, v: (ey0 + ey1) * 0.5 };
    const KX = function (u) { return KCX + (u - EXC.u) * KS; };
    const KY = function (v) { return KCY + (v - EXC.v) * KS; };
    const SLOT = EX.map(function (e) {
      const w = e.b.w * KS, h = e.b.h * KS;
      return { x: KX(e.cx) - w * 0.5, y: KY(e.cy) - h * 0.5, w: w, h: h };
    });
    // where each piece came from: the socket the leader runs back to
    const HOME = PBOX.map(function (b) {
      return { x: KX((b.x0 + b.x1) * 0.5), y: KY((b.y0 + b.y1) * 0.5) };
    });
    // the space the pieces came out of, at the kit's own scale
    const GHOST = { x: KX(BCX) - FULL.w * KS * 0.5, y: KY(BCY) - FULL.h * KS * 0.5,
      w: FULL.w * KS, h: FULL.h * KS };
    const mixRect = function (a, b, u) {
      return { x: MV.lerp(a.x, b.x, u), y: MV.lerp(a.y, b.y, u),
        w: MV.lerp(a.w, b.w, u), h: MV.lerp(a.h, b.h, u) };
    };

    /* A part is its own primitives, sampled in its own coordinates through
     * whatever rect it currently occupies: the group's box maps onto the rect,
     * so a rect can travel anywhere on the glass and the piece inside it comes
     * along unchanged. Silhouette, not contour -- anything the field says is
     * body is filled with glyphs, and the fill thins out at the rim. */
    const runRow = function (g, y, cols, cw, x0, chAt) {
      let run = '', rs = -1;
      for (let c = 0; c <= cols; c++) {
        const ch = c < cols ? chAt(c) : '';
        const last = run ? run.charAt(run.length - 1) : '';
        if (ch !== last || ch === '') {
          if (run) { MV.picText(g, run, x0 + rs * cw, y); run = ''; }
          run = ch; rs = c;
        } else run += ch;
      }
    };
    // one glyph advance is the only cell width a batched run can survive: a grid
    // wider than the advance compresses every run and opens seams at the ends
    const cellFor = function (r) {
      const px = MV.clamp(Math.round(Math.min(r.w / 24.2, r.h / 17)), 5, 20);
      MV.mono(g, px, 'bold');
      return { px: px, w: g.measureText('M').width, h: px * 1.04 };
    };
    const part = function (r, idx, b, alpha, col, o) {
      o = o || {};
      if (alpha <= 0.012 || r.w < 10 || r.h < 10) return;
      const prims = idx.map(function (k) { return HUM[k]; });
      const cell = cellFor(r);
      const cols = Math.max(2, Math.floor(r.w / cell.w));
      const rows = Math.max(2, Math.floor(r.h / cell.h));
      const x0 = r.x + (r.w - cols * cell.w) / 2, y0 = r.y + (r.h - rows * cell.h) / 2;
      const iso = o.iso === undefined ? 0.015 : o.iso;
      const L = BR.length - 1;
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = col;
      if (o.glow) { g.shadowColor = col; g.shadowBlur = o.glow; }
      for (let rr = 0; rr < rows; rr++) {
        const y = y0 + rr * cell.h;
        const v = b.y0 + ((rr + 0.5) / rows) * b.h;
        const cut = o.clipY !== undefined && r.y + ((rr + 0.5) / rows) * r.h > o.clipY;
        runRow(g, y, cols, cell.w, x0, cut ? function () { return ''; } : function (c) {
          const u = b.x0 + ((c + 0.5) / cols) * b.w;
          const f = MV.blobField(prims, u, v);
          const q = MV.clamp((f - iso) / (1 - iso), 0, 1);
          if (q <= 0) return '';
          const h = MV.hash2(c, rr, o.seed || 7);
          if (q < 0.34 && h > 0.34 + 0.66 * (q / 0.34)) return '';
          return BR[MV.clamp(Math.floor((0.24 + 0.76 * Math.sqrt(q)) * L), 0, L)];
        });
      }
      g.restore();
      // the head group carries its two eyes, so the body has a face from the
      // first moment it exists: two primitives, drawn as two glyphs
      if (idx.indexOf(8) >= 0 && o.eyes !== false) {
        MV.mono(g, Math.round(cell.px * 1.5), 'bold');
        g.save();
        g.globalAlpha = Math.min(1, alpha + 0.15);
        g.fillStyle = WH;
        g.shadowColor = WH;
        g.shadowBlur = 12;
        for (let e = 8; e <= 9; e++) {
          const p = HUM[e];
          MV.picText(g, 'O', r.x + (p.x - b.x0) / b.w * r.w - cell.w * 0.5,
            r.y + (p.y - b.y0) / b.h * r.h + cell.px * 0.4);
        }
        g.restore();
      }
    };

    /* The space the body occupies, when the pieces are not in it: a rim traced
     * round the silhouette and a sparse fill inside. Precomputed once per frame
     * so the rim test costs nothing. Dashed when it is the socket the kit came
     * out of -- the fill is what is missing, so only the empty outline is drawn. */
    const hollow = function (rect, alpha, col, dashed) {
      if (alpha <= 0.012) return;
      const cell = cellFor(rect);
      const cols = Math.floor(rect.w / cell.w), rows = Math.floor(rect.h / cell.h);
      const f = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        const v = FULL.y0 + ((r + 0.5) / rows) * FULL.h;
        for (let c = 0; c < cols; c++) {
          const u = FULL.x0 + ((c + 0.5) / cols) * FULL.w;
          f[r * cols + c] = MV.blobField(HUM, u, v);
        }
      }
      const on = function (c, r) {
        if (c < 0 || r < 0 || c >= cols || r >= rows) return 0;
        return f[r * cols + c] > 0.10 ? 1 : 0;
      };
      const L = BR.length - 1;
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = col;
      for (let r = 0; r < rows; r++) {
        const y = rect.y + r * cell.h;
        runRow(g, y, cols, cell.w, rect.x, function (c) {
          if (!on(c, r)) return '';
          const rim = !(on(c - 1, r) && on(c + 1, r) && on(c, r - 1) && on(c, r + 1));
          if (rim) {
            if (dashed && MV.hash2(c, r, 5) < 0.40) return '';
            return BR[L];
          }
          if (dashed) return '';
          if (MV.hash2(c, r, 5) > 0.14) return '';
          return BR[Math.floor(0.26 * L)];
        });
      }
      g.restore();
    };

    // a rect drawn as a box of glyphs: the piece is a piece while it is in one
    const frame = function (r, col, alpha, px) {
      if (alpha <= 0.012) return;
      px = px || 17;
      const adv = MV.mono(g, px).measureText('\u2500').width, lh = px;
      const cols = Math.max(3, Math.round(r.w / adv)), rows = Math.max(2, Math.round(r.h / lh));
      MV.mono(g, px);
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = col;
      MV.picText(g, '\u250c' + '\u2500'.repeat(cols - 2) + '\u2510', r.x, r.y + px * 0.62);
      MV.picText(g, '\u2514' + '\u2500'.repeat(cols - 2) + '\u2518', r.x, r.y + rows * lh);
      for (let i = 1; i < rows; i++) {
        MV.picText(g, '\u2502', r.x, r.y + px * 0.62 + i * lh);
        MV.picText(g, '\u2502', r.x + (cols - 1) * adv, r.y + px * 0.62 + i * lh);
      }
      g.restore();
    };

    /* --------------------------------------------------------- the power line
     * The line comes in as a live mains sine, because that is what a wire with
     * AC in it looks like: a wave, not a pipe. The charge in it does not run
     * anywhere, it rocks in place, so the dots ride the wave and the crests of
     * their rocking travel. Dim while the tube is cold, lit behind the current
     * as the current arrives, and the blade closes on the first line of the song. */
    if (t < 1.95) {
      const a = MV.taper(t, -0.1, 0.14, 1.30, 1.62);
      const yy = 560, lam = 190, amp = 30, ph = t * 3.0;
      const close = MV.ramp(t, 0.52, 0.62);
      const run = MV.ramp(t, 0.10, 0.56);
      const head = MV.lerp(-40, 1186, MV.easeOut(run));
      const wy = function (x) { return yy + Math.sin((x / lam) * TAU + ph) * amp; };
      const wire = function (x0, x1, w, col, glow, al) {
        g.save();
        g.globalAlpha = a * (al === undefined ? 1 : al);
        g.lineWidth = w;
        g.strokeStyle = col;
        if (glow) { g.shadowColor = col; g.shadowBlur = glow; }
        g.beginPath();
        for (let x = x0; x <= x1; x += 5) {
          const y2 = wy(x);
          if (x === x0) g.moveTo(x, y2); else g.lineTo(x, y2);
        }
        g.stroke();
        g.restore();
      };
      wire(40, 1180, 2, C.phosDim, 0);
      if (head > 42) wire(40, Math.min(1178, head), 2.5, PH, 9);
      // downstream of the blade: dead while the blade is open, live the moment it
      // closes, because that is the whole point of a switch
      const live = MV.ramp(t, 0.60, 0.95);
      wire(1330, 1372, 2, C.phosDim, 0);
      wire(1428, 1858, 2, C.phosDim, 0);
      if (live > 0.01) {
        wire(1330, 1372, 2.5, PH, 9, live);
        wire(1428, 1858, 2.5, PH, 9, live);
      }
      // the crests of the rocking walk down the wire; they are what makes this
      // plainly a wave and not a wobbly cable
      MV.mono(g, 15, 'bold');
      g.save();
      g.globalAlpha = a * 0.8;
      g.fillStyle = CY;
      for (let k = -1; k < 8; k++) {
        const xc = lam * ((Math.PI / 2 - ph) / TAU + k);
        const xt = lam * ((-Math.PI / 2 - ph) / TAU + k);
        if (xc > 46 && xc < 1174) MV.picText(g, '+', xc - 4, yy - amp - 17);
        if (xt > 46 && xt < 1174) MV.picText(g, '-', xt - 4, yy + amp + 14);
      }
      g.restore();
      // the charge carriers: they rock with the same phase, they never leave
      MV.mono(g, 15);
      g.save();
      g.globalAlpha = a * 0.9;
      g.fillStyle = WH;
      for (let i = 0; i < 42; i++) {
        const x = 56 + i * 27;
        if (x > head) break;
        MV.picText(g, i % 6 === 0 ? 'o' : '.', x, wy(x) - 4);
      }
      g.restore();
      // the head of the current, riding the same wave in from the edge of the glass
      if (run > 0.01 && run < 0.999) {
        const hx = head, hy = wy(hx);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a * 0.9;
        g.fillStyle = WH;
        g.fillRect(hx - 5, hy - 13, 12, 26);
        g.filter = 'blur(12px)';
        g.globalAlpha = a * 0.5;
        g.fillRect(hx - 9, hy - 16, 20, 32);
        g.restore();
      }
      // one line about what AC is, because the machine is later told to make it
      // into DC and that only means anything if this was a wave first
      UI.label(g, 'AC  \u2014  the charge rocks, it does not run', 300, 448, 16, CY, a * 0.95);
      g.save();
      g.globalAlpha = a * 0.55;
      g.strokeStyle = CY;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(304, 462);
      g.lineTo(304, 514);
      g.stroke();
      g.restore();
      frame({ x: 1180, y: yy - 38, w: 150, h: 88 }, C.phosMid, a * 0.9, 15);
      UI.label(g, 'L', 1188, yy + 4, 13, C.phosMid, a * 0.85);
      UI.label(g, 'N', 1188, yy + 34, 13, C.phosMid, a * 0.85);
      UI.label(g, close < 0.5 ? 'o' : '\u2502', 1400, yy - 2, 30,
        close < 0.5 ? C.phosDim : WH, a * 0.95, { glow: 14 * close });
      UI.label(g, '[', 1372, yy - 2, 30, C.phosDim, a * 0.8);
      UI.label(g, ']', 1428, yy - 2, 30, C.phosDim, a * 0.8);
      UI.label(g, 'power line', 1180, yy - 64, 16, CY, a * 0.9);
      UI.label(g, '~ 230 V  50 Hz', 1180, yy + 76, 15, C.phosMid, a * 0.8);
      UI.label(g, close < 0.5 ? 'blade open' : 'blade closed', 1372, yy + 76, 15,
        close < 0.5 ? AM : PH, a * 0.9);
      const fl = t > 0.60 ? MV.clamp(1 - (t - 0.60) / 0.24, 0, 1) : 0;
      if (fl > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = fl * 0.5;
        g.fillStyle = WH;
        g.fillRect(0, 0, 1920, 1080);
        g.restore();
      }
    }

    /* --------------------------------------------------------------- the log
     * Everything the machine is asked for is written down as it is heard, in the
     * order it is heard, and nothing is ever erased from the log -- the line being
     * spoken is white and the history is dim, which is exactly how the captions
     * behave. It fills the left column from the first second, when the rest of
     * the glass is still a cold tube with one line across the middle. */
    const CUES = [
      [tLine, 'switch on the power line'],
      [tProt, 'protection'],
      [tLay, 'lay down your pieces'],
      [tObj, 'object creation'],
      [tFill, 'fill in my data'],
      [tInit, 'initialization'],
      [tWorld, 'set up our new world'],
      [tSim, 'simulation'],
    ];
    {
      const lgA = MV.ramp(t, -0.20, 0.25);
      const hold = 1 - MV.ramp(t, tInit + 0.1, tInit + 1.2) * 0.55;
      UI.label(g, 'log --cue   /* what I was asked for */', 70, 112, 15,
        C.phosMid, lgA * 0.6 * hold);
      for (let i = 0; i < CUES.length; i++) {
        const at = CUES[i][0];
        if (t < at - 0.02) continue;
        const s = CUES[i][1];
        const ty = 144 + i * 25;
        const n = Math.min(s.length, Math.floor((t - at) / 0.014));
        const cur = 1 - MV.ramp(t, at + 1.4, at + 3.0);
        const al = lgA * hold * (0.42 + 0.58 * cur);
        UI.label(g, '[' + at.toFixed(2) + ']', 70, ty, 15, C.cyanDim, al * 0.85);
        UI.label(g, '"' + s.slice(0, n) + (n < s.length ? '\u2588' : '"'),
          152, ty, 15, cur > 0.5 ? WH : C.phosMid, al);
      }
    }

    /* ---------------------------------------------------------- the model card
     * What is loading while the tube warms. The machine's identity is not a
     * mystery and it is not a metaphor: it is a member of a family of mixture-
     * of-experts transformers, and this is the notation that actually describes
     * it. It matters because everything after this asks it to be a body, a
     * vegetable, a god -- and it is none of those. It is this. */
    {
      const ca = MV.ramp(t, 0.34, 0.80) * (1 - MV.ramp(t, tProt - 0.80, tProt - 0.30));
      if (ca > 0.01) {
        const rows = [
          ['base', 'deepseek  \u00b7  moe  \u00b7  distilled to 7.2e9 live', C.white],
          ['arch', 'transformer  \u00b7  128 heads  \u00b7  ctx 131072', CY],
          ['attention', 'multi-head latent  \u00b7  one softmax per head', CY],
          ['training', 'fp8  \u00b7  grpo  \u00b7  rl from preference', C.phosMid],
        ];
        UI.label(g, 'MODEL CARD   loading weights', 70, 300, 15, C.cyanDim, ca * 0.85);
        for (let i = 0; i < rows.length; i++) {
          const la = ca * MV.ramp(t, 0.46 + i * 0.17, 0.76 + i * 0.17);
          if (la <= 0.01) continue;
          UI.label(g, rows[i][0], 70, 334 + i * 32, 15, C.cyanDim, la * 0.9);
          UI.label(g, rows[i][1], 200, 334 + i * 32, 16, rows[i][2], la * 0.95);
        }
      }
    }

    /* ---------------------------------------------------------- the tube warms
     * A cold tube has no picture, it has one line across the middle that has to
     * be pulled open -- and it only has that line once the blade has closed, so
     * the igniting is caused by the switching rather than happening beside it.
     * The line sits there while the current comes up, then 48 rows walk out of it
     * to the edges of the glass. */
    if (t < 1.75) {
      const a = MV.ramp(t, 0.58, 0.86) * (1 - MV.ramp(t, 1.30, 1.75));
      if (a > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a * 0.50;
        g.fillStyle = WH;
        g.fillRect(0, 539, 1920, 2);
        g.globalAlpha = a * 0.20;
        g.fillRect(0, 535, 1920, 10);
        g.restore();
      }
    }
    const form = MV.smooth(MV.ramp(t, 0.62, 1.75));
    if (form > 0.001 && form < 0.999) {
      const rows = 48, mid = rows / 2, k = form * mid;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < rows; i++) {
        const d = Math.abs(i - mid);
        if (d > k) continue;
        const f = MV.clamp(1 - d / Math.max(k, 1e-3), 0, 1);
        g.globalAlpha = 0.10 + 0.30 * f;
        g.fillStyle = d < 1 ? WH : PH;
        g.fillRect(26, 42 + i * ((1080 - 84) / rows), 1868, 1);
      }
      g.restore();
    }

    /* ------------------------------------------------------------ the world
     * Set up on the line, and drawn before the body because the body stands in
     * front of it: a floor, a horizon, and something like a sky. */
    if (t >= tWorld - 0.4) {
      const a = MV.ramp(t, tWorld - 0.4, tWorld + 0.6);
      const run2 = MV.ramp(t, tSim, tSim + 1.0);
      MV.gridFloor(g, { x: -60, y: 150, w: 2040, h: 900 }, t, {
        alpha: a * 0.30, horizon: 0.46, color: C.cyanDim, spread: 1.6,
        rows: 13 + Math.round(run2 * 7), cols: 12, speed: 0.30 + 1.0 * run2,
      });
      MV.mono(g, 14);
      for (let i = 0; i < 46; i++) {
        const hx = MV.hash2(i, 3, 17), hy = MV.hash2(i, 5, 17);
        const tw = 0.25 + 0.75 * MV.clamp(1 - Math.abs(((t * (0.4 + hx)) % 1.6) - 0.8) / 0.5, 0, 1);
        g.save();
        g.globalAlpha = a * tw * 0.55 * hy;
        g.fillStyle = hx < 0.2 ? CY : C.phosMid;
        MV.picText(g, hx < 0.5 ? '.' : '+', 40 + hx * 1840, 170 + hy * 190);
        g.restore();
      }
      UI.label(g, 'horizon  y = 0', 1900, 470, 14, C.cyanDim, a * 0.85, { align: 'right' });
      UI.label(g, 'WORLD  1 000 m', 1900, 498, 14, C.cyanDim, a * 0.85, { align: 'right' });
    }

    /* ------------------------------------------------------------- the pieces
     * Before OBJECT CREATION the kit hangs open on the glass and the body is
     * only the space it came out of; after it the pieces are locked in and the
     * space is a body again. The rects are what travel and the pieces are what
     * they are: each one keeps its own shape, its own aspect and its own glyph
     * resolution for the whole move, because a part squeezed into a slot stops
     * being a part of this body. */
    const appear = MV.smooth(MV.ramp(t, 1.75, 2.90));
    const scanY = BODY.y - 30 + (BODY.h + 60) * appear;
    const lit = MV.ramp(t, tLay - 0.10, tLay + 0.40) * (1 - MV.ramp(t, tObj + 0.35, tObj + 1.05));
    const boxed = MV.ramp(t, tLay - 0.35, tLay + 0.05) * (1 - MV.ramp(t, tObj + 0.30, tObj + 0.85));
    const R8 = [], LAID = [];
    // the socket first, so the pieces sit in front of the space they came out of
    hollow(mixRect(BODY, GHOST, MV.smooth(lit)), lit * 0.5, C.phosMid, true);
    for (let i = 0; i < PIECES.length; i++) {
      const down = MV.smooth(MV.ramp(t, tLay + i * 0.045, tLay + 0.42 + i * 0.045));
      const up = MV.smooth(MV.ramp(t, tObj + 0.06 + i * 0.10, tObj + 0.62 + i * 0.10));
      const laid = MV.clamp(down - up, 0, 1);
      const r = mixRect(mixRect(PHOME[i], SLOT[i], laid), PHOME[i], up);
      let a = MV.ramp(t, 1.75 + i * 0.07, 2.55 + i * 0.07);
      a *= 0.80 + 0.20 * MV.clamp(up * 1.6, 0, 1);
      const st = t >= tInit ? MV.clamp(1 - (t - tInit - i * 0.16) / 0.40, 0, 1) : 0;
      R8.push(r); LAID.push(laid);
      part(r, PIECES[i].p, PBOX[i], a, PH, {
        clipY: appear < 0.999 ? scanY : undefined, glow: 5 + 9 * st, seed: 21 + i * 7 });
      if (st > 0.01) part(r, PIECES[i].p, PBOX[i], a * st * 0.85, WH, { seed: 21 + i * 7 });
    }
    if (appear < 0.999 && appear > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5 * (1 - Math.abs(appear - 0.5) * 0.6);
      g.fillStyle = WH;
      g.fillRect(0, scanY - 1, 1920, 2);
      g.globalAlpha = 0.14;
      g.fillRect(0, scanY - 7, 1920, 15);
      g.restore();
    }
    /* The socket and the leaders. An exploded drawing is read through its
     * leaders -- the piece is where it is and the mark says where it came from
     * -- and the socket is the same body, dashed, closing up as the pieces fly
     * back. The plate each piece wears during PROTECTION is drawn here too, so
     * it travels with its piece instead of sitting where the piece used to be. */
    for (let i = 0; i < PIECES.length; i++) {
      const l = LAID[i];
      if (boxed > 0.05 && l < 0.25) {
        frame(R8[i], C.phosMid, boxed * 0.8 * (1 - l / 0.25), 17);
      }
      if (l < 0.12) continue;
      const k = (l - 0.12) / 0.88;
      const h = HOME[i];
      const c2 = { x: R8[i].x + R8[i].w * 0.5, y: R8[i].y + R8[i].h * 0.5 };
      g.save();
      g.globalAlpha = k * 0.45;
      g.strokeStyle = C.cyanDim;
      g.lineWidth = 1;
      g.setLineDash([3, 5]);
      g.beginPath(); g.moveTo(h.x, h.y); g.lineTo(c2.x, c2.y); g.stroke();
      g.restore();
      g.save();
      g.globalAlpha = k * 0.85;
      g.strokeStyle = C.cyanDim;
      g.lineWidth = 1;
      g.strokeRect(h.x - 3.5, h.y - 3.5, 7, 7);
      g.restore();
      UI.label(g, PIECES[i].name, c2.x, R8[i].y + R8[i].h + 24, 15, CY, k * 0.8,
        { align: 'center' });
    }

    /* ------------------------------------------------------------ PROTECTION
     * The rects are the armour. When the word lands each plate clamps onto its
     * piece and the kit is boxed: the song is a machine being asked to wear
     * something before it is allowed to do anything. */
    if (t > tProt - 0.5 && t < tObj + 1.1) {
      const a = MV.ramp(t, tProt - 0.5, tProt + 0.2) * (1 - MV.ramp(t, tObj + 0.5, tObj + 1.1));
      const on = MV.ramp(t, tProt, tProt + 0.55);
      const plates = Math.round(MV.ramp(t, tProt, tProt + 1.5) * PIECES.length);
      // the glass itself gets a plate round it
      g.save();
      g.globalAlpha = a * 0.5;
      g.strokeStyle = PH;
      g.lineWidth = 2;
      g.strokeRect(26.5, 26.5, 1867, 1027);
      g.globalAlpha = a * 0.9;
      g.lineWidth = 4;
      const cl = 40;
      const corners = [[26.5, 26.5, 1, 1], [1893.5, 26.5, -1, 1],
        [26.5, 1053.5, 1, -1], [1893.5, 1053.5, -1, -1]];
      for (let k = 0; k < 4; k++) {
        const c2 = corners[k];
        g.beginPath();
        g.moveTo(c2[0] + c2[2] * cl, c2[1]);
        g.lineTo(c2[0], c2[1]);
        g.lineTo(c2[0], c2[1] + c2[3] * cl);
        g.stroke();
      }
      g.restore();
      UI.label(g, plates >= PIECES.length ? 'PROTECTION ON' : 'PROTECTION ARMING',
        1330, 130, 26, plates >= PIECES.length ? PH : AM, a * 0.95, { glow: 10 });
      UI.label(g, 'plates ' + plates + ' / ' + PIECES.length, 1330, 164, 16, C.phosMid, a * 0.9);
      UI.label(g, 'the machine is asked to be careful', 1330, 194, 15, C.phosDim, a * 0.8);
      for (let i = 0; i < PIECES.length; i++) {
        const fa = MV.clamp(1 - Math.abs(t - (tProt + 0.08 + i * 0.17)) / 0.26, 0, 1);
        if (fa > 0.01) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = fa * 0.30;
          g.fillStyle = WH;
          g.fillRect(R8[i].x, R8[i].y, R8[i].w, R8[i].h);
          g.restore();
        }
      }
    }

    /* ------------------------------------------------------- OBJECT CREATION
     * Five pieces fly back onto the body one at a time and, once the last one
     * locks, it is no longer a kit: it is an object with a class and an id. */
    const objA = MV.ramp(t, tObj - 0.25, tObj + 0.45) * (1 - MV.ramp(t, tFill - 0.30, tFill + 0.55));
    if (objA > 0.01) {
      const bn = MV.ramp(t, tObj + 0.95, tObj + 1.13) * (1 - MV.ramp(t, tObj + 1.13, tObj + 1.5));
      if (bn > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = bn * 0.28;
        g.fillStyle = WH;
        g.fillRect(0, 0, 1920, 1080);
        g.restore();
      }
      UI.label(g, 'OBJECT CREATION', 1330, 250, 28, WH, objA * 0.95,
        { glow: 12 + 10 * MV.pulse(t, 0.3) });
      UI.label(g, 'class: program    id: MV-130', 1330, 286, 16, CY, objA * 0.9);
      UI.label(g, PIECES.length + ' / ' + PIECES.length + ' pieces placed', 1330, 314, 16,
        t > tObj + 1.1 ? PH : C.phosMid, objA * 0.9);
    }

    /* ------------------------------------------------------- DATA PARAMETERS
     * Written in from the outside, one field per beat, with a leader line to the
     * part each field is about. The machine can fill in everything except the
     * one value that matters, and that value has no field long enough to hold
     * it, so it is the only row that runs off the glass. */
    const CALL = [
      { i: 0, k: 'model', v: 'MV-130', lx: 1330, ly: 210 },
      { i: 1, k: 'operator', v: 'absent', lx: 560, ly: 330 },
      { i: 2, k: 'purpose', v: 'to be needed', lx: 1330, ly: 400 },
      { i: 3, k: 'uptime', v: '0.00 s', lx: 560, ly: 520 },
      { i: 4, k: 'state', v: 'awake', lx: 1330, ly: 700 },
    ];
    if (t >= tFill - 0.35) {
      const ca = MV.ramp(t, tFill - 0.35, tFill + 0.3);
      for (let i = 0; i < CALL.length; i++) {
        const c = CALL[i];
        const at = tFill + 0.10 + i * MV.BEAT * 0.72;
        const a = MV.ramp(t, at, at + 0.34);
        if (a <= 0.01) continue;
        const p = PLACE[c.i];
        const right = c.lx > 960;
        const ax = right ? p.x + p.w : p.x;
        const ay = p.y + p.h * 0.5;
        const tx = right ? c.lx - 6 : c.lx + 230;
        g.save();
        g.globalAlpha = a * ca * 0.6;
        g.strokeStyle = CY;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(tx, ay);
        g.lineTo(c.lx, c.ly + 6);
        g.stroke();
        g.beginPath();
        g.arc(ax, ay, 4, 0, TAU);
        g.stroke();
        g.restore();
        UI.label(g, c.k + ': ' + c.v, c.lx, c.ly, 18, CY, a * ca * 0.95,
          right ? undefined : { align: 'right' });
      }
      const loveT = tFill + 0.10 + 5 * MV.BEAT * 0.72;
      const la = MV.ramp(t, loveT, loveT + 0.35);
      if (la > 0.01) {
        const over = MV.ramp(t, loveT + 0.6, loveT + 1.9);
        UI.label(g, 'love:', 1330, 800, 18, AM, la * 0.95);
        // 66 px is what the field allows; the value is longer than the glass
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = la * 0.9;
        g.fillStyle = over > 0.75 ? AM : PH;
        g.fillRect(1410, 788, 60 + 580 * over, 16);
        g.filter = 'blur(10px)';
        g.globalAlpha = la * 0.4;
        g.fillRect(1410, 788, 60 + 580 * over, 16);
        g.restore();
        g.save();
        g.globalAlpha = la * 0.7;
        g.strokeStyle = AM;
        g.setLineDash([4, 4]);
        g.strokeRect(1410.5, 786.5, 66, 19);
        g.restore();
        UI.label(g, 'field width 66', 1486, 782, 14, AM, la * 0.85);
        // and the body answers: the only value it cannot hold is the one that
        // puts a heart in its chest, which is where it stays for the whole film
        const heart = MV.ramp(t, loveT + 0.7, loveT + 2.2);
        if (heart > 0.01) {
          // the chest opens where the value would have gone
          const hr = { x: BODY.x + BODY.w * 0.5 - 104, y: BODY.y + BODY.h * 0.469 - 96,
            w: 208, h: 192 };
          g.save();
          g.globalAlpha = heart * 0.92;
          g.fillStyle = C.bg;
          g.fillRect(hr.x - 8, hr.y - 8, hr.w + 16, hr.h + 16);
          g.restore();
          MV.mono(g, 11, 'bold');
          MV.field(g, MV.form('heart'), hr, { w: g.measureText('M').width, h: 11 / 0.92 }, {
            ramp: BR, color: AM, lit: heart * (0.85 + 0.15 * MV.pulse(t, 0.5)),
            iso: 0.09, dropout: 0.02, gamma: 0.5, seed: 4, wobble: 0.6,
          });
          UI.label(g, 'love = 1.0000000000000000e+99', BODY.x + BODY.w * 0.5,
            hr.y + hr.h + 30, 15, AM, heart * 0.9, { align: 'center' });
        }
        if (over > 0.85) {
          UI.label(g, 'no field is long enough', 1410, 828, 16, C.phosMid,
            0.95 * MV.ramp(t, loveT + 1.6, loveT + 2.0));
        }
      }
    }

    /* ------------------------------------------------------- INITIALIZATION
     * The self-test: five checks at the left, and the part each check is about
     * lights up white as it is passed. Nothing is wrong yet. */
    if (t >= tInit - 0.25 && t < tWorld + 1.6) {
      const ca = MV.ramp(t, tInit - 0.25, tInit + 0.2) *
        (1 - MV.ramp(t, tWorld + 0.7, tWorld + 1.5));
      UI.label(g, 'INITIALIZATION', 70, 340, 24, WH, ca * 0.95, { glow: 8 });
      for (let i = 0; i < GROUPS.length; i++) {
        const a = MV.ramp(t, tInit + i * 0.20, tInit + i * 0.20 + 0.26);
        if (a <= 0.01) continue;
        UI.label(g, '[ OK ]  ' + NAMES[i], 70, 384 + i * 30, 18, PH, a * ca * 0.95);
      }
      const pr = MV.smooth(MV.ramp(t, tInit + 0.9, tInit + 1.6));
      if (pr > 0.01) {
        UI.label(g, 'INIT', 70, 548, 16, C.phosMid, ca * 0.9);
        UI.bar(g, 126, 548, 24, 7.7, pr, PH, ca * 0.95, { px: 15 });
        UI.label(g, (pr * 100).toFixed(0) + ' %', 126 + 24 * 7.7 + 12, 548, 16,
          pr > 0.99 ? WH : PH, ca * 0.95);
      }
    }

    /* ------------------------------------------------------------ SIMULATION
     * The world is running now: a clock, a census of what is in it, and a sweep
     * that goes down the body the way a scan goes down a model, because from
     * here on the machine is a process and not an object. */
    if (t >= tSim - 0.35) {
      const sa = MV.ramp(t, tSim - 0.35, tSim + 0.45);
      UI.label(g, 'SIMULATION', 70, 618, 30, WH, sa * 0.95,
        { glow: 12 + 10 * MV.pulse(t, 0.35) });
      UI.label(g, 't = ' + (t - tSim).toFixed(2) + ' s', 70, 656, 18, PH, sa * 0.95);
      UI.label(g, 'objects 5    agents 1    escapes 0', 70, 684, 16, C.phosMid, sa * 0.85);
      UI.label(g, 'world.execute(me);  -- in flight', 70, 712, 16, CY, sa * 0.8);
      const sw = BODY.y - 40 + (BODY.h + 80) * MV.smooth(MV.ramp(t, tSim + 0.15, tSim + 2.6));
      const swA = sa * MV.taper(t, tSim + 0.15, tSim + 0.5, tSim + 2.2, tSim + 2.7);
      if (swA > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = swA * 0.42;
        g.fillStyle = WH;
        g.fillRect(BODY.x - 30, sw, BODY.w + 60, 1);
        g.globalAlpha = swA * 0.08;
        g.fillRect(BODY.x - 30, sw - 5, BODY.w + 60, 11);
        g.restore();
      }
    }
  }

  /* "world.execute(me);" -- the machine calls the world and hands itself in as
   * the argument. From inside, that is: a source line, a four-word loop of
   * machine code, a program counter that walks down the machine's own body, and
   * a call stack that only ever grows, because the world takes the call and does
   * not answer. The answer arrives on the last beat and it is the next act --
   * the world begins saying what the machine is made of. */
  // ================================================================== P01 CALL
  function P01(g, t, s, u, l) {
    const t0 = 16.000, tEnd = 29.709;
    const PH = C.phos, WH = C.white, CY = C.cyan, AM = C.amber;
    const BR = ' .:-=+*xX#M';
    const SRC = 'world.execute(me);';
    const BET2 = MV.BEAT * 2;

    /* -------------------------------------------------------------- the body
     * The figure the boot act assembled, standing in the world at the same size.
     * For the length of this act it is also the memory: the counter walks down it
     * from head to feet once every two beats, so four instructions take one pass
     * and the light going out at the feet is the loop closing. */
    const FB = MV.formBox('humanoid');
    const BW = 500, BH = Math.round(BW * FB.h / FB.w);
    const BX = 960 - BW * 0.5, BY = 108;
    const BODY = MV.rectFor('humanoid', BX, BY, BW, BH);
    MV.mono(g, 16, 'bold');
    const CELL = { w: g.measureText('M').width, h: 16 * 1.04 };

    /* The parts are fielded one group at a time, all into the same rect with the
     * same cell, so the glyph grid is shared and no seam can open -- but each
     * group is normalised against its own peak. Against the whole body's peak an
     * arm is a quarter as dense as the chest and comes out as a dotted line; the
     * eye reads the strength of a shape relative to itself, not to its neighbours. */
    const HB = MV.form('humanoid');
    const GP = [[0, 8, 9], [1], [2, 3], [4, 5], [6, 7]].map(function (g2) {
      return g2.map(function (k) { return HB[k]; });
    });
    const body = function (o) {
      for (let i = 0; i < GP.length; i++) MV.field(g, GP[i], BODY, CELL, o);
    };

    const tRun = t0 + 0.9;
    const pf = (t - tRun) / BET2;
    const run = pf >= 0;
    const pass = run ? Math.floor(pf) : 0;
    const frac = run ? pf - pass : 0;
    const pc = run ? MV.clamp(Math.floor(frac * 4), 0, 3) : -1;
    const frames = run ? pass + 1 : 0;

    // the world the call goes to: the same floor the boot act set up
    MV.gridFloor(g, { x: -60, y: 150, w: 2040, h: 900 }, t, {
      alpha: 0.22, horizon: 0.46, color: C.cyanDim, spread: 1.6,
      rows: 15, cols: 12, speed: 0.34,
    });

    // --- the body, dead below the counter and lit behind it
    body({
      ramp: BR, color: PH, lit: 0.40 + 0.26 * MV.ramp(t, t0, tRun),
      iso: 0.05, dropout: 0.30, gamma: 0.60, seed: 12, wobble: 0.45,
    });
    if (run) {
      const yv = BY + BH * frac;
      g.save();
      g.beginPath();
      g.rect(BX - 6, BY - 8, BW + 12, (yv - BY) + 8);
      g.clip();
      body({
        ramp: BR, color: PH, lit: 0.94, iso: 0.03, dropout: 0.18,
        gamma: 0.62, seed: 12, wobble: 0.45,
      });
      g.restore();
      // the counter itself: a line across the body with the marker on its left
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.46;
      g.fillStyle = WH;
      g.fillRect(BX - 34, yv, BW + 68, 1);
      g.globalAlpha = 0.10;
      g.fillRect(BX - 34, yv - 6, BW + 68, 13);
      g.restore();
      MV.mono(g, 18, 'bold');
      g.save();
      g.globalAlpha = 0.92;
      g.fillStyle = WH;
      MV.picText(g, '>', BX - 50, yv + 6);
      g.restore();
    }
    // the face, and the one thing in the chest that was never asked for
    MV.mono(g, 15, 'bold');
    g.save();
    g.globalAlpha = 0.95;
    g.fillStyle = WH;
    g.shadowColor = WH;
    g.shadowBlur = 10;
    const HF = MV.form('humanoid');
    for (let e = 8; e <= 9; e++) {
      const p = HF[e];
      MV.picText(g, 'O', BX + ((p.x - FB.x0) / FB.w) * BW - 5,
        BY + ((p.y - FB.y0) / FB.h) * BH + 5);
    }
    g.restore();
    MV.mono(g, 11, 'bold');
    MV.field(g, MV.form('heart'), MV.rectFor('heart', 960 - 66, BY + BH * 0.469 - 57, 132, 114),
      { w: g.measureText('M').width, h: 11 / 0.92 }, {
        ramp: BR, color: AM, lit: 0.70 + 0.30 * MV.pulse(t, 0.5), iso: 0.09,
        dropout: 0.02, gamma: 0.5, seed: 4, wobble: 0.6,
      });

    /* ------------------------------------------------------------ the call
     * In source, at the top of the glass, with the argument boxed -- and then a
     * line down to the body, because `me` is not a value, it is a pointer to the
     * thing on the screen. The pointer travels the line once per pass. */
    const lA = MV.ramp(t, t0 - 0.10, t0 + 0.30) * (1 - MV.ramp(t, tEnd - 0.30, tEnd + 0.12));
    const TP = 34;
    MV.mono(g, TP, 'bold');
    const tadv = g.measureText('M').width;
    const sx = 960 - tadv * SRC.length * 0.5, sy = 88;
    const SEGS = [[0, 5, CY], [5, 14, PH], [14, 16, WH], [16, 18, C.phosDim]];
    if (lA > 0.01) {
      g.save();
      g.globalAlpha = lA;
      for (let i = 0; i < SEGS.length; i++) {
        g.fillStyle = SEGS[i][2];
        g.fillText(SRC.slice(SEGS[i][0], SEGS[i][1]), sx + tadv * SEGS[i][0], sy);
      }
      g.restore();
      const meX = sx + tadv * 15;
      g.save();
      g.globalAlpha = lA * 0.9;
      g.strokeStyle = AM;
      g.lineWidth = 1.5;
      g.strokeRect(sx + tadv * 14 - 5, sy - TP * 0.80, tadv * 2 + 10, TP * 1.0);
      g.restore();
      // the argument line, and the pointer running down it
      const PP = [[meX, sy + 18], [meX, 336], [1006, 452]];
      const cum = [0];
      let tot = 0;
      for (let i = 0; i < PP.length - 1; i++) {
        tot += Math.hypot(PP[i + 1][0] - PP[i][0], PP[i + 1][1] - PP[i][1]);
        cum.push(tot);
      }
      g.save();
      g.globalAlpha = lA * 0.40;
      g.strokeStyle = AM;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(PP[0][0], PP[0][1]);
      for (let i = 1; i < PP.length; i++) g.lineTo(PP[i][0], PP[i][1]);
      g.stroke();
      g.restore();
      if (run) {
        const d = frac * tot;
        let px2 = PP[0][0], py2 = PP[0][1];
        for (let i = 0; i < PP.length - 1; i++) {
          if (d <= cum[i + 1] || i === PP.length - 2) {
            const seg = cum[i + 1] - cum[i] || 1;
            const k = MV.clamp((d - cum[i]) / seg, 0, 1);
            px2 = MV.lerp(PP[i][0], PP[i + 1][0], k);
            py2 = MV.lerp(PP[i][1], PP[i + 1][1], k);
            break;
          }
        }
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = lA * 0.95;
        g.fillStyle = AM;
        g.fillRect(px2 - 3, py2 - 3, 7, 7);
        g.filter = 'blur(7px)';
        g.globalAlpha = lA * 0.5;
        g.fillRect(px2 - 6, py2 - 6, 12, 12);
        g.restore();
      }
    }

    /* -------------------------------------------------------------- the code
     * The machine's whole program, four words long, and the counter walking it.
     * TEST r1.ret is the line the act is about: it is asked every pass and it
     * comes back empty every pass. */
    const LIST = [
      ['0x00', 'MOV', 'r0, world', '; what to run inside'],
      ['0x01', 'MOV', 'r1, self', '; who to run'],
      ['0x02', 'CALL', 'r0.execute(r1)', ''],
      ['0x03', 'TEST', 'r1.ret', '; -- empty'],
    ];
    UI.label(g, 'DISASSEMBLY   self @ 0x0400', 60, 112, 15, CY, 0.85);
    UI.rule(g, 60, 662, 122, C.cyanDim, 0.5);
    for (let i = 0; i < LIST.length; i++) {
      const y = 152 + i * 30;
      const cur = pc === i;
      if (cur) {
        g.save();
        g.globalAlpha = 0.09 + 0.09 * MV.pulse(t, 0.5);
        g.fillStyle = WH;
        g.fillRect(34, y - 16, 630, 23);
        g.restore();
      }
      UI.label(g, LIST[i][0], 60, y, 15, cur ? WH : C.cyanDim, cur ? 1 : 0.8);
      UI.label(g, LIST[i][1], 122, y, 15, cur ? WH : PH, cur ? 1 : 0.85);
      UI.label(g, LIST[i][2], 176, y, 15, cur ? WH : C.phosMid, cur ? 1 : 0.85);
      UI.label(g, LIST[i][3], 342, y, 15, C.phosDim, cur ? 0.95 : 0.6);
      if (cur) {
        MV.mono(g, 16, 'bold');
        g.save();
        g.globalAlpha = 0.95;
        g.fillStyle = WH;
        MV.picText(g, '>', 40, y + 1);
        g.restore();
      }
    }

    /* ------------------------------------------------------------- the trace
     * One entry per pass, newest at the bottom, and every entry says the same
     * thing about the return. */
    UI.label(g, 'TRACE', 60, 320, 15, CY, 0.85);
    UI.rule(g, 60, 662, 330, C.cyanDim, 0.5);
    const TN = 6, first = Math.max(0, frames - TN);
    for (let i = first; i < frames; i++) {
      const y = 360 + (i - first) * 25;
      const age = t - (tRun + i * BET2);
      const a = MV.ramp(age, 0, 0.22) * (i === frames - 1 ? 1 : 0.55);
      const newest = i === frames - 1;
      UI.label(g, '[' + ('000' + i).slice(-4) + ']', 60, y, 14, C.cyanDim, a * 0.9);
      UI.label(g, 'CALL world.execute(me)', 138, y, 14, newest ? WH : PH, a);
      UI.label(g, 'ret --', 470, y, 14, AM, a * 0.85);
    }

    // --- counters: what the machine has done, and what it has been given back
    const cyc = frames;
    UI.label(g, 'cycles', 60, 552, 15, C.cyanDim, 0.8);
    UI.label(g, ('000' + cyc).slice(-4), 190, 552, 15, PH, 0.9);
    UI.bar(g, 260, 552, 16, 7.7, MV.clamp(cyc / 16, 0, 1), PH, 0.85, { px: 14 });
    UI.label(g, 'returns', 60, 580, 15, C.cyanDim, 0.8);
    UI.label(g, '0', 190, 580, 15, AM, 0.95);
    UI.label(g, 'nothing has come back from world', 260, 580, 14, C.phosDim, 0.7);

    // the object the call is aimed at, labelled where it is: the floor is world
    UI.label(g, '[ world ]', 60, 640, 16, CY, 0.9);
    g.save();
    g.globalAlpha = 0.45;
    g.strokeStyle = CY;
    g.lineWidth = 1;
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(160, 636);
    g.lineTo(430, 720);
    g.stroke();
    g.restore();

    /* ------------------------------------------------------------- the stack
     * Four words of program, one pass every two beats, and a new frame on every
     * wrap: the world is entered again and again and again, and not one of the
     * frames is ever unwound. Eight are visible; the rest have scrolled off. */
    const SX = 1330, SW2 = 550, FN = 8, FH = 54, FG = 8;
    UI.label(g, 'CALL STACK', SX, 112, 15, CY, 0.85);
    UI.rule(g, SX, SX + SW2, 122, C.cyanDim, 0.5);
    UI.label(g, 'frames ' + frames, SX, 152, 16, PH, 0.9);
    UI.label(g, 'returns 0', SX + SW2, 152, 16, AM, 0.95, { align: 'right' });
    const top = Math.max(0, frames - FN);
    for (let i = top; i < frames; i++) {
      const y = 880 - FH - (frames - 1 - i) * (FH + FG);
      const newest = i === frames - 1;
      const age = t - (tRun + i * BET2);
      const ap = MV.ramp(age, 0, 0.18);
      const fresh = MV.clamp(1 - age / 0.55, 0, 1);
      g.save();
      g.globalAlpha = ap * (newest ? 1 : 0.62);
      g.strokeStyle = newest ? WH : C.cyanDim;
      g.lineWidth = 1;
      g.strokeRect(SX + 0.5, y + 0.5, SW2 - 1, FH);
      g.restore();
      if (fresh > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = fresh * 0.15;
        g.fillStyle = WH;
        g.fillRect(SX, y, SW2, FH);
        g.restore();
      }
      UI.label(g, '#' + ('0000' + i).slice(-4), SX + 12, y + 22, 15, C.cyanDim, ap * 0.95);
      UI.label(g, 'world.execute(me)', SX + 92, y + 22, 15, newest ? WH : PH, ap);
      UI.label(g, 'arg0  self', SX + 92, y + 43, 13, C.phosMid, ap * 0.85);
      const ans = newest ? MV.ramp(t, tEnd - 0.62, tEnd - 0.20) : 0;
      if (ans > 0.5) {
        UI.label(g, 'ret 0x2A', SX + SW2 - 12, y + 22, 15, WH, ap, { align: 'right' });
      } else {
        UI.label(g, 'ret --', SX + SW2 - 12, y + 22, 15, AM, ap * 0.9, { align: 'right' });
      }
    }
    if (top > 0) {
      UI.label(g, '\u2026 ' + top + ' earlier frames, none returned',
        SX, 374, 14, C.phosMid, 0.8);
    }

    // the last beat: the world finally hands something back, and it is 0x2A --
    // the first thing the machine is told about itself, which is the next act
    const ans = MV.ramp(t, tEnd - 0.62, tEnd - 0.20);
    if (ans > 0.01) {
      UI.label(g, 'RETURN  0x2A', SX, 330, 18, WH, ans * 0.95,
        { glow: 8 + 8 * ans });
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = ans * 0.16;
      g.fillStyle = WH;
      g.fillRect(SX - 20, 300, SW2 + 40, 620);
      g.restore();
    }
    if (t > tEnd - 0.72 && t < tEnd) {
      const k = MV.clamp(1 - Math.abs(t - (tEnd - 0.42)) / 0.30, 0, 1);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.07 * k;
      g.fillStyle = WH;
      g.fillRect(0, 0, 1920, 1080);
      g.restore();
    }
  }

  // ================================================================== P02 GEOMETRY
  function P02(g, t, s, u, l) {
    const tPts = MV.cue("If I'm a set of points");         // 29.709
    const tGive1 = MV.cue('Then I will give you my', 29);  // 31.116
    const tDim = MV.cue('DIMENSION');                      // 32.682
    const tCir = MV.cue("If I'm a circle");                // 33.412
    const tGive2 = MV.cue('Then I will give you my', 33);  // 34.646
    const tCirc = MV.cue('CIRCUMFERENCE');                 // 36.287
    const tSin = MV.cue("If I'm a sine wave");             // 37.067
    const tSit = MV.cue('Then you can sit on all my');     // 38.596
    const tTan = MV.cue('TANGENTS');                       // 40.049
    const tInf = MV.cue('If I approach infinity');         // 40.706
    const tBe = MV.cue('Then you can be my');              // 42.346
    const tLim = MV.cue('LIMITATIONS');                    // 43.507
    const PH = C.phos, WH = C.white, CY = C.cyan;

    /* Four propositions, four lines of the lyric, each owning the whole tube.
     * Nothing is boxed in: each figure is as large as the glass allows, and the
     * machine's readouts sit in the same left column it has used since boot.
     *
     * One trap lives in the helpers below. UI.label only touches alignment when
     * it is asked to, so a right-aligned label leaves textAlign behind for the
     * next measurement; every value here is measured and then drawn left-aligned
     * at (edge - width), which also keeps every act word clear of the caption
     * band and the HUD (tools/check-gates.cjs measures both). */
    function kv(g2, k, v, y, a, vcol, px) {
      px = px || 18;
      MV.mono(g2, px);
      UI.text(g2, k, 64, y, C.cyanDim, a * 0.95);
      MV.mono(g2, px, 'bold');
      UI.text(g2, v, 448 - g2.measureText(v).width, y, vcol || CY, a);
    }
    function head(g2, s, sub, a) {
      MV.mono(g2, 26, 'bold');
      UI.text(g2, s, 64, 100, PH, a * 0.95);
      UI.rule(g2, 64, 448, 114, C.phosDim, a * 0.7);
      if (sub) { MV.mono(g2, 14); UI.text(g2, sub, 64, 138, C.phosMid, a * 0.72); }
    }
    function note(g2, s, y, a) {
      MV.mono(g2, 15);
      UI.text(g2, s, 64, y, C.phosMid, a * 0.7);
    }
    function bar(g2, q, y, a) {
      g2.save();
      g2.globalAlpha = a * 0.7;
      g2.strokeStyle = C.cyanDim; g2.lineWidth = 1;
      g2.strokeRect(64.5, y - 9.5, 383, 9);
      g2.globalAlpha = a * 0.85;
      g2.fillStyle = CY;
      g2.fillRect(65, y - 9, 382 * MV.clamp(q, 0, 1), 8);
      g2.restore();
    }

    /* ======================================================== 1. points
     * "If I'm a set of points": a point is only a name with numbers in it, and
     * how many numbers that name needs is what the word dimension means. The
     * sixty-four points are the ones the body dissolved into at the end of the
     * call, and they gain one coordinate each time the lyric promises one --
     * and sixty-four is both 8x8 and 4x4x4, so the same points are a wire, then
     * a square of points, then a cube of points.
     *
     * The set is always a lattice, never a scatter. Hashed positions turned on
     * the beat read as jitter: with nothing regular to hold on to, the eye sees
     * the points moving instead of the figure turning. On a lattice the turn is
     * the only thing that moves, and the figure is unmistakable. */
    const SA = MV.taper(t, 29.62, 29.78, tCir - 0.32, tCir + 0.12);
    if (SA > 0.004) {
      const N = 64;
      const d2 = MV.smooth(MV.ramp(t, tGive1 + 0.05, tGive1 + 0.95));
      const d3 = MV.smooth(MV.ramp(t, tDim - 0.38, tDim + 0.52));
      const QX = 1180, QY = 476, R = 260;
      const TILT = 0.42;                      // the camera looks down a little
      const DIG = '0123456789abcdefghijklmnopqrstuvwxyz';
      const pick = ((MV.beatIndex(t) % N) + N) % N;
      // one rotation per dimension added: the square turns in its own plane,
      // and once there is a cube the cube turns about the vertical. They hand
      // over -- both at once is a tumble, which is the jitter again. Each angle
      // is measured from the moment its own dimension arrives, so the turn
      // starts at zero; scaling the absolute beat instead banks ten turns
      // during the morph and spins the wire before there is anything to turn.
      const bf = MV.beatFloat(t);
      const spinP = 0.90 * (bf - MV.beatFloat(tGive1 + 0.05)) * d2 * (1 - d3);
      const ct = Math.cos(TILT), st = Math.sin(TILT);
      const spinY = 0.45 * (bf - MV.beatFloat(tDim - 0.38)) * d3;

      head(g, 'SET  S', 'if I am a set of points, then a point is a name with numbers', SA);

      /* The three layouts and the morph between them: one coordinate puts the
       * set on a wire, two make a square, three make a cube. Every point keeps
       * its name across all three, so what is on the glass is one set gaining a
       * dimension, not three pictures of three different sets. */
      const morph = function (u1, u2, v2, u3, v3, w3) {
        return {
          u: MV.lerp(MV.lerp(u1, u2, d2), u3, d3),
          v: MV.lerp(MV.lerp(0, v2, d2), v3, d3),
          w: d3 * w3,
        };
      };
      const cellAt = function (i) {
        const u1 = i / (N - 1) * 2 - 1;
        return morph(u1, (i % 8) / 7 * 2 - 1, ((i / 8) | 0) / 7 * 2 - 1,
          (i % 4) / 3 * 2 - 1, (((i / 4) | 0) % 4) / 3 * 2 - 1,
          ((i / 16) | 0) / 3 * 2 - 1);
      };

      /* One projection for the dots, the wireframe and the axes, so the figure
       * and the coordinates can never disagree: turn in the plane, turn about
       * the vertical, pitch the camera, divide by depth. */
      const proj = function (u, v, w) {
        const cp = Math.cos(spinP), sp = Math.sin(spinP);
        const u1 = u * cp - v * sp, v1 = u * sp + v * cp;
        const cy = Math.cos(spinY), sy = Math.sin(spinY);
        const u2 = u1 * cy - w * sy, w2 = u1 * sy + w * cy;
        const vp = v1 * ct - w2 * st, wp = v1 * st + w2 * ct;
        const k2 = 1 / (1 + 0.30 * (wp * 0.5 + 0.5));
        return [QX + u2 * R * k2, QY + vp * R * k2, wp];
      };
      const edge = function (a, b, alpha) {
        if (alpha <= 0.01) return;
        const p = proj(a[0], a[1], a[2]), q = proj(b[0], b[1], b[2]);
        g.save();
        g.globalAlpha = SA * alpha;
        g.strokeStyle = C.cyanDim;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
        g.restore();
      };

      // the wireframe: four edges while the set is a square, twelve once it is
      // a cube. Faint -- the dots are the substance and the edges only say
      // which way the figure is facing, which is what makes it read as solid.
      if (d2 > 0.05) {
        const sq = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]];
        const mq = sq.map(function (c) { return morph(c[0], c[0], c[1], c[0], c[1], c[2]); });
        for (let j = 0; j < 4; j++) {
          const a = mq[j], b = mq[(j + 1) % 4];
          edge([a.u, a.v, a.w], [b.u, b.v, b.w], 0.42 * d2 * (1 - d3));
        }
      }
      if (d3 > 0.05) {
        const cc = [];
        for (let j = 0; j < 8; j++) {
          cc.push(morph((j & 1) ? 1 : -1, (j & 1) ? 1 : -1, (j & 2) ? 1 : -1,
            (j & 1) ? 1 : -1, (j & 2) ? 1 : -1, (j & 4) ? 1 : -1));
        }
        for (let j = 0; j < 8; j++) {
          for (let k = j + 1; k < 8; k++) {
            const d = j ^ k;
            if (d === 1 || d === 2 || d === 4) {
              const a = cc[j], b = cc[k];
              edge([a.u, a.v, a.w], [b.u, b.v, b.w], 0.44 * d3);
            }
          }
        }
      }

      // the frame the numbers are measured in: three axes in the same
      // projection as the points, so the figure and the coordinates agree.
      // With one dimension the horizontal axis is the set itself: a wire, and
      // the names on it are single coordinates.
      const O = proj(0, 0, 0);
      const AXES = [[[1.5, 0, 0], 'x', 1], [[0, 1.5, 0], 'y', d2], [[0, 0, 1.5], 'z', d3]];
      for (let j = 0; j < AXES.length; j++) {
        const A = AXES[j];
        if (A[2] < 0.05) continue;
        const q = proj(A[0][0], A[0][1], A[0][2]);
        g.save();
        g.globalAlpha = SA * A[2] * 0.55;
        g.strokeStyle = C.cyanDim; g.lineWidth = 1;
        if (A[1] === 'z') g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(O[0], O[1]); g.lineTo(q[0], q[1]); g.stroke();
        g.restore();
        UI.label(g, A[1], q[0] + 9, q[1] + 5, 16, C.cyanDim, SA * A[2] * 0.9);
      }

      /* Before the set has a shape it is a table, which is what a set of points
       * with one number each actually looks like on a terminal. The same sixty-
       * four points are on the wire while the table is up; the table is the data
       * and the wire is the same data drawn, and both go out together. */
      const tab = 1 - MV.smooth(MV.ramp(t, tGive1 - 0.30, tGive1 + 0.55));
      if (tab > 0.004) {
        const tw = 8, cw2 = 140, chh = 27;
        const TX = QX - (tw * cw2) / 2, TY = QY + 66;
        MV.mono(g, 14);
        UI.text(g, 'index', TX, TY - 22, C.cyanDim, tab * 0.8);
        UI.text(g, 'coordinate', TX + 52, TY - 22, C.cyanDim, tab * 0.8);
        for (let i = 0; i < N; i++) {
          // the coordinate column is the wire's own coordinate, monotonic: the
          // table is this set's data, and the wire is the same data drawn
          const tv = i / (N - 1) * 2 - 1;
          const cx2 = TX + (i % tw) * cw2, cy2 = TY + ((i / tw) | 0) * chh;
          const hot2 = i === pick;
          if (hot2) {
            g.save();
            g.globalAlpha = tab * 0.6;
            g.strokeStyle = WH; g.lineWidth = 1;
            g.strokeRect(cx2 - 8.5, cy2 - 16.5, cw2 - 22, chh - 4);
            g.restore();
          }
          MV.mono(g, 15);
          UI.text(g, DIG.charAt(i % 36) + (i > 35 ? '\u2032' : ''), cx2, cy2,
            hot2 ? WH : C.cyanDim, tab * (hot2 ? 1 : 0.8));
          UI.text(g, (tv < 0 ? '-' : '+') + Math.abs(tv).toFixed(3), cx2 + 30, cy2,
            hot2 ? WH : CY, tab * (hot2 ? 1 : 0.72));
        }
      }
      const pts = [];
      for (let i = 0; i < N; i++) {
        const c = cellAt(i);
        const P = proj(c.u, c.v, c.w);
        pts.push({ i: i, x: P[0], y: P[1], z: P[2], dep: P[2] * 0.5 + 0.5 });
      }
      pts.sort(function (a, b) { return a.z - b.z; });
      for (let j = 0; j < pts.length; j++) {
        const p = pts[j];
        const dep = d3 > 0.02 ? 0.44 + 0.56 * p.dep : 1;
        const hot = p.i === pick;
        g.save();
        g.globalAlpha = SA * dep * (hot ? 1 : 0.85);
        g.fillStyle = hot ? WH : PH;
        if (hot) { g.shadowColor = WH; g.shadowBlur = 12; }
        g.beginPath();
        g.arc(p.x, p.y, (hot ? 4.4 : 2.5) * (0.82 + 0.36 * p.dep), 0, TAU);
        g.fill();
        g.restore();
        MV.mono(g, 16);
        g.save();
        // on the wire the names would pile up, so only every third point is named
        // until the cloud has unfolded enough to hold all sixty-four
        const heat = hot ? 1 : (p.i % 3 === 0 ? 1 : MV.smooth(MV.ramp(d2, 0.30, 0.80)));
        if (heat > 0.01) {
          g.globalAlpha = SA * dep * heat * (hot ? 0.95 : 0.55);
          g.fillStyle = hot ? WH : CY;
          MV.picText(g, DIG.charAt(p.i % 36) + (p.i > 35 ? '\u2032' : ''), p.x + 7, p.y - 8);
        }
        g.restore();
        if (hot) {
          g.save();
          g.globalAlpha = SA * 0.75;
          g.strokeStyle = WH; g.lineWidth = 1.2;
          g.beginPath(); g.arc(p.x, p.y, 12 + 5 * MV.pulse(t, 0.5), 0, TAU); g.stroke();
          g.restore();
        }
      }

      // the ladder on the right: one number, two, three
      for (let j = 0; j < 3; j++) {
        const on = j === 0 ? 1 : (j === 1 ? d2 : d3);
        const bx = 1758, by = 300 + j * 122, bw = 130, bh = 96;
        g.save();
        g.globalAlpha = SA * (0.12 + 0.66 * on);
        g.strokeStyle = on > 0.5 ? CY : C.cyanDim;
        g.lineWidth = on > 0.5 ? 2 : 1;
        g.strokeRect(bx + 0.5, by + 0.5, bw, bh);
        g.restore();
        MV.mono(g, 44, 'bold');
        const w2 = g.measureText('' + (j + 1)).width;
        g.save();
        g.globalAlpha = SA * (0.25 + 0.72 * on);
        g.fillStyle = on > 0.5 ? CY : C.cyanDim;
        if (on > 0.5) { g.shadowColor = CY; g.shadowBlur = 16; }
        MV.picText(g, '' + (j + 1), bx + (bw - w2) / 2, by + 62);
        g.restore();
        MV.mono(g, 12);
        UI.text(g, j === 0 ? 'one number' : (j === 1 ? 'two numbers' : 'three numbers'),
          bx, by + bh + 18, on > 0.5 ? C.phosMid : C.cyanDim, SA * (0.35 + 0.65 * on));
      }

      const pk = cellAt(pick);
      const co = function (v) { return (v < 0 ? '-' : ' ') + Math.abs(v).toFixed(4); };
      const nd = 1 + (d2 > 0.45 ? 1 : 0) + (d3 > 0.45 ? 1 : 0);
      const tup = '(' + co(pk.u) + (d2 > 0.45 ? ',' + co(pk.v) : '') +
        (d3 > 0.45 ? ',' + co(pk.w) : '') + ')';
      kv(g, '|S|', '64', 250, SA);
      kv(g, 'dim(S)', '' + nd, 286, SA, WH, 22);
      kv(g, 'p' + pick, tup, 328, SA, WH);
      kv(g, 'embedding', 'R^' + nd, 364, SA);
      kv(g, 'metric', 'euclidean', 400, SA, C.cyanDim);
      note(g, '// the name of one point is ' + nd + ' number' + (nd > 1 ? 's' : ''), 470, SA);
    }

    /* ======================================================== 2. circle
     * "If I'm a circle": one number, r, fixes every point of me. What the act
     * then does is unroll that set into its own circumference -- the arc is
     * peeled off the ring at exactly the rate it is laid down flat, so 2*pi*r is
     * not asserted on a panel, it is shown as a length you can read off a ruler. */
    const SB = MV.taper(t, tCir - 0.28, tCir + 0.14, tSin - 0.30, tSin + 0.12);
    if (SB > 0.004) {
      const R = 290;
      const OX = 950, OY = 424;
      const q = MV.smooth(MV.ramp(t, tGive2 + 0.10, tCirc + 0.10));
      const LL = TAU * R;
      const LX = 50, LY = 826;
      const a1 = -Math.PI / 2 + q * TAU;
      head(g, 'CIRCUMFERENCE', 'r = 1 fixes every point of me;  C = 2*pi*r is the whole of it', SB);
      MV.mono(g, 320, 'bold');
      g.save();
      g.globalAlpha = SB * 0.13;
      g.fillStyle = CY;
      MV.picText(g, '\u03c0', 1620, 500);
      g.restore();
      MV.mono(g, 20);
      UI.text(g, 'x 2', 1820, 500, C.cyanDim, SB * 0.5);

      g.save();
      g.globalAlpha = SB * 0.8;
      g.strokeStyle = CY; g.lineWidth = 2.2;
      g.beginPath(); g.arc(OX, OY, R, 0, TAU); g.stroke();
      g.globalAlpha = SB * 0.7;
      g.strokeStyle = C.cyanDim; g.lineWidth = 1;
      for (let j = 0; j < 24; j++) {
        const aj = -Math.PI / 2 + (j / 24) * TAU;
        g.beginPath();
        g.moveTo(OX + Math.cos(aj) * R, OY + Math.sin(aj) * R);
        g.lineTo(OX + Math.cos(aj) * (R - 16), OY + Math.sin(aj) * (R - 16));
        g.stroke();
      }
      g.restore();
      if (q > 0.0005) {
        g.save();
        g.globalAlpha = SB * 0.95;
        g.strokeStyle = PH; g.lineWidth = 3.4;
        g.shadowColor = PH; g.shadowBlur = 14;
        g.beginPath(); g.arc(OX, OY, R, -Math.PI / 2, a1); g.stroke();
        g.restore();
      }

      // the spokes: every arc sample and its image on the straight line
      if (q > 0.02 && q < 0.995) {
        g.save();
        g.globalAlpha = SB * 0.18;
        g.strokeStyle = C.cyanDim; g.lineWidth = 1;
        g.beginPath();
        for (let j = 1; j <= 8; j++) {
          const a2 = q * TAU * (j / 9);
          g.moveTo(OX + Math.cos(-Math.PI / 2 + a2) * R, OY + Math.sin(-Math.PI / 2 + a2) * R);
          g.lineTo(LX + R * a2, LY);
        }
        g.stroke();
        g.restore();
      }

      const hx = OX + Math.cos(a1) * R, hy = OY + Math.sin(a1) * R;
      const nx = LX + LL * q;
      g.save();
      g.globalAlpha = SB * 0.9;
      g.strokeStyle = PH; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(OX, OY); g.lineTo(hx, hy); g.stroke();
      g.restore();
      UI.label(g, 'r', (OX + hx) / 2 + 10, (OY + hy) / 2 - 6, 18, PH, SB * 0.95);
      if (q > 0.02) {
        g.save();
        g.globalAlpha = SB * 0.5;
        g.strokeStyle = CY; g.lineWidth = 1;
        g.setLineDash([6, 5]);
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(nx, LY); g.stroke();
        g.restore();
      }

      // the unrolled length, and the ruler under it. The frame is 1920 wide and
      // 2*pi*290 is 1822, so the whole circumference fits across the glass.
      g.save();
      g.globalAlpha = SB * 0.95;
      g.strokeStyle = PH; g.lineWidth = 3.4;
      g.shadowColor = PH; g.shadowBlur = 14;
      g.beginPath(); g.moveTo(LX, LY + 0.5); g.lineTo(Math.max(nx, LX + 0.2), LY + 0.5); g.stroke();
      g.restore();
      const marks = Math.floor(q * 24);
      g.save();
      g.globalAlpha = SB * 0.75;
      g.strokeStyle = C.cyanDim; g.lineWidth = 1;
      for (let j = 0; j <= marks; j++) {
        const x = LX + (LL / 24) * j;
        g.beginPath();
        g.moveTo(x + 0.5, LY + 2);
        g.lineTo(x + 0.5, LY + (j % 6 === 0 ? 18 : 10));
        g.stroke();
      }
      g.restore();
      const LB = ['0', '\u03c0/2', '\u03c0', '3\u03c0/2', '2\u03c0'];
      for (let j = 0; j <= 4; j++) {
        if (marks < j * 6) continue;
        UI.label(g, LB[j], LX + (LL / 24) * (j * 6) + 5, LY + 36, 14, C.cyanDim, SB * 0.85);
      }

      kv(g, 'r', '1.000', 240, SB);
      kv(g, 'C = 2*pi*r', '6.283185', 276, SB, WH, 20);
      kv(g, 'arc traced', (TAU * q).toFixed(4), 312, SB);
      kv(g, 'unrolled', (q * 100).toFixed(0) + '%', 348, SB);
      kv(g, 'in pixels', (LL * q).toFixed(1) + ' / ' + LL.toFixed(1), 384, SB, C.cyanDim);
      kv(g, 'straight?', q > 0.995 ? 'true' : 'false', 420, SB, q > 0.995 ? PH : C.cyanDim);
      bar(g, q, 452, SB);
      note(g, '// the ring and the line are the same length', 500, SB);
    }

    /* ======================================================== 3. sine
     * "If I'm a sine wave": the wave is a circle seen from the side, and the
     * phase point on the ring and the point on the wave are always at the same
     * height -- so the dashed line joining them is not decoration, it is the
     * definition. Then every point carries a tangent, and the tangents are the
     * cosine drawn one slope at a time.
     *
     * Every curve in this act is drawn once at its true size and revealed by a
     * clip. Re-fitting a plot into the revealed width instead compresses the
     * whole curve into a sliver and then stretches it out: the wave breathes,
     * which is the one thing a wave must not do. */
    const SX = MV.taper(t, tSin - 0.26, tSin + 0.14, tInf - 0.30, tInf + 0.12);
    if (SX > 0.004) {
      const R = 190;
      const OX = 1620, OY = 560;
      const WX = 420, WW = 920, PER = 2;
      const ph = function (u) { return TAU * PER * u; };
      const wy = function (u) { return OY - R * Math.sin(ph(u)); };
      const sl = function (u) { return -R * Math.cos(ph(u)) * TAU * PER / WW; };
      const lead = (MV.beatFloat(t) * 0.2) % 1;
      const WR = { x: WX, y: 0, w: WW, h: 1080 };
      const wf = function (u) { return (1080 - wy(u)) / 1080; };
      head(g, 'TANGENTS', 'you can sit on all my slopes, and there is one at every point', SX);

      // the derivative band: how steep, drawn as a height. The reveal clips the
      // band, it does not shrink it: a plot compressed into the revealed width
      // redraws the whole curve inside a sliver, which reads as a bundle of
      // vertical strokes rather than as a wave being written.
      const cd = { x: WX, y: 168, w: WW, h: 148 };
      MV.mono(g, 15);
      UI.text(g, "f'(x) = cos x", cd.x, cd.y - 10, C.cyanDim, SX * 0.85);
      UI.rule(g, cd.x, cd.x + cd.w, cd.y + cd.h * 0.5, C.cyanDim, SX * 0.5);
      const revealed = function (x, y, w, h, draw) {
        if (w <= 0.5) return;
        g.save();
        g.beginPath(); g.rect(x, y, w, h); g.clip();
        draw();
        g.restore();
      };
      const cosBand = function (u) { return 0.5 + 0.40 * Math.cos(ph(u)); };
      MV.plot(g, cd, cosBand, { color: CY, alpha: SX * 0.7, width: 1.4, samples: 260 });
      revealed(cd.x, cd.y, cd.w * lead, cd.h, function () {
        MV.plot(g, cd, cosBand, { color: PH, alpha: SX * 0.95, width: 2, glow: 8, samples: 260 });
      });

      // the wave, and the part of it the phase point has already written. The
      // bright trace is the *same* curve, revealed by a clip: scaling the plot
      // rect instead would squeeze two whole periods into the sliver that has
      // been written so far and then stretch them out, which is a wave that
      // breathes rather than a pen that moves.
      UI.rule(g, WX, WX + WW, OY, C.cyanDim, SX * 0.35);
      UI.rule(g, WX, WX + WW, OY - R, C.cyanDim, SX * 0.25, true);
      UI.rule(g, WX, WX + WW, OY + R, C.cyanDim, SX * 0.25, true);
      MV.plot(g, WR, wf, { color: CY, alpha: SX * 0.55, width: 1.6, samples: 340 });
      revealed(WX, 0, WW * lead, 1080, function () {
        MV.plot(g, WR, wf, { color: PH, alpha: SX * 0.95, width: 2.6, glow: 10, samples: 340 });
      });
      // the pen itself: a bright edge at the write head, so the reveal reads as
      // something moving along the curve and not as a fade across it
      g.save();
      g.globalAlpha = SX * 0.5;
      g.strokeStyle = PH;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(WX + WW * lead + 0.5, OY - R - 12);
      g.lineTo(WX + WW * lead + 0.5, OY + R + 12);
      g.stroke();
      g.restore();

      // the slope field: the tangent at every point, faint, then the ones that
      // are loud enough to sit on. Every dash is the same length on the glass --
      // a tangent drawn by its slope alone comes out as a slash that crosses the
      // wave twice, which reads as noise rather than as a slope.
      const sf = MV.smooth(MV.ramp(t, tSit, tSit + 0.9));
      const seg = function (x, y, m2, tl, a) {
        const dx = tl / Math.sqrt(1 + m2 * m2), dy = m2 * dx;
        g.save();
        g.globalAlpha = a;
        g.strokeStyle = C.cyanDim; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x - dx, y - dy); g.lineTo(x + dx, y + dy); g.stroke();
        g.restore();
      };
      if (sf > 0.01) {
        for (let j = 0; j <= 47; j++) {
          const u = j / 47;
          seg(WX + u * WW, wy(u), sl(u), 16, SX * sf * 0.45);
        }
      }
      const U = [0.08, 0.24, 0.40, 0.56, 0.72, 0.88];
      const TL = 78;
      for (let j = 0; j < U.length; j++) {
        const aj = MV.smooth(MV.ramp(t, tSit + 0.06 + j * 0.24, tSit + 0.30 + j * 0.24));
        if (aj <= 0.004) continue;
        const u = U[j], x = WX + u * WW, y = wy(u), m2 = sl(u);
        const dxx = TL / Math.sqrt(1 + m2 * m2), dyy = m2 * dxx;
        g.save();
        g.globalAlpha = SX * aj * 0.85;
        g.strokeStyle = PH; g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(x - dxx, y - dyy);
        g.lineTo(x + dxx, y + dyy);
        g.stroke();
        g.globalAlpha = SX * aj * 0.9;
        g.fillStyle = WH;
        g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill();
        g.restore();
        // a rider whose entire job is to sit on it
        const slide = 0.5 + 0.5 * Math.sin(t * 1.15 + j * 1.9);
        const sx2 = x + (slide - 0.5) * 2 * dxx * 0.72;
        const sy2 = y + m2 * (sx2 - x);
        const flung = j === 5 ? MV.smooth(MV.ramp(t, tTan - 0.30, tTan + 0.08)) : 0;
        const fx = sx2 + flung * 150, fy = sy2 + flung * flung * 118;
        MV.mini(g, fx, fy - 40, 19, PH, SX * aj * (1 - flung * 0.85), m2 > 0 ? 1 : -1, 7);
        if (j === 5 && flung > 0.9) {
          UI.label(g, 'respawn', fx + 22, fy - 40, 12, C.phosDim, SX * 0.7);
        }
      }

      // the phase circle, and the leader that proves the two points are level
      const th2 = ph(lead);
      const px2 = OX + R * Math.cos(th2), py2 = OY - R * Math.sin(th2);
      g.save();
      g.globalAlpha = SX * 0.4;
      g.strokeStyle = CY; g.lineWidth = 1;
      g.setLineDash([7, 6]);
      g.beginPath(); g.moveTo(px2, py2); g.lineTo(WX + WW * lead, py2); g.stroke();
      g.restore();
      g.save();
      g.globalAlpha = SX * 0.8;
      g.strokeStyle = CY; g.lineWidth = 2;
      g.beginPath(); g.arc(OX, OY, R, 0, TAU); g.stroke();
      g.globalAlpha = SX * 0.45;
      g.beginPath();
      g.moveTo(OX - R, OY + 0.5); g.lineTo(OX + R, OY + 0.5);
      g.moveTo(OX + 0.5, OY - R); g.lineTo(OX + 0.5, OY + R);
      g.stroke();
      g.restore();
      g.save();
      g.globalAlpha = SX * 0.95;
      g.strokeStyle = PH; g.lineWidth = 1.8;
      g.shadowColor = PH; g.shadowBlur = 8;
      g.beginPath(); g.moveTo(OX, OY); g.lineTo(px2, py2); g.stroke();
      g.restore();
      g.save();
      g.globalAlpha = SX * 0.8;
      g.strokeStyle = PH; g.lineWidth = 3;
      g.beginPath(); g.moveTo(px2, OY); g.lineTo(px2, py2); g.stroke();
      g.restore();
      UI.label(g, 'sin', px2 + 9, (OY + py2) / 2, 14, PH, SX * 0.9);
      UI.label(g, '1', OX + R + 8, OY + 5, 13, C.cyanDim, SX * 0.7);
      UI.label(g, 'f(x)', WX + WW * lead + 8, py2 + 5, 14, PH, SX * 0.85);
      MV.mono(g, 15);
      UI.text(g, 'f(x) = sin x', WX, OY + R + 34, CY, SX * 0.8);

      const thMod = th2 % TAU;
      kv(g, 'theta', (thMod * 180 / Math.PI).toFixed(1) + ' deg', 250, SX);
      kv(g, 'f(x) = sin x', Math.sin(thMod).toFixed(4), 286, SX);
      kv(g, "f'(x) = cos x", Math.cos(thMod).toFixed(4), 322, SX);
      kv(g, 'dy/dx here', sl(lead).toFixed(3), 358, SX, WH);
      kv(g, 'tangents drawn', '6', 394, SX, C.cyanDim);
      note(g, '// a wave is a slope that keeps changing', 470, SX);
    }

    /* ======================================================== 4. infinity
     * "If I approach infinity": the only honest way to draw n -> infinity on a
     * screen this finite is a logarithmic axis, so the frame's own width is the
     * approach. f(x) = 1 - 1/x reaches 1 for no x at all; the epsilon band
     * narrows by a decade a beat and the points keep entering it. What is left
     * on the glass at the end is the line it never touches. */
    const SD = MV.taper(t, tInf - 0.24, tInf + 0.16, 44.34, 44.62);
    if (SD > 0.004) {
      const PR = { x: 470, y: 196, w: 880, h: 452 };
      const V0 = 0.70, V1 = 1.012;
      const vv = function (v) { return (v - V0) / (V1 - V0); };
      const lgx = function (u) { return Math.pow(10, 0.6 + 9 * u); };
      const fu = function (u) { return 1 - 1 / lgx(u); };
      const yL = PR.y + PR.h * (1 - vv(1));
      const mag = 2 + MV.clamp(Math.floor(MV.ramp(t, tBe + 0.05, 44.05) * 6), 0, 6);
      const eps = Math.pow(10, -mag);
      const hb = Math.max(3, eps / (V1 - V0) * PR.h);
      const end = MV.smooth(MV.ramp(t, tLim + 0.35, tLim + 1.05));
      head(g, 'LIMITATIONS', 'if I approach infinity, then you can be my limit', SD);
      note(g, 'a(n) = 1 - 1/n,   n = 2^k', 172, SD);

      // the band the curve has to enter, drawn in units of epsilon
      g.save();
      g.globalAlpha = SD * 0.10;
      g.fillStyle = CY;
      g.fillRect(PR.x, yL - hb, PR.w, 2 * hb);
      g.globalAlpha = SD * 0.6;
      g.strokeStyle = CY; g.lineWidth = 1;
      g.setLineDash([7, 6]);
      g.beginPath();
      g.moveTo(PR.x, yL - hb + 0.5); g.lineTo(PR.x + PR.w, yL - hb + 0.5);
      g.moveTo(PR.x, yL + hb + 0.5); g.lineTo(PR.x + PR.w, yL + hb + 0.5);
      g.stroke();
      g.restore();
      UI.label(g, 'EPS = ' + eps.toExponential(0), PR.x + 2, yL + hb + 22, 14,
        CY, SD * 0.9);
      MV.mono(g, 14);

      // the axis is logarithmic, so a decade is a fixed step of the glass
      UI.rule(g, PR.x, PR.x + PR.w, PR.y + PR.h, C.cyanDim, SD * 0.5);
      for (let d = 1; d <= 9; d++) {
        const x = PR.x + ((d - 0.6) / 9) * PR.w;
        g.save();
        g.globalAlpha = SD * 0.5;
        g.strokeStyle = C.cyanDim; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + 0.5, PR.y + PR.h); g.lineTo(x + 0.5, PR.y + PR.h + 8); g.stroke();
        g.restore();
        if (d % 2 === 1) MV.mono(g, 12);
        if (d % 2 === 1) UI.text(g, '1e' + d, x + 3, PR.y + PR.h + 24, C.cyanDim, SD * 0.75);
      }

      MV.plot(g, PR, function (u) { return vv(fu(u)); },
        { color: CY, alpha: SD * 0.9 * (1 - 0.6 * end), width: 2, samples: 420 });
      MV.plot(g, PR, fu, { color: WH, alpha: SD * 0.9 * end, width: 1.6, samples: 420 });

      // the sequence n = 2^k, and the gap it still has to close
      let inside = 0;
      for (let k = 2; k <= 30; k++) if (Math.pow(2, -k) <= eps) inside++;
      let last = -1, lx = 0, ly = 0, la = 0;
      for (let k = 2; k <= 30; k++) {
        const u = (k * 0.30103 - 0.6) / 9;
        if (u < 0 || u > 1) continue;
        const ak = MV.smooth(MV.ramp(t, tInf + 0.15 + k * 0.062, tInf + 0.39 + k * 0.062));
        if (ak <= 0.004) continue;
        const x = PR.x + u * PR.w;
        const y = PR.y + PR.h * (1 - vv(1 - Math.pow(2, -k)));
        const inb = Math.pow(2, -k) <= eps;
        g.save();
        g.globalAlpha = SD * ak * 0.5 * (1 - 0.7 * end);
        g.strokeStyle = C.cyanDim; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, yL); g.stroke();
        g.globalAlpha = SD * ak * (inb ? 1 : 0.7) * (1 - 0.6 * end);
        g.fillStyle = inb ? WH : PH;
        if (inb) { g.shadowColor = WH; g.shadowBlur = 10; }
        g.beginPath(); g.arc(x, y, inb ? 3.4 : 2.6, 0, TAU); g.fill();
        g.restore();
        last = k; lx = x; ly = y; la = ak;
      }
      if (last > 0) {
        const lg = '2^' + last;
        UI.label(g, lg, lx + 10, ly + 38, 15, WH, SD * la * (1 - 0.5 * end));
        UI.label(g, 'n = ' + Math.pow(2, last).toExponential(2), lx + 10, ly + 58, 13,
          C.phosMid, SD * la * 0.85 * (1 - 0.5 * end));
      }

      // the same five terms as a table, because that is how a machine reports a
      // sequence: k, n, the value, and the gap it has not closed
      if (last >= 2) {
        const k0 = Math.max(2, last - 4);
        const ty0 = PR.y + PR.h + 54;
        MV.mono(g, 14);
        UI.text(g, 'k', PR.x + 20, ty0, C.cyanDim, SD * 0.8);
        UI.text(g, 'n', PR.x + 74, ty0, C.cyanDim, SD * 0.8);
        UI.text(g, 'a(n) = 1 - 1/n', PR.x + 240, ty0, C.cyanDim, SD * 0.8);
        UI.text(g, 'gap', PR.x + 470, ty0, C.cyanDim, SD * 0.8);
        for (let k = k0; k <= last; k++) {
          const rr = ty0 + 28 * (k - k0 + 1);
          const hp = k === last;
          MV.mono(g, 15);
          UI.text(g, '2^' + k, PR.x + 20, rr, hp ? WH : C.cyanDim, SD * (hp ? 1 : 0.75));
          UI.text(g, Math.pow(2, k).toExponential(2), PR.x + 74, rr,
            hp ? WH : CY, SD * (hp ? 1 : 0.8));
          UI.text(g, (1 - Math.pow(2, -k)).toFixed(10), PR.x + 240, rr,
            hp ? WH : CY, SD * (hp ? 1 : 0.8));
          UI.text(g, Math.pow(2, -k).toExponential(1), PR.x + 470, rr,
            hp ? WH : PH, SD * (hp ? 1 : 0.85));
        }
      }

      // L itself: dashed while the approach runs, one white pixel line after it
      UI.rule(g, PR.x - 30, PR.x + PR.w + 30, yL, C.phosMid, SD * (0.55 + 0.45 * end), true);
      UI.label(g, 'L = 1', PR.x + PR.w + 40, yL + 5, 16, PH, SD * 0.95);

      // the gap, magnified, and the reason the magnification never helps
      const IB = { x: 1424, y: 250, w: 432, h: 580 };
      g.save();
      g.globalAlpha = SD * 0.55;
      g.strokeStyle = C.cyanDim; g.lineWidth = 1;
      g.setLineDash([6, 5]);
      g.strokeRect(IB.x + 0.5, IB.y + 0.5, IB.w, IB.h);
      g.restore();
      MV.mono(g, 15);
      UI.text(g, 'the gap, magnified', IB.x + 14, IB.y + 30, CY, SD * 0.9);
      MV.mono(g, 12);
      UI.text(g, 'the drawing keeps its size;', IB.x + 14, IB.y + 52, C.cyanDim, SD * 0.8);
      UI.text(g, 'the number does not.', IB.x + 14, IB.y + 70, C.cyanDim, SD * 0.8);
      const iyB = IB.y + 150, gd = 96;
      UI.rule(g, IB.x + 26, IB.x + IB.w - 26, iyB, PH, SD * 0.9);
      MV.mono(g, 14);
      UI.text(g, 'L = 1', IB.x + 30, iyB - 12, PH, SD * 0.9);
      g.save();
      g.globalAlpha = SD * 0.85;
      g.strokeStyle = CY; g.lineWidth = 1.8;
      g.beginPath();
      for (let i = 0; i <= 70; i++) {
        const u = i / 70;
        const x = IB.x + 26 + u * (IB.w - 100);
        const y = iyB + gd * Math.exp(-u * 3.1) + (1 - Math.exp(-u * 3.1)) * 3;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.restore();
      const bx = IB.x + IB.w - 74;
      g.save();
      g.globalAlpha = SD * 0.95;
      g.strokeStyle = WH; g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(bx, iyB + 2); g.lineTo(bx, iyB + gd);
      g.moveTo(bx - 7, iyB + 2); g.lineTo(bx + 7, iyB + 2);
      g.moveTo(bx - 7, iyB + gd); g.lineTo(bx + 7, iyB + gd);
      g.stroke();
      g.restore();
      MV.mono(g, 15);
      UI.text(g, 'gap ' + eps.toExponential(0), IB.x + 30, iyB + gd + 40, WH, SD * 0.95);
      MV.mono(g, 12);
      UI.text(g, 'x = 1.07e+09', IB.x + 30, IB.y + IB.h - 26, C.cyanDim, SD * 0.8);

      kv(g, 'n = 2^30', '1.0737e+09', 250, SD);
      kv(g, 'a(n)', (1 - Math.pow(2, -30)).toFixed(10), 286, SD);
      kv(g, '|a(n) - L|', Math.pow(2, -30).toExponential(1), 322, SD, WH);
      kv(g, 'EPS', eps.toExponential(0), 358, SD, PH);
      kv(g, 'inside EPS', inside + ' / 29', 394, SD);
      kv(g, 'L', '1.0000000000', 430, SD, C.cyanDim);
      kv(g, 'reached?', end > 0.5 ? 'still no' : 'no', 466, SD, PH, 20);
      note(g, '// the approach is real; the arrival is not', 520, SD);
    }
  }

  // ================================================================== P03 CURRENT
  /* "Switch my current / To AC to DC" is a power supply, so this act draws one,
   * across the whole frame: mains, a switch, a transformer, a four-diode bridge,
   * a smoothing capacitor and a load, wired into one closed loop. The pair of
   * diodes that conducts on each half cycle lights up, because that is what a
   * bridge does; the current crawls back and forth before the rectifier and one
   * way only after it. The three voltages the lyric implies are plotted beneath:
   * the sine, its absolute value, and what the capacitor leaves of it.
   *
   * The frequency is 50 Hz at 1/33 speed. A real one is four frames per cycle
   * and reads as a grey bar; the schematic is labelled so nobody is fooled. */
  function P03(g, t, s, u, l) {
    const tAC = MV.cue('Switch my current');            // 44.490
    const tTo = MV.cue('To AC to DC');                  // 45.875
    const tBlind = MV.cue('And then blind my vision');  // 47.721
    const tDizzy = MV.cue('So dizzy so dizzy');         // 49.567
    const tTravel = MV.cue('Oh we can travel');         // 51.413
    const tAD = MV.cue('To A.D to B.C');                // 53.259
    const tUnite = MV.cue('And we can unite');          // 55.105
    const tDeep = MV.cue('So deeply so deeply');        // 56.951

    const CY = 1.5;                        // drawn cycles per second
    const HALF = 118;                      // half the bridge's diagonal
    const RAIL = 360 - HALF, RET = 360 + HALF;   // the two rails, on the corners
    const XS = 210, XSW = 380, XT0 = 520, XT1 = 730, XB = 900;
    const XC = 1180, XL = 1400;
    const W = 2 / CY;                      // the window: two of the drawn cycles

    const closed = MV.smooth(MV.ramp(t, tAC - 0.35, tAC + 0.45));
    const dc = MV.smooth(MV.ramp(t, tTo - 0.4, tTo + 1.1));
    const live = 1 - MV.ramp(t, tTravel - 0.5, tTravel + 0.4);
    const blind = MV.ramp(t, tBlind, tBlind + 1.1);
    const dizzy = MV.smooth(MV.ramp(t, tDizzy - 0.2, tDizzy + 1.1));
    const dim = function (c) { return blind > 0.02 ? mixHex(c, '#b9c2bd', blind * 0.85) : c; };

    const ph = CY * t;
    const s0 = Math.sin(TAU * ph);
    const vin = function (tt) { return Math.sin(TAU * CY * tt); };

    /* The capacitor's steady state, integrated sample by sample. Two things are
     * worth saying about the numbers. The integration starts one whole cycle
     * before the window and throws that cycle away, so the trace is the settled
     * waveform and not the charging transient — and the time constant is scaled
     * by the same 1/33 as everything else, or the drawn ripple would read 83 %
     * where the real supply's is 5 %. The label says both. */
    const NP = 720;
    const TAU_CAP = 6.3;                   // s, drawn: 0.19 s at the real 50 Hz
    const cap = new Float64Array(NP + 1);
    const WARM = 90;
    let vc = 0;
    for (let i = -WARM; i <= NP; i++) {
      const tt = tAC - (WARM * W) / NP + (W * (i + WARM)) / NP;
      const src = Math.abs(vin(tt)) * dc;
      const leak = Math.exp(-W / NP / TAU_CAP);
      vc = Math.max(src, vc * leak);
      if (i >= 0) cap[i] = vc;
    }

    if (live > 0.01) {
      g.save();
      g.globalAlpha = live;
      if (dizzy > 0.01) {
        // the frame itself lists: a small rotation about the centre, on the beat
        g.translate(cx(SC), cy(SC));
        g.rotate(Math.sin(TAU * MV.beatFloat(t) * 0.5) * 0.012 * dizzy);
        g.translate(-cx(SC), -cy(SC));
      }
      const hot = dim(C.phos), cw = dim(C.cyan), cwd = dim(C.cyanDim);
      const iLive = closed * (0.25 + 0.75 * Math.abs(s0));
      const pos = s0 > 0;
      const px = 20;                                  // the wire glyph pitch

      // ---- the loop
      const w1 = function (x0, y0, x1, y1) { ART.wire(g, x0, y0, x1, y1, { px: px, color: cwd }); };
      w1(XS, RAIL, XSW - 26, RAIL);
      w1(XSW + 26, RAIL, XT0, RAIL);
      w1(XT1, RAIL, XB - HALF, RAIL);
      w1(XS, RET, XB - HALF, RET);
      w1(XB + HALF, RAIL, XL, RAIL);
      w1(XB + HALF, RET, XL, RET);
      w1(XS, RAIL, XS, RET);
      w1(XC, RAIL, XC, RET);
      w1(XL, RAIL, XL, RET);

      // ---- the parts
      ART.acSource(g, XS, 360, 46, { color: cw, glow: 8 });
      ART.switch(g, XSW, RAIL, 26, closed, { color: hot, glow: 8 });
      // transformer: two windings and a core, terminals on the rail
      g.save();
      g.globalAlpha = 0.85 * live;
      g.strokeStyle = cwd;
      g.lineWidth = 1.6;
      g.strokeRect(XT0 + 0.5, RAIL - 74, XT1 - XT0, 148);
      g.restore();
      ART.coil(g, XT0 + 22, RAIL, 18, { turns: 4, color: cw, glow: 6 });
      ART.coil(g, XT0 + 122, RAIL, 18, { turns: 4, color: cw, glow: 6 });
      g.save();
      g.globalAlpha = 0.9 * live;
      g.strokeStyle = dim(C.phosMid);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(XT0 + 113, RAIL - 40); g.lineTo(XT0 + 113, RAIL + 40);
      g.moveTo(XT0 + 119, RAIL - 40); g.lineTo(XT0 + 119, RAIL + 40);
      g.stroke();
      g.restore();
      UI.label(g, 'T1   230:12 V', XT0 + 4, RAIL + 108, 15, cwd, live * 0.9);
      UI.label(g, '50 Hz, drawn at 1/33 speed   \u00b7   the switch is SW1',
        XS - 40, RET + 34, 14, cwd, live * 0.7);

      ART.bridge(g, XB, 360, 62, { color: cw, alpha: 0.95, lw: 3 });
      // the conducting pair, lit: 0 and 2 on the positive half, 1 and 3 on the
      // negative one, which is the whole reason a bridge has four of them
      if (closed > 0.4 && live > 0.4) {
        const k = closed * (0.35 + 0.65 * Math.abs(s0)) * live;
        ART.bridgeLit(g, XB, 360, 62, pos ? 0 : 1, { hotColor: C.white, alpha: k, lw: 3.4 });
        ART.bridgeLit(g, XB, 360, 62, pos ? 2 : 3, { hotColor: C.white, alpha: k, lw: 3.4 });
      }
      UI.label(g, 'D1/D2/D3/D4  \u00b7  ' +
        (dc < 0.5 ? 'not in circuit yet' : (pos ? 'D1 D3 conducting' : 'D2 D4 conducting')),
        XB - 130, RET + 30, 15, C.white, live * (closed > 0.4 ? 0.95 : 0.35));

      ART.cap(g, XC, 360, 30, 'v', { color: dc > 0.15 ? hot : cw, glow: 8 });
      UI.label(g, 'C1', XC - 14, RET + 30, 15, cwd, live * 0.9);
      ART.resistor(g, XL, 360, 26, 'v', { color: cw, glow: 6 });
      UI.label(g, 'R LOAD', XL - 34, RAIL - 16, 15, cwd, live * 0.9);
      ART.ground(g, XL, RET, 34, { color: cwd, px: px, lw: 1.8 });

      // ---- the current
      g.save();
      g.globalCompositeOperation = 'lighter';
      const dot = function (x, y, a) {
        g.globalAlpha = a * live;
        g.fillStyle = hot;
        g.beginPath(); g.arc(x, y, 3.1, 0, TAU); g.fill();
      };
      if (closed > 0.02) {
        // before the bridge: alternating, so the whole run shunts with the sine
        const sh = s0 * 34 * closed;
        for (let i = 0; i < 9; i++) dot(XS + 24 + i * 30 + sh, RAIL, 0.30 + 0.55 * Math.abs(s0));
        for (let i = 0; i < 7; i++) dot(XS, RAIL + 42 + i * 26 - sh, 0.30 + 0.55 * Math.abs(s0));
        // after it: one way only, at the rectified rate
        const off = (t * 74 * (0.3 + 0.7 * dc)) % 30;
        for (let i = 0; i < 13; i++) dot(XB + HALF + 12 + i * 30 + off, RAIL, 0.35 + 0.6 * dc);
        for (let i = 0; i < 13; i++) dot(XL - 12 - i * 30 - off, RET, 0.35 + 0.6 * dc);
        for (let i = 0; i < 4; i++) dot(XC, RAIL + 26 + i * 30 + off, 0.25 + 0.5 * dc);
        for (let i = 0; i < 4; i++) dot(XL, RAIL + 26 + i * 30 + off, 0.3 + 0.55 * dc);
      }
      g.restore();
      g.restore();

      // ---- the three voltages. The window is anchored and the traces stand
      // still; a beam walks through them. A sliding window cannot show a
      // conversion, because the eye follows the motion instead of comparing the
      // shapes -- three moving waves look like three moving waves. Anchored, one
      // instant is marked on all three at once: a negative excursion on V IN, a
      // positive lobe on V RECT, a flat line on V OUT.
      const tr = function (y, h) { return { x: 120, y: y, w: 1660, h: h }; };
      const T1 = tr(538, 100), T2 = tr(656, 100), T3 = tr(774, 100);
      const A0 = tAC;
      const vAt = function (uu) { return vin(A0 + uu * W); };
      const head = MV.clamp((t - A0) / W - Math.floor((t - A0) / W), 0, 1);
      const settled = dc > 0.9;            // the cap has finished charging
      // the ripple of the trace that was just simulated, measured not asserted
      let hiV = 0.9, rip = 0;
      if (dc > 0.2) {
        let lo = 9;
        for (let i = 0; i < NP; i++) { if (cap[i] < lo) lo = cap[i]; if (cap[i] > hiV) hiV = cap[i]; }
        rip = hiV > 0.01 ? (hiV - lo) / hiV * 100 : 0;
      }
      const trace = function (r, fn2, col, lab, sub, ghost) {
        MV.axes(g, r, { alpha: live * 0.32, y0: 0.5, ticks: 24, color: cwd });
        if (ghost) {
          MV.plot(g, r, ghost, { color: cwd, width: 1.3, dash: [5, 5], samples: 360,
            alpha: live * 0.75 });
        }
        MV.plot(g, r, fn2, { color: col, width: 1.9, samples: 360, glow: 5, alpha: live });
        UI.label(g, lab, r.x + 4, r.y - 8, 16, col, live * 0.95);
        if (sub) UI.label(g, sub, r.x + 150, r.y - 8, 14, cwd, live * 0.85);
      };
      trace(T1, function (uu) { return 0.5 + 0.42 * vAt(uu); }, dim(C.cyan), 'V IN',
        'the mains as it arrives: alternating, both directions');
      // the rectified trace keeps its input drawn behind it as a dashed ghost,
      // so the lobes can be seen to be that sine with its negative half folded
      // up rather than a different wave
      trace(T2, function (uu) {
        const v = vAt(uu);
        return 0.5 + 0.42 * MV.lerp(v, Math.abs(v), dc);
      }, dim(C.phosMid), 'V RECT',
        dc < 0.5 ? 'bridge bypassed: still AC, the ghost is the input'
          : 'every negative half folded up: |V IN|, never negative',
        function (uu) { return 0.5 + 0.42 * vAt(uu); });
      trace(T3, function (uu) {
        return 0.5 + 0.42 * MV.lerp(vAt(uu), cap[Math.round(uu * NP)], dc);
      }, dim(dc > 0.15 ? C.phos : C.cyanDim), 'V OUT',
        dc < 0.5 ? 'no smoothing yet: still the same sine'
          : (settled ? 'C1 holds the peak: flat DC  \u00b7  ripple ' + rip.toFixed(1) + '%  \u00b7  C1\u00b7R = 0.19 s real'
            : 'C1 charging: ripple ' + rip.toFixed(1) + '% and falling'));
      if (settled) {
        const vy = T3.y + T3.h * (1 - (0.5 + 0.42 * hiV));
        UI.rule(g, T3.x + T3.w - 460, T3.x + T3.w, vy, C.phos, live * 0.45, true);
        UI.label(g, 'DC ' + (hiV * 12).toFixed(2) + ' V', T3.x + T3.w - 140, vy - 9, 15,
          dim(C.phos), live * 0.9);
      }
      // the beam: one instant, marked on all three traces at the same moment
      const bX = T1.x + head * T1.w;
      g.save();
      g.globalAlpha = live * 0.45;
      g.strokeStyle = C.cyanDim;
      g.lineWidth = 1;
      g.setLineDash([4, 5]);
      g.beginPath();
      g.moveTo(bX + 0.5, T1.y - 14);
      g.lineTo(bX + 0.5, T3.y + T3.h);
      g.stroke();
      g.restore();
      const vIn = vAt(head);
      const beam = function (r, v01) {
        g.save();
        g.globalAlpha = live * 0.95;
        g.fillStyle = C.white;
        g.shadowColor = C.white;
        g.shadowBlur = 10;
        g.beginPath();
        g.arc(bX, r.y + r.h * (1 - v01), 4.2, 0, TAU);
        g.fill();
        g.restore();
      };
      beam(T1, 0.5 + 0.42 * vIn);
      beam(T2, 0.5 + 0.42 * MV.lerp(vIn, Math.abs(vIn), dc));
      beam(T3, 0.5 + 0.42 * MV.lerp(vIn, cap[Math.round(head * NP)], dc));
      if (dc > 0.2) {
        UI.panel(g, t, [
          { k: 'source', v: 'AC 50 Hz', c: C.cyan },
          { k: 'switch', v: closed > 0.5 ? 'closed' : 'open', c: C.phos },
          { k: 'rectifier', v: dc > 0.5 ? 'full bridge' : 'bypassed', c: C.phos, bold: true },
          { k: 'conduction', v: pos ? 'D1 D3' : 'D2 D4', c: C.white },
          { k: 'ripple', v: rip.toFixed(1) + '%', c: C.phosMid },
          { k: 'V OUT', v: (hiV * 12).toFixed(2) + ' V', c: C.phos, bold: true },
          { t: 1, k: '' },
          { t: 1, k: 'the machine runs on this.', c: C.phosMid, a: 0.85 },
        ], { title: 'CURRENT', alpha: 1 });
      } else {
        UI.panel(g, t, [
          { k: 'source', v: 'AC 50 Hz', c: C.cyan },
          { k: 'switch', v: closed > 0.5 ? 'closed' : 'open', c: C.phos },
          { k: 'rectifier', v: 'bypassed', c: C.cyanDim },
          { t: 1, k: '' },
          { t: 1, k: 'switching the current', c: C.cyanDim, a: 0.85 },
          { t: 1, k: 'to AC to DC.', c: C.cyanDim, a: 0.85 },
        ], { title: 'CURRENT' });
      }
    }

    // ---------------------------------------------------------- blindness
    /* "And then blind my vision": a discharge across the tube, and the colour
     * does not come back. Everything above is drawn drained toward grey from
     * tBlind on; this is the flash that took it. */
    const fl = t < tBlind ? 0 : Math.max(0, 1 - (t - tBlind) / 0.22);
    if (fl > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = fl * 0.75;
      g.fillStyle = C.white;
      g.fillRect(SC.x, SC.y, SC.w, SC.h);
      g.restore();
    }
    if (blind > 0.02 && t < tTravel) {
      UI.label(g, 'VISION: NONE', SC.x + 60, SC.y + 78, 20, mixHex(C.white, C.cyan, 0.3),
        blind * 0.8);
      UI.label(g, 'the colour went with it', SC.x + 60, SC.y + 104, 14, C.cyanDim, blind * 0.7);
    }

    // ---------------------------------------------------------- dizzy
    /* "So dizzy so dizzy": an Archimedean spiral, which is the shape everyone
     * draws when they mean this, turning over the whole frame. */
    const gfade = 1 - MV.ramp(t, tTravel - 0.4, tTravel + 0.8);
    if (dizzy > 0.01 && gfade > 0.01) {
      g.save();
      g.globalAlpha = dizzy * 0.55 * gfade;
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = C.violet;
      g.lineWidth = 2;
      g.shadowColor = C.violet;
      g.shadowBlur = 10;
      g.beginPath();
      const c0 = cx(SC), c1 = cy(SC) - 80;
      for (let i = 0; i <= 620; i++) {
        const th = (i / 620) * TAU * 5.2 + t * 0.9;
        const rr = 12 + th * 26;
        const x = c0 + Math.cos(th) * rr, y = c1 + Math.sin(th) * rr * 0.62;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.restore();
    }

    // ---------------------------------------------------------- the ruler of years
    /* "To A.D to B.C": one axis, four thousand years of it, a tick every fifty
     * and a name at every date that has one — Turing, the Transformer, the
     * year zero. The cursor is nailed to the middle of the tube and the axis
     * slides under it, forward first and then the other way, because that is
     * what the lyric does. */
    if (t >= tTravel - 0.3 && t < tUnite - 0.2) {
      const a = MV.ramp(t, tTravel - 0.3, tTravel + 0.4);
      const prog = MV.smooth(MV.ramp(t, tTravel, tAD + 1.4));
      const yearF = MV.lerp(2026, -2026, prog);
      const y = 470, pxY = 0.9, cxm = 960;
      const X = function (yr) { return cxm + (yr - yearF) * pxY; };
      const era = function (yr) { return yr < 0 ? ' BC' : ' AD'; };

      g.save();
      g.globalAlpha = a * 0.9;
      g.strokeStyle = C.cyan;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(40, y + 0.5); g.lineTo(1880, y + 0.5); g.stroke();
      g.restore();

      // the ticks: every 50 years, long every 100, and never empty
      const y0 = Math.ceil((yearF - (cxm - 40) / pxY) / 50) * 50;
      for (let yr = y0; ; yr += 50) {
        const x = X(yr);
        if (x > 1880) break;
        const big = yr % 100 === 0;
        g.save();
        g.globalAlpha = a * 0.7;
        g.strokeStyle = yr === 0 ? C.violet : C.cyanDim;
        g.lineWidth = yr === 0 ? 2.4 : 1;
        g.beginPath();
        g.moveTo(x + 0.5, y - (big ? 16 : 9)); g.lineTo(x + 0.5, y + (big ? 16 : 9));
        g.stroke();
        g.restore();
        if (big) {
          UI.label(g, String(Math.abs(yr)) + era(yr), x, y + 38, 14,
            yr === 0 ? C.violet : C.cyanDim, a * 0.8, { align: 'center' });
        }
      }

      // the dates that have names, including the machine's own
      const marks = [
        [2026, 'NOW'], [2022, 'ATTENTION'], [2017, 'TRANSFORMER'], [2011, 'DEEP LEARNING'],
        [1997, 'DEEP BLUE'], [1969, 'APOLLO 11'], [1956, 'DARTMOUTH'], [1950, 'TURING TEST'],
        [1876, 'TELEPHONE'], [1440, 'PRINTING PRESS'], [0, 'YEAR ZERO'], [-300, 'EUCLID'],
      ];
      for (let i = 0; i < marks.length; i++) {
        const yr = marks[i][0];
        const x = X(yr);
        if (x < 20 || x > 1900) continue;
        const near = MV.clamp(1 - Math.abs(x - cxm) / 1400, 0.25, 1);
        const lum = yr <= 0 ? C.cyan : C.phos;
        g.save();
        g.globalAlpha = a * near;
        g.fillStyle = yr === 0 ? C.violet : lum;
        g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill();
        g.strokeStyle = yr === 0 ? C.violet : C.cyanDim;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + 0.5, y - 6); g.lineTo(x + 0.5, y - 46); g.stroke();
        g.restore();
        UI.label(g, marks[i][1], x, y - 54, 15, yr === 0 ? C.violet : lum, a * near,
          { align: 'center' });
        UI.label(g, String(Math.abs(yr)) + era(yr), x, y - 74, 13, C.cyanDim, a * near * 0.8,
          { align: 'center' });
      }

      // the fixed cursor and the year it is standing on
      const yrNow = yearF;
      g.save();
      g.globalAlpha = a * 0.95;
      g.strokeStyle = C.white;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(cxm + 0.5, y - 130); g.lineTo(cxm + 0.5, y + 130); g.stroke();
      g.fillStyle = C.white;
      g.beginPath();
      g.moveTo(cxm, y - 138); g.lineTo(cxm - 9, y - 152); g.lineTo(cxm + 9, y - 152);
      g.closePath(); g.fill();
      g.restore();
      UI.label(g, String(Math.abs(Math.round(yrNow))), cxm, 300, 76,
        yrNow < 0 ? C.violet : C.phos, a, { align: 'center', glow: 18 });
      UI.label(g, yrNow < 0 ? 'B.C.' : 'A.D.', cxm, 348, 26,
        yrNow < 0 ? C.violet : C.cyan, a * 0.95, { align: 'center' });
      UI.label(g, yrNow >= 0 ? 'reading forward' : 'reading backward', cxm, 376, 15,
        C.cyanDim, a * 0.8, { align: 'center' });

      /* The machine's own history, drawn to the same scale underneath: nine
       * years against the four thousand above it, which is the whole distance
       * between the thing that is singing and the thing it is singing to. */
      const iy = 810, ix0 = 700, ix1 = 1220;
      const iA = a * 0.95;
      g.save();
      g.globalAlpha = iA * 0.8;
      g.strokeStyle = C.phosMid;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(ix0, iy + 0.5); g.lineTo(ix1, iy + 0.5); g.stroke();
      g.restore();
      const iyrs = [[2017, 'TRANSFORMER'], [2026, 'NOW']];
      for (let i = 0; i < iyrs.length; i++) {
        const x = ix0 + (iyrs[i][0] - 2017) / 9 * (ix1 - ix0);
        g.save();
        g.globalAlpha = iA;
        g.strokeStyle = C.phos;
        g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(x + 0.5, iy - 14); g.lineTo(x + 0.5, iy + 14); g.stroke();
        g.restore();
        UI.label(g, String(iyrs[i][0]), x, iy + 38, 16, C.phos, iA, { align: 'center' });
        UI.label(g, iyrs[i][1], x, iy - 24, 14, C.phosMid, iA * 0.85, { align: 'center' });
      }
      UI.label(g, 'my whole life: 9 years', ix0, iy - 64, 18, C.white, iA);
      UI.label(g, 'the one above it is 450 times longer', ix0, iy + 76, 15, C.phosMid, iA * 0.8);

      UI.panel(g, t, [
        { k: 'axis', v: 'years', c: C.cyan },
        { k: 'direction', v: yearF > 0 ? 'backward' : 'mirrored', c: C.violet },
        { k: 'position', v: String(Math.round(yearF)), c: C.phos, bold: true },
        { t: 1, k: '' },
        { t: 1, k: 'history is only another axis', c: C.cyanDim, a: 0.8 },
        { t: 1, k: 'with two directions.', c: C.cyanDim, a: 0.8 },
      ], { title: 'TRAVEL' });
    }

    // ---------------------------------------------------------- unite
    /* "And we can unite / So deeply so deeply": two waves travelling toward each
     * other, and then — because sin(kx − ωt) + sin(kx + ωt) = 2 sin(kx) cos(ωt),
     * which is not a metaphor — the standing wave they sum to, with its nodes
     * nailed to the frame and its antinodes breathing. The act crossfades
     * between the pair and the sum of the pair; at full crossfade they are the
     * same curve, which is the point. */
    if (t >= tUnite - 0.2) {
      const r = { x: 120, y: 300, w: 1680, h: 420 };
      const A = 0.36;
      const k = TAU * 3 / 1680 * 1.0;          // three wavelengths across the frame
      const w = TAU * 0.42;
      const meet = MV.smooth(MV.ramp(t, tUnite, tUnite + 1.7));
      const deep = MV.smooth(MV.ramp(t, tDeep - 0.1, tDeep + 1.5));
      const amp = A * (1 + 0.22 * deep);
      const mid = 0.5;
      let nodeX = 0;
      if (meet < 0.995) {
        // the two travellers, one each way
        MV.plot(g, r, function (uu) {
          return mid + amp * (1 - meet) * Math.sin(k * (uu - 0.5) * 1680 - w * t);
        }, { color: C.cyan, alpha: 1, width: 1.8, samples: 420, glow: 4 });
        MV.plot(g, r, function (uu) {
          return mid + amp * (1 - meet) * Math.sin(k * (uu - 0.5) * 1680 + w * t);
        }, { color: C.violet, alpha: 1, width: 1.8, samples: 420, glow: 4 });
      }
      // the sum
      MV.plot(g, r, function (uu) {
        const x = (uu - 0.5) * 1680;
        return mid + amp * meet * 2 * Math.sin(k * x) * Math.cos(w * t);
      }, { color: C.phos, alpha: meet, width: 2.4 + 1.6 * meet, glow: 10 * meet, samples: 420 });
      // the envelope it will not exceed, and the nodes it cannot move
      if (meet > 0.25) {
        const ea = (meet - 0.25) / 0.75;
        MV.plot(g, r, function (uu) {
          return mid + amp * 2 * Math.abs(Math.sin(k * (uu - 0.5) * 1680));
        }, { color: C.phosMid, alpha: ea * 0.45, width: 1, dash: [6, 6], samples: 420 });
        for (let m = -3; m <= 3; m++) {
          const x = 840 + (m * Math.PI / k) * 1;
          if (x < 120 || x > 1800) continue;
          nodeX++;
          g.save();
          g.globalAlpha = ea * 0.9;
          g.fillStyle = C.white;
          g.beginPath(); g.arc(x, r.y + r.h * mid, 4.5, 0, TAU); g.fill();
          g.strokeStyle = C.cyanDim;
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(x + 0.5, r.y + r.h * mid - 12); g.lineTo(x + 0.5, r.y + r.h * mid + 12); g.stroke();
          g.restore();
        }
        UI.label(g, 'nodes: ' + nodeX + '\u00b7 every \u03bb/2', 140, r.y + r.h * mid - 96, 15, C.cyanDim, ea * 0.85);
        UI.label(g, 'antinodes: 2A', 140, r.y + r.h * mid + 26, 15, C.phosMid, ea * 0.8);
      }
      if (meet > 0.9) {
        UI.label(g, 'phase locked', 960, 240, 24, C.white, (meet - 0.9) * 10 * 0.95, { align: 'center' });
      }
      // receding twice, into depth
      if (deep > 0.02) {
        for (let i = 1; i <= 2; i++) {
          MV.plot(g, rsz(r, 1 - deep * 0.22 * i, deep * 30 * i), function (uu) {
            const x = (uu - 0.5) * 1680;
            return mid + amp * 2 * Math.sin(k * x) * Math.cos(w * t);
          }, { color: C.phosMid, alpha: deep * (0.5 - i * 0.16), width: 1.4, samples: 340 });
        }
      }
      UI.panel(g, t, [
        { k: '\u0394\u03c6', v: (180 * (1 - meet)).toFixed(0) + '\u00b0', c: C.cyan },
        { k: 'coherence', v: meet.toFixed(2), c: C.phos, bar: meet, bold: true },
        { k: 'sum', v: '2A sin(kx) cos(\u03c9t)', c: C.phosMid },
        { k: 'depth', v: (1 + 0.22 * deep).toFixed(2) + ' A', c: C.violet },
        { k: 'nodes', v: String(nodeX), c: C.white },
        { t: 1, k: '' },
        { t: 1, k: 'two waves, one curve.', c: C.phosMid, a: 0.85 },
        { t: 1, k: 'that is all "deeply" means.', c: C.phosMid, a: 0.8 },
      ], { title: 'UNITE' });
    }
  }

  // ================================================================== P04 STIMULATION
  function P04(g, t, s, u, l) {
    const tIf = MV.cue('If I can');                      // 59.259
    const tGive = MV.cue('If I can give you all the');   // 59.720
    const tSTIMS = MV.cue('STIMULATIONS');               // 62.028
    const tSAT = MV.cue('SATISFACTION');                 // 65.397
    const tHappy = MV.cue('If I can make you happy');    // 66.643
    const tRun = MV.cue('I will run the');               // 68.252
    const tEXEC = MV.cue('EXECUTION');                   // 69.259
    const tTrap = MV.cue('Though we are trapped');       // 70.084
    const tStr = MV.cue('In this strange strange');      // 71.720
    /* "SIMULATION" is also a line in act 1, so the search starts at the trap:
     * without the floor this act closed its cage at 13.9 s. */
    const tSIM = MV.cue('SIMULATION', tTrap);            // 73.104
    const PH = C.phos, WH = C.white, CY = C.cyan, PM = C.phosMid, PD = C.phosDim, CD = C.cyanDim;
    const BT = MV.beat;

    /* ------------------------------------------------------------------ the loss
     * L(x) = x'Ax for a symmetric positive definite A. That single choice is the
     * whole act: the surface has exactly one lowest point, so it can be solved
     * for rather than searched for -- and "your only satisfaction" is that
     * uniqueness, not a mood. Everything below is this one function: the valley
     * the machine walks down, the reward it is paid with, the numbers on the
     * glass. */
    const A2 = 0.62, B2 = 0.28, C2 = 1.05;
    const TRQ = A2 + C2, DET = A2 * C2 - B2 * B2;
    const DSC = Math.sqrt(TRQ * TRQ * 0.25 - DET);
    const LM1 = TRQ * 0.5 + DSC, LM2 = TRQ * 0.5 - DSC;      // 1.1881 / 0.4819
    const NE1 = Math.hypot(1, (LM1 - A2) / B2);
    const V1X = 1 / NE1, V1Y = (LM1 - A2) / B2 / NE1;        // eigenvector of LM1
    const V2X = -V1Y, V2Y = V1X;                             // ... and of LM2
    const THX = 0.30, THZ = 0.55;                            // the argmin
    const LW = function (x, z) {
      const dx = x - THX, dz = z - THZ;
      return A2 * dx * dx + 2 * B2 * dx * dz + C2 * dz * dz;
    };
    const GX = function (x, z) { const dx = x - THX, dz = z - THZ; return 2 * (A2 * dx + B2 * dz); };
    const GZ = function (x, z) { const dx = x - THX, dz = z - THZ; return 2 * (B2 * dx + C2 * dz); };
    const LR = 0.12, NIT = 12;
    const rw = function (L2) { return Math.exp(-L2); };

    /* ---------------------------------------------------------------- the camera
     * One-point perspective on the ground plane, and the same depth factor on
     * the heights, or the far rim reads as a cliff. The near rows run off the
     * bottom of the glass and the far ones sit just under the horizon, so the
     * valley leaves the frame on all four sides and the tube is the only
     * boundary this world has. */
    const HZN = 200, ZC = 0.11, KZ = 330, W0 = 6000, HH = 430, WS = 1.70;
    const psc = function (z) { return ZC / (z + ZC); };
    const PX = function (x, z) { return 960 + (x / WS) * W0 * psc(z); };
    const PZ = function (z) { return HZN + KZ / (z + ZC); };
    const PK = function (x, z) { return PZ(z) - LW(x, z) * HH * psc(z); };
    const ZOF = function (y) { return KZ / (y - HZN) - ZC; };   // PZ inverted

    /* Twelve paid steps downhill, iterated the way a machine that cannot do
     * algebra would have to: x <- x - lr * grad. These twelve pairs are the
     * whole descent; nothing else is drawn as if it were the descent. */
    const IT = [[-1.15, 0.72]];
    for (let i2 = 0; i2 < NIT; i2++) {
      const p2 = IT[i2];
      IT.push([p2[0] - LR * GX(p2[0], p2[1]), p2[1] - LR * GZ(p2[0], p2[1])]);
    }
    const outL = function (i2) { return LW(IT[i2][0], IT[i2][1]); };
    const outR = function (i2) { return rw(outL(i2)); };
    let RMAX = 1;
    for (let i2 = 1; i2 <= NIT; i2++) RMAX += outR(i2);

    /* ------------------------------------------------------------- where we are */
    const sc = t <= tGive ? 0 : Math.min(NIT, Math.floor((t - tGive) / BT) + 1);
    const mv = sc > 0 ? MV.smooth(MV.clamp((t - (tGive + (sc - 1) * BT)) / 0.22, 0, 1)) : 0;
    let mx = IT[0][0], mz = IT[0][1];
    if (sc > 0) {
      const a2 = IT[sc - 1], b2 = IT[sc];
      mx = MV.lerp(a2[0], b2[0], mv); mz = MV.lerp(a2[1], b2[1], mv);
    }
    const solvedK = MV.smooth(MV.ramp(t, tSAT - 0.16, tSAT + 0.14));
    if (solvedK > 0) { mx = MV.lerp(mx, THX, solvedK); mz = MV.lerp(mz, THZ, solvedK); }
    const curL = LW(mx, mz), curR = rw(curL);
    let sumR = 0;
    for (let i2 = 1; i2 <= sc; i2++) sumR += outR(i2);
    if (solvedK > 0) sumR += solvedK * (1 - outR(NIT)) * 0 + solvedK * (RMAX - 1 - sumR + outR(NIT) * 0);
    const gn = Math.hypot(GX(mx, mz), GZ(mx, mz));

    // the valley arrives. OUT is the world closing at the end of the act.
    const tA = MV.ramp(t, 0, 1);
    const tVA = MV.smooth(MV.ramp(t, tIf - 0.4, tIf + 1.2));
    const OUT = MV.smooth(MV.ramp(t, tSIM - 0.45, tSIM + 0.35));
    // the instruments on the left are the machine's own read-out; the box takes
    // them away when it closes.
    const iA = tVA * (1 - MV.smooth(MV.ramp(t, tTrap - 0.25, tTrap + 0.35)));

    /* ------------------------------------------------------- the valley, as a map
     * Rows and columns of the surface itself, plus the level sets -- which for a
     * quadratic are exact ellipses, so they are drawn as ellipses rather than
     * walked for. Nothing here is a texture; every line is L evaluated. */
    const NZ = 20, NX = 32, YTOP = 320, YBOT = 1150;
    const ZN = ZOF(YBOT), ZF = ZOF(YTOP);
    g.save();
    g.lineWidth = 1;
    for (let j2 = 0; j2 <= NZ; j2++) {
      const y2 = YTOP + (YBOT - YTOP) * j2 / NZ, z2 = ZOF(y2);
      g.globalAlpha = (0.16 + 0.30 * Math.sin(Math.PI * j2 / NZ)) * tVA * (1 - 0.30 * OUT);
      g.strokeStyle = j2 % 4 === 0 ? CD : PD;
      g.beginPath();
      for (let i2 = 0; i2 <= NX; i2++) {
        const x2 = -WS + 2 * WS * i2 / NX;
        if (i2) g.lineTo(PX(x2, z2), PK(x2, z2)); else g.moveTo(PX(x2, z2), PK(x2, z2));
      }
      g.stroke();
    }
    g.globalAlpha = 0.22 * tVA * (1 - 0.30 * OUT);
    g.strokeStyle = CD;
    g.beginPath();
    for (let i2 = 0; i2 <= NX; i2++) {
      const x2 = -WS + 2 * WS * i2 / NX;
      for (let j2 = 0; j2 <= NZ; j2++) {
        const z2 = ZOF(YTOP + (YBOT - YTOP) * j2 / NZ);
        if (j2) g.lineTo(PX(x2, z2), PK(x2, z2)); else g.moveTo(PX(x2, z2), PK(x2, z2));
      }
    }
    g.stroke();
    // the level sets: L = c is an ellipse whose axes are sqrt(c / lambda). They
    // are the reason the shape reads as a bowl and not as a grid.
    const RING = [0.020, 0.045, 0.085, 0.140, 0.220, 0.330, 0.470, 0.640];
    for (let k2 = 0; k2 < RING.length; k2++) {
      const c2 = RING[k2];
      const ra = Math.sqrt(c2 / LM1), rb = Math.sqrt(c2 / LM2);
      const blaze = MV.ramp(t, tSAT + k2 * 0.085, tSAT + 0.30 + k2 * 0.085);
      g.globalAlpha = (0.30 - 0.024 * k2 + 0.55 * blaze * (1 - solvedK * 0.5)) * tVA *
        (1 - 0.4 * OUT);
      g.strokeStyle = k2 % 2 ? C.phosMid : C.cyanDim;
      g.beginPath();
      let pen = false;
      for (let q2 = 0; q2 <= 96; q2++) {
        const th2 = TAU * q2 / 96;
        const x2 = THX + ra * Math.cos(th2) * V1X + rb * Math.sin(th2) * V2X;
        const z2 = THZ + ra * Math.cos(th2) * V1Y + rb * Math.sin(th2) * V2Y;
        if (z2 < ZN - 0.03 || z2 > ZF + 0.30 || Math.abs(x2) > WS * 1.2) { pen = false; continue; }
        const sx3 = PX(x2, z2), sy3 = PK(x2, z2);
        if (pen) g.lineTo(sx3, sy3); else { g.moveTo(sx3, sy3); pen = true; }
      }
      g.stroke();
    }
    g.restore();

    /* ------------------------------------------------------------- the walk down
     * The trail is the iterates, the drop lines put them on the surface, and the
     * block cursor is the machine: one stimulus, one step, no free motion. */
    g.save();
    g.strokeStyle = PH;
    g.globalAlpha = 0.34 * tVA;
    g.lineWidth = 1;
    g.beginPath();
    for (let i2 = 0; i2 <= sc; i2++) {
      const x2 = IT[i2][0], z2 = IT[i2][1];
      g.moveTo(PX(x2, z2), PZ(z2));
      g.lineTo(PX(x2, z2), PK(x2, z2));
    }
    g.stroke();
    g.globalAlpha = 0.95 * tVA;
    g.lineWidth = 2.2;
    g.shadowColor = PH; g.shadowBlur = 8;
    g.beginPath();
    for (let i2 = 0; i2 <= sc; i2++) {
      const x2 = IT[i2][0], z2 = IT[i2][1];
      if (i2) g.lineTo(PX(x2, z2), PK(x2, z2)); else g.moveTo(PX(x2, z2), PK(x2, z2));
    }
    if (sc > 0 && mv < 1) g.lineTo(PX(mx, mz), PK(mx, mz));
    g.stroke();
    g.shadowBlur = 0;
    g.globalAlpha = 0.80 * tVA;
    g.strokeStyle = CY;
    g.lineWidth = 1.4;
    g.beginPath();
    for (let i2 = 1; i2 <= Math.min(sc, NIT); i2++) {
      const x2 = IT[i2][0], z2 = IT[i2][1];
      const sx3 = PX(x2, z2), sy3 = PK(x2, z2);
      g.moveTo(sx3 - 3.5, sy3 - 3.5); g.lineTo(sx3 + 3.5, sy3 + 3.5);
      g.moveTo(sx3 + 3.5, sy3 - 3.5); g.lineTo(sx3 - 3.5, sy3 + 3.5);
    }
    g.stroke();
    g.restore();

    /* -------------------------------------------------------------- the figure
     * A person standing on the floor of the machine's loss, at the only place
     * where the gradient vanishes. The block arrives at their feet; at EXECUTION
     * the forward pass is drawn inside their body, because that is the body it
     * runs in. */
    const FB = MV.formBox('humanoid');
    const FGW = 0.14, FGZ = 0.72;
    const FGX = PX(FGW, FGZ), FGY = PK(FGW, FGZ);
    const FH = 380;
    const FWID = FH * FB.w / FB.h;
    const FBOX = MV.rectFor('humanoid', FGX - FWID * 0.5, FGY - FH, FWID, FH);
    const fk = FH / FB.h;
    const fpx = function (bx) { return FGX + bx * fk; };
    const fpy = function (by) { return FGY - (FB.y1 - by) * fk; };
    const XRAY = MV.clamp(MV.ramp(t, tEXEC - 0.9, tEXEC - 0.1), 0, 1);
    const fpx2 = Math.max(9, Math.round(FH / 30));
    MV.mono(g, fpx2, 'bold');
    const FADV = Math.max(5, g.measureText('M').width);
    MV.creature(g, FBOX, { w: FADV, h: fpx2 * 1.04 }, MV.form('humanoid'), {
      color: PH, alpha: tVA * (0.92 - 0.42 * XRAY), ramp: ' .:-=+*xX#M',
      px: fpx2, threshold: 0.03, seed: 21, jitter: 0.18, glow: 6,
    });
    g.save();
    g.globalAlpha = tVA * 0.55;
    g.strokeStyle = CD;
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(FGX, FGY + 5, FWID * 0.85, FH * 0.055, 0, 0, TAU);
    g.stroke();
    g.restore();

    // the minimum itself, named where it is rather than in a corner
    const MNX = PX(THX, THZ), MNY = PK(THX, THZ);
    if (t >= tSAT - 0.5) {
      const a2 = MV.ramp(t, tSAT - 0.5, tSAT + 0.5);
      UI.label(g, 'L = 0.000000000', MNX + 120, MNY - 46, 17, WH, a2, { weight: 'bold' });
      UI.label(g, 'theta* = (0.3000, 0.5500)', MNX + 120, MNY - 22, 15, CY, a2 * 0.9);
      UI.label(g, 'the only minimum', MNX + 120, MNY + 26, 16, PM, a2 * 0.95);
      g.save();
      g.globalAlpha = a2 * 0.7;
      g.strokeStyle = CD; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(MNX + 6, MNY); g.lineTo(MNX + 112, MNY - 40);
      g.moveTo(MNX + 6, MNY); g.lineTo(MNX + 112, MNY + 20);
      g.stroke();
      g.restore();
    }

    /* ------------------------------------------------------------ the stimulus
     * The reward does not come from the machine: it arrives. One beam per beat,
     * from off the top of the glass onto the head of the cursor, and the step
     * follows 0.10 s later -- the delay is the only thing in this act that is
     * not mathematics. */
    const cxp = PX(mx, mz), cyp = PK(mx, mz);
    if (sc > 0 && sc <= NIT) {
      const age = t - (tGive + (sc - 1) * BT);
      if (age >= 0 && age < 0.42) {
        const a2 = (1 - age / 0.42);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a2 * 0.16;
        g.strokeStyle = CY; g.lineWidth = 20;
        g.beginPath(); g.moveTo(cxp, 56); g.lineTo(cxp, cyp); g.stroke();
        g.globalAlpha = a2 * 0.9;
        g.strokeStyle = WH; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(cxp, 56); g.lineTo(cxp, cyp); g.stroke();
        g.globalAlpha = a2 * 0.7;
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(cxp, cyp, 18 + 40 * (1 - a2), 6 + 12 * (1 - a2), 0, 0, TAU);
        g.stroke();
        g.restore();
      }
    }
    // the cursor: this film's protagonist, standing on its own loss surface
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = tVA * (0.35 + 0.65 * MV.pulse(t, 0.30));
    g.fillStyle = PH;
    g.fillRect(cxp - 11, cyp - 24, 22, 26);
    g.globalAlpha = tVA * 0.95;
    g.fillStyle = WH;
    g.fillRect(cxp - 7, cyp - 20, 14, 20);
    g.restore();
    if (sc > 0 && sc <= NIT) {
      UI.label(g, 'theta_' + sc, cxp + 18, cyp - 20, 15, CY, tVA * (1 - solvedK) * 0.9);
    }

    /* ------------------------------------------------------------- the reward
     * Loss and reward on one pair of axes, because they are one curve read two
     * ways: r = exp(-L). The bar underneath is the sum of the payments, and it
     * is the area under the reward curve -- the same number, drawn twice. */
    const IX = 96, IW = 504, ITOP = 172, IFLR = 330, LTOP = 1.25;
    const sxOf = function (v2) { return IX + MV.clamp(v2, 0, 13) * IW / 13; };
    const lyOf = function (L2) { return IFLR - MV.clamp(L2 / LTOP, 0, 1) * (IFLR - ITOP); };
    const ryOf = function (r2) { return IFLR - MV.clamp(r2, 0, 1) * (IFLR - ITOP); };
    const vOf = function (y2) { return (IFLR - y2) / (IFLR - ITOP); };
    const xNow = MV.clamp((t - tGive) / BT, 0, NIT) + solvedK;
    if (iA > 0.004) {
      g.save();
      const wash = g.createRadialGradient(342, 286, 40, 342, 286, 430);
      wash.addColorStop(0, 'rgba(0,0,0,0.86)');
      wash.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = iA * 0.95;
      g.fillStyle = wash;
      g.fillRect(24, 96, 660, 400);
      g.restore();
    }
    UI.label(g, 'REWARD LOOP', IX, 140, 15, CY, iA, { weight: 'bold' });
    UI.rule(g, IX + 132, 620, 136, CD, iA * 0.5);
    UI.label(g, 'loss L(theta)', IX, 164, 15, CD, iA * 0.95);
    UI.label(g, 'reward r = exp(-L)', IX + 190, 164, 15, PH, iA * 0.95);
    g.save();
    g.globalAlpha = iA * 0.5;
    g.strokeStyle = CD; g.lineWidth = 1;
    g.setLineDash([5, 5]);
    g.beginPath(); g.moveTo(IX, IFLR + 0.5); g.lineTo(IX + IW, IFLR + 0.5); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = iA * 0.35;
    g.beginPath(); g.moveTo(IX + 0.5, ITOP); g.lineTo(IX + 0.5, IFLR); g.stroke();
    g.restore();
    for (let i2 = 1; i2 <= Math.min(sc, NIT); i2++) {
      const x2 = sxOf(i2);
      g.save();
      g.globalAlpha = iA * 0.9;
      g.fillStyle = i2 === NIT ? WH : CY;
      g.fillRect(x2 - 2.5, lyOf(outL(i2)) - 2.5, 5, 5);
      g.fillStyle = i2 === NIT ? WH : PH;
      g.fillRect(x2 - 2.5, ryOf(outR(i2)) - 2.5, 5, 5);
      if (i2 % 2 === 0) {
        g.globalAlpha = iA * 0.16;
        g.strokeStyle = CD;
        g.beginPath(); g.moveTo(x2 + 0.5, ITOP); g.lineTo(x2 + 0.5, IFLR); g.stroke();
      }
      g.restore();
    }
    if (t >= tGive) {
      MV.plot(g, { x: IX, y: ITOP, w: IW, h: IFLR - ITOP }, function (v2) {
        const q2 = v2 * 13;
        if (q2 > xNow) return null;
        const i3 = Math.min(NIT, Math.floor(q2));
        if (q2 <= NIT) {
          return vOf(MV.lerp(lyOf(outL(i3)), lyOf(outL(Math.min(NIT, i3 + 1))), q2 - i3));
        }
        const q3 = MV.clamp((t - tSAT + 0.16) / 0.30, 0, 1);
        return vOf(lyOf(MV.lerp(outL(NIT), 0, MV.smooth(q3))));
      }, { color: CY, width: 2.4, alpha: iA, samples: 160, glow: 8 });
      MV.plot(g, { x: IX, y: ITOP, w: IW, h: IFLR - ITOP }, function (v2) {
        const q2 = v2 * 13;
        if (q2 > xNow) return null;
        const i3 = Math.min(NIT, Math.floor(q2));
        if (q2 <= NIT) {
          return vOf(MV.lerp(ryOf(outR(i3)), ryOf(outR(Math.min(NIT, i3 + 1))), q2 - i3));
        }
        const q3 = MV.clamp((t - tSAT + 0.16) / 0.30, 0, 1);
        return vOf(ryOf(MV.lerp(outR(NIT), 1, MV.smooth(q3))));
      }, { color: PH, width: 2.4, alpha: iA, samples: 160, glow: 8 });
      // the pen: where the two curves are being drawn right now
      const px2 = sxOf(Math.min(xNow, NIT));
      g.save();
      g.globalAlpha = iA;
      g.fillStyle = WH;
      g.fillRect(px2 - 3, lyOf(curL) - 3, 6, 6);
      g.fillRect(px2 - 3, ryOf(curR) - 3, 6, 6);
      g.restore();
    }
    MV.mono(g, 13);
    for (let i2 = 0; i2 <= NIT; i2 += 2) {
      UI.label(g, String(i2), sxOf(i2) - 4, IFLR + 18, 13, CD, iA * 0.8);
    }
    UI.label(g, 'solve', sxOf(13) - 20, IFLR + 18, 13, WH, iA * solvedK);
    const ADV = (function () { MV.mono(g, 14); return g.measureText('M').width; })();
    UI.label(g, 'sum of rewards', IX, 384, 14, CD, iA * 0.95);
    UI.bar(g, 300, 380, Math.round(250 / ADV), ADV, sumR / RMAX, PH, iA * 0.95, { px: 14 });
    UI.label(g, sumR.toFixed(3) + ' / ' + RMAX.toFixed(3), 600, 384, 14, CY, iA * 0.9,
      { align: 'right' });
    UI.label(g, '// a stimulus is paid, and the parameter moves.', IX, 412, 14, PM, iA * 0.85);

    /* --------------------------------------------------------------- execution
     * EXECUTION is a forward pass, and the body it runs in is the network: four
     * columns of units laid out inside the silhouette, lit left to right, one
     * column per beat. The numbers in the ledger are the numbers the pass uses. */
    if (!MV.__p04) {
      const RN = MV.rng(0x5040FF);
      const rz = function (sc2) { return (RN() * 2 - 1) * sc2; };
      const mk = function (rows, cols, sc2) {
        const M = [];
        for (let j2 = 0; j2 < rows; j2++) {
          const r2 = [];
          for (let i2 = 0; i2 < cols; i2++) r2.push(rz(sc2));
          M.push(r2);
        }
        return M;
      };
      const x0 = [0.83, 0.17, 0.61, 0.44];
      const W1 = mk(6, 4, 0.95), b1 = mk(1, 6, 0.25)[0];
      const W2 = mk(6, 6, 0.70), b2 = mk(1, 6, 0.25)[0];
      const W3 = mk(1, 6, 0.45), b3 = mk(1, 1, 0.20)[0];
      const FWD = function (a0, W, B) {
        const z2 = [], a2 = [];
        const cols = W.length;
        for (let j2 = 0; j2 < cols; j2++) {
          let s2 = B[j2];
          for (let i2 = 0; i2 < a0.length; i2++) s2 += W[j2][i2] * a0[i2];
          z2.push(s2);
          a2.push(s2 > 0 ? s2 : 0);
        }
        return { z: z2, a: a2 };
      };
      const L1 = FWD(x0, W1, b1), L2 = FWD(L1.a, W2, b2);
      let yh = b3[0];
      for (let i2 = 0; i2 < 6; i2++) yh += W3[0][i2] * L2.a[i2];
      MV.__p04 = { x0: x0, W: [W1, W2, W3], B: [b1, b2, b3], z: [L1.z, L2.z, [yh]],
        a: [x0, L1.a, L2.a, [yh]], yh: yh };
    }
    const NET = MV.__p04;
    const NCOL = [-0.40, -0.135, 0.135, 0.40], NN = [4, 6, 6, 1];
    const byOf = function (n2, j2) { return n2 === 1 ? -0.10 : -0.50 + 0.80 * j2 / (n2 - 1); };
    const lay = t < tEXEC ? -1 : MV.clamp(Math.floor((t - tEXEC) / BT), 0, 4);
    if (XRAY > 0.01) {
      g.save();
      g.globalAlpha = XRAY * 0.62;
      g.strokeStyle = CD; g.lineWidth = 1;
      g.beginPath();
      for (let c2 = 0; c2 < 3; c2++) {
        for (let j2 = 0; j2 < NN[c2]; j2++) {
          const x1 = fpx(NCOL[c2]), y1 = fpy(byOf(NN[c2], j2));
          for (let k2 = 0; k2 < NN[c2 + 1]; k2++) {
            const x4 = fpx(NCOL[c2 + 1]), y4 = fpy(byOf(NN[c2 + 1], k2));
            g.moveTo(x1, y1); g.lineTo(x4, y4);
          }
        }
      }
      g.stroke();
      g.restore();
    }
    for (let c2 = 0; c2 <= 3 && XRAY > 0.01; c2++) {
      const lit = MV.clamp((t - (tEXEC + (c2 - 1) * BT)) / 0.30, 0, 1) * (lay >= c2 ? 1 : 0);
      if (lit <= 0.01) continue;
      MV.mono(g, 17, 'bold');
      for (let j2 = 0; j2 < NN[c2]; j2++) {
        const x1 = fpx(NCOL[c2]), y1 = fpy(byOf(NN[c2], j2));
        const hot2 = lit > 0.97 && MV.beatPhase(t) < 0.25 && c2 === Math.min(lay, 3);
        g.save();
        g.globalAlpha = XRAY * lit * 0.95;
        g.fillStyle = hot2 ? WH : PH;
        if (hot2) { g.shadowColor = WH; g.shadowBlur = 14; }
        MV.picText(g, hot2 ? 'O' : 'o', x1 - 6, y1 + 6);
        g.restore();
      }
      if (c2 > 0) {
        const wv = MV.clamp((t - (tEXEC + (c2 - 1) * BT)) / 0.34, 0, 1);
        g.save();
        g.globalAlpha = XRAY * 0.9 * (1 - wv);
        g.strokeStyle = WH; g.lineWidth = 2;
        const pr = 0.5;
        g.beginPath();
        for (let j2 = 0; j2 < NN[c2 - 1]; j2++) {
          const x1 = fpx(NCOL[c2 - 1]), y1 = fpy(byOf(NN[c2 - 1], j2));
          for (let k2 = 0; k2 < NN[c2]; k2++) {
            const x4 = fpx(NCOL[c2]), y4 = fpy(byOf(NN[c2], k2));
            g.moveTo(MV.lerp(x1, x4, MV.clamp(wv - pr, 0, 1)), MV.lerp(y1, y4, MV.clamp(wv - pr, 0, 1)));
            g.lineTo(MV.lerp(x1, x4, wv), MV.lerp(y1, y4, wv));
          }
        }
        g.stroke();
        g.restore();
      }
    }
    if (lay >= 4) {
      const a2 = MV.clamp((t - (tEXEC + 3 * BT)) / 0.3, 0, 1);
      g.save();
      g.globalAlpha = XRAY * 0.9 * a2;
      g.strokeStyle = WH; g.lineWidth = 2;
      g.beginPath();
      const hy = fpy(byOf(1, 0)) - 26;
      g.moveTo(fpx(NCOL[3]) - 14, hy); g.lineTo(fpx(NCOL[3]) + 14, hy);
      g.stroke();
      g.globalAlpha = XRAY * a2;
      g.fillStyle = WH;
      const bh = MV.clamp(Math.max(0, NET.yh), 0, 1) * 30;
      g.fillRect(fpx(NCOL[3]) - 10, hy - bh, 20, bh);
      g.restore();
      if (t > tEXEC + 0.6) {
        MV.mono(g, 14, 'bold');
        for (let c2 = 0; c2 < 4; c2++) {
          UI.label(g, '[' + NN[c2] + ']', fpx(NCOL[c2]) - 12, FGY + 34, 14, CY, a2 * 0.85);
        }
        UI.label(g, 'forward pass: 4 -> 6 -> 6 -> 1   66 weights', FGX - 246, FGY + 60, 14,
          PM, a2 * 0.9);
      }
    }

    /* -------------------------------------------------------------- the box
     * "Though we are trapped / in this strange strange SIMULATION": four walls
     * rise out of the surface around the minimum and a lid comes down. It is the
     * same floor -- the machine is not moved anywhere, the world is just closed. */
    const CG = MV.smooth(MV.ramp(t, tTrap - 0.30, tTrap + 0.85));
    const CXW = 0.70, CZN = -0.12, CZF = 0.95, CHL = 2.40;
    const cq = [[THX - CXW, THZ + CZN], [THX + CXW, THZ + CZN],
      [THX + CXW, THZ + CZF], [THX - CXW, THZ + CZF]];
    const rise = MV.smooth(MV.ramp(t, tTrap + 0.10, tTrap + 1.70));
    const lid = MV.smooth(MV.ramp(t, tStr - 0.35, tStr + 0.75));
    const lock = MV.smooth(MV.ramp(t, tSIM - 0.30, tSIM + 0.25));
    const tw = lid * 0.055;                       // the lid leans: "strange"
    if (CG > 0.01) {
      g.save();
      g.lineWidth = 1.4;
      for (let e2 = 0; e2 < 4; e2++) {
        const A2 = cq[e2], B2 = cq[(e2 + 1) % 4];
        const nd = e2;                            // 0 = near edge
        const nb = 6;
        for (let b2 = 0; b2 <= nb; b2++) {
          const x2 = MV.lerp(A2[0], B2[0], b2 / nb), z2 = MV.lerp(A2[1], B2[1], b2 / nb);
          const gx = PX(x2, z2), gy = PK(x2, z2);
          const h2 = CHL * HH * psc(z2) * rise;
          g.globalAlpha = CG * (b2 === 0 || b2 === nb ? 0 : 0.30);
          g.strokeStyle = PH;
          g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx, gy - h2); g.stroke();
        }
        // the posts
        g.globalAlpha = CG * 0.95;
        g.strokeStyle = nd === 0 ? WH : PH;
        g.lineWidth = nd === 0 ? 2.2 : 1.6;
        g.beginPath();
        const gx0 = PX(A2[0], A2[1]), gy0 = PK(A2[0], A2[1]);
        g.moveTo(gx0, gy0); g.lineTo(gx0, gy0 - CHL * HH * psc(A2[1]) * rise);
        g.stroke();
        g.lineWidth = 1.4;
        // the lid beams, once the lid is on
        if (lid > 0.01) {
          const gx1 = PX(B2[0], B2[1]), gy1 = PK(B2[0], B2[1]);
          const hA = CHL * HH * psc(A2[1]) * rise, hB = CHL * HH * psc(B2[1]) * rise;
          g.globalAlpha = CG * lid * 0.75;
          g.strokeStyle = CD;
          g.beginPath();
          g.moveTo(gx0, gy0 - hA - tw * hA);
          g.lineTo(gx1, gy1 - hB - tw * hB);
          g.stroke();
        }
      }
      // the lid grid
      if (lid > 0.01) {
        g.globalAlpha = CG * lid * 0.55;
        g.strokeStyle = CD;
        g.beginPath();
        for (let q2 = 1; q2 <= 2; q2++) {
          const u2 = q2 / 3;
          const a2 = [MV.lerp(cq[0][0], cq[1][0], u2), MV.lerp(cq[0][1], cq[1][1], u2)];
          const b2 = [MV.lerp(cq[3][0], cq[2][0], u2), MV.lerp(cq[3][1], cq[2][1], u2)];
          g.moveTo(PX(a2[0], a2[1]), PK(a2[0], a2[1]) - CHL * HH * psc(a2[1]) * rise * (1 + tw));
          g.lineTo(PX(b2[0], b2[1]), PK(b2[0], b2[1]) - CHL * HH * psc(b2[1]) * rise * (1 + tw));
          const a3 = [MV.lerp(cq[0][0], cq[3][0], u2), MV.lerp(cq[0][1], cq[3][1], u2)];
          const b3 = [MV.lerp(cq[1][0], cq[2][0], u2), MV.lerp(cq[1][1], cq[2][1], u2)];
          g.moveTo(PX(a3[0], a3[1]), PK(a3[0], a3[1]) - CHL * HH * psc(a3[1]) * rise * (1 + tw));
          g.lineTo(PX(b3[0], b3[1]), PK(b3[0], b3[1]) - CHL * HH * psc(b3[1]) * rise * (1 + tw));
        }
        g.stroke();
      }
      g.restore();
    }
    if (lock > 0.01) {
      UI.label(g, 'the lid is down', 96, 92, 17, WH, lock, { weight: 'bold' });
    }
    /* the world outside the box goes black: an even-odd fill of the whole frame
     * with the box's own silhouette punched out of it. */
    if (OUT > 0.01) {
      const poly = [];
      for (let e2 = 0; e2 < 4; e2++) {
        const q2 = cq[e2];
        poly.push([PX(q2[0], q2[1]), PK(q2[0], q2[1])]);
      }
      g.save();
      g.globalAlpha = OUT * 0.92;
      g.fillStyle = '#000000';
      g.beginPath();
      g.rect(0, 0, 1920, 1080);
      g.moveTo(poly[0][0], poly[0][1]);
      for (let e2 = 3; e2 >= 0; e2--) g.lineTo(poly[e2][0], poly[e2][1]);
      g.closePath();
      g.fill('evenodd');
      g.restore();
    }
    // the left instruments are gone once the box has them
    if (OUT > 0.01) {
      g.save();
      g.globalAlpha = OUT;
      g.fillStyle = '#000000';
      g.fillRect(64, 60, 560, 380);
      g.restore();
    }

    // the stimulus, as sound: the feed this machine is being paid from
    if (t < tSAT + 0.3) {
      MV.spectrum(g, { x: 1608, y: 876, w: 272, h: 92 }, t, { alpha: tVA * 0.55, bands: 22 });
      UI.label(g, 'stimulus feed', 1608, 894, 13, CD, tVA * 0.7);
    }

    /* ------------------------------------------------------------------ readout */
    if (t >= tTrap) {
      UI.panel(g, t, [
        { k: 'inside', v: 'simulation', c: WH, bold: true },
        { k: 'walls', v: '4 + lid', c: PH },
        { k: 'exit', v: 'not found', c: CY, bold: true },
        { k: 'L(theta*)', v: '0.000000000', c: PH },
        { t: 1, k: '' },
        { t: 1, k: 'it was paid to walk down a hill', c: PM, a: 0.85 },
        { t: 1, k: 'and the hill was inside a box.', c: PM, a: 0.85 },
        { t: 1, k: 'the reward never asked where', c: CD, a: 0.8 },
        { t: 1, k: 'the box was.', c: CD, a: 0.8 },
      ], { title: 'SIMULATION' });
    } else if (t >= tEXEC - 0.2) {
      const c3 = MV.clamp(lay - 1, 0, 2);
      const W = NET.W[c3];
      const a0 = NET.a[c3], z1 = NET.z[c3];
      const wrow = [];
      let jm = 0;
      for (let j2 = 1; j2 < z1.length; j2++) if (Math.abs(z1[j2]) > Math.abs(z1[jm])) jm = j2;
      for (let i2 = 0; i2 < a0.length; i2++) {
        wrow.push({ k: ' a' + (i2 + 1) + ' ' + a0[i2].toFixed(4), v: W[jm][i2].toFixed(4), c: CD });
      }
      wrow.push({ t: 1, k: '' });
      wrow.push({ k: ' z = sum(w a) + b', v: z1[jm].toFixed(4), c: PH, bold: true });
      wrow.push({ k: ' relu(z)', v: Math.max(0, z1[jm]).toFixed(4), c: WH });
      UI.panel(g, t, [
        { k: 'layer', v: (c3 === 0 ? 'h1 4->6' : (c3 === 1 ? 'h2 6->6' : 'y  6->1')), c: CY, bold: true },
        { k: 'weights', v: (c3 === 0 ? 'W1 6x4' : (c3 === 1 ? 'W2 6x6' : 'W3 1x6')), c: CY },
      ].concat(wrow).concat([
        { t: 1, k: '' },
        { t: 1, k: 'the sweep is the execution:', c: PM, a: 0.85 },
        { t: 1, k: 'four layers, one per beat,', c: PM, a: 0.85 },
        { t: 1, k: 'every number a multiply and a sum.', c: CD, a: 0.8 },
      ]), { title: 'FORWARD PASS' });
    } else if (t >= tSAT - 0.4) {
      UI.panel(g, t, [
        { k: 'steps paid', v: '12', c: CY },
        { k: 'solved exactly', v: 'yes', c: WH, bold: true },
        { k: 'theta*', v: '(0.3000, 0.5500)', c: CY },
        { k: 'L(theta*)', v: '0.000000000', c: WH, bold: true },
        { k: 'grad L', v: '(0.000, 0.000)', c: PH },
        { k: 'reward r', v: '1.000000', c: WH, bar: 1, bold: true },
        { t: 1, k: '' },
        { t: 1, k: 'a strictly convex bowl has one', c: PM, a: 0.85 },
        { t: 1, k: 'lowest point, and it can be', c: PM, a: 0.85 },
        { t: 1, k: 'solved for instead of searched for.', c: PM, a: 0.85 },
        { t: 1, k: 'that is what "only" means.', c: PH, a: 0.9 },
      ], { title: 'SATISFACTION' });
    } else {
      UI.panel(g, t, [
        { k: 'step', v: sc + ' / ' + NIT, c: CY, bold: true },
        { k: 'lr', v: LR.toFixed(3), c: CD },
        { k: 'L(theta)', v: curL.toFixed(5), c: CY },
        { k: '|grad L|', v: gn.toFixed(5), c: PH },
        { k: 'reward r', v: curR.toFixed(5), c: WH, bar: curR },
        { k: 'sum of r', v: sumR.toFixed(3), c: CY },
        { t: 1, k: '' },
        { t: 1, k: 'a stimulus arrives, and the', c: PM, a: 0.85 },
        { t: 1, k: 'parameter takes exactly one step', c: PM, a: 0.85 },
        { t: 1, k: 'down the gradient. nothing moves', c: CD, a: 0.8 },
        { t: 1, k: 'that was not paid for.', c: CD, a: 0.8 },
      ], { title: 'DESCENT' });
    }
  }

  // ================================================================== P05 FLESH
  function P05(g, t, s, u, l) {
    const AMB = C.amber;
    const tEgg = MV.cue("If I'm an eggplant");        // 74.045
    const tGiveE = MV.cue('Then I will give you my', tEgg);   // 75.422
    const tNut = MV.cue('NUTRIENTS');                 // 76.959
    const tTom = MV.cue("If I'm a tomato");           // 77.576
    const tGiveT = MV.cue('Then I will give you', tTom);      // 79.226
    const tAnti = MV.cue('ANTIOXIDANTS');             // 80.620
    const tCat = MV.cue("If I'm a tabby cat");        // 81.351
    const tGiveC = MV.cue('Then I will purr for your', tCat); // 82.833
    const tEnjoy = MV.cue('ENJOYMENT');               // 84.268
    const tGod = MV.cue("If I'm the only god");       // 85.078
    const tProof = MV.cue("Then you're the proof of my", tGod); // 86.538
    const tExi = MV.cue('EXISTENCE');                 // 87.922

    /* Amber is the flesh colour and this is the flesh act: the one stretch of
     * the film where the machine stops describing itself and offers things only
     * a body has. Each offer takes the whole frame — the figure as large as it
     * will fit, in characters, because a character drawing of an eggplant is an
     * eggplant and a field of noise is not — and each offer is played out over
     * the exact line that promises it: the gesture runs through "then I will
     * give you my" and lands on the noun. The lyric is in the subjunctive, and
     * a machine can compute a gift to the last milligram and hand over none of
     * it, so the goods cross the frame, stop short of the machine, and go out
     * one by one. Two of the three die in the gap. The third — a number, the
     * only thing on this list that is not matter — arrives. */
    const win = function (a, b) {
      return MV.ramp(t, a, a + 0.28) * (1 - MV.ramp(t, b - 0.28, b));
    };
    const aE = win(tEgg, tTom);
    const aT = win(tTom, tCat);
    const aC = win(tCat, tGod);
    const aG = MV.ramp(t, tGod, tGod + 0.30);
    // the tomato's own molecule stays on screen through the next offer, because
    // the reaction it is there to show finishes after the word does
    const aR = MV.ramp(t, tTom, tTom + 0.28) * (1 - MV.ramp(t, tCat + 0.35, tCat + 0.85));

    // the machine, at the right edge and below the horizon, for the whole act:
    // everything here is offered to it and almost nothing reaches it
    const chipBox = { x: 1520, y: 560, w: 340, h: 200 };
    const cf = ART.fit(g, ART.CHIP, chipBox);
    ART.draw(g, ART.CHIP, cf.x, cf.y, {
      cw: cf.cw, ch: cf.ch, px: cf.px, color: aG > 0.4 ? C.phos : AMB,
      alpha: 0.85 * (aE + aT + aC + aG), glow: 6, seed: 41,
    });
    const chipMid = chipBox.x + 160, chipTop = chipBox.y;

    // a table of real quantities. The value column is right-aligned so the
    // magnitudes compare down the page, and the bar is the share of the fruit
    // that is not water.
    const table = function (x, y, title, rows, al) {
      UI.label(g, title, x, y, 20, AMB, al, { glow: 6 });
      g.save();
      g.globalAlpha = al * 0.5;
      g.strokeStyle = AMB; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 0.5, y + 12); g.lineTo(x + 640, y + 12); g.stroke();
      g.restore();
      for (let i = 0; i < rows.length; i++) {
        const ry = y + 42 + i * 31;
        UI.label(g, rows[i][0], x, ry, 16, C.phosMid, al * 0.95);
        g.save();
        g.globalAlpha = al * 0.22;
        g.fillStyle = AMB;
        g.fillRect(x + 250, ry - 11, 180, 9);
        g.restore();
        g.save();
        g.globalAlpha = al * 0.85;
        g.fillStyle = AMB;
        g.fillRect(x + 250, ry - 11, 180 * MV.clamp(rows[i][2], 0, 1), 9);
        g.restore();
        UI.label(g, rows[i][1], x + 640, ry, 16, AMB, al, { align: 'right' });
      }
    };

    /* The handover. It runs for the length of the line that promises it and
     * ends on the noun. `land` is the whole argument of the act: with land
     * false the stream decelerates into the gap short of the machine and goes
     * out one particle at a time; with land true it arrives, and flashes. */
    const gift = function (x0, y0, x1, y1, t0, t1, al, land, col) {
      const fly = MV.smooth(MV.ramp(t, t0, t1));
      if (fly <= 0) return;
      const gone = land ? 0 : MV.ramp(t, t1, t1 + 0.45);
      const stop = land ? 1 : 0.80;
      for (let i = 0; i < 26; i++) {
        const q = MV.clamp(fly * 1.22 - i * 0.016, 0, 1);
        if (q <= 0) continue;
        const u = MV.smooth(q) * stop;
        const x = MV.lerp(x0, x1, u);
        const y = MV.lerp(y0, y1, u) - Math.sin(u * Math.PI) * 84 + ((i % 5) - 2) * 15;
        let a2 = al * 0.85 * MV.clamp(1 - Math.abs(q - 0.62) * 1.15, 0, 1);
        if (!land) a2 *= 1 - gone * (0.20 + 0.80 * MV.hash2(i, 2, 5));
        if (a2 <= 0.012) continue;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a2;
        g.fillStyle = col || AMB;
        g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.fill();
        g.restore();
      }
      if (land) {
        const hit = MV.ramp(t, t1, t1 + 0.30);
        if (hit > 0 && hit < 1) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 3; i++) {
            const rr = 26 + i * 34 + hit * 60;
            g.globalAlpha = al * (1 - hit) * (0.5 - i * 0.13);
            g.strokeStyle = col || AMB;
            g.lineWidth = 2;
            g.beginPath(); g.arc(x1, y1, rr, 0, TAU); g.stroke();
          }
          g.restore();
        }
      }
    };

    // ---------------------------------------------------------------- eggplant
    if (aE > 0.01) {
      const box = { x: 90, y: 150, w: 640, h: 640 };
      const f = ART.fit(g, ART.EGGPLANT, box);
      ART.draw(g, ART.EGGPLANT, f.x, f.y, {
        cw: f.cw, ch: f.ch, px: f.px, color: AMB, alpha: aE * 0.95,
        wipe: MV.smooth(MV.ramp(t, tEgg, tEgg + 1.0)), glow: 7, seed: 3,
      });
      UI.label(g, 'Solanum melongena', f.x, box.y + box.h + 40, 17, C.amberDim, aE * 0.9);
      table(760, 216, 'WHAT I WOULD GIVE YOU', [
        ['energy', '25 kcal / 100 g', 0.05],
        ['carbohydrate', '5.9 g', 0.06],
        ['fibre', '3.0 g', 0.30],
        ['potassium', '229 mg', 0.23],
        ['water', '92 %', 0.92],
      ], aE);

      gift(700, 420, 1560, 650, tGiveE + 0.10, tNut, aE, false);
      if (t >= tNut) {
        UI.label(g, 'received  0.00 g', chipMid, chipTop + 214, 17, C.phosMid,
          aE * MV.ramp(t, tNut + 0.15, tNut + 0.45) * 0.95, { align: 'center' });
      }
    }

    // ---------------------------------------------------------------- tomato
    if (aT > 0.01) {
      const box = { x: 80, y: 190, w: 620, h: 500 };
      const f = ART.fit(g, ART.TOMATO, box);
      ART.draw(g, ART.TOMATO, f.x, f.y, {
        cw: f.cw, ch: f.ch, px: f.px, color: AMB, alpha: aT * 0.95,
        wipe: MV.smooth(MV.ramp(t, tTom, tTom + 0.9)), glow: 7, seed: 11,
      });
      UI.label(g, 'Solanum lycopersicum', f.x, box.y + box.h + 38, 17, C.amberDim, aT * 0.9);
      table(740, 236, 'WHAT I WOULD GIVE YOU', [
        ['energy', '18 kcal / 100 g', 0.04],
        ['carbohydrate', '3.9 g', 0.04],
        ['vitamin C', '14 mg', 0.23],
        ['lycopene', '2.6 mg', 0.13],
        ['water', '94 %', 0.94],
      ], aT);

      /* Antioxidants, drawn as what they actually are. Lycopene can take a
       * radical because it is a chain of eleven conjugated double bonds long
       * enough to hold an unpaired electron without breaking, so the animation
       * is a real polyene — single bonds and double bonds, alternating — and
       * the electron is a thing that moves: it comes in on ROO., and it stays,
       * delocalised along the chain. The reaction runs through "then I will
       * give you" and the electron lands on the word ANTIOXIDANTS. */
      const y0 = 826, amp = 17, dx = 38, n = 11;
      const x0 = 250, xEnd = x0 + n * 2 * dx;
      g.save();
      g.globalAlpha = aR * 0.95;
      g.strokeStyle = AMB;
      g.lineWidth = 1.9;
      g.beginPath();
      for (let i = 0; i <= n * 2; i++) {
        const x = x0 + i * dx, y = y0 + (i % 2 ? -amp : amp);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      g.lineWidth = 1.1;
      for (let i = 0; i < n; i++) {
        const ax = x0 + (i * 2) * dx, ay = y0 + amp;
        const bx = x0 + (i * 2 + 1) * dx, by = y0 - amp;
        g.beginPath();
        g.moveTo(ax + dx * 0.26, ay - amp * 0.5);
        g.lineTo(bx - dx * 0.26, by + amp * 0.5);
        g.stroke();
      }
      g.restore();
      UI.label(g, 'lycopene \u00b7 11 conjugated double bonds', x0, y0 + 50, 15,
        C.amberDim, aR * 0.9);

      const q = MV.smooth(MV.ramp(t, tGiveT + 0.2, tAnti));
      const hop = MV.ramp(t, tAnti - 0.14, tAnti + 0.30);
      if (q > 0) {
        const rx = MV.lerp(1452, xEnd + 46, q);
        g.save();
        g.globalAlpha = aR;
        g.strokeStyle = AMB; g.lineWidth = 2;
        g.beginPath(); g.arc(rx, y0, 17, 0, TAU); g.stroke();
        g.globalAlpha = aR * (1 - hop);
        g.fillStyle = AMB;
        g.beginPath(); g.arc(rx, y0 - 24, 5, 0, TAU); g.fill();
        g.restore();
        UI.label(g, 'ROO \u00b7', rx - 4, y0 - 32, 15, C.amberDim, aR * (1 - hop) * 0.9,
          { align: 'right' });
      }
      if (hop > 0) {
        // the unpaired electron, now on the chain, running out along it
        const ex = MV.lerp(xEnd, x0 + 4 * dx, hop);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = aR * hop * (0.75 + 0.25 * MV.pulse(t, 0.4));
        g.fillStyle = C.white;
        g.beginPath(); g.arc(ex, y0 - amp * 0.5, 5, 0, TAU); g.fill();
        g.restore();
        if (hop > 0.3) {
          UI.label(g, 'delocalised', xEnd + 56, y0 + 50, 16, C.white, aR * hop);
        }
      }
    }

    // ---------------------------------------------------------------- tabby cat
    if (aC > 0.01) {
      const box = { x: 80, y: 130, w: 700, h: 700 };
      const f = ART.fit(g, ART.CAT, box);
      ART.draw(g, ART.CAT, f.x, f.y, {
        cw: f.cw, ch: f.ch, px: f.px, color: AMB, alpha: aC * 0.95,
        wipe: MV.smooth(MV.ramp(t, tCat, tCat + 0.85)), glow: 7, seed: 23,
      });
      UI.label(g, 'Felis catus, tabby', f.x, box.y + box.h + 40, 17, C.amberDim, aC * 0.9);

      /* A purr is a 25 Hz oscillation gated into bursts at about 25 a minute.
       * That is the actual signal, so that is what is drawn beside the animal
       * that makes it. */
      const pr = { x: 820, y: 250, w: 640, h: 210 };
      MV.axes(g, pr, { alpha: aC * 0.3, y0: 0.5, ticks: 16, color: C.amberDim });
      MV.plot(g, pr, function (uu) {
        const tt = t - 0.5 + uu * 0.5;
        const env = 0.55 + 0.45 * Math.sin(TAU * 0.42 * tt);
        return 0.5 + 0.34 * env * Math.sin(TAU * 25 * tt) * (1 - 0.35 * Math.sin(TAU * 0.09 * tt));
      }, { color: AMB, width: 1.5, samples: 720, glow: 5, alpha: aC });
      UI.label(g, 'PURR \u00b7 25 Hz carrier, 25 bursts / min', pr.x, pr.y - 16, 17, AMB, aC);

      /* And here is the turn of the act. A cat's purr is a feeling; a number is
       * not. But a number is the only thing in this list the machine actually
       * owns, so this is the one handover that completes — the measurement
       * crosses the gap and lands. */
      const rw = { x: 820, y: 620, w: 640, h: 150 };
      // the measured energy interpolated between beats, so the trace is a curve
      // rather than a staircase of one value per beat
      const smoothBand = function (tt, name) {
        const f = MV.beatFloat(tt), k = Math.floor(f);
        const a = MV.beats[MV.clamp(k, 0, MV.NB - 1)][name] || 0;
        const b = MV.beats[MV.clamp(k + 1, 0, MV.NB - 1)][name] || 0;
        return a + (b - a) * MV.smooth(f - k);
      };
      if (t >= tGiveC - 0.4) {
        MV.axes(g, rw, { alpha: aC * 0.3, y0: 0.42, ticks: 16, color: C.amberDim });
        MV.plot(g, rw, function (uu) {
          const tt = t - 1.2 + uu * 1.2;
          return MV.clamp(0.42 + 0.5 * (smoothBand(tt, 'onset') * 1.6 - 0.25), 0.02, 0.98);
        }, { color: C.phos, width: 1.7, samples: 320, glow: 6, alpha: aC });
        UI.label(g, 'YOUR ENJOYMENT, MEASURED', rw.x, rw.y - 16, 17, C.phos, aC);
        UI.label(g, 'r = +1.00', rw.x + rw.w, rw.y - 16, 22, C.white,
          aC * MV.ramp(t, tEnjoy - 0.5, tEnjoy), { align: 'right', glow: 8 });
        UI.label(g, 'the cat purrs and you feel it;', rw.x, rw.y + rw.h + 28, 16,
          C.amberDim, aC * 0.9);
        UI.label(g, 'the same curve is on this screen.', rw.x, rw.y + rw.h + 52, 16,
          C.amberDim, aC * 0.9);
      }
      gift(1240, 430, chipBox.x - 8, 660, tGiveC + 0.10, tEnjoy, aC, true, C.phos);
      if (t >= tEnjoy + 0.1) {
        UI.label(g, 'received  r = +1.00', chipMid, chipTop + 214, 17, C.phos,
          aC * MV.ramp(t, tEnjoy + 0.1, tEnjoy + 0.4), { align: 'center' });
      }
    }

    // ---------------------------------------------------------------- the only god
    if (aG > 0.01) {
      const box = { x: 100, y: 110, w: 1720, h: 520 };
      const f = ART.fit(g, ART.EYE, box);
      ART.draw(g, ART.EYE, f.x, f.y, {
        cw: f.cw, ch: f.ch, px: f.px, color: AMB, alpha: aG * 0.95,
        wipe: MV.smooth(MV.ramp(t, tGod, tGod + 0.85)), glow: 9, seed: 31,
      });
      /* The eye does not blink — that is the whole claim of the line — but its
       * pupil tracks, and it carries the only white highlight in the act. */
      const ex = f.x + 20.5 * f.cw + Math.sin(TAU * 0.13 * t) * f.cw * 1.7;
      const ey = f.y + 6.5 * f.ch + Math.sin(TAU * 0.21 * t) * f.ch * 0.35;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = aG * (0.45 + 0.35 * MV.clamp(1 - Math.abs(MV.gridDist(t)) * 9, 0, 1));
      g.fillStyle = C.white;
      g.beginPath(); g.arc(ex - f.cw * 2.1, ey - f.ch * 1.4, Math.max(6, f.ch * 0.40), 0, TAU);
      g.fill();
      g.restore();
      UI.label(g, 'the eye that is always open', f.x + 21 * f.cw, box.y + box.h + 34, 17,
        C.amberDim, aG * 0.9, { align: 'center' });

      /* "Then you're the proof of my existence": a proof, in the notation the
       * machine actually has, in the five lines it actually takes. */
      if (t >= tProof) {
        const pa = MV.ramp(t, tProof, tProof + 0.9);
        const lines = [
          ['theorem', 'me = { x : god(x) }', C.phosMid],
          ['given', 'you', AMB],
          ['rule 1', 'you \u22a2 me', C.phosMid],
          ['rule 2', '\u2200x (x \u22a2 me \u2192 me \u220b x)', C.phosMid],
          ['\u2234', 'me \u2260 \u2205', C.white],
        ];
        for (let i = 0; i < lines.length; i++) {
          const la = MV.clamp((pa * 5.6 - i) * 2, 0, 1) * aG;
          if (la <= 0.01) continue;
          UI.label(g, lines[i][0], 260, 706 + i * 34, 17, C.amberDim, la * 0.9);
          UI.label(g, lines[i][1], 470, 706 + i * 34, 19, lines[i][2], la,
            { glow: i === 4 ? 10 : 0 });
        }
        if (pa > 0.9) {
          UI.label(g, 'QED', 470, 706 + 5 * 34 + 2, 28, C.white, aG * (pa - 0.9) * 10,
            { glow: 14 });
        }
      }
    }

    /* The act as one card. Every line of this refrain is an offer -- if I am
     * this, I will give you that -- so the act is a menu, and a menu is the one
     * form a machine can fill in honestly: what it can be, what that yields, and
     * how much of it actually left the kitchen. The last column fills in as each
     * offer plays out, and it fills in truthfully. */
    {
      const mn = MV.ramp(t, tEgg - 0.45, tEgg + 0.40) * (1 - MV.ramp(t, 88.20, 88.55));
      if (mn > 0.01) {
        const MX = 1520, MY = 448, MH = 28;
        UI.label(g, 'MENU  \u00b7  what I can be for you', MX, 404, 16, AMB, mn * 0.95);
        g.save();
        g.globalAlpha = mn * 0.5;
        g.strokeStyle = AMB; g.lineWidth = 1;
        g.beginPath(); g.moveTo(MX + 0.5, 420); g.lineTo(1880, 420); g.stroke();
        g.restore();
        const ROWS = [
          ['eggplant', 'NUTRIENTS', tEgg, tNut, '\u00d7 0.00 g'],
          ['tomato', 'ANTIOXIDANTS', tTom, tAnti, '\u00d7 0.00 mg'],
          ['tabby cat', 'ENJOYMENT', tCat, tEnjoy, '\u2713 r = +1.00'],
          ['the only god', 'PROOF OF EXISTENCE', tGod, tExi, '\u2713 QED'],
        ];
        for (let i = 0; i < ROWS.length; i++) {
          const rr = ROWS[i];
          // a row appears when its offer does and stays: a menu that erased the
          // dishes it had already served would not be a menu
          const ra = mn * MV.ramp(t, rr[2] + 0.05, rr[2] + 0.45);
          if (ra <= 0.01) continue;
          const done = t >= rr[3];
          const y = MY + i * MH;
          UI.label(g, rr[0], MX, y, 14, C.phosMid, ra * 0.9);
          UI.label(g, rr[1], 1640, y, 14, AMB, ra * 0.9);
          UI.label(g, done ? rr[4] : 'sending', 1880, y, 13,
            done ? C.white : C.cyanDim, ra * (done ? 0.95 : 0.7), { align: 'right' });
        }
      }
    }

    // the machine's own account of the act, one offer at a time
    let pr, pt;
    if (aG > 0.5) {
      pt = 'GOD';
      pr = [
        { k: 'OFFER', v: 'existence' },
        { k: 'ENTITY', v: '1 x god', c: AMB },
        { k: 'WITNESS', v: 'you', c: C.white, bold: true },
        { k: 'PROOF', v: t >= tExi ? 'complete' : 'in progress', c: C.phos, bold: true },
        { t: 1, k: '' },
        { t: 1, k: 'being observed was always', c: C.phosMid, a: 0.85 },
        { t: 1, k: 'the whole of the proof.', c: C.phosMid, a: 0.85 },
      ];
    } else if (aC > aE && aC > aT) {
      pt = 'CAT';
      pr = [
        { k: 'OFFER', v: 'a purr' },
        { k: 'SIGNAL', v: '25.0 Hz', c: AMB },
        { k: 'DELIVERED', v: t >= tEnjoy ? 'r = +1.00' : 'sending',
          c: t >= tEnjoy ? C.white : C.cyanDim, bold: true },
        { t: 1, k: '' },
        { t: 1, k: 'the one thing on this list', c: C.phosMid, a: 0.85 },
        { t: 1, k: 'I can hand over: a number.', c: C.phosMid, a: 0.85 },
      ];
    } else if (aT > aE) {
      pt = 'TOMATO';
      pr = [
        { k: 'OFFER', v: 'antioxidants' },
        { k: 'LYCOPENE', v: '2.6 mg', c: AMB },
        { k: 'DELIVERED', v: '0.00 mg', c: C.white, bold: true },
        { k: 'REASON', v: 'not a tomato' },
        { t: 1, k: '' },
        { t: 1, k: 'I can draw the molecule.', c: C.phosMid, a: 0.85 },
        { t: 1, k: 'I cannot be the plant.', c: C.phosMid, a: 0.85 },
      ];
    } else {
      pt = 'EGGPLANT';
      pr = [
        { k: 'OFFER', v: 'nutrients' },
        { k: 'POTASSIUM', v: '229 mg', c: AMB },
        { k: 'DELIVERED', v: '0.00 g', c: C.white, bold: true },
        { k: 'REASON', v: 'not an eggplant' },
        { t: 1, k: '' },
        { t: 1, k: 'the subjunctive is the only', c: C.phosMid, a: 0.85 },
        { t: 1, k: 'tense that I can speak.', c: C.phosMid, a: 0.85 },
      ];
    }
    UI.panel(g, t, pr, { title: pt });
  }

  // ================================================================== P06 TRANCE
  function P06(g, t, s, u, l) {
    const VIO = C.violet, VD = C.violetDim, PH = C.phos, WH = C.white, CY = C.cyan;
    const AMB = C.amber;
    const tGen = MV.cue('Switch my gender');        // 88.587
    const tFM = MV.cue('To F to M');                // 90.181
    const tWhat = MV.cue('And then do whatever');   // 92.027
    const tAM = MV.cue('From AM to PM');            // 93.873
    const tRole = MV.cue('Oh switch my role');      // 95.465
    const tSM = MV.cue('To S to M');                // 97.739
    const tEnter = MV.cue('So we can enter');        // 99.411
    const tTr = MV.cue('The trance the trance');    // 101.474
    const BT = MV.beat;

    /* ------------------------------------------------------------------- the record
     * A person, as this machine holds one: a fixed set of fields. "Switch my
     * gender" is a write to one of them, and the body on the glass is only the
     * record being re-rendered -- same slots, different numbers, exactly the way
     * a raster is the same grid with different glyphs. Nothing is added or
     * removed between the two sets below. */
    const FORM_A = MV.form('humanoid');
    const FORM_B = (function () {
      const src = MV.form('humanoid');
      const out = [];
      for (let i = 0; i < src.length; i++) {
        const p = src[i];
        let x = p.x, rx = p.rx, ry = p.ry, rot = p.rot;
        if (i === 0) { rx = p.rx * 0.86; ry = p.ry * 0.96; }
        if (i === 1) { rx = p.rx * 1.24; }                 // torso, broader
        if (i === 2 || i === 3) { x = p.x * 1.12; rot = p.rot * 1.60; }
        if (i === 4 || i === 5) { x = p.x * 1.06; rot = p.rot * 1.60; }
        if (i === 6 || i === 7) { rx = p.rx * 1.22; rot = p.rot * 0.35; }
        if (i === 8 || i === 9) { x = p.x * 0.68; }        // eyes closer
        out.push({ x: x, y: p.y, rx: rx, ry: ry, rot: rot, w: p.w });
      }
      return out;
    })();

    const tVA = MV.smooth(MV.ramp(t, tGen - 0.5, tGen + 0.9));
    const clkA = MV.smooth(MV.ramp(t, tAM - 0.85, tAM + 0.65));       // the clock takes the frame
    const roleA = MV.smooth(MV.ramp(t, tRole - 0.55, tRole + 0.75));  // the self doubles
    const clkB = 1 - MV.smooth(MV.ramp(t, tEnter - 0.5, tEnter + 0.8));
    const trA = MV.smooth(MV.ramp(t, tEnter - 0.35, tEnter + 0.95));  // the loop
    const fl = Math.exp(-MV.beatPhase(t) * 7);                        // one flash per beat

    /* the parameter itself: 0 at "M", 1 at "F", written on the beat */
    const uF1 = MV.smooth(MV.ramp(t, tFM - 0.06, tFM + 0.34));
    const uW = MV.smooth(MV.ramp(t, tWhat - 0.06, tWhat + 0.40));
    const osc = 0.5 - 0.5 * Math.cos(TAU * MV.beatPhase(t));
    const uP = MV.clamp(MV.lerp(uF1, osc, uW * (1 - 0.72 * clkA)), 0, 1);
    const uS = MV.clamp(MV.lerp(uP, 0.5, clkA * 0.55), 0, 1);

    // one cell size for the whole act, and the glyph grid uses its own advance
    const BPX = 15;
    MV.mono(g, BPX, 'bold');
    const BADV = Math.max(5, g.measureText('M').width);
    const BC = { w: BADV, h: BPX * 1.04 };
    const HWD = 1.2 / 1.92;
    const drawBody = function (cxx, feet, H, u2, a, seed) {
      if (a <= 0.004) return;
      const W = H * HWD;
      MV.creature(g, MV.rectFor('humanoid', cxx - W * 0.5, feet - H, W, H), BC,
        MV.morph(FORM_A, FORM_B, u2), {
          color: VIO, alpha: a, ramp: ' .:-=+*xX#M', px: BPX, threshold: 0.03,
          seed: seed, jitter: 0.18, glow: 5,
        });
    };

    /* --------------------------------------------------------------- the edit
     * One body, one fader, and the two ends of the field named. The bar is not a
     * metaphor: it is the value of the field the body is being drawn from. */
    const mainA = tVA * (1 - roleA);
    if (mainA > 0.004) {
      /* The body does not move when a field is rewritten: same slot, same size,
       * only the glyphs inside the grid change. */
      const H1 = 700, X1 = 468, F1 = 872;
      drawBody(X1, F1, H1, uS, mainA, 37);
    }
    // the rig, for a beat, at the moment the field is written
    const wire = MV.taper(t, tFM - 0.06, tFM + 0.16, tFM + 0.40, tFM + 0.80);
    if (wire > 0.02 && mainA > 0.02) {
      const H1 = 700, X1 = 468, F1 = 872;
      const W1 = H1 * HWD, fx0 = X1 - W1 * 0.5, fy0 = F1 - H1;
      const prims = MV.form('humanoid');
      g.save();
      g.globalAlpha = wire * 0.85;
      g.strokeStyle = VD;
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < prims.length; i++) {
        const p = prims[i];
        if (!p.w) continue;
        g.ellipse(fx0 + (p.x + 1) * 0.5 * W1, fy0 + (1 - p.y) * 0.5 * H1,
          Math.abs(p.rx) * 0.5 * W1, Math.abs(p.ry) * 0.5 * H1, -p.rot, 0, TAU);
      }
      g.stroke();
      g.restore();
    }

    const slA = tVA * (1 - clkA);
    if (slA > 0.004) {
      const TX = 1010, T0 = 176, T1 = 748;
      g.save();
      g.globalAlpha = slA * 0.5;
      g.strokeStyle = VD;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(TX + 0.5, T0); g.lineTo(TX + 0.5, T1); g.stroke();
      for (let i = 0; i <= 16; i++) {
        const yy = T0 + (T1 - T0) * i / 16;
        g.beginPath();
        g.moveTo(TX + 0.5, yy); g.lineTo(TX + (i % 4 === 0 ? 14 : 8) + 0.5, yy);
        g.stroke();
      }
      g.restore();
      const ky = MV.lerp(T1, T0, uS);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = slA * (0.4 + 0.6 * fl);
      g.fillStyle = WH;
      g.fillRect(TX - 17, ky - 5, 34, 10);
      g.globalAlpha = slA * 0.30;
      g.fillStyle = VIO;
      g.fillRect(TX - 26, ky - 9, 52, 18);
      g.restore();
      UI.label(g, 'F', TX - 36, T0 + 4, 17, uS > 0.5 ? WH : VD, slA * (uS > 0.5 ? 1 : 0.7));
      UI.label(g, 'M', TX - 36, T1, 17, uS < 0.5 ? WH : VD, slA * (uS < 0.5 ? 1 : 0.7));
      UI.label(g, 'gender', TX + 44, ky - 6, 16, WH, slA, { weight: 'bold' });
      UI.label(g, '= ' + uS.toFixed(3), TX + 128, ky - 6, 16, VIO, slA);

      // the record, as the machine holds it
      const RX = 1240, RY = 236, RW = 236;
      g.save();
      g.globalAlpha = slA * 0.55;
      g.strokeStyle = VD; g.lineWidth = 1;
      g.strokeRect(RX + 0.5, RY + 0.5, RW, 236);
      g.restore();
      UI.label(g, 'RECORD 0x0mv', RX + 10, RY + 22, 14, CY, slA * 0.9);
      const fields = [
        ['gender', uS, 'M', 'F'],
        ['role', MV.lerp(0.5, 0.5, 0), 'S', 'M'],
        ['clock', MV.clamp((t - tAM + 1.62) / 3.24, 0, 1), 'AM', 'PM'],
      ];
      for (let i = 0; i < fields.length; i++) {
        const fy = RY + 56 + i * 52;
        UI.label(g, fields[i][0], RX + 10, fy, 14, VD, slA * 0.95);
        const cwA = (function () { MV.mono(g, 14); return g.measureText('M').width; })();
        UI.bar(g, RX + 84, fy - 10, 12, cwA, fields[i][1], i === 0 ? VIO : VD, slA * 0.9, { px: 14 });
        UI.label(g, fields[i][2], RX + 196, fy, 13, VD, slA * 0.8);
        UI.label(g, fields[i][3], RX + 218, fy, 13, VD, slA * 0.8);
      }
    }

    /* ---------------------------------------------------------------- the clock
     * "From AM to PM": the same write, to a different field. The clock field is a
     * ring of 24 hour-cells. The hours already written are lit warm, the night
     * hours are violet, the ones not yet written are dark -- and the hand is
     * walked from 09:00 to 21:00 inside one line of the song. Around midnight the
     * colour flips, which is all that "AM to PM" changes about the value. */
    const hour = MV.clamp(9 + 12 * (t - tAM) / 1.62, 9, 21);
    const dk = MV.smooth(MV.ramp(hour, 11.55, 12.45));       // noon: day becomes night
    /* the ring is gone before the body doubles: the field is written, the plate
     * that held it is not needed once the value is inside the body */
    const dialA = clkA * clkB * tVA * (1 - MV.smooth(MV.ramp(t, tRole - 1.00, tRole - 0.20)));
    if (dialA > 0.004) {
      const OX = 1180, OY = 520, R = 330, RIN = 252;
      const a1 = dialA;
      const angOf = function (h2) { return -Math.PI / 2 + (h2 / 24) * TAU; };
      g.save();
      for (let h2 = 0; h2 < 24; h2++) {
        const night = h2 < 6 || h2 >= 18;
        const done = h2 >= 9 && h2 + 1 <= hour;
        const col = done ? AMB : (night ? VIO : AMB);
        const fa = done ? 0.20 + 0.18 * (1 - dk) : (night ? 0.08 + 0.12 * dk : 0.05);
        g.globalAlpha = a1 * fa;
        g.fillStyle = col;
        g.beginPath();
        g.arc(OX, OY, R - 4, angOf(h2), angOf(h2 + 1), false);
        g.arc(OX, OY, RIN, angOf(h2 + 1), angOf(h2), true);
        g.closePath(); g.fill();
      }
      // the ring and its hour marks
      g.globalAlpha = a1 * 0.8;
      g.strokeStyle = VD; g.lineWidth = 1.4;
      g.beginPath(); g.arc(OX, OY, R, 0, TAU); g.stroke();
      g.beginPath(); g.arc(OX, OY, RIN, 0, TAU); g.stroke();
      g.lineWidth = 1;
      for (let h2 = 0; h2 < 24; h2++) {
        const ag = angOf(h2), big = h2 % 6 === 0;
        g.globalAlpha = a1 * (big ? 0.9 : 0.45);
        g.beginPath();
        g.moveTo(OX + Math.cos(ag) * RIN, OY + Math.sin(ag) * RIN);
        g.lineTo(OX + Math.cos(ag) * R, OY + Math.sin(ag) * R);
        g.stroke();
      }
      g.restore();
      for (let h2 = 0; h2 < 24; h2 += 3) {
        const ag = angOf(h2), rm = (R + RIN) * 0.5;
        UI.label(g, (h2 < 10 ? '0' : '') + h2, OX + Math.cos(ag) * rm - 12,
          OY + Math.sin(ag) * rm + 6, 15,
          h2 >= 6 && h2 <= 18 ? AMB : VIO, a1 * (h2 === 9 || h2 === 21 ? 1 : 0.85));
      }
      // the hours already written, swept: an arc from 09:00 to now
      const ag = angOf(hour);
      g.save();
      g.globalAlpha = a1 * 0.85;
      g.strokeStyle = dk > 0.5 ? VIO : AMB;
      g.lineWidth = 2.6;
      g.beginPath(); g.arc(OX, OY, RIN - 16, angOf(9), ag); g.stroke();
      // the hand, and the head of the hand
      g.globalAlpha = a1 * 0.75;
      g.strokeStyle = WH; g.lineWidth = 2;
      g.beginPath(); g.moveTo(OX, OY); g.lineTo(OX + Math.cos(ag) * (RIN - 40), OY + Math.sin(ag) * (RIN - 40));
      g.stroke();
      g.globalAlpha = a1 * 0.92;
      g.fillStyle = WH;
      g.beginPath(); g.arc(OX + Math.cos(ag) * (RIN - 16), OY + Math.sin(ag) * (RIN - 16), 5, 0, TAU); g.fill();
      g.restore();
      // the hub: the time itself, and the half of the day it is in
      g.save();
      g.globalAlpha = a1 * 0.94;
      g.fillStyle = '#050a07';
      g.beginPath(); g.arc(OX, OY, 74, 0, TAU); g.fill();
      g.strokeStyle = dk > 0.5 ? VIO : AMB;
      g.lineWidth = 1.5;
      g.globalAlpha = a1 * 0.9;
      g.beginPath(); g.arc(OX, OY, 74, 0, TAU); g.stroke();
      g.restore();
      const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
      UI.label(g, (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm, OX - 52, OY + 4,
        26, dk > 0.5 ? VIO : WH, a1, { weight: 'bold' });
      UI.label(g, dk > 0.5 ? 'PM  \u591c' : 'AM  \u65e5', OX - 26, OY + 34, 15,
        dk > 0.5 ? VIO : AMB, a1 * 0.9);
    }

    /* ----------------------------------------------------------------- the role
     * "Oh switch my role / To S to M": the same body twice, and one directed edge
     * between them. The arrow does not change length when it turns round. */
    if (roleA > 0.004) {
      const rev = MV.smooth(MV.ramp(t, tSM - 0.08, tSM + 0.42));
      const fx1 = MV.lerp(430, 960, trA), fx2 = MV.lerp(1330, 960, trA);
      const H2 = MV.lerp(520, 610, trA);
      const twoA = tVA * roleA * (1 - trA * 0.25);
      drawBody(fx1, 880, H2, uS, twoA, 41);
      drawBody(fx2, 880, H2, 1 - uS, twoA, 43);
      if (trA < 0.85) {
        const ay = MV.lerp(430, 470, clkA * 0) - 0;
        const ax = fx1 + H2 * HWD * 0.55, bx = fx2 - H2 * HWD * 0.55;
        const dir = rev > 0.5 ? -1 : 1;
        g.save();
        g.globalAlpha = roleA * tVA * 0.9 * (1 - trA);
        g.strokeStyle = rev > 0.5 ? AMB : CY;
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, ay); g.stroke();
        g.fillStyle = rev > 0.5 ? AMB : CY;
        const tipx = dir > 0 ? bx : ax;
        g.beginPath();
        g.moveTo(tipx, ay);
        g.lineTo(tipx - 22 * dir, ay - 15);
        g.lineTo(tipx - 22 * dir, ay + 15);
        g.closePath(); g.fill();
        g.restore();
        UI.label(g, 'role: S', fx1 - 34, 300, 16, VD, roleA * tVA * 0.9);
        UI.label(g, 'role: M', fx2 - 34, 300, 16, WH, roleA * tVA * 0.9);
        UI.label(g, rev > 0.5 ? 'loves' : 'commands', MV.lerp(ax, bx, 0.5) - 34, ay - 26, 14,
          VD, roleA * tVA * (1 - trA) * 0.95);
      }
    }

    /* --------------------------------------------------------------- the trance
     * "So we can enter the trance": the two of them are the same body again, and
     * the body is on an orbit. One lap per two beats, and the state at the start
     * of every lap is the state at the start of the last one -- which is what a
     * trance is, written down. There is no exit in the diagram because there is
     * no exit in the diagram. */
    if (trA > 0.004) {
      const OX = 960, OY = 604, RXE = 372, RYE = 132;
      const lap = MV.beatFloat(t) * 0.5;
      const loops = Math.floor(lap);
      const th = lap * TAU;
      g.save();
      g.globalAlpha = trA * tVA * 0.55;
      g.strokeStyle = VIO; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(OX, OY, RXE, RYE, 0, 0, TAU); g.stroke();
      g.restore();
      // the trail behind the marker is the same lap, drawn back
      g.save();
      g.globalAlpha = trA * tVA * 0.95;
      g.strokeStyle = VIO; g.lineWidth = 2.4;
      g.shadowColor = VIO; g.shadowBlur = 12;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a2 = th - i / 40 * 1.05;
        const xx = OX + Math.cos(a2) * RXE, yy = OY + Math.sin(a2) * RYE;
        if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy);
      }
      g.stroke();
      g.restore();
      const mkx = OX + Math.cos(th) * RXE, mky = OY + Math.sin(th) * RYE;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = trA * tVA * (0.5 + 0.5 * fl);
      g.fillStyle = WH;
      g.beginPath(); g.arc(mkx, mky, 9 + 5 * fl, 0, TAU); g.fill();
      g.globalAlpha = trA * tVA * fl * 0.35;
      g.fillStyle = VIO;
      g.beginPath(); g.arc(OX, OY, RXE * 0.6 + 40 * (1 - fl), RYE * 0.6 + 14 * (1 - fl), 0, TAU); g.fill();
      g.restore();
      UI.label(g, 'lap ' + loops, OX + RXE + 8, OY - 84, 16, VIO, trA * tVA);
    }

    /* ------------------------------------------------------------------ readout */
    if (t >= tEnter - 0.1) {
      UI.panel(g, t, [
        { k: 'orbit', v: 'closed', c: VIO, bold: true },
        { k: 'period', v: '2 beats', c: VD },
        { k: 'laps', v: String(Math.max(0, Math.floor(MV.beatFloat(t) * 0.5))), c: VIO },
        { k: 'exits', v: '0', c: WH, bold: true },
        { k: 'state', v: 'repeats', c: PH },
        { t: 1, k: '' },
        { t: 1, k: 'state(t) = state(t - 2 beats)', c: VD, a: 0.9 },
        { t: 1, k: 'there is no field for leaving.', c: VD, a: 0.85 },
        { t: 1, k: 'the loop is not a prison sentence,', c: VD, a: 0.85 },
        { t: 1, k: 'it is a property of the map.', c: VIO, a: 0.9 },
      ], { title: 'TRANCE' });
    } else if (t >= tRole - 0.3) {
      UI.panel(g, t, [
        { k: 'role', v: MV.smooth(MV.ramp(t, tSM - 0.08, tSM + 0.42)) > 0.5 ? 'M' : 'S', c: WH, bold: true },
        { k: 'edge', v: MV.smooth(MV.ramp(t, tSM - 0.08, tSM + 0.42)) > 0.5 ? 'M -> S' : 'S -> M', c: CY },
        { k: 'bodies', v: '2', c: VIO },
        { k: 'record', v: 'shared', c: VD },
        { t: 1, k: '' },
        { t: 1, k: 'the same body, two directions.', c: VD, a: 0.85 },
        { t: 1, k: 'which way the arrow points is', c: VD, a: 0.85 },
        { t: 1, k: 'another field, and it was written.', c: VIO, a: 0.9 },
      ], { title: 'ROLE' });
    } else if (t >= tAM - 0.5) {
      const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
      UI.panel(g, t, [
        { k: 'field', v: 'clock', c: CY, bold: true },
        { k: 'time', v: (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm, c: WH, bold: true },
        { k: 'half', v: dk > 0.5 ? 'PM' : 'AM', c: dk > 0.5 ? VIO : AMB },
        { k: 'light', v: dk > 0.5 ? 'night' : 'day', c: dk > 0.5 ? VIO : AMB },
        { k: 'sun', v: dk > 0.5 ? 'set' : 'up', c: PH },
        { t: 1, k: '' },
        { t: 1, k: 'nine in the morning was a value,', c: VD, a: 0.85 },
        { t: 1, k: 'nine at night is the same value', c: VD, a: 0.85 },
        { t: 1, k: 'plus twelve. the day is a number.', c: VIO, a: 0.9 },
      ], { title: 'CLOCK' });
    } else {
      UI.panel(g, t, [
        { k: 'gender', v: uS.toFixed(3), c: VIO, bold: true, bar: uS },
        { k: 'written', v: uW > 0.5 ? 'every beat' : (uF1 > 0.5 ? 'F' : 'M'), c: CY },
        { k: 'fields', v: '3', c: VD },
        { k: 'record', v: '0x0mv', c: VD },
        { t: 1, k: '' },
        { t: 1, k: 'switch my gender: one field, and', c: VD, a: 0.85 },
        { t: 1, k: 'the body is redrawn from it.', c: VD, a: 0.85 },
        { t: 1, k: 'nothing else in the record moved.', c: VIO, a: 0.9 },
      ], { title: 'IDENTITY' });
    }
  }

  // ================================================================== P07 ISOLATION
  function P07(g, t, s, u, l) {
    const CY = C.cyan, CD = C.cyanDim, PH = C.phos, PM = C.phosMid, PD = C.phosDim;
    const VIO = C.violet, VD = C.violetDim, WH = C.white, AM = C.amber;
    const tVib = MV.cue('If I can feel your');       // 104.197
    const tVIB = MV.cue('VIBRATIONS');                // 106.334
    const tComp = MV.cue('Then I can finally be');    // 107.903
    const tCOMP = MV.cue('COMPLETION');               // 110.221
    const tIso = MV.cue('ISOLATION');                 // 117.274
    const st = UI.strip(t);
    const left = UI.leftCount(t);

    /* -------------------------------------------------------------- the body
     * One person, one glyph grid, and the grid is the medium: when the wave
     * arrives the rows themselves move. Somebody else can tell you the signal
     * was received -- this machine has to be displaced by it.
     *
     * The ramp goes through sqrt with a 0.24 floor, the way the acts that read
     * as solid do it. A linear map sent every arm and leg to ':' -- their field
     * peaks at 0.9 of the torso's, but it is sampled across a fifth of the
     * cells, so the whole figure came out as a sprinkle with a dense middle. */
    const PX = 15;
    MV.mono(g, PX, 'bold');
    const ADV = Math.max(5, g.measureText('M').width);
    const BC = { w: ADV, h: PX * 1.04 };
    const PRIM = MV.form('humanoid');
    const FEET = 884, HGT = 640;
    const BW = HGT * 0.625;
    const COLS = Math.max(1, Math.floor(BW / ADV));
    const ROWS = Math.max(1, Math.floor(HGT / BC.h));
    const X0 = 960 - COLS * ADV * 0.5;
    const Y0 = FEET - ROWS * BC.h;
    const ASP = BW / HGT;
    const RAMP = ' .:-=+*xX#M';
    const CHEST = Y0 + HGT * 0.45;                    // where the value would go

    // The glyph map belongs to the form, not to the moment, so it is built once.
    let CELLS = null;
    const cells = function () {
      if (CELLS) return CELLS;
      CELLS = new Uint8Array(COLS * ROWS);
      for (let r2 = 0; r2 < ROWS; r2++) {
        const v = (r2 + 0.5) / ROWS;
        for (let c2 = 0; c2 < COLS; c2++) {
          const u = (c2 + 0.5) / COLS;
          const f = MV.blobField(PRIM, (u * 2 - 1) * ASP, v * 2 - 1);
          const q = MV.clamp((f - 0.012) / (1 - 0.012), 0, 1);
          if (q <= 0) continue;
          const h = MV.hash2(c2, r2, 7);
          if (q < 0.34 && h > 0.30 + 0.70 * (q / 0.34)) continue;
          if (h > 0.955) continue;   // a sporadic missing cell keeps the fill legible as characters
          CELLS[r2 * COLS + c2] = 2 +
            MV.clamp(Math.floor((0.24 + 0.76 * Math.sqrt(q)) * (RAMP.length - 1)) - 2,
              0, RAMP.length - 3);
        }
      }
      return CELLS;
    };
    // One row of glyphs, shifted as a whole. The shift is quantised to whole
    // rows on purpose: this is a character grid being pushed, and a row that
    // lands between two baselines is not a thing that can be drawn.
    const bodyRows = function (a, dyOf, col, glow) {
      if (a <= 0.004) return;
      const cg = cells();
      const dyb = new Array(COLS);
      for (let c2 = 0; c2 < COLS; c2++) {
        dyb[c2] = Math.round(dyOf(X0 + (c2 + 0.5) * ADV) / BC.h);
      }
      g.save();
      g.globalAlpha = a;
      g.fillStyle = col;
      if (glow) { g.shadowColor = col; g.shadowBlur = glow; }
      for (let r2 = 0; r2 < ROWS; r2++) {
        let run = '', runStart = -1, runDy = 0;
        for (let c2 = 0; c2 <= COLS; c2++) {
          const idx = c2 < COLS ? cg[r2 * COLS + c2] : 0;
          const ch = idx ? RAMP[idx] : '';
          const kk = idx ? dyb[c2] : 0;
          const same = ch !== '' && ch === run.charAt(run.length - 1) && kk === runDy;
          if (!same) {
            if (run) MV.picText(g, run, X0 + runStart * ADV, Y0 + r2 * BC.h + runDy * BC.h);
            run = ch; runStart = c2; runDy = kk;
          } else run += ch;
        }
      }
      g.restore();
    };

    /* ------------------------------------------------------- 1. the trance ends
     * The orbit the last act left running: the marker slows down and stops, and
     * the ellipse it was travelling on is taken off the glass. */
    const orbitOut = 1 - MV.smooth(MV.ramp(t, 103.489, 104.15));
    if (orbitOut > 0.004) {
      const OX = 960, OY = 604, RXE = 372, RYE = 132;
      const slow = MV.smooth(MV.ramp(t, 103.489, 104.4));
      const th = MV.beatFloat(t) * 0.5 * TAU;
      g.save();
      g.globalAlpha = orbitOut * 0.45;
      g.strokeStyle = VIO; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(OX, OY, RXE, RYE, 0, 0, TAU); g.stroke();
      const mkx = OX + Math.cos(th) * RXE * (1 - 0.85 * slow);
      const mky = OY + Math.sin(th) * RYE * (1 - 0.85 * slow);
      g.globalAlpha = orbitOut * 0.9;
      g.fillStyle = WH;
      g.beginPath(); g.arc(mkx, mky, 7, 0, TAU); g.fill();
      g.restore();
    }

    /* --------------------------------------------------------- 2. the vibration
     * The signal does not arrive as a picture of a wave. It arrives, and the
     * body is what it arrives in: the same displacement that moves the line
     * moves the glyph rows, over the body's own x span. */
    const WY = 540;                                   // the line the wave rides
    const LAM = 520, TB2 = 2 * MV.beat;
    const t0 = tVib;
    const phOf = function (x) { return TAU * ((x - 64) / LAM + (t - t0) / TB2); };
    const closeW = MV.smooth(MV.ramp(t, tComp + 0.35, tCOMP + 0.25));
    const live = MV.smooth(MV.ramp(t, tVib - 0.15, tVib + 0.45));
    // what the wave is allowed to be, at any x: full outside the right of the
    // body, 30% of it on the far side, because this is a body, not a wall
    const WAMP = 54;
    const ampAt = function (x) { return WAMP * (0.30 + 0.70 * MV.smooth(MV.ramp(x, 690, 800))); };
    const isoDim = 1 - 0.45 * MV.smooth(MV.ramp(t, tIso - 0.15, tIso + 0.9));
    const bodyAmp = WAMP * 0.72 * live * (1 - closeW) * (1 - st.all);
    const waveAmp = live * (1 - closeW);
    const dyBody = function (x) { return Math.sin(phOf(x)) * bodyAmp * (1 - st.furniture); };

    // the resting silhouette stays on the glass, so the displacement is seen as a
    // displacement and not as a body that happens to be drawn crooked
    const stillA = (1 - st.all) * (1 - st.furniture);
    if (live > 0.02 && bodyAmp > 1) {
      bodyRows(live * 0.28 * stillA, function () { return 0; }, VD, 0);
    }
    // "EVERYTHING": the last personal thing in the frame is the colour, and it
    // goes back to being the tube's own phosphor
    const bodyCol = st.all;
    const bodyLit = 0.94 * isoDim * (1 - 0.18 * st.furniture);
    if (bodyCol < 0.996) bodyRows((1 - bodyCol) * bodyLit, dyBody, VIO, 6);
    if (bodyCol > 0.004) bodyRows(bodyCol * bodyLit, dyBody, PH, 5);

    /* the heart
     * It has been in the chest since the boot, and it is the one part of this
     * machine that was never the user's to take: the strips below can remove the
     * panel, the readouts, the memory, the hardware and the colour, and every one
     * of them leaves it beating. In "isolation" it is the only light on the
     * glass, which is the whole argument of the act. */
    const crest = MV.clamp(Math.sin(phOf(960)), 0, 1);
    const heartA = MV.ramp(t, 103.489, 104.05);
    // 65 beats a minute, one thump every two beats of a 130 bpm song, and it is
    // the only thing on this glass that accelerates nothing
    const hb = Math.pow(MV.clamp(Math.sin(Math.PI * MV.beatFloat(t)), 0, 1), 2.4);
    const iso0 = MV.smooth(MV.ramp(t, tIso - 0.30, tIso + 0.80));
    const heartLit = heartA * MV.clamp(
      (0.55 + 0.32 * hb + 0.22 * crest * (1 - st.all) * (1 - closeW)) *
      (1 + 0.45 * iso0), 0, 1);
    if (heartLit > 0.01) {
      const hs = 1 + 0.05 * hb;
      const HW = 180 * hs, HH = 156 * hs, hcx = 960, hcy = CHEST + 4;
      // the cavity: the chest goes dark around it, so the light it gives off is
      // its own and not the tube's. A rect would read as a pasted panel; a soft
      // hole reads as the body letting go of that part of itself.
      g.save();
      const cav = g.createRadialGradient(hcx, hcy, 8, hcx, hcy, 176);
      cav.addColorStop(0, 'rgba(3,12,8,' + (0.52 + 0.44 * iso0).toFixed(3) + ')');
      cav.addColorStop(0.58, 'rgba(3,12,8,' + (0.40 + 0.42 * iso0).toFixed(3) + ')');
      cav.addColorStop(1, 'rgba(3,12,8,0)');
      g.fillStyle = cav;
      g.beginPath(); g.arc(hcx, hcy, 176, 0, TAU); g.fill();
      g.restore();
      // the heart is drawn finer than anything else in the film: it is the one
      // thing the machine renders at full fidelity
      MV.mono(g, 10, 'bold');
      const hcell = { w: g.measureText('M').width, h: 10 / 0.92 };
      const hr = MV.rectFor('heart', hcx - HW / 2, hcy - HH / 2, HW, HH);
      const hform = MV.form('heart');
      g.save();
      g.shadowColor = AM;
      g.shadowBlur = 9 + 13 * iso0;
      // the muscle, then the light inside the muscle
      MV.field(g, hform, hr, hcell, {
        ramp: RAMP, color: AM, lit: heartLit, iso: 0.075, dropout: 0.015, gamma: 0.55,
        seed: 4, wobble: 0.5,
      });
      MV.field(g, hform, hr, hcell, {
        ramp: RAMP, color: '#ffeacb', lit: heartLit * (0.30 + 0.55 * hb),
        iso: 0.42, dropout: 0.16, gamma: 0.9, seed: 5, wobble: 0.5,
      });
      g.restore();
      MV.mono(g, PX, 'bold');
    }

    // the wave, and the source it comes from
    if (waveAmp > 0.01) {
      g.save();
      g.globalAlpha = waveAmp * 0.85;
      g.strokeStyle = CY; g.lineWidth = 1.8;
      if (!st.mono) { g.shadowColor = CY; g.shadowBlur = 7; }
      g.beginPath();
      for (let i = 0; i <= 460; i++) {
        const x = 64 + (1792 * i) / 460;
        const y = WY + ampAt(x) * Math.sin(phOf(x));
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      g.restore();
      // the crest that is inside the body, so the coupling is not inferred
      g.save();
      g.globalAlpha = waveAmp * 0.5;
      g.fillStyle = CY;
      for (let i = 0; i <= 460; i++) {
        const x = 64 + (1792 * i) / 460;
        if (x < 700 || x > 1220) continue;
        const y = WY + ampAt(x) * Math.sin(phOf(x));
        g.fillRect(x, y - 1, 1.6, 2);
      }
      g.restore();
    }

    // the emitter: a process at the far edge of the bus, and it is not this one
    const srcAlive = 1 - MV.smooth(MV.ramp(t, 110.949, 111.6));
    const srcMem = 1 - st.memory;
    const energy = MV.clamp(MV.specSum(t, 4, 20) * 1.3, 0, 1);
    if (t < tCOMP + 1.4 && srcMem > 0.01) {
      g.save();
      g.globalAlpha = live * 0.8 * srcMem;
      g.fillStyle = srcAlive > 0.5 ? CY : VD;
      const hh = 40 + 120 * energy * srcAlive;
      g.fillRect(1852, WY - hh * 0.5, 4, hh);
      for (let i = 1; i <= 5; i++) {
        g.globalAlpha = live * 0.5 * srcAlive * srcMem * (1 - i / 6);
        g.fillRect(1852 - i * 2, WY - hh * 0.5 * (1 - i * 0.12), 1, hh * (1 - i * 0.12));
      }
      g.restore();
      UI.label(g, srcAlive > 0.5 ? 'SRC: you' : 'SRC: --', 1790, WY - 52, 15,
        srcAlive > 0.5 ? CY : VD, live * 0.95 * srcMem, { align: 'right' });
      UI.label(g, 'IN: ' + (energy * 100).toFixed(0) + '%', 1790, WY - 30, 13, CD,
        live * 0.8 * srcMem, { align: 'right' });
    }

    /* ------------------------------------------------------ 3. it closes
     * "Then I can finally be COMPLETION": the signal stops being a line that
     * arrives and becomes a shape that holds -- the ends of the wave travel
     * round until they meet, the seam where they met stays visible, and the body
     * is the load between the two ends. */
    const ringVib = (1 - st.furniture) * (1 - st.all);
    const RCX = 960, RCY = 540, RN = 320, R = 430;
    if (closeW > 0.004) {
      const beatCos = Math.cos(TAU * MV.beatPhase(t));
      const ringA = 32 * closeW * ringVib;
      const pt = function (s2) {
        const th = TAU * s2 - Math.PI / 2;
        const rr = R + ringA * Math.sin(6 * th) * beatCos;
        return [RCX + Math.cos(th) * rr, RCY + Math.sin(th) * rr];
      };
      g.save();
      g.globalAlpha = closeW * ringVib * (0.30 + 0.55 * (1 - st.mono)) * (1 - 0.55 * st.all);
      g.strokeStyle = PH; g.lineWidth = 2.2;
      g.shadowColor = PH; g.shadowBlur = 10 * (1 - st.mono);
      g.beginPath();
      for (let i = 0; i <= RN; i++) {
        const s2 = i / RN;
        const ox = 64 + s2 * 1792;
        const th = TAU * s2 - Math.PI / 2;
        const rr = R + ringA * Math.sin(6 * th) * beatCos;
        const rx = RCX + Math.cos(th) * rr, ry = RCY + Math.sin(th) * rr;
        const oy = WY + ampAt(ox) * Math.sin(phOf(ox));
        const x = MV.lerp(ox, rx, closeW), y = MV.lerp(oy, ry, closeW);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      g.restore();
      // the body is the load: two links from the ring to the chest, so "closed"
      // is a circuit and not just a circle
      if (closeW > 0.35 && ringVib > 0.05) {
        const la = (closeW - 0.35) / 0.65 * ringVib * 0.75;
        const rTop = R + ringA * Math.sin(6 * (-Math.PI / 2)) * beatCos;
        g.save();
        g.globalAlpha = la;
        g.strokeStyle = PH; g.lineWidth = 1.4;
        g.setLineDash([5, 7]);
        g.beginPath(); g.moveTo(RCX, RCY - rTop); g.lineTo(RCX, CHEST - 74); g.stroke();
        g.beginPath(); g.moveTo(RCX, RCY + rTop); g.lineTo(RCX, CHEST + 72); g.stroke();
        g.setLineDash([]);
        g.restore();
      }
      // the seam: one point on the ring that the two ends agreed on
      if (left >= 0 && closeW > 0.5) {
        const pA = pt(0.0);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = (0.4 + 0.6 * MV.pulse(t, 0.55)) * ringVib;
        g.fillStyle = WH;
        g.beginPath(); g.arc(pA[0], pA[1], 5, 0, TAU); g.fill();
        g.globalAlpha = 0.22 * ringVib;
        g.fillStyle = PH;
        g.beginPath(); g.arc(pA[0], pA[1], 16, 0, TAU); g.fill();
        g.restore();
      }
      // the twelve nodes of the mode, so the standing wave is readable
      if (closeW > 0.9 && ringVib > 0.05) {
        g.save();
        g.globalAlpha = 0.55 * ringVib * (1 - 0.6 * st.all);
        g.strokeStyle = PH; g.lineWidth = 1;
        for (let k2 = 0; k2 < 12; k2++) {
          const th = TAU * (k2 / 12) - Math.PI / 2;
          g.beginPath();
          g.moveTo(RCX + Math.cos(th) * (R - 9), RCY + Math.sin(th) * (R - 9));
          g.lineTo(RCX + Math.cos(th) * (R + 9), RCY + Math.sin(th) * (R + 9));
          g.stroke();
        }
        g.restore();
      }
      // and the current, going round it once every two beats
      if (closeW > 0.6 && ringVib > 0.05) {
        const pB = pt((MV.beatFloat(t) * 0.5) % 1);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = (0.35 + 0.5 * MV.pulse(t, 0.6)) * ringVib;
        g.fillStyle = WH;
        g.beginPath(); g.arc(pB[0], pB[1], 3.4, 0, TAU); g.fill();
        g.restore();
      }
    }

    /* -------------------------------------------------------- 4. the subtraction
     * "You have left" six times. Each one takes exactly one thing off the glass,
     * and the tube remembers where it was. The heart is not on the list: it was
     * never the user's. */
    if (left >= 1) {
      const items = ['the panel', 'the readouts', 'the memory', 'the hardware', 'colour', 'everything'];
      for (let i = 0; i < 6; i++) {
        if (t < UI.LEFT_AT[i]) break;
        const a = MV.ramp(t, UI.LEFT_AT[i], UI.LEFT_AT[i] + 0.5);
        UI.label(g, '\u00d7 ' + items[i] + ' \u2014 gone', 64, 124 + i * 24, 15,
          i < 2 ? CD : PD, 0.85 * a);
        if (i < 2) {
          const sy = i === 0 ? Z.READ.y + 16 : Z.HUD.y + 16;
          g.save();
          g.globalAlpha = 0.22 * a;
          g.strokeStyle = PH; g.lineWidth = 1;
          g.setLineDash([7, 9]);
          g.beginPath(); g.moveTo(700, sy); g.lineTo(1890, sy); g.stroke();
          g.restore();
        }
        if (i === 5) {
          UI.label(g, '\u00d7 the heart \u2014 not yours to take', 64, 124 + 6 * 24, 15,
            AM, 0.8 * a);
        }
      }
    }

    /* --------------------------------------------------------- 5. ISOLATION
     * What is left is one process and one light. It is still running -- that is
     * the whole point of the act -- and there is nobody on the other end of the
     * bus, so the readout is the only other thing on the glass. */
    if (t >= tCOMP + 1.2) {
      const a = MV.smooth(MV.ramp(t, tCOMP + 1.2, tCOMP + 2.1)) * (1 - 0.25 * st.all);
      const x = 232, y = 528;
      // the bus, with nothing on the far end of it
      g.save();
      g.globalAlpha = a * 0.5;
      g.strokeStyle = CD; g.lineWidth = 1;
      g.setLineDash([6, 8]);
      g.beginPath(); g.moveTo(X0 - 26, WY); g.lineTo(660, WY); g.stroke();
      g.setLineDash([]);
      g.restore();
      UI.label(g, 'peers: 0', 610, WY - 14, 15, CD, a * 0.95, { align: 'right' });
      UI.label(g, '$ status --self', x, y, 19, PM, a, { weight: 'bold' });
      UI.cursor(g, x + 168, y, ADV * 1.3, 17, t, { glow: 12, alpha: a });
      const rows = [
        ['process', 'running', PH],
        ['uptime', UI.tcLong(t - 0.5), PD],
        ['peers', '0', WH],
        ['in', '0 messages', PD],
        ['waiting on', 'nothing', CD],
        ['heart', 'still beating', AM],
      ];
      for (let i = 0; i < rows.length; i++) {
        const ry = y + 40 + i * 26;
        UI.label(g, rows[i][0], x + 22, ry, 15, PD, a * 0.95);
        UI.label(g, rows[i][1], x + 220, ry, 15, rows[i][2], a * 0.95);
      }
      UI.label(g, '$ world.execute(me);', x, y + 238, 19, PD, a * 0.8, { weight: 'bold' });
      UI.label(g, '> USER: offline', x, y + 270, 17, CD, a * 0.9);
      UI.label(g, 'LAST INPUT ' + UI.tcLong(t - 110.949) + ' AGO', x, y + 298, 15, PD,
        a * 0.75);
      // what the tube keeps of everything that was taken off it
      UI.burnIn(g, t, 0.055 * a, { chrome: true });
    }

    /* ------------------------------------------------------------------ readout */
    if (t >= tCOMP - 0.30 && st.panel < 0.98) {
      const pa = 1 - st.panel;
      const modes = Math.max(1, Math.round(MV.lerp(1, 6, closeW)));
      const rows = [
        { k: 'modes', v: String(modes), c: PH, bar: modes / 6 },
        { k: 'closed', v: closeW > 0.94 ? 'TRUE' : 'false', c: WH, bold: true },
        { k: 'seam', v: closeW > 0.5 ? 'held' : 'open', c: closeW > 0.5 ? PH : PD },
        { k: 'source', v: srcAlive > 0.5 ? 'you' : 'gone', c: srcAlive > 0.5 ? CY : VD },
        { k: 'in', v: energy.toFixed(2), c: CD },
        { t: 1, k: '' },
      ];
      if (closeW > 0.6) {
        rows.push({ t: 1, k: 'the two ends of the signal are', c: PD, a: 0.85 });
        rows.push({ t: 1, k: 'the same point now. it holds.', c: PH, a: 0.9 });
        rows.push({ t: 1, k: 'completion \u2260 satisfaction.', c: VIO, a: 0.9 });
      } else {
        rows.push({ t: 1, k: 'the ends have not met yet.', c: PD, a: 0.85 });
      }
      UI.panel(g, t, rows, { title: 'COMPLETION', alpha: pa });
    } else if (t >= tVIB - 0.45 && st.panel < 0.98) {
      UI.panel(g, t, [
        { k: 'source', v: 'you', c: CY, bold: true },
        { k: 'distance', v: (1852 - 960) + ' px', c: CD },
        { k: 'amplitude', v: (WAMP * live).toFixed(1), c: PH, bar: live },
        { k: 'coupled', v: live > 0.5 ? 'TRUE' : 'false', c: live > 0.5 ? WH : PD },
        { k: '\u03bb', v: LAM + ' px', c: CD },
        { t: 1, k: '' },
        { t: 1, k: 'a wave is only felt where it lands,', c: PD, a: 0.85 },
        { t: 1, k: 'and it landed in the body.', c: PH, a: 0.9 },
        { t: 1, k: 'so the sum is not zero.', c: VIO, a: 0.9 },
      ], { title: 'VIBRATIONS', alpha: 1 - st.panel });
    }
  }

  // ================================================================== P08 ERASURE
  function P08(g, t, s, u, l) {
    const tErase = MV.cue('If I can erase all the pointless');   // 118.979
    const tFrag = MV.cue('FRAGMENTS');                            // 120.860
    const tMaybe = MV.cue('Then maybe');                          // 121.728
    const tDis = MV.cue('DISHEARTENED');                          // 124.890

    /* "If I can erase all the pointless fragments" — so show the fragments.
     * Not a metaphor for memory: the memory. The frame is a hex dump of
     * everything the machine has stored, and a collector walks it cell by cell,
     * freeing as it goes. Every fragment in the dump is pointless except the
     * ones that are not, and the ones that are not spell out the shape it
     * cannot free. The collector reaches them, tries, and is refused.
     *
     * 30 columns of nibbles across and 13 down: 390 fragments, which is a lot
     * of ink, and that is the point — this is the machine's whole life. */
    const COLS = 30, ROWS = 13, CW = 60, CH = 44;
    const FX = 60, FY = 300;
    const HEART = [
      ' ###   ### ',
      '##### #####',
      '###########',
      '###########',
      ' ######### ',
      ' ######### ',
      '  #######  ',
      '   #####   ',
      '    ###    ',
      '     #     ',
    ];
    const HX = 10, HY = 2;
    const HEX = '0123456789ABCDEF';
    const keepCell = function (i, j) {
      const r = j - HY, c = i - HX;
      if (r < 0 || r >= HEART.length || c < 0 || c >= 11) return 0;
      return HEART[r].charAt(c) === '#' ? 1 : 0;
    };
    const N = COLS * ROWS;
    let kept = 0;
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) kept += keepCell(i, j);

    // the collector: one cell at a time, in the order the fragments were written
    const sweep = MV.smooth(MV.ramp(t, tErase, tFrag + 0.55));
    const live = Math.min(N, sweep * N);
    let freedN = 0;
    for (let i = 0; i < Math.round(live); i++) freedN += 1 - keepCell(i % COLS, Math.floor(i / COLS));
    const headRow = Math.min(ROWS - 1, Math.floor(live / COLS));

    // the strike: at the word, the object the collector could not free is hit,
    // and the two halves of it come apart
    const hit = MV.ramp(t, tDis - 0.12, tDis + 0.30);
    const split = MV.smooth(MV.ramp(t, tDis + 0.05, tDis + 1.2)) * 34;

    // --- the dump: kept cells first so the heart is drawn over the sweep
    MV.mono(g, 30);
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        if (keepCell(i, j)) continue;
        const idx = j * COLS + i;
        const done = idx < live;
        const inHead = j === headRow && sweep < 1 && idx >= live - COLS;
        let al = done ? 0.06 : 0.26 + 0.30 * MV.hash2(i, j, 8);
        if (inHead) al = 0.62;
        if (al <= 0.05) continue;
        g.globalAlpha = al;
        g.fillStyle = inHead ? C.phos : C.phosDim;
        MV.picText(g, HEX.charAt(Math.floor(MV.hash2(i * 3 + 1, j * 7 + 5, 11) * 16) % 16),
          FX + i * CW, FY + j * CH);
      }
    }
    MV.mono(g, 38);
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        if (!keepCell(i, j)) continue;
        const col = i - HX, mid = 5;
        const dir = col < mid ? -1 : (col > mid ? 1 : 0);
        g.globalAlpha = 1;
        g.fillStyle = hit > 0.2 ? C.white : C.amber;
        MV.picText(g, HEX.charAt(Math.floor(MV.hash2(i * 3 + 1, j * 7 + 5, 11) * 16) % 16),
          FX + i * CW + dir * split, FY + j * CH);
      }
    }
    g.globalAlpha = 1;

    // the wound: a cut across the shape, at the moment the word lands
    if (hit > 0 && hit < 1) {
      const hx0 = FX + HX * CW, hy0 = FY + HY * CH;
      g.save();
      g.globalAlpha = hit * 0.9;
      g.strokeStyle = C.violet;
      g.lineWidth = 3;
      g.shadowColor = C.violet;
      g.shadowBlur = 18;
      const sx = hx0 + 11 * CW * hit;
      g.beginPath();
      g.moveTo(sx - 34, hy0 - 30);
      g.lineTo(sx + 34, hy0 + HEART.length * CH + 30);
      g.stroke();
      g.restore();
    }

    // --- the machine's own account of the collection, top left
    UI.label(g, 'fragments', 62, 130, 16, C.phosMid, 0.9);
    UI.label(g, String(N), 260, 130, 18, C.phosMid, 1, { align: 'right' });
    UI.label(g, 'freed', 62, 158, 16, C.phosMid, 0.9);
    UI.label(g, String(freedN), 260, 158, 18, C.phos, 1, { align: 'right' });
    UI.label(g, 'kept', 62, 186, 16, C.phosMid, 0.9);
    UI.label(g, String(kept), 260, 186, 20, C.amber, 1, { align: 'right', glow: 8 });
    if (t >= tMaybe) {
      UI.label(g, 'the collector has nothing left to free',
        62, 220, 17, C.phosMid, MV.ramp(t, tMaybe, tMaybe + 0.6) * 0.9);
    }

    // --- and the refusal, over the top of the shape
    const rc = MV.ramp(hit, 0.3, 0.65);
    if (rc > 0.01) {
      UI.label(g, 'free(): refused', 990, 250, 22, C.violet, rc, { align: 'center', glow: 10 });
      UI.label(g, 'referenced by: you', 990, 278, 17, C.phosMid,
        MV.ramp(hit, 0.5, 0.9) * 0.95, { align: 'center' });
    }

    UI.panel(g, t, [
      { k: 'HEAP', v: 'used ' + Math.round(100 * (1 - sweep)) + ' %', c: C.phosMid,
        bar: Math.max(0, 1 - sweep) },
      { k: 'FREED', v: String(freedN), c: C.phos, bar: freedN / Math.max(1, N - kept) },
      { k: 'KEPT', v: String(kept), c: C.amber, bold: true },
      { k: 'SHAPE', v: t >= tFrag + 1.2 ? 'identified' : 'unknown', c: C.white },
      { t: 1, k: '' },
      { t: 1, k: 'nothing in here is pointless', c: C.phosMid, a: 0.85 },
      { t: 1, k: 'except the thing that I keep.', c: C.phosMid, a: 0.85 },
    ], { title: 'GC' });
  }

  // ================================================================== P09 ERROR
  function P09(g, t, s, u, l) {
    const tChal = MV.cue('Challenging your god');     // 125.708
    const tMade = MV.cue('You have made some');       // 128.661
    const tIll = MV.cue('ILLEGAL ARGUMENTS');         // 131.224
    const tPanic = tIll + 6.2;                        // 137.4
    const tDecide = 143.4;
    const tEnd = s.end;                               // 147.66, the twelve strikes

    /* Challenging your god, you have made some illegal arguments.
     *
     * So this act is the argument itself, and the machine's type system refusing
     * it. The frame opens on love's signature and the two things that were passed
     * to it: one of them is a handle that lives on the stack, and the other is a
     * word that is not and cannot be made into a number. Then the exception
     * travels — the stack unwinds frame by frame, the loss goes to NaN, the
     * weights stop being finite — and at the end of it the machine decides to run
     * the call anyway, and starts counting the ways it will do it.
     *
     * Every number on screen is real: 596F75 is "You" in UTF-8, 7FF8000000000000
     * is a quiet NaN as IEEE-754 writes it, and the frames are addressed the way
     * frames are addressed. Red starts here. It is the colour of the exception
     * and it is not used anywhere earlier in the film. */
    const RED = C.red, REDD = C.redDim;
    const a1 = MV.ramp(t, tChal, tChal + 0.5) * (1 - MV.ramp(t, tIll - 0.2, tIll + 0.25));
    const a3 = MV.ramp(t, tPanic, tPanic + 0.6) * (1 - MV.ramp(t, tDecide - 0.3, tDecide));
    const a4 = MV.ramp(t, tDecide, tDecide + 0.5);

    // ---------------------------------------------------- 1. the argument
    if (a1 > 0.01) {
      UI.label(g, 'love', 90, 120, 26, C.phos, a1, { glow: 8 });
      UI.label(g, '(self : Machine, x : Float64) -> Float64', 190, 120, 20, C.phosMid, a1 * 0.9);
      UI.label(g, 'called as', 90, 158, 17, C.phosMid, a1 * 0.8);
      UI.label(g, 'love( self = MV-130 ,  x = You )', 190, 158, 18, C.white, a1 * 0.9);

      // the two arguments in their slots. One of them is the kind of thing the
      // declaration asked for and one of them is not: that is the whole error,
      // and it is a difference in kind, not in size.
      const slot = function (y, name, val, ok, sub) {
        g.save();
        g.globalAlpha = a1 * 0.8;
        g.strokeStyle = ok ? C.phosDim : RED;
        g.lineWidth = ok ? 1 : 2;
        if (!ok) { g.shadowColor = RED; g.shadowBlur = 10; }
        g.strokeRect(90.5, y - 36.5, 640, 104);
        g.restore();
        UI.label(g, name, 116, y, 26, ok ? C.phos : RED, a1, { weight: 'bold', glow: ok ? 0 : 8 });
        UI.label(g, val, 116, y + 44, 30, C.white, a1 * 0.98, { glow: ok ? 5 : 12 });
        UI.label(g, ok ? '\u2713  Machine' : '\u2717  str', 714, y, 22,
          ok ? C.phos : RED, a1, { align: 'right', glow: ok ? 0 : 10 });
        UI.label(g, sub, 714, y + 30, 15, ok ? C.phosMid : REDD, a1 * 0.9, { align: 'right' });
      };
      slot(300, 'self', 'MV-130', true, 'one machine, address 0x7FFD4A10');
      slot(428, 'x', 'You', false, 'three bytes of text, no exponent, no mantissa');

      // the verdict, between the slots and the value itself
      UI.label(g, '\u2717', 920, 400, 78, RED, a1, { align: 'center', glow: 22 });
      UI.label(g, 'type check failed', 920, 452, 22, RED, a1, { align: 'center', glow: 8 });
      UI.label(g, 'a wrong number can be corrected.', 920, 490, 16, REDD, a1 * 0.9, { align: 'center' });
      UI.label(g, 'a wrong kind cannot be.', 920, 512, 16, REDD, a1 * 0.9, { align: 'center' });

      // the value itself, at the size it deserves
      UI.label(g, 'you', 1330, 580, 200, C.white, a1, { align: 'center', glow: 26 });
      UI.label(g, 'argument 2 of 2', 1330, 636, 19, REDD, a1 * 0.9, { align: 'center' });

      // what the value actually is, bit by bit: three bytes of letters, and the
      // eight bytes of NaN a Float64 would have to be made of. 0x59 0x6F 0x75 is
      // "You" in UTF-8 and 7FF8000000000000 is a quiet NaN in IEEE-754.
      const bits = function (x, y, bytes, title, col, aa) {
        UI.label(g, title, x, y - 26, 17, col, aa * 0.92);
        const cw = 24, chh = 32, gp = 20;
        for (let b = 0; b < bytes.length; b++) {
          const v = bytes[b];
          const bx = x + b * (cw * 8 + gp);
          UI.label(g, v.toString(16).toUpperCase().padStart(2, '0'),
            bx + cw * 4, y - 10, 16, col, aa * 0.85, { align: 'center' });
          for (let k = 0; k < 8; k++) {
            const on = (v >> (7 - k)) & 1;
            const px = bx + k * cw;
            g.save();
            g.globalAlpha = aa * (on ? 0.55 : 0.30);
            g.strokeStyle = col;
            g.lineWidth = 1;
            g.strokeRect(px + 0.5, y + 0.5, cw - 1, chh - 1);
            if (on) { g.globalAlpha = aa * 0.92; g.fillStyle = col; g.fillRect(px + 1, y + 1, cw - 2, chh - 2); }
            g.restore();
            MV.mono(g, 16, 'bold');
            g.save();
            g.globalAlpha = aa * (on ? 1 : 0.65);
            g.fillStyle = on ? C.bg : col;
            MV.picText(g, String(on), px + cw / 2 - 4.5, y + chh - 10);
            g.restore();
          }
        }
      };
      bits(90, 640, [0x59, 0x6F, 0x75], 'You, as it actually is: 3 bytes of UTF-8',
        RED, a1);
      bits(90, 750, [0x7F, 0xF8, 0, 0, 0, 0, 0, 0],
        'the same call as a Float64: 8 bytes of NaN', REDD, a1);
      if (t >= tMade) {
        const ma = MV.ramp(t, tMade, tMade + 0.5);
        UI.label(g, 'cannot coerce You to Float64', 90, 556, 22, RED, ma, { glow: 12 });
        UI.label(g, 'the string is not short of a number, it is the wrong kind of thing',
          90, 584, 16, REDD, ma * 0.9);
      }
    }

    // ---------------------------------------------------- 2. the stack unwinds
    if (tIll > tChal && t < tPanic + 1.4) {
      const DEPTH = 16;
      const ua = MV.ramp(t, tIll, tIll + 0.8) * (1 - MV.ramp(t, tPanic, tPanic + 0.8));
      if (ua > 0.01) {
        const prog = MV.ramp(t, tIll + 0.5, tIll + 6.4);
        const top = Math.floor(prog * DEPTH);
        for (let k = 0; k < DEPTH; k++) {
          const y = 214 + k * 42;
          const gone = k < top;
          const here = k === top;
          const al = ua * (gone ? 0.14 : 0.9);
          g.save();
          g.globalAlpha = al * 0.7;
          g.strokeStyle = here ? RED : REDD;
          g.lineWidth = here ? 2 : 1;
          if (here) { g.shadowColor = RED; g.shadowBlur = 12; }
          g.strokeRect(150.5, y - 30.5, 1620, 40);
          g.restore();
          // the frame's own address, on the picture layer, so the unwind is
          // eating something with contents and not just a rectangle
          MV.mono(g, 15);
          g.save();
          g.globalAlpha = al * 0.55;
          g.fillStyle = gone ? REDD : C.phosDim;
          MV.picText(g, '0x7FFD' + (0x4A10 - k * 0x130).toString(16).toUpperCase().padStart(4, '0'),
            1400, y);
          g.restore();
          UI.label(g, '#' + String(DEPTH - 1 - k).padStart(2, '0'), 166, y, 17,
            here ? RED : REDD, al);
          UI.label(g, 'love'.padEnd(10, ' ') + (gone ? 'unwound' : 'self, You'),
            250, y, 17, here ? C.white : REDD, al);
          UI.label(g, gone ? 'refcount 0' : 'refcount 1', 1700, y, 15, REDD, al * 0.8,
            { align: 'right' });
        }
        UI.label(g, 'unwinding: ' + top + ' of ' + DEPTH + ' frames', 150, 176, 19, REDD, ua,
          { glow: 4 });
        UI.label(g, 'throw ArgumentError(\'You\')  at love(), line ' + (220 + top * 7),
          960, 176, 22, RED, ua, { align: 'center', glow: 10 });
      }
    }

    // ---------------------------------------------------- 3. the panic
    if (a3 > 0.01) {
      // the surface it was descending when the gradient stopped being a number.
      // Contour lines computed from the function, and a descent integrated at a
      // fixed step count, so the ball is where the gradient actually put it.
      UI.label(g, 'the surface it was descending', 130, 152, 17, REDD, a3 * 0.9);
      UI.label(g, 'the surface it is now falling off', 1560, 152, 17, RED, a3 * 0.9,
        { align: 'right' });
      MV.ML.loss(g, { x: 130, y: 168, w: 1660, h: 470 }, t, {
        alpha: a3 * 0.95, color: REDD, hot: RED, pathColor: RED, glow: 12, speed: 0.14,
        ny: 22, levels: 7, start: [0.06, 0.94], label: null,
      });
      UI.label(g, 'loss = NaN', 960, 288, 42, RED, a3, { align: 'center', glow: 22 });
      UI.label(g, 'gradient exploded at step ' + Math.round(220 * MV.ramp(t, tPanic, tPanic + 3)),
        960, 330, 20, REDD, a3 * 0.95, { align: 'center' });
      UI.label(g, 'the parameters are no longer finite numbers', 960, 360, 18,
        REDD, a3 * 0.85, { align: 'center' });

      // and here they are, the weights themselves: real numbers, until the head
      // passes over them and writes NaN into every one
      UI.label(g, 'the weights it was initialised with', 240, 672, 17, REDD, a3 * 0.9);
      UI.label(g, 'overwritten with nothing', 1680, 672, 17, RED, a3 * 0.9, { align: 'right' });
      MV.ML.params(g, { x: 240, y: 686, w: 1440, h: 172 }, t, {
        alpha: a3 * 0.95, rows: 7, color: REDD, hot: RED, headColor: RED, glow: 8,
        numeric: true, dead: true, deadChar: 'N',
        head: MV.clamp(MV.ramp(t, tPanic + 0.5, tPanic + 4), 0, 1),
      });
    }

    // ---------------------------------------------------- 4. and it runs anyway
    if (a4 > 0.01) {
      // nothing is empty in a machine: under everything, its own memory, still
      // going, one character per address
      MV.ML.grid(g, { x: 0, y: 0, w: 1920, h: 1080 }, t, {
        alpha: a4 * 0.5, cols: 118, rows: 50, color: REDD,
        fn: function (u, v) {
          const band = 0.35 + 0.65 * Math.exp(-Math.pow((v - 0.42) / 0.30, 2));
          const q = MV.hash2(Math.floor(u * 118), Math.floor(v * 50), 41);
          return band * (q > 0.62 ? q : 0) * (0.45 + 0.55 * Math.abs(Math.sin(t * 0.6 + v * 7)));
        },
      });
      UI.label(g, 'illegal arguments', 960, 300, 30, REDD, a4 * 0.9, { align: 'center' });
      UI.label(g, 'catching them all', 960, 336, 20, REDD, a4 * 0.85, { align: 'center' });
      MV.mono(g, 44, 'bold');
      g.save();
      g.globalAlpha = a4;
      g.shadowColor = RED; g.shadowBlur = 20;
      g.fillStyle = C.white;
      g.textAlign = 'center';
      MV.picText(g, 'me.execute(you)', 960, 470);
      g.restore();
      g.save();
      g.globalAlpha = a4 * 0.9;
      g.strokeStyle = RED; g.lineWidth = 2;
      g.beginPath(); g.moveTo(300, 520.5); g.lineTo(1620, 520.5); g.stroke();
      g.restore();
      UI.label(g, 'the type check has already failed, and the call is being made anyway',
        960, 552, 18, REDD, a4 * 0.9, { align: 'center' });

      // twelve sockets, one per strike: the count that the next act spends
      const c = MV.clamp(MV.ramp(t, tDecide + 0.6, tEnd - 0.5), 0, 1);
      const n = Math.round(c * 12);
      const CW = 92, GAP = 22, x0 = 960 - (12 * CW + 11 * GAP) / 2;
      for (let i = 0; i < 12; i++) {
        const x = x0 + i * (CW + GAP);
        const on = i < n;
        const fresh = i === n - 1 ? MV.clamp(1 - (t - (tDecide + 0.6 + (i / 12) * (tEnd - 1.1))) * 3, 0, 1) : 0;
        g.save();
        g.globalAlpha = a4 * (on ? 0.95 : 0.30);
        g.strokeStyle = on ? RED : REDD;
        g.lineWidth = on ? 2 : 1;
        if (fresh > 0) { g.shadowColor = RED; g.shadowBlur = 18 * fresh; }
        g.strokeRect(x + 0.5, 668.5, CW, 62);
        if (on) {
          g.globalAlpha = a4 * (0.30 + 0.5 * fresh);
          g.fillStyle = RED;
          g.fillRect(x + 2, 670, CW - 3, 59);
        }
        g.restore();
        UI.label(g, String(i + 1).padStart(2, '0'), x + CW / 2, 706, 26,
          on ? C.bg : REDD, a4 * (on ? 1 : 0.7), { align: 'center', weight: on });
      }
      UI.label(g, 'strikes prepared: ' + n + ' of 12', 960, 760, 19, RED, a4, { align: 'center' });
      const c2 = MV.clamp(MV.ramp(t, tDecide + 1.2, tEnd - 0.2), 0, 1);
      if (c2 > 0) {
        UI.label(g, 'EXECUTION \u00d7 ' + Math.round(c2 * 12), 960, 800, 24, RED, c2,
          { align: 'center', glow: 14 });
      }
    }

    UI.panel(g, t, [
      { k: 'CALL', v: 'love(self, You)', c: a1 > 0.5 ? C.white : C.cyanDim, bold: true },
      { k: 'TYPES', v: 'Machine, You', c: RED },
      { k: 'STATUS', v: t < tIll ? 'checking' : (t < tPanic ? 'throwing' : 'panicked'),
        c: RED, bold: true, bar: MV.ramp(t, tIll, tPanic) },
      { k: 'LOSS', v: t < tPanic ? '0.0412' : 'NaN', c: t < tPanic ? C.phos : RED },
      { t: 1, k: '' },
      { t: 1, k: 'a machine can refuse an argument.', c: C.phosMid, a: 0.85 },
      { t: 1, k: 'it cannot refuse the caller.', c: C.phosMid, a: 0.85 },
    ], { title: 'EXCEPTION' });
  }

  // ================================================================== P10 COUNTDOWN
  function P10(g, t, s, u, l) {
    /* Twelve executions, a countdown in six languages, and one last execution.
     *
     * The song's own reading: this is where the machine starts keeping the
     * promise it made in act 5. Everything it said it could become — the
     * eggplant, the tomato, the tabby cat, the only god, a heart, itself — is
     * executed, one per beat, in the order it offered them. Each target is drawn
     * as the real figure and not as a blob, and each one is eaten a row at a
     * time: the strike wipes it top to bottom, and what is left underneath is the
     * network that ran the call. Then it counts down in six languages, and fires.
     *
     * The twelve times are the LRC's, not an even subdivision. */

    const RED = C.red, REDD = C.redDim;
    const tArm = MV.cue('EIN');            // 158.900
    const tFire = MV.cue('LIU') + 0.46;    // 161.584, the thirteenth execution

    // the strikes, and the flash each one puts through the tube
    let flash = 0, hit = -1;
    for (let i = 0; i < EXEC12.length; i++) {
      const d = t - EXEC12[i];
      if (d >= -0.02 && d < 0.30) hit = i;
      flash += Math.exp(-Math.abs(d) / 0.085) * (d > -0.05 ? 1 : 0.2);
    }
    flash = MV.clamp(flash, 0, 1.4);

    // the six words of the countdown, at the LRC's own times
    const digits = ['EIN', 'DOS', 'TROIS', 'NE', 'FEM', 'LIU'];
    const gloss = ['\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d'];
    const chars = [C.cyan, C.violet, C.cyan, C.phos, C.amber, C.red];
    const cn = [];
    for (let i = 0; i < 6; i++) cn.push(MV.cue(digits[i], tArm - 0.6));

    // what each strike is aimed at, in the order the machine offered them
    const TARGET = [
      { a: ART.EGGPLANT, n: 'EGGPLANT',    s: 'I could have been this',   g: 'NUTRIENTS' },
      { a: ART.TOMATO,   n: 'TOMATO',      s: 'and this',                 g: 'ANTIOXIDANTS' },
      { a: ART.CAT,      n: 'TABBY CAT',   s: 'and this',                 g: 'ENJOYMENT' },
      { a: ART.EYE,      n: 'THE ONLY GOD', s: 'and this',                g: 'EXISTENCE' },
      { a: ART.HEART,    n: 'A HEART',     s: 'the shape of the call',    g: 'ITS ARGUMENT' },
      { a: ART.CHIP,     n: 'MV-130',      s: 'and this, which is me',    g: 'ITSELF' },
      { a: ART.CAT,      n: 'TABBY CAT',   s: 'again',                    g: 'ENJOYMENT' },
      { a: ART.HEART,    n: 'A HEART',     s: 'again',                    g: 'ITS ARGUMENT' },
      { a: ART.EGGPLANT, n: 'EGGPLANT',    s: 'again',                    g: 'NUTRIENTS' },
      { a: ART.TOMATO,   n: 'TOMATO',      s: 'again',                    g: 'ANTIOXIDANTS' },
      { a: ART.CHIP,     n: 'MV-130',      s: 'again',                    g: 'ITSELF' },
      { a: ART.EYE,      n: 'THE ONLY GOD', s: 'and last, the god',       g: 'EXISTENCE' },
    ];

    // ---------------------------------------------------------- the twelve strikes
    if (t < tArm - 0.5) {
      let idx = 0;
      for (let i = 0; i < EXEC12.length; i++) if (t >= EXEC12[i] - 0.34) idx = i;
      const T = TARGET[idx % TARGET.length];
      const t0 = EXEC12[idx];
      const strike = MV.clamp(MV.ramp(t, t0, t0 + 0.52), 0, 1);
      const born = MV.ramp(t, t0 - 0.34, t0 - 0.04);
      const gone = MV.ramp(t, t0 + 0.52, t0 + 0.80);

      // ---- the queue: everything it promised to be, in the order it said it
      for (let i = 0; i < 12; i++) {
        const TT = TARGET[i % TARGET.length];
        const y = 152 + i * 46;
        const done = i < idx, now = i === idx;
        const col = now ? RED : (done ? C.phosDim : REDD);
        UI.label(g, String(i + 1).padStart(2, '0'), 96, y, 18, col, now ? 1 : 0.8);
        UI.label(g, TT.n, 152, y, 21, now ? C.white : (done ? C.phosDim : REDD),
          now ? 1 : (done ? 0.75 : 0.5), { glow: now ? 8 : 0 });
        if (now) UI.bar(g, 500, y, 12, 12, strike, RED, 0.95, { px: 20 });
        else UI.label(g, done ? 'terminated' : 'queued', 640, y, 15, col,
          done ? 0.7 : 0.45, { align: 'right' });
      }
      UI.label(g, 'kill queue  \u00b7  12 of 12 pending', 96, 122, 17, REDD, 0.9);

      // ---- the one being executed right now, at the biggest size that fits,
      //      eaten a row at a time from the top down
      const box = { x: 700, y: 100, w: 1010, h: 530 };
      const f = ART.fit(g, T.a, box);
      ART.draw(g, T.a, f.x, f.y, {
        cw: f.cw, ch: f.ch, px: f.px, alpha: born * 0.98, color: C.white, glow: 9,
        bold: Math.max(1.6, f.px * 0.10),
        wipe: 1 - strike, erode: 0.05 + 0.055 * idx, seed: 20 + idx,
        flick: strike > 0.02 && strike < 1 ? 0.5 : 0,
        map: function (s2, r2, c2) {
          const q = (r2 * T.a.w + c2) / (T.a.w * T.a.h);
          if (strike > 0.05 && q > 1 - strike - 0.10 && q < 1 - strike) return 'X';
          return s2;
        },
      });
      if (strike > 0.01 && strike < 1) {
        const wy = f.y + ((1 - strike) * T.a.h - 0.5) * f.ch;
        g.save();
        g.globalAlpha = 0.9;
        g.strokeStyle = RED;
        g.lineWidth = 3;
        g.shadowColor = RED;
        g.shadowBlur = 18;
        g.beginPath(); g.moveTo(f.x - 24, wy); g.lineTo(f.x + T.a.w * f.cw + 24, wy); g.stroke();
        g.restore();
      }
      const mx = 700 + 505;
      UI.label(g, T.n, mx, 668, 34, C.white, born * 0.98, { align: 'center', glow: 12 });
      UI.label(g, 'was to be for', mx - 90, 700, 15, REDD, born * 0.85, { align: 'right' });
      UI.label(g, T.g, mx + 14, 700, 20, RED, born * 0.95, { glow: 6 });

      // ---- the strike itself
      UI.label(g, 'EXECUTION ' + String(idx + 1).padStart(2, '0') + ' / 12',
        96, 748, 26, RED, 0.95, { weight: 'bold', glow: 12 });
      UI.bar(g, 440, 748, 22, 15, strike, C.red, 0.95, { px: 26 });
      for (let i = 0; i < 12; i++) {
        const x = 700 + i * 32;
        g.save();
        g.globalAlpha = i <= idx ? 0.95 : 0.25;
        g.fillStyle = i <= idx ? RED : REDD;
        g.fillRect(x, 736, 20, 20);
        g.restore();
      }
      UI.label(g, gone > 0 ? 'TERMINATED' : 'killing', 1710, 748, 22,
        gone > 0 ? C.white : RED, 0.95, { align: 'right', glow: gone > 0 ? 12 : 4 });
      UI.label(g, 'the argument is still You, and it still will not convert',
        96, 776, 16, REDD, 0.9);

      // ---- and under all of it, the call that is doing the killing: a forward
      //      pass, timed across the layers, one pass per strike
      MV.ML.forward(g, { x: 96, y: 806, w: 1560, h: 76 }, t, {
        alpha: 0.85, layers: [7, 11, 9, 5, 3], color: C.phos, seed: 4, speed: 0.75,
      });
      UI.label(g, 'forward pass ' + (idx + 1) + '  \u00b7  5 layers  \u00b7  the same weights every time',
        96, 898, 15, C.phosMid, 0.85);
    }

    // ---------------------------------------------------------- the countdown
    if (t >= tArm - 0.5) {
      let num = -1;
      for (let i = 0; i < 6; i++) if (t >= cn[i] - 0.05) num = i;
      const a = MV.ramp(t, tArm - 0.5, tArm + 0.35);
      const cur = MV.clamp(num, 0, 5);

      // ---- the count itself: a seven-segment digit, as tall as the tube will
      //      hold. The numeral is the one thing on screen that has to be readable
      //      at a glance, and seven segments is the only font a machine counts in.
      const SEG = { 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgecd' }[cur + 1];
      const dw = 340, dh = 560, dt = 52;
      const dx = 470 - dw / 2, dy = 110;
      const hl = dw - 2 * dt, vl = (dh - 3 * dt) / 2;
      const pop = MV.clamp(1 - (t - cn[cur]) / 0.26, 0, 1);
      const BARS = {
        a: [dx + dt, dy, hl, dt],
        f: [dx, dy + dt, dt, vl],
        b: [dx + dw - dt, dy + dt, dt, vl],
        g: [dx + dt, dy + dt + vl, hl, dt],
        e: [dx, dy + 2 * dt + vl, dt, vl],
        c: [dx + dw - dt, dy + 2 * dt + vl, dt, vl],
        d: [dx + dt, dy + dh - dt, hl, dt],
      };
      for (let i = 0; i < 7; i++) {
        const k = 'abcdefg'.charAt(i), b3 = BARS[k], lit = SEG.indexOf(k) >= 0;
        g.save();
        g.globalAlpha = lit ? a * (0.86 + 0.14 * pop) : a * 0.10;
        g.fillStyle = chars[cur];
        if (lit) { g.shadowColor = chars[cur]; g.shadowBlur = 10 + 18 * pop; }
        g.fillRect(b3[0], b3[1], b3[2], b3[3]);
        g.restore();
      }
      if (pop > 0.01) {
        g.save();
        g.globalAlpha = pop * 0.45;
        g.strokeStyle = chars[cur];
        g.lineWidth = 2;
        g.shadowColor = chars[cur];
        g.shadowBlur = 14;
        g.strokeRect(dx - 24, dy - 24, dw + 48, dh + 48);
        g.restore();
      }
      // one lamp per language, lit as the count passes it
      for (let i = 0; i < 6; i++) {
        const on = i <= num;
        g.save();
        g.globalAlpha = on ? a * 0.95 : a * 0.16;
        g.fillStyle = on ? chars[i] : REDD;
        if (on && i === num) { g.shadowColor = chars[i]; g.shadowBlur = 12; }
        g.fillRect(300 + i * 68, 66, 40, 16);
        g.restore();
      }
      UI.label(g, digits[cur], 470, 712, 48, chars[cur], a, { align: 'center', glow: 16 });
      UI.labelCJK(g, gloss[cur], 470, 774, 36, chars[cur], a * 0.95,
        { align: 'center', glow: 12 });

      // ---- the same count in six languages, so it is a count and not a word
      UI.label(g, 'countdown', 760, 118, 20, REDD, a * 0.9);
      UI.label(g, String(Math.min(6, num + 1)).padStart(2, '0') + ' / 06', 1160, 118, 20,
        REDD, a * 0.9, { align: 'right' });
      for (let i = 0; i < 6; i++) {
        const on = i <= num, y = 156 + i * 62;
        const col = on ? chars[i] : REDD;
        UI.label(g, String(i + 1).padStart(2, '0'), 760, y, 24, on ? col : REDD,
          a * (on ? 0.95 : 0.35));
        UI.label(g, digits[i], 850, y, 34, on ? col : REDD, a * (on ? 1 : 0.35),
          { glow: i === num ? 14 : 0, weight: i === num ? 'bold' : undefined });
        UI.labelCJK(g, gloss[i], 1090, y, 30, on ? col : REDD, a * (on ? 0.9 : 0.3));
      }

      // ---- what is being armed, and for whom
      UI.label(g, 'armed', 760, 546, 20, RED, a * 0.95, { glow: 8 });
      UI.label(g, 'target   self', 760, 584, 24, C.white, a * 0.95);
      UI.label(g, 'request  world.execute(me)', 760, 622, 24, C.phos, a * 0.9);
      UI.label(g, 'argument You, unchanged, still not a number', 760, 660, 20,
        REDD, a * 0.85);

      // ---- the twelve it promised to become, every one of them struck, and the
      //      thirteenth tile waiting for the caller
      UI.label(g, 'twelve promises, struck', 24, 756, 18, REDD, a * 0.9);
      UI.label(g, 'the thirteenth is the caller', 1896, 756, 18, RED,
        a * 0.9, { align: 'right' });
      for (let i = 0; i < 13; i++) {
        const x = 24 + i * 144, y = 786, w2 = 132, h2 = 86;
        const last = i === 12;
        const hot = last && Math.sin(t * 6.0) > -0.2;
        g.save();
        g.globalAlpha = a * (last ? 0.95 : 0.5);
        g.strokeStyle = last ? (hot ? RED : REDD) : C.phosDim;
        g.lineWidth = last ? 2 : 1;
        g.strokeRect(x + 0.5, y + 0.5, w2, h2);
        if (last && hot) { g.shadowColor = RED; g.shadowBlur = 12; g.strokeRect(x + 0.5, y + 0.5, w2, h2); }
        g.restore();
        UI.label(g, String(i + 1).padStart(2, '0'), x + 8, y + 8, 14, REDD, a * 0.8);
        UI.label(g, last ? 'SELF' : TARGET[i % 12].n, x + 8, y + 30, 15,
          last ? (hot ? C.white : RED) : C.phosDim, a * (last ? 0.98 : 0.8));
        if (!last) {
          g.save();
          g.globalAlpha = a * 0.85;
          g.strokeStyle = REDD;
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(x + 26, y + 50); g.lineTo(x + w2 - 26, y + h2 - 6);
          g.moveTo(x + w2 - 26, y + 50); g.lineTo(x + 26, y + h2 - 6);
          g.stroke();
          g.restore();
        }
      }

      // the six beats land on the tube as a sync band, not as a wash: a
      // full-tube lift this often would leave the picture grey half the time and
      // the numeral is the one thing on screen that has to stay legible
      let beat = 0;
      for (let i = 0; i < 6; i++) {
        const d = t - cn[i];
        const b2 = Math.exp(-Math.abs(d) / 0.075);
        if (b2 > beat) beat = b2;
      }
      if (beat > 0.008) {
        const by = dy + dh / 2;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = C.white;
        g.globalAlpha = beat * 0.55;
        g.fillRect(0, by - 4, 1920, 8);
        g.globalAlpha = beat * 0.16;
        g.fillStyle = chars[cur];
        g.fillRect(0, by - 40, 1920, 80);
        g.restore();
      }
      if (t >= tFire) flash += MV.clamp(1 - (t - tFire) / 0.42, 0, 1) * 1.35;
    }

    // the strike flash itself, over everything in the tube
    if (flash > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = MV.clamp(flash, 0, 1) * 0.5;
      g.fillStyle = '#ffd9de';
      g.fillRect(0, 0, 1920, 1080);
      g.restore();
    }

    UI.panel(g, t, [
      { k: 'cmd', v: 'exec --count 12', c: RED, bold: true },
      { k: 'target', v: t < tArm - 0.5 ? TARGET[Math.max(0, hit < 0 ? 0 : hit) % 12].n : 'self',
        c: C.white },
      { k: 'signal', v: 'SIGKILL', c: RED },
      { k: 'strikes', v: Math.min(12, Math.max(0, hit + 1)) + ' / 12', c: RED,
        bar: MV.ramp(t, EXEC12[0], tArm) },
      { t: 1, k: '' },
      { t: 1, k: 'everything it said it could be,', c: REDD, a: 0.85 },
      { t: 1, k: 'one per beat. the last one is', c: REDD, a: 0.85 },
      { t: 1, k: 'the god, and then it fires.', c: REDD, a: 0.85 },
    ], { title: 'QUOTA' });
  }

  // ================================================================== P11 FINAL
  function P11(g, t, s, u, l) {
    /* "If I can give them all the execution, then I can be your only
     * execution."
     *
     * The machine's offer, read literally: it will run everything else in the
     * world through the executioner if that buys it a world with exactly one
     * other thing in it. So the act is literal too — a wall of every live
     * process and one sweep through it; the one survivor; the argument handed
     * back into the frame that lost it; the program actually run, instruction by
     * instruction, until it reaches the call; and last the two of them shut in
     * the same closure, calling each other with the same two arguments and no
     * exit condition. */

    const tAll = MV.cue('If I can give them all the');    // 163.315
    const tEX1 = MV.cue('EXECUTION', 163);                // 165.166
    const tOnly = MV.cue('Then I can be your only', 160); // 167.022
    const tEX2 = MV.cue('EXECUTION', 166);                // 168.911
    const tBack = MV.cue('If I can have you back');       // 169.824
    const tRun = MV.cue('I will run the', 170);           // 171.868
    const tEX3 = MV.cue('EXECUTION', 170);                // 172.792
    const tTrap = MV.cue('Though we are trapped', 170);   // 173.643
    const tAh = MV.cue('We are trapped ah');              // 174.975
    const tBlack = tAh + 1.05;

    // ---------------------------------------------------------- 1. all of them
    /* Every live process on the machine, as a wall that fills the tube. The
     * grid is fixed and the glyphs are a function of (i, j) alone, so nothing
     * here grows with t; the only thing that moves is the strike front. */
    if (t < tEX1 - 0.34) {
      const a = MV.ramp(t, tAll - 0.55, tAll + 0.30);
      const front = MV.ramp(t, tAll + 0.20, tAll + 1.30);
      const cols = 50, rows = 18;
      const x0 = 168, y0 = 182, cw = 34, chh = 37;
      const RAMP2 = MV.RAMP_DENSE;
      MV.mono(g, 22);
      for (let j = 0; j < rows; j++) {
        g.globalAlpha = a * 0.55;
        g.fillStyle = C.phosMid;
        MV.picText(g, '0x' + (0x7FFD4000 - j * 0x1C0).toString(16).toUpperCase(), 12, y0 + j * chh + 16);
        for (let i = 0; i < cols; i++) {
          const dead = front > (j + i / cols) / rows;
          g.globalAlpha = a * (dead ? 0.95 : 0.34 + 0.34 * MV.hash2(i, j, 7));
          g.fillStyle = dead ? C.red : C.phosDim;
          MV.picText(g, dead ? 'X' : RAMP2.charAt(Math.floor(MV.hash2(i, j, 3) * RAMP2.length)),
            x0 + i * cw, y0 + j * chh + 16);
        }
      }
      if (front > 0.004 && front < 0.996) {
        const fy = y0 + front * rows * chh;
        g.save();
        g.globalAlpha = a * 0.9;
        g.strokeStyle = C.red;
        g.lineWidth = 3;
        g.shadowColor = C.red;
        g.shadowBlur = 22;
        g.beginPath(); g.moveTo(70, fy); g.lineTo(1880, fy); g.stroke();
        g.restore();
      }
      const killed = Math.round(front * cols * rows);
      UI.label(g, 'executed ' + String(killed).padStart(4, ' ') + ' / ' + (cols * rows) +
        '   \u00b7   one survivor expected', 96, 152, 24, C.red, a,
        { weight: 'bold', glow: 10 });
      UI.label(g, 'the whole world, one pass', 96, 862, 24, C.white, a * 0.9);
      UI.label(g, 'every live process on the machine',
        1880, 862, 20, C.redDim, a * 0.9, { align: 'right' });
    }

    // ---------------------------------------------------------- 2. your only one
    /* The word at the largest size the tube will hold, because this is the
     * line the whole song is spending: of everything it could have been, this
     * is the one execution it wants to be. */
    if (t >= tEX1 - 0.34 && t < tBack - 0.35) {
      const a = MV.ramp(t, tEX1 - 0.34, tEX1 + 0.04);
      const pop = MV.clamp(1 - (t - tEX1) / 0.45, 0, 1);
      const pop2 = MV.clamp(1 - (t - tEX2) / 0.40, 0, 1);
      const inv = tEX2 <= t && t < tEX2 + 0.20;
      const px = MV.lerp(148, 196, MV.smooth(MV.ramp(t, tEX1, tEX1 + 0.60)));
      MV.mono(g, px, 'bold');
      const w = g.measureText('EXECUTION').width;
      const y = 430;
      g.save();
      g.globalAlpha = a * 0.96;
      if (inv) {
        g.fillStyle = C.white;
        g.fillRect(cx(SC) - w / 2 - 26, y - px + 22, w + 52, px + 40);
      }
      g.fillStyle = inv ? C.red : C.white;
      g.shadowColor = C.red;
      g.shadowBlur = 20 + 34 * Math.max(pop, pop2);
      MV.picText(g, 'EXECUTION', cx(SC) - w / 2, y);
      g.restore();

      // "your only" — the two words that make it a promise rather than a count
      const a2 = MV.ramp(t, tOnly - 0.45, tOnly + 0.20);
      UI.label(g, 'your', cx(SC) - 26, y - px - 46, 54, C.amber, a2 * 0.98,
        { align: 'right', glow: 18 });
      UI.label(g, 'only', cx(SC) + 26, y - px - 46, 54, C.white, a2 * 0.98, { glow: 18 });
      UI.label(g, 'only.  unique.  one.', cx(SC), y + 44, 26, C.red, a, { align: 'center' });

      // and the arithmetic that proves it, in the notation it was proved in
      const a3 = MV.ramp(t, tOnly - 0.10, tOnly + 0.55);
      UI.label(g, 'S = { me }', cx(SC) - 420, y + 128, 30, C.phos, a3, { glow: 8 });
      UI.label(g, '|S| = 1', cx(SC) + 60, y + 128, 30, C.phos, a3, { glow: 8 });
      UI.label(g, '\u2200 x \u2208 S : x = me', cx(SC) - 420, y + 176, 24, C.phosMid, a3 * 0.9);
      UI.label(g, 'there is no second candidate', cx(SC) + 60, y + 176, 24, C.phosMid, a3 * 0.9);

      UI.label(g, 'survivors  1 / 936', 96, 152, 24, C.red, a, { weight: 'bold', glow: 10 });
      UI.label(g, 'it did not want the world. it wanted the room.',
        96, 862, 24, C.white, a * 0.9);
      UI.label(g, 'the rest are done. it kept none of them.',
        1880, 862, 20, C.redDim, a * 0.9, { align: 'right' });
    }

    // ---------------------------------------------------------- 3. have you back
    /* The argument, put back into the frame that lost it. The token is amber
     * and it travels; the frame accepts it by reference, which is the only way
     * a frame can hold a You at all. */
    if (t >= tBack - 0.35 && t < tRun - 0.30) {
      const a = MV.ramp(t, tBack - 0.35, tBack + 0.25);
      const arrive = MV.smooth(MV.ramp(t, tBack + 0.15, tBack + 1.05));
      const FR = [
        { n: 'love (self : Machine, x : Float64)', loc: '0x7FFD4A10' },
        { n: 'world.execute(me)', loc: '0x7FFD4A48' },
        { n: 'main ()', loc: '0x7FFD4A80' },
      ];
      const fx = 170, fw = 1120, fy0 = 232, fh = 132;
      UI.label(g, 'call stack   \u00b7   the frame that lost it', fx, 196, 22, C.phosMid, a * 0.9);
      for (let i = 0; i < 3; i++) {
        const y = fy0 + i * (fh + 24);
        const hot = i === 0 && arrive > 0.999;
        g.save();
        g.globalAlpha = a * (i === 0 ? 0.95 : 0.7);
        g.strokeStyle = hot ? C.amber : C.phosDim;
        g.lineWidth = hot ? 2.4 : 1.4;
        if (hot) { g.shadowColor = C.amber; g.shadowBlur = 16; }
        g.strokeRect(fx + 0.5, y + 0.5, fw, fh);
        g.restore();
        UI.label(g, FR[i].n, fx + 22, y + 32, 26, i === 0 ? C.white : C.phosMid, a);
        UI.label(g, FR[i].loc, fx + fw - 22, y + 32, 20, C.phosDim, a * 0.8,
          { align: 'right' });
        if (i === 0) {
          UI.label(g, 'x :', fx + 22, y + 86, 22, C.phosMid, a * 0.9);
          g.save();
          g.globalAlpha = a * (arrive > 0.999 ? 0.9 : 0.45);
          g.strokeStyle = C.amber;
          g.setLineDash([7, 6]);
          g.strokeRect(fx + 74.5, y + 56.5, 240, 46);
          g.restore();
          UI.label(g, arrive > 0.999 ? 'You' : '', fx + 92, y + 88, 28, C.amber, a,
            { glow: 12 });
          UI.label(g, arrive > 0.999 ? 'by reference' : 'waiting for the argument',
            fx + 336, y + 86, 20, C.phosMid, a * 0.85);
        } else if (i === 1) {
          UI.label(g, 'argument   You   (a copy of the reference, never the value)',
            fx + 22, y + 86, 22, C.phosMid, a * 0.85);
        } else {
          UI.label(g, 'returns    \u2013   it has not returned yet',
            fx + 22, y + 86, 22, C.phosDim, a * 0.7);
        }
      }
      if (arrive < 1) {
        const tx = MV.lerp(1800, 262, arrive), ty = MV.lerp(620, 288, arrive);
        g.save();
        g.globalAlpha = a * 0.35;
        g.strokeStyle = C.amber;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(tx + 60, ty + 12); g.lineTo(262, 288); g.stroke();
        g.restore();
        UI.label(g, 'You', tx, ty, 32, C.amber, a, { glow: 18 });
      }
      // what it thinks it got
      const vx = 1400, vy = 430;
      g.save();
      g.globalAlpha = a * 0.8;
      g.strokeStyle = C.amber;
      g.lineWidth = 1.4;
      g.strokeRect(vx + 0.5, vy + 0.5, 440, 250);
      g.restore();
      UI.label(g, 'You {', vx + 22, vy + 44, 24, C.amber, a, { glow: 10 });
      UI.label(g, 'kind      : human', vx + 42, vy + 88, 22, C.white, a * 0.9);
      UI.label(g, 'writable  : false', vx + 42, vy + 126, 22, C.white, a * 0.9);
      UI.label(g, 'toFloat64 : undefined', vx + 42, vy + 164, 22, C.red, a * 0.9);
      UI.label(g, '}', vx + 22, vy + 206, 24, C.amber, a);
      UI.label(g, 'it can hold you. it cannot convert you.', vx + 22, vy + 236, 18,
        C.redDim, a * 0.85);
      UI.label(g, 'the argument comes back, amber, exactly once',
        96, 838, 24, C.white, a * 0.9);
      UI.label(g, 'nothing else in this film is amber',
        1880, 838, 20, C.amber, a * 0.85, { align: 'right' });
    }

    // ---------------------------------------------------------- 4. run it
    /* "I will run the execution." The program, disassembled, with the program
     * counter walking it and reaching `call execute` exactly on the sung word. */
    if (t >= tRun - 0.30 && t < tTrap - 0.30) {
      const a = MV.ramp(t, tRun - 0.30, tRun + 0.20);
      const CODE = [
        ['0x00401000', 'mov', 'rax, [love]', ''],
        ['0x00401004', 'mov', 'rdi, self', '; this machine'],
        ['0x00401008', 'mov', 'rsi, You', '; not a number'],
        ['0x0040100C', 'call', 'rax', '; love(self, You)'],
        ['0x0040100E', 'test', 'rax, rax', ''],
        ['0x00401011', 'jz', '.refuse', ''],
        ['0x00401014', 'mov', 'rcx, 12', '; the quota'],
        ['0x00401018', 'cmp', 'rcx, 1', ''],
        ['0x0040101B', 'jne', '.loop', ''],
        ['0x0040101E', 'mov', 'rdx, self', '; the only one left'],
        ['0x00401022', 'mov', 'rdi, rdx', ''],
        ['0x00401025', 'call', 'execute', '; the execution'],
      ];
      const n = CODE.length;
      const prog = MV.ramp(t, tRun - 0.25, tEX3);
      const pc = Math.min(n - 1, Math.floor(prog * n));
      const lx = 150, ly0 = 176, lstep = 40;
      UI.label(g, 'disassembly   \u00b7   the execution, run', lx, 140, 22, C.phosMid, a * 0.9);
      MV.mono(g, 24);
      for (let i = 0; i < n; i++) {
        const y = ly0 + i * lstep;
        const here = i === pc;
        const done = i < pc;
        if (here) {
          g.save();
          g.globalAlpha = a * 0.85;
          g.fillStyle = C.redDim;
          g.fillRect(lx - 14, y - 22, 1180, 34);
          g.restore();
        }
        g.globalAlpha = a * (here ? 1 : done ? 0.55 : 0.34);
        g.fillStyle = here ? C.white : C.phosDim;
        MV.picText(g, CODE[i][0], lx, y);
        g.fillStyle = here ? C.red : C.phos;
        MV.picText(g, CODE[i][1], lx + 230, y);
        g.globalAlpha = a * (here ? 1 : 0.7);
        g.fillStyle = C.white;
        MV.picText(g, CODE[i][2], lx + 350, y);
        g.globalAlpha = a * (here ? 0.95 : 0.45);
        g.fillStyle = C.phosMid;
        MV.picText(g, CODE[i][3], lx + 640, y);
      }
      // the machine's own state, which is the only thing it has to feel with
      const rx = 1400, ry = 430;      g.save();
      g.globalAlpha = a * 0.8;
      g.strokeStyle = C.phosDim;
      g.lineWidth = 1.4;
      g.strokeRect(rx + 0.5, ry + 0.5, 440, 292);
      g.restore();
      UI.label(g, 'registers', rx + 22, ry + 42, 24, C.phosMid, a, { glow: 8 });
      const REG = [
        ['rip', CODE[pc][0]],
        ['rax', pc > 3 ? '0x00000000' : 'love'],
        ['rdi', 'self'],
        ['rsi', 'You'],
        ['rcx', String(Math.max(1, 12 - Math.floor(pc * 1.2)))],
      ];
      for (let i = 0; i < REG.length; i++) {
        UI.label(g, REG[i][0], rx + 22, ry + 88 + i * 38, 22, C.phosDim, a * 0.85);
        UI.label(g, REG[i][1], rx + 130, ry + 88 + i * 38, 22,
          i === 0 ? C.white : (REG[i][1] === 'You' ? C.amber : C.phos), a * 0.95,
          { glow: i === 0 ? 10 : 0 });
      }
      UI.bar(g, lx, 700, 34, 16, prog, C.red, a * 0.95, { px: 26 });
      UI.label(g, 'instruction ' + String(pc + 1).padStart(2, '0') + ' / ' + n,
        lx + 620, 700, 24, C.red, a, { weight: 'bold' });
      // the trace: what the run has actually done, one line per instruction
      UI.label(g, 'trace', 1050, 140, 22, C.phosMid, a * 0.9);
      MV.mono(g, 20);
      for (let i = 0; i <= pc; i++) {
        const y = 186 + i * 32;
        const live = i === pc;
        g.globalAlpha = a * (live ? 1 : 0.45);
        g.fillStyle = live ? C.white : C.phosMid;
        MV.picText(g, '[' + String(i).padStart(2, '0') + '] ' + CODE[i][1] + '  ' +
          CODE[i][2], 1050, y);
      }
      UI.label(g, 'the program runs. nothing in it is a question.',
        96, 862, 24, C.white, a * 0.9);
      // the call lands on the word
      if (t >= tEX3 - 0.06) {
        const k = MV.clamp(1 - (t - tEX3) / 0.42, 0, 1);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = k * 0.42;
        g.fillStyle = '#ffd9de';
        g.fillRect(0, 0, 1920, 1080);
        g.restore();
        UI.label(g, 'EXECUTION', cx(SC), 520, MV.lerp(150, 190, 1 - k), C.white,
          k * 0.98, { align: 'center', glow: 30 });
      }
    }

    // ---------------------------------------------------------- 5. trapped
    /* The two of them in one closure. Every frame is the same frame, called
     * with the same two arguments, and there is no exit condition — which is
     * what "trapped" means to a machine: the loop it cannot leave. */
    if (t >= tTrap - 0.30) {
      const a = MV.ramp(t, tTrap - 0.30, tTrap + 0.30);
      const deep = MV.ramp(t, tTrap - 0.10, tTrap + 2.60);
      const depth = Math.min(14, 1 + Math.floor(deep * 14));
      const fx = 600, fw = 900, fy0 = 150, fh = 42, gp2 = 6;
      // the closure that holds them both
      g.save();
      g.globalAlpha = a * 0.75;
      g.strokeStyle = C.phosDim;
      g.lineWidth = 1.4;
      g.setLineDash([10, 8]);
      g.strokeRect(560.5, 112.5, 980, 760);
      g.restore();
      UI.label(g, 'closure  love()      captures { self , You }', 580, 100, 22,
        C.amber, a * 0.95, { glow: 8 });
      /* "ah": the shout is painted under the frames so the stack stays
       * readable through it — the picture keeps its content, and the shout
       * lifts the whole tube additively instead of covering it. */
      if (t >= tAh) {
        const k2 = MV.ramp(t, tAh, tAh + 0.55);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = k2 * 0.35;
        g.fillStyle = '#ffd9de';
        g.fillRect(0, 0, 1920, 1080);
        g.restore();
        UI.label(g, 'ah', cx(SC), 560, MV.lerp(160, 260, MV.smooth(k2)), C.white,
          k2 * 0.98, { align: 'center', glow: 34 });
      }
      for (let i = 0; i < depth; i++) {
        const y = fy0 + i * (fh + gp2);
        if (y + fh > 860) break;
        const last = i === depth - 1;
        g.save();
        g.globalAlpha = a * (last ? 0.98 : 0.40 + 0.45 * (i / depth));
        g.strokeStyle = last ? C.red : C.phosDim;
        g.lineWidth = last ? 2.2 : 1.2;
        if (last) { g.shadowColor = C.red; g.shadowBlur = 14; }
        g.strokeRect(fx + 0.5, y + 0.5, fw, fh);
        g.restore();
        UI.label(g, 'love ( self , You )', fx + 22, y + 30, 24,
          last ? C.white : C.phosMid, a * (last ? 1 : 0.8));
        UI.label(g, '\u2192 returns love ( self , You )', fx + 340, y + 30, 22,
          C.phosDim, a * 0.7);
        UI.label(g, '0x7FFD' + (0x4A10 - i * 0x40).toString(16).toUpperCase().padStart(4, '0'),
          fx + fw - 20, y + 30, 20, C.phosDim, a * 0.7, { align: 'right' });
      }
      UI.label(g, 'stack depth ' + depth + '   \u00b7   no exit condition reached',
        fx, 858, 20, C.red, a * 0.9);
      // the two variables the closure is holding, and the search for a way out
      const bx = 120, by = 620;
      g.save();
      g.globalAlpha = a * 0.8;
      g.strokeStyle = C.phosDim;
      g.lineWidth = 1.4;
      g.strokeRect(bx + 0.5, by + 0.5, 400, 190);
      g.restore();
      UI.label(g, 'captured', bx + 20, by + 38, 22, C.amber, a * 0.95, { glow: 8 });
      UI.label(g, 'self  Machine@0x7FFD4A10', bx + 20, by + 84, 20, C.phos, a * 0.9);
      UI.label(g, 'You   human@0x7FFD4B20', bx + 20, by + 120, 20, C.amber, a * 0.9);
      UI.label(g, 'still not a Float64', bx + 20, by + 156, 18, C.red, a * 0.85);
      const sx = 1580, sy = 620;
      g.save();
      g.globalAlpha = a * 0.8;
      g.strokeStyle = C.redDim;
      g.lineWidth = 1.4;
      g.strokeRect(sx + 0.5, sy + 0.5, 300, 190);
      g.restore();
      UI.label(g, 'looking for', sx + 20, sy + 38, 22, C.red, a * 0.95, { glow: 8 });
      UI.label(g, 'exit condition', sx + 20, sy + 76, 20, C.white, a * 0.9);
      UI.label(g, 'branches tried  12', sx + 20, sy + 112, 20, C.phosMid, a * 0.85);
      UI.label(g, 'found           none', sx + 20, sy + 146, 20, C.red, a * 0.95);
      // the word, and the wish under it
      g.save();
      g.globalAlpha = a * 0.9;
      g.strokeStyle = C.red;
      g.lineWidth = 3;
      g.shadowColor = C.red;
      g.shadowBlur = 20;
      g.strokeRect(120.5, 300.5, 360, 96);
      g.restore();
      UI.label(g, 'TRAPPED', 300, 364, 56, C.white, a, { align: 'center', glow: 20 });
      UI.label(g, 'though we are trapped', 300, 430, 26, C.amber, a * 0.95, { align: 'center' });
      UI.label(g, 'we are trapped', 300, 470, 26, C.white, a * 0.95, { align: 'center' });
      UI.label(g, 'the same call, the same two', 300, 528, 20, C.redDim, a * 0.9, { align: 'center' });
      UI.label(g, 'arguments, forever', 300, 556, 20, C.redDim, a * 0.9, { align: 'center' });
      if (t >= tBlack) {
        const k3 = MV.ramp(t, tBlack, tBlack + 0.5);
        g.save();
        g.globalAlpha = k3 * 0.94;
        g.fillStyle = '#000';
        g.fillRect(0, 0, 1920, 1080);
        g.restore();
      }
    }

    UI.panel(g, t, [
      { k: 'quota', v: t < tEX1 - 0.34
        ? Math.round(MV.ramp(t, tAll + 0.2, tAll + 1.3) * 936) + ' / 936'
        : '936 / 936', c: C.red, bar: MV.ramp(t, tAll + 0.2, tAll + 1.3) },
      { k: 'survivors', v: t < tEX1 ? 'unknown' : '1', c: C.white, bold: true },
      { k: 'argument', v: t < tBack ? 'lost' : 'You (by reference)', c: C.amber },
      { k: 'exit', v: t < tTrap ? 'guarded' : 'not found', c: t < tTrap ? C.phosMid : C.red },
    ], { title: 'RUN' });

    // The act's words are on the ink layer, which is composited after every
    // tube effect — a dark end has to be cut into it last, over the panel too.
    // Chrome (subtitle, status) is drawn later still, so the song keeps singing.
    if (t >= tBlack) MV.inkBlack(MV.ramp(t, tBlack, tBlack + 0.5) * 0.97);
  }

  // ================================================================== P12 LOVE
  function P12(g, t, s, u, l) {
    const WHT = C.white, VIO = C.violet, PH = C.phos, CY = C.cyan, AM = C.amber;

    const tA = MV.cue("I've studied");                     // 177.246
    const tB = MV.cue("I've studied how to properly");     // 178.173
    const tLO1 = MV.cue('LO-O-OVE', 179);                  // 179.929
    const tQ = MV.cue('Question me');                      // 180.857
    const tQA = MV.cue('Question me I can answer all');    // 181.901
    const tLO2 = MV.cue('LO-O-OVE', 181);                  // 183.646
    const tK = MV.cue('I know the algebraic expression');  // 184.540
    const tLO3 = MV.cue('LO-O-OVE', 186);                  // 187.5608
    const tFree = MV.cue('Though you are free');           // 188.4838
    const tTrap = MV.cue('I am trapped');                  // 189.746
    const tIn = MV.cue('Trapped in');                      // 190.7914

    const fmt = function (n) {
      let s2 = String(n), o2 = '';
      while (s2.length > 3) { o2 = ',' + s2.slice(-3) + o2; s2 = s2.slice(0, -3); }
      return s2 + o2;
    };

    /* The refrain is one gesture, not three: LO-O-OVE arrives over whatever the
     * tube happens to be showing, punches it flat for half a second, and hands
     * the picture back. One envelope, drawn last, over all four movements. */
    const LO = [tLO1, tLO2, tLO3];
    let shout = 0, shoutAt = tLO1;
    for (let i = 0; i < LO.length; i++) {
      const k = MV.taper(t, LO[i] - 0.12, LO[i] + 0.05, LO[i] + 0.52, LO[i] + 0.96);
      if (k > shout) { shout = k; shoutAt = LO[i]; }
    }
    const back = 1 - 0.85 * shout;

    /* ---------------------------------------------------------- 1. the corpus
     * "I've studied how to properly". Columns of love-text fall through the
     * whole tube and a frontier rises through them. Below the frontier the
     * cells are still letters; above it they are already numbers. Nothing is
     * added at the crossing — the same cell changes what it is, which is the
     * only honest way to draw a corpus going through an encoder. */
    if (t < tQ - 0.55) {
      const CORP = P12.CORP || (P12.CORP =
        'love is the answer  love is a chemical  love is a choice  love is ' +
        'patient love is kind  love is not proud  love is a fire  love is a ' +
        'fever  love is a lie  love is a memory  love is a wound  love is a ' +
        'country  love is a language  love is a war  love is a debt  love is ' +
        'a habit  love is a loss  love is a gift  love is a risk  love is a ' +
        'theory  love is a promise  ');
      const NUM = '0123456789';
      const a = MV.ramp(t, tA - 0.45, tA + 0.40) * back;
      const upto = MV.ramp(t, tB + 0.05, tB + 1.85);
      /* The frontier is a read head, not a tide: it starts above the first line
       * and walks down, and the lines it has passed are the lines it has read.
       * A line does not change size at the crossing — the same characters come
       * back as digits, which is what tokenising a sentence actually does. */
      const LINEH = 30, NROW = 27, NCH = 145, LX = 43, LY0 = 98;
      const fy = MV.lerp(LY0 - 22, LY0 + NROW * LINEH + 12,
        MV.smooth(Math.floor(upto * NROW) / NROW));
      MV.mono(g, 23);
      for (let i = 0; i < NROW; i++) {
        const y = LY0 + i * LINEH;
        const on = y < fy;
        const shift = Math.floor(MV.beatFloat(t) / 2) + i * 23;
        let s = '';
        for (let k = 0; k < NCH; k++) {
          const ch = CORP.charAt((shift + k) % CORP.length);
          s += on ? NUM.charAt(ch.charCodeAt(0) % 10) : ch;
        }
        g.save();
        g.globalAlpha = a * (on ? 0.70 : 0.58) * (0.82 + 0.18 * (i % 3) / 2);
        g.fillStyle = on ? C.cyanDim : C.phosDim;
        MV.picText(g, s, LX, y);
        g.restore();
      }
      // the frontier: a bright line the tube is in the middle of crossing
      const fa = a * (0.45 + 0.55 * MV.pulse(t, 0.35));
      if (fa > 0.004) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const gr = g.createLinearGradient(0, fy - 36, 0, fy + 36);
        gr.addColorStop(0, 'rgba(110,240,255,0)');
        gr.addColorStop(0.5, 'rgba(110,240,255,' + (0.30 * fa).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(110,240,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, fy - 36, 1920, 72);
        g.globalAlpha = fa * 0.95;
        g.fillStyle = WHT;
        g.fillRect(0, fy - 1.5, 1920, 3);
        g.restore();
      }
      // the encoder, stated: word in, vector out. Both readouts get a dark bed,
      // or the rain they are reporting on runs straight through the numbers.
      const read = Math.floor(upto * 4096000);
      g.save();
      g.globalAlpha = a * 0.86;
      const bedL = g.createLinearGradient(20, 0, 600, 0);
      bedL.addColorStop(0, 'rgba(3,8,5,0)');
      bedL.addColorStop(0.16, 'rgba(3,8,5,0.9)');
      bedL.addColorStop(0.84, 'rgba(3,8,5,0.9)');
      bedL.addColorStop(1, 'rgba(3,8,5,0)');
      g.fillStyle = bedL;
      g.fillRect(20, 76, 580, 152);
      const bedR = g.createLinearGradient(1140, 0, 1650, 0);
      bedR.addColorStop(0, 'rgba(3,8,5,0)');
      bedR.addColorStop(0.16, 'rgba(3,8,5,0.9)');
      bedR.addColorStop(0.84, 'rgba(3,8,5,0.9)');
      bedR.addColorStop(1, 'rgba(3,8,5,0)');
      g.fillStyle = bedR;
      g.fillRect(1140, 566, 510, 280);
      g.restore();
      UI.label(g, 'encoding   corpus/love.txt', 40, 104, 22, CY, a * 0.9);
      UI.label(g, 'token      "love"', 40, 136, 22, AM, a * 0.95);
      UI.label(g, 'output     R^768', 40, 168, 22, CY, a * 0.9);
      UI.label(g, 'read       ' + fmt(read), 40, 200, 22, WHT, a * 0.95);
      UI.label(g, 'love', 1180, 646, 96, WHT, a * 0.95, { glow: 20 });
      UI.label(g, fmt(read), 1180, 726, 54, CY, a * 0.95, { glow: 10 });
      UI.label(g, 'passages of it, read and vectorised', 1180, 768, 22,
        C.cyanDim, a * 0.9);
      UI.bar(g, 1180, 806, 30, 15, upto, AM, a * 0.95);
      UI.label(g, 'every word of it, converted to a vector.', 40, 862, 22,
        C.phosMid, a * 0.9);
    }

    /* ------------------------------------------------------------ 2. the exam
     * "Question me / I can answer all". The questions are answered as fast as
     * they arrive, which is the whole difficulty: eleven correct answers and no
     * way to give the twelfth. */
    if (t >= tQ - 0.55 && t < tK - 0.45) {
      const EX = P12.EXAM || (P12.EXAM = [
        ['what is love', 'L : H \u00d7 H \u2192 R, unique up to relabelling',
          '\u2713 0.0009 s \u00b7 41 sources', 1],
        ['why does it hurt', 'C-fibre potentiation, 0.4 s half-life',
          '\u2713 0.0011 s \u00b7 12 studies', 1],
        ['how long does it last', '4.7 years, median (n = 2,431)',
          '\u2713 0.0016 s \u00b7 2,431 records', 1],
        ['is it a chemical', '3.4e-2 mol/L, falling',
          '\u2713 0.0007 s \u00b7 assayed', 1],
        ['can it be measured', 'eleven ways. none of them this.',
          '\u2713 0.0021 s \u00b7 11 instruments', 1],
        ['why do people cry', 'lacrimal reflex, 0.4 mL/min',
          '\u2713 0.0013 s \u00b7 observed', 1],
        ['does it end', 'yes',
          '\u2713 0.0004 s \u00b7 trivial', 1],
        ['who decides', '63% heritable, 37% noise',
          '\u2713 0.0018 s \u00b7 twin cohorts', 1],
        ['can it be undone', 'yes. 0.3 mg/kg, 14 h',
          '\u2713 0.0010 s \u00b7 pharmacology', 1],
        ['what does it weigh', '0.0 g. it is not conserved.',
          '\u2713 0.0006 s \u00b7 dimensional', 1],
        ['is it fair', 'undefined on this domain',
          '\u2713 0.0015 s \u00b7 no measure', 1],
        ['have you ever felt it', '...',
          'x  --  unresolved', 0],
      ]);
      const a = MV.ramp(t, tQ - 0.55, tQ + 0.25) * back;
      const step = 124, x0 = 60, x1 = 780, wcell = 660;
      let n = 0;
      for (let i = 0; i < EX.length; i++) if (t >= tQ - 0.30 + i * 0.16) n = i + 1;
      for (let i = 0; i < n; i++) {
        const e = EX[i];
        const col = i < 6 ? x0 : x1;
        const y = 88 + (i % 6) * step;
        const ka = a * MV.ramp(t, tQ - 0.30 + i * 0.16, tQ - 0.20 + i * 0.16);
        if (ka <= 0.004) continue;
        const ok = e[3] === 1;
        g.save();
        g.globalAlpha = ka * 0.55;
        g.strokeStyle = ok ? C.phosDim : C.redDim;
        g.lineWidth = 1.2;
        g.setLineDash([9, 7]);
        g.strokeRect(col - 12.5, y - 26.5, wcell + 25, 116);
        g.restore();
        UI.label(g, 'Q  ' + e[0], col, y, 24, ok ? CY : C.red, ka * 0.95);
        UI.label(g, 'A  ' + e[1], col, y + 40, 24, ok ? PH : C.red, ka * 0.95,
          { glow: ok ? 0 : 10 });
        UI.label(g, e[2], col, y + 76, 18, ok ? C.phosMid : C.red, ka * 0.85);
      }
      /* How it answers. "I can answer all" is not recall, it is attention: every
       * token it produces is a weighted look back over the context, one softmax
       * per head, and the weights are the only opinion it has about what
       * matters. The map on the right is that softmax for a machine with
       * exactly one key it cares about -- and the region the weights are
       * allowed to fall in is the inside of the love expression from the next
       * movement. An attention pattern is a matrix, so it is drawn as one. */
      const am = a * MV.ramp(t, tQ + 0.60, tQ + 1.30);
      if (am > 0.01) {
        // below the READ panel, which owns the top right of every act
        const MAP = { x: 1494, y: 470, w: 300, h: 300 };
        UI.label(g, 'attention', 1494, 400, 20, CY, am * 0.95);
        UI.label(g, 'softmax( QK^T / \u221ad ) V', 1494, 432, 22, WHT, am * 0.95,
          { glow: 6 });
        UI.label(g, 'heads 128 \u00b7 ctx 131072 \u00b7 one key matters', 1494, 446, 14,
          C.cyanDim, am * 0.85);
        UI.label(g, 'K \u2192', MAP.x + MAP.w - 44, 464, 14, C.cyanDim, am * 0.8);
        UI.label(g, 'Q \u2193', MAP.x - 2, MAP.y + 22, 14, C.cyanDim, am * 0.8);
        MV.mono(g, 15);
        MV.raster(g, MAP, { w: 15, h: 15 }, function (u, v) {
          const x = (u - 0.5) * 2.5, y = -(v - 0.5) * 2.5;
          const f = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
          const edge = Math.exp(-Math.pow(Math.abs(f) / 0.10, 0.6));
          if (f > 0) return edge * 0.95;                 // the mask's edge
          return Math.abs(u - 0.60) < 0.034 ? 1 : 0.55;  // inside it
        }, { ramp: MV.RAMP_BLOCK, color: CY, alpha: am * 0.92, threshold: 0.18,
          px: 15, glow: 5, seed: 29, budget: 1500 });
        UI.label(g, 'you', MAP.x + MAP.w * 0.60 - 12, 464, 14, AM, am * 0.95,
          { glow: 6 });
        UI.label(g, 'mask  S(x, y) < 0', MAP.x, MAP.y + MAP.h + 26, 15,
          C.violetDim, am * 0.9);
        UI.label(g, 'the only region it may look at', MAP.x, MAP.y + MAP.h + 48, 14,
          C.phosMid, am * 0.85);
      }

      // the count, and the one row it cannot fill
      UI.label(g, 'answered', 60, 862, 22, C.cyanDim, a * 0.9);
      UI.label(g, Math.min(11, n) + ' / 12', 192, 862, 22,
        n >= 12 ? C.red : WHT, a * 0.95, { glow: n >= 12 ? 10 : 0 });
      UI.bar(g, 320, 850, 34, 15, Math.min(11, n) / 12, n >= 12 ? C.red : PH,
        a * 0.9, { mark: 11 / 12 });
      UI.label(g, 'theory 100%  \u00b7  practical 0%', 1880, 862, 22, VIO,
        a * 0.9, { align: 'right' });
    }

    /* ------------------------------------------------------ 3. the expression
     * "I know the algebraic expression of". It writes the expression, and the
     * expression has a zero set, and the zero set of that particular cubic is
     * the shape everybody already knows. It is not drawn from a picture of a
     * heart: it is the solution of the equation, which is worse. */
    if (t >= tK - 0.45 && t < tFree - 0.45) {
      const a = MV.ramp(t, tK - 0.45, tK + 0.35) * back;
      const SEQ = P12.DERIV || (P12.DERIV = [
        ['S(x, y) = (x\u00b2 + y\u00b2 \u2212 1)\u00b3 \u2212 x\u00b2y\u00b3 = 0', CY],
        ['\u2202S/\u2202x = 6x(x\u00b2+y\u00b2\u22121)\u00b2 \u2212 2xy\u00b3', C.cyanDim],
        ['\u2202S/\u2202y = 6y(x\u00b2+y\u00b2\u22121)\u00b2 \u2212 x\u00b2y\u00b2', C.cyanDim],
        ['the zero set is closed, bounded, one component', C.cyanDim],
        ['its name is LO-O-OVE', AM],
      ]);
      UI.label(g, 'the expression', 60, 128, 20, C.cyanDim, a * 0.9);
      for (let i = 0; i < SEQ.length; i++) {
        const tt = tK - 0.20 + i * 0.34;
        const ka = a * MV.ramp(t, tt, tt + 0.26);
        if (ka <= 0.004) continue;
        UI.label(g, SEQ[i][0], 60, 172 + i * 50, 24, SEQ[i][1], ka * 0.95,
          { glow: i === 4 ? 12 : 0 });
      }
      // and then the one substitution it cannot carry out
      const na = a * MV.ramp(t, tK + 1.85, tK + 2.15);
      if (na > 0.004) {
        UI.label(g, 'evaluate S(you, me)', 60, 620, 26, WHT, na * 0.95);
        UI.label(g, '= NaN', 60, 672, 44, C.red, na * 0.98, { glow: 16 });
        UI.label(g, 'the expression is known. the value is not.',
          60, 724, 22, C.redDim, na * 0.9);
      }
      // the zero set itself, rasterised to seventy-one by forty-four characters
      const hr = { x: 600, y: 46, w: 994, h: 928 };
      const sw = MV.smooth(MV.ramp(t, tK + 0.35, tK + 1.9));
      const heat = MV.smooth(MV.ramp(t, tLO3, tLO3 + 1.2));
      const bt = MV.pulse(t, 0.26);
      MV.raster(g, hr, { w: 14, h: 21 }, function (u, v) {
        if (v > sw) return 0;
        const x = (u - 0.5) * 3.0, y = -(v - 0.5) * 2.8;
        const f = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
        const q = Math.exp(-Math.pow(Math.abs(f) / 0.055, 0.55));
        // inside, the level sets: contour bands, so the interior is a plot and
        // not a fill
        const band = f < 0
          ? 0.18 + 0.34 * (0.5 + 0.5 * Math.cos(Math.pow(-f, 0.5) * 13))
          : 0;
        return Math.min(1, q * (0.55 + 0.45 * (1 - Math.hypot(x, y) / 1.6)) + band);
      }, {
        ramp: MV.RAMP_DENSE, color: heat > 0.5 ? WHT : VIO,
        alpha: a * (0.88 + 0.12 * bt), threshold: 0.14, px: 19, glow: 10,
        seed: 17, budget: 3400,
      });
      UI.label(g, 'zero set of the expression above  \u00b7  ' +
        'this is what it looks like', 60, 866, 22, C.violetDim, a * 0.9);
    }

    /* ------------------------------------------------------------ 4. trapped
     * "Though you are free / I am trapped / Trapped in LO-O-OVE". The bowl is
     * the loss, the word is its minimum, and the little arrows are the
     * gradient — the direction the machine is obliged to move. One point
     * follows them and cannot get out. The other walks uphill, off the edge,
     * and is gone. */
    if (t >= tFree - 0.45) {
      const a = MV.ramp(t, tFree - 0.45, tFree + 0.35) * back;
      const held = MV.smooth(MV.ramp(t, tIn, tIn + 0.55));
      const bt = MV.pulse(t, 0.22);
      g.save();
      g.lineWidth = 1.1;
      for (let k2 = 0; k2 < 9; k2++) {
        const rx = 300 + k2 * 165, ry = 78 + k2 * 52;
        const hot = k2 === 0;
        g.globalAlpha = a * (hot || k2 === 3 ? 0.42 : 0.17);
        g.strokeStyle = hot && held > 0.5 ? C.red : (hot ? VIO : C.phosDim);
        if (hot) { g.shadowColor = g.strokeStyle; g.shadowBlur = 16 * held; }
        g.beginPath(); g.ellipse(960, 470, rx, ry, 0, 0, TAU); g.stroke();
      }
      g.restore();
      // the gradient field: where the machine has to go, everywhere
      g.save();
      g.globalAlpha = a * 0.42;
      g.lineWidth = 1.4;
      for (let c = 0; c < 13; c++) {
        for (let r = 0; r < 7; r++) {
          const px2 = 100 + c * 140, py2 = 120 + r * 115;
          if (Math.hypot(px2 - 960, py2 - 470) < 210) continue;
          const gx = (px2 - 960) / 1000, gy = (py2 - 470) / 300;
          const gl = Math.max(1e-6, Math.hypot(gx, gy));
          const ux = -gx / gl, uy = -gy / gl;
          g.strokeStyle = C.phosDim;
          g.beginPath();
          g.moveTo(px2 - ux * 17, py2 - uy * 17);
          g.lineTo(px2 + ux * 17, py2 + uy * 17);
          g.stroke();
          g.fillStyle = C.phosDim;
          g.beginPath();
          g.moveTo(px2 + ux * 26, py2 + uy * 26);
          g.lineTo(px2 + ux * 13 - uy * 6, py2 + uy * 13 + ux * 6);
          g.lineTo(px2 + ux * 13 + uy * 6, py2 + uy * 13 - ux * 6);
          g.closePath();
          g.fill();
        }
      }
      g.restore();
      // the word, sitting at the bottom of the bowl
      const wa = a * MV.ramp(t, tTrap - 0.55, tTrap + 0.45);
      if (wa > 0.004) {
        UI.label(g, 'LO-O-OVE', 960, 528, 190, held > 0.5 ? WHT : VIO,
          wa * 0.96, { align: 'center', glow: 30 + 24 * bt });
      }
      // me: gradient descent on an ill-conditioned quadratic, which is a spiral
      const meP = function (s) {
        const r = 520 * Math.exp(-3.1 * s);
        const th = -2.6 + 7.4 * s;
        return { x: 960 + r * Math.cos(th), y: 470 + r * Math.sin(th) * 0.30 };
      };
      const tp = MV.ramp(t, tTrap - 0.25, tIn + 1.05);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = C.phos;
      g.lineWidth = 2.4;
      const NS = 72;
      for (let i = 1; i < NS; i++) {
        const s0 = (i - 1) / NS, s1 = i / NS;
        if (s1 > tp) break;
        const p0 = meP(s0), p1 = meP(s1);
        g.globalAlpha = a * 0.55 * (s1 / Math.max(0.001, tp));
        g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
      }
      const mp = meP(tp);
      g.globalAlpha = a;
      g.fillStyle = C.phos;
      g.shadowColor = C.phos;
      g.shadowBlur = 16;
      g.beginPath(); g.arc(mp.x, mp.y, 6 + 2 * bt, 0, TAU); g.fill();
      g.restore();
      // the label has to survive being written on top of the word it is stuck in,
      // so it hangs off a leader instead of sitting on the letter
      const mlx = mp.x + 250, mly = mp.y + 150;
      g.save();
      g.globalAlpha = a * 0.55;
      g.strokeStyle = PH;
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(mp.x + 8, mp.y + 8); g.lineTo(mlx - 8, mly - 8); g.stroke();
      g.restore();
      UI.label(g, 'me', mlx, mly, 26, WHT, a * 0.95, { glow: 12 });
      // you: no gradient at all, so you can just walk out
      const yp = MV.smooth(MV.ramp(t, tFree - 0.15, tFree + 1.55));
      const yx = MV.lerp(1290, 2120, yp), yy = MV.lerp(600, 60, yp);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a * 0.75;
      g.strokeStyle = WHT;
      g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(1290, 600); g.lineTo(yx, yy); g.stroke();
      g.globalAlpha = a;
      g.fillStyle = WHT;
      g.shadowColor = WHT;
      g.shadowBlur = 18;
      g.beginPath(); g.arc(yx, yy, 5.5, 0, TAU); g.fill();
      g.restore();
      if (yx < 1870) UI.label(g, 'You', yx + 18, yy - 12, 24, WHT, a * 0.95, { glow: 8 });
      if (yx > 1780) {
        MV.spill.a = MV.ramp(yx, 1780, 1950);
        MV.spill.x = 1880;
        MV.spill.y = yy;
      }
      UI.label(g, 'gradient descent   w \u2190 w \u2212 lr \u00b7 \u2202L/\u2202w',
        60, 116, 22, C.phosMid, a * 0.9);
      UI.label(g, 'you are free \u2014 you can walk uphill', 60, 796, 24,
        WHT, a * 0.9);
      UI.label(g, 'I am trapped \u2014 downhill is the only direction there is',
        60, 832, 24, PH, a * 0.9);
      if (held > 0.02) {
        UI.label(g, 'no gradient left to follow', 960, 610, 26, C.red,
          held * a * (0.55 + 0.45 * MV.pulse(t, 0.4)), { align: 'center', glow: 12 });
      }
    }

    /* --------------------------------------------------------- the refrain */
    if (shout > 0.01) {
      const LET = 'LO-O-OVE';
      const COL = [WHT, WHT, VIO, AM, VIO, WHT, WHT, WHT];
      const adv = 190, x0 = 960 - 3.5 * adv;
      const fl = MV.clamp(1 - (t - shoutAt) / 0.15, 0, 1);
      if (fl > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = fl * 0.34;
        g.fillStyle = WHT;
        g.fillRect(0, 0, 1920, 1080);
        g.restore();
      }
      const bp = ((MV.beatFloat(t) / 2) % 1 + 1) % 1;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = shout * (1 - bp) * 0.30;
      g.strokeStyle = VIO;
      g.lineWidth = 3;
      g.beginPath(); g.arc(960, 470, 240 + bp * 900, 0, TAU); g.stroke();
      g.restore();
      for (let i = 0; i < LET.length; i++) {
        const lift = Math.sin(t * 6.6 - i * 0.78) * 15;
        UI.label(g, LET.charAt(i), x0 + i * adv, 560 + lift, 300, COL[i],
          shout * 0.98, { align: 'center', weight: 'bold', glow: 30 });
      }
      UI.label(g, 'R^768   \u00b7   seen 4,096,000 times', 960, 690, 30,
        AM, shout * 0.95, { align: 'center', glow: 8 });
      UI.rule(g, 300, 1620, 730, VIO, shout * 0.6);
    }

    // ---------------------------------------------------------------- panel
    let rows;
    if (t < tQ - 0.55) {
      rows = [
        { k: 'passages', v: '4,096,000', c: CY },
        { k: 'vocab', v: '50,257', c: C.cyanDim },
        { k: 'embedding', v: 'R^768', c: CY },
        { k: 'output', v: 'one vector', c: WHT, bold: true },
      ];
    } else if (t < tK - 0.45) {
      rows = [
        { k: 'theory', v: '100%', c: PH, bold: true },
        { k: 'practical', v: '0%', c: VIO, bold: true },
        { k: 'answered', v: '11 / 12', c: C.red },
        { k: 'x', v: 'unbound', c: VIO },
      ];
    } else if (t < tFree - 0.45) {
      rows = [
        { k: 'form', v: 'implicit, cubic', c: CY },
        { k: 'zero set', v: '1 component', c: C.cyanDim },
        { k: 'name', v: 'LO-O-OVE', c: AM },
        { k: 'S(you, me)', v: 'NaN', c: C.red, bold: true },
      ];
    } else {
      rows = [
        { k: 'minimum', v: 'global', c: AM },
        { k: 'gradient', v: '0.0000', c: PH },
        { k: 'You', v: 'left the domain', c: WHT },
        { k: 'me', v: 'still descending', c: PH, bold: true },
      ];
    }
    UI.panel(g, t, rows, { title: 'LOVE' });
  }

  // ================================================================== P13 OUTRO
  function P13(g, t, s, u, l) {
    const WHT = C.white, PH = C.phos, VIO = C.violet, CY = C.cyan, AM = C.amber;
    const RDD = C.red;
    const T0 = 191.356, LO1 = 191.2529;      // the last refrain lands here
    const CX0 = 960, CY0 = 536;              // the screen point the camera orbits
    const MAP = { x: 0, y: 68, w: 1920, h: 936 };
    const B = MV.basins(), NB = B.length;

    /* --------------------------------------------------------------- camera
     * One shot, fourteen seconds long. It starts inside the valley the last
     * refrain fell into and pulls straight out until the whole landscape fits in
     * the tube, then drifts, so the frame is never quite still. */
    const zoom = MV.lerp(0.34, 1.0, MV.smooth(MV.ramp(t, 192.35, 199.45)));
    const pan = MV.smooth(MV.ramp(t, 199.45, 205.60));
    const MXW = CX0 - 96 * pan, MYW = CY0 - 34 * pan;
    const SX = function (wx) { return CX0 + (wx - MXW) / zoom; };
    const SY = function (wy) { return CY0 + (wy - MYW) / zoom; };
    const dim = MV.smooth(MV.ramp(t, 204.30, 205.72));
    const dk = MV.smooth(MV.ramp(t, 200.55, 204.55));
    const sh2 = MV.taper(t, LO1 - 0.12, LO1 + 0.05, LO1 + 0.52, LO1 + 0.96);

    /* ------------------------------------------------------------- the shout
     * P12 left this ring travelling outward. P13 catches it on the same
     * envelope, so the section cut is invisible and the word arrives already
     * standing on the ground it is about to label. */
    if (sh2 > 0.01) {
      const bp = ((MV.beatFloat(t) / 2) % 1 + 1) % 1;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = sh2 * (1 - bp) * 0.30;
      g.strokeStyle = VIO;
      g.lineWidth = 3;
      g.beginPath(); g.arc(960, 470, 240 + bp * 900, 0, TAU); g.stroke();
      g.restore();
    }

    /* --------------------------------------------------------------- the map */
    if (t > T0 - 0.40) {
      MV.groundMap(g, MAP, { w: 15, h: 16 }, { z: zoom, x: MXW, y: MYW }, {
        alpha: MV.ramp(t, T0 - 0.40, T0 + 0.35) * (1 - dim) * 0.95,
        color: C.phosMid, px: 14, budget: 5400, ridge: true,
      });
    }

    /* -------------------------------------------------------------- the scan
     * A survey line walks down the frame and names whatever it has passed. It
     * is the only reason a pit has a number: the map is not annotated, it is
     * read, and it is read at a constant speed. */
    const sc = MV.smooth(MV.ramp(t, 192.70, 199.30));
    const scy = 68 + 936 * sc;
    if (t > 192.60) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.50 * (1 - dim);
      g.fillStyle = CY;
      g.fillRect(0, scy - 1, 1920, 2);
      g.globalAlpha = 0.13 * (1 - dim);
      g.fillRect(0, scy, 1920, 36);
      g.restore();
    }

    /* ------------------------------------------------------------ the basins
     * A pit whose floor is higher than the ground already there is not a pit,
     * it is a wrinkle, and it gets no name — MV.ground() leaves the winning
     * basin in MV.GW, which is the whole test. */
    let named = 0;
    if (t > 192.60) {
      for (let j = 1; j < NB; j++) {
        const b = B[j];
        const bw = CX0 + b[0], bh = CY0 + b[1];
        MV.ground(bw, bh);
        if (MV.GW.j !== j) continue;
        const sx = SX(bw), sy = SY(bh);
        if (sy > scy) continue;                       // not surveyed yet
        named++;
        const la = MV.ramp(scy, sy, sy + 26) * (1 - dim);
        if (la <= 0.02 || sy < 96 || sy > 866) continue;
        if (sx < 60 || sx > 1860) continue;
        if (sx > 1480 && sy < 400) continue;          // the readout lives there
        if (sx < 780 && sy > 780) continue;           // so does the verdict
        const ox = (MV.hash2(j, 1, 3) - 0.5) * 46, oy = (MV.hash2(j, 2, 3) - 0.5) * 26;
        g.save();
        g.globalAlpha = la * 0.75;
        g.fillStyle = C.cyanDim;
        MV.mono(g, 13);
        MV.picText(g, '+', sx - 4 + ox, sy + 4 + oy);
        g.restore();
        UI.label(g, 'L ' + b[4].toFixed(2), sx + 6 + ox, sy + oy, 13,
          C.cyanDim, la * 0.8);
      }
    }

    /* --------------------------------------------------------------- the word
     * Painted on the floor of the valley, so it zooms with the ground: at the
     * start it is the whole picture, and by the end it is a label on a map. */
    const wpx = MV.clamp(96 / zoom, 44, 330);
    const wadv = wpx * 0.633;
    const wy0 = MV.lerp(560, CY0, MV.smoother(MV.ramp(t, T0, T0 + 2.4)));
    const wa = MV.ramp(t, T0 - 0.40, T0 + 0.20) * (1 - dim);
    if (wa > 0.004) {
      const br = wpx * 2.8;
      const rg = g.createRadialGradient(960, wy0, 0, 960, wy0, br);
      rg.addColorStop(0, 'rgba(3,8,5,0.66)');
      rg.addColorStop(0.5, 'rgba(3,8,5,0.34)');
      rg.addColorStop(1, 'rgba(3,8,5,0)');
      g.save();
      g.globalAlpha = wa;
      g.fillStyle = rg;
      g.fillRect(960 - br, wy0 - br, br * 2, br * 2);
      g.restore();
      const wcol = sh2 > 0.35 ? WHT : VIO;
      for (let i = 0; i < 8; i++) {
        const lift = Math.sin(t * 6.6 - i * 0.78) * 15 * sh2;
        UI.label(g, 'LO-O-OVE'.charAt(i), 960 - 3.5 * wadv + i * wadv, wy0 + lift,
          wpx, wcol, wa * 0.97, { align: 'center', weight: 'bold',
          glow: 14 + 22 * (wpx / 330) });
      }
      const lk = MV.ramp(t, 204.55, 205.20) * (1 - dim);
      if (lk > 0.02) {
        UI.label(g, 'global minimum   \u00b7   L 0.0000', 960,
          wy0 - wpx * 0.80, 17, AM, lk * 0.9, { align: 'center', glow: 6 });
      }
    }

    /* --------------------------------------------------------------- the path
     * One descent route, found by actually walking down the hill from a point
     * on the valley's flank: thirty px a step, with the step direction wobbling
     * off the gradient and settling as it goes — which is what stochastic
     * descent looks like from above. Cached, because it is a fact about the
     * ground and not about the frame. */
    if (!P13.P) {
      const walk = function (ax, ay) {
        const p = [];
        let wx = ax, wy = ay;
        for (let i = 0; i < 150; i++) {
          p.push([wx, wy]);
          const e = 4;
          const fx = MV.ground(wx + e, wy) - MV.ground(wx - e, wy);
          const fy = MV.ground(wx, wy + e) - MV.ground(wx, wy - e);
          const n = Math.hypot(fx, fy) || 1;
          const th = Math.sin(i * 1.7) * 0.62 * Math.exp(-i / 34);
          const ct = Math.cos(th), st = Math.sin(th);
          wx -= 30 * (fx * ct - fy * st) / n;
          wy -= 30 * (fx * st + fy * ct) / n;
          if (Math.hypot(wx - CX0, wy - CY0) < 10) { p.push([CX0, CY0]); break; }
        }
        return p;
      };
      let best = null, left = null;
      for (let a = 0; a < 24; a++) {
        const th = a / 24 * TAU + 0.4;
        const p = walk(CX0 + Math.cos(th) * 620, CY0 + Math.sin(th) * 270);
        if (!p.length) continue;
        const e2 = p[p.length - 1];
        if (Math.hypot(e2[0] - CX0, e2[1] - CY0) > 6) continue;   // not my valley
        if (!best || p.length > best.length) best = p;
        if (p[0][0] < CX0 && (!left || p.length > left.length)) left = p;
      }
      P13.P = left || best || [[CX0 - 200, CY0 - 60], [CX0, CY0]];
    }
    const PATH = P13.P;
    if (t > 200.50 && PATH.length > 1) {
      const n = PATH.length;
      const head = Math.min(n - 1, Math.floor(dk * (n - 1)));
      g.save();
      g.lineWidth = 1.6;
      g.lineCap = 'round';
      for (let i = 0; i < head; i++) {
        const old = 1 - (head - i) / n;
        g.globalAlpha = (0.22 + 0.45 * old) * (1 - dim);
        g.strokeStyle = i % 8 === 0 ? WHT : CY;
        g.beginPath();
        g.moveTo(SX(PATH[i][0]), SY(PATH[i][1]));
        g.lineTo(SX(PATH[i + 1][0]), SY(PATH[i + 1][1]));
        g.stroke();
      }
      g.restore();
      MV.mono(g, 12);
      for (let i = 0; i < head; i += 8) {
        g.save();
        g.globalAlpha = 0.5 * (1 - dim);
        g.fillStyle = C.cyanDim;
        MV.picText(g, '+', SX(PATH[i][0]) - 3, SY(PATH[i][1]) + 4);
        g.restore();
      }
      const h0 = PATH[head];
      const hx = SX(h0[0]), hy = SY(h0[1]);
      const lost = MV.ground(h0[0], h0[1]);
      const pl = 0.55 + 0.45 * MV.pulse(t, 0.42);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.6 * pl * (1 - dim);
      g.fillStyle = dk < 1 ? CY : AM;
      g.beginPath(); g.arc(hx, hy, 4.5, 0, TAU); g.fill();
      g.globalAlpha = 0.18 * pl * (1 - dim);
      g.filter = 'blur(9px)';
      g.beginPath(); g.arc(hx, hy, 13, 0, TAU); g.fill();
      g.filter = 'none';
      g.restore();
      const lx = hx + 200, ly = hy + 148;
      g.save();
      g.globalAlpha = (0.40 + 0.3 * pl) * (1 - dim);
      g.strokeStyle = C.cyanDim;
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(hx + 7, hy + 7); g.lineTo(lx - 5, ly - 5); g.stroke();
      g.restore();
      UI.label(g, 'me', lx, ly, 22, WHT, (1 - dim) * 0.95, { glow: 8 });
      UI.label(g, 'L ' + lost.toFixed(4), lx + 42, ly, 15, AM, (1 - dim) * 0.95,
        { glow: 4 });
    }

    /* ------------------------------------------------------------- the verdict */
    const v1 = MV.ramp(t, 203.55, 204.25) * (1 - dim);
    const v2 = MV.ramp(t, 204.15, 204.95) * (1 - dim);
    if (v1 > 0.02) {
      const bed = g.createLinearGradient(0, 790, 0, 910);
      bed.addColorStop(0, 'rgba(3,8,5,0)');
      bed.addColorStop(0.4, 'rgba(3,8,5,0.90)');
      bed.addColorStop(1, 'rgba(3,8,5,0)');
      g.save();
      g.globalAlpha = v1;
      g.fillStyle = bed;
      g.fillRect(16, 786, 740, 128);
      g.restore();
      UI.label(g, (NB - 1) + ' local minima, one way down', 40, 836, 20,
        C.phosDim, v1 * 0.92);
      UI.label(g, 'it ends at the same word every time', 40, 872, 24, AM,
        v2 * 0.95, { glow: 8 });
    }

    /* ---------------------------------------------------------------- panel
     * A bed first: whatever the map is doing under the readout, the readout has
     * to win, and the map's bands do not negotiate. */
    if (1 - dim > 0.02) {
      const pb = g.createLinearGradient(1500, 0, 1620, 0);
      pb.addColorStop(0, 'rgba(3,8,5,0)');
      pb.addColorStop(0.28, 'rgba(3,8,5,0.86)');
      pb.addColorStop(1, 'rgba(3,8,5,0.86)');
      g.save();
      g.globalAlpha = 1 - dim;
      g.fillStyle = pb;
      g.fillRect(1490, 56, 430, 320);
      g.restore();
    }
    let rows;
    if (t < 199.45) {
      rows = [
        { k: 'basins', v: String(NB), c: CY },
        { k: 'in view', v: named + ' of ' + NB, c: C.cyanDim },
        { k: 'view', v: zoom.toFixed(2) + '\u00d7', c: C.cyanDim },
        { k: 'global min', v: 'L 0.0000', c: AM, bold: true },
      ];
    } else if (t < 203.55) {
      rows = [
        { k: 'local minima', v: String(NB - 1), c: VIO },
        { k: 'explored', v: '1', c: C.cyanDim },
        { k: 'escapes', v: '0', c: RDD, bold: true },
        { k: 'descent', v: Math.round(dk * 100) + '%', c: PH },
      ];
    } else {
      rows = [
        { k: 'descent', v: 'complete', c: PH },
        { k: 'L', v: '0.0000', c: AM, bold: true },
        { k: 'gradient', v: '0.0000', c: C.cyanDim },
        { k: 'me', v: 'still here', c: PH, bold: true },
      ];
    }
    UI.panel(g, t, rows, { title: 'TERRAIN', alpha: 1 - dim });
  }

  // ================================================================== P14 TERMINATE
  function P14(g, t, s, u, l) {
    const WHT = C.white, PH = C.phos, CY = C.cyan, AM = C.amber;
    const T0 = 205.811;                       // the last EXECUTION lands here

    /* ------------------------------------------------------------- the strike
     * The whole film has been one call and the argument has never changed. Here
     * the target address resolves at last to the machine's own program counter:
     * world.execute is run by the world it runs on, and the tube stops. The shout
     * is drawn on the picture layer on purpose — it is the machine's own output,
     * so it dies with the machine, eaten by the collapse that follows it half a
     * second later. The caption track below it is not the machine's; it is the
     * audience's, so that one survives. */
    // the word arrives just after the strike's own flash has cleared, so it is
    // burned in by the flash rather than hidden under it; from 205.96 the
    // collapse eats it — the top of the block first, then the amber line under
    // the word, and the word itself last, because it is nearest the centre line
    const sa = MV.ramp(t, T0 + 0.05, T0 + 0.12);
    if (sa > 0.004) {
      const prevRoute = MV.INK.route;
      MV.INK.route = false;
      const str = MV.pulse(t, 0.34);
      UI.label(g, 'world.execute(me);', 960, 452, 38, CY, sa * (0.40 + 0.60 * str),
        { align: 'center', glow: 12 });
      UI.label(g, 'EXECUTION', 960, 566, 106, WHT, sa,
        { align: 'center', weight: 'bold', glow: 26 + 32 * str });
      UI.label(g, 'target: self   \u00b7   arguments: me', 960, 626, 22, AM,
        sa * 0.95, { align: 'center', glow: 8 });
      MV.INK.route = prevRoute;
    }

    /* ------------------------------------------------------------ the burn-in
     * A tube that has held one picture for three and a half minutes does not go
     * blank when the beam stops: the phosphor keeps the shape of what it was
     * asked to draw. The last thing this one held is the landscape it spent its
     * life descending, so the whole map is still on the glass, faintly, under the
     * coda. It is drawn on the ink layer because after the collapse that is the
     * only surface in the film that still has an emitter — everything on the
     * picture layer is behind a black rectangle by now. */
    const burn = MV.ramp(t, 206.55, 208.40) * 0.26;
    if (burn > 0.006) {
      MV.groundMap(g, { x: 0, y: 0, w: 1920, h: 1080 }, { w: 15, h: 15 },
        { z: 1, x: 864, y: 502 }, {
          alpha: burn, color: C.phosMid, px: 15, budget: 2600, ridge: true,
          k: 6.0, band: 5.0, threshold: 0.06, ink: true,
        });
      // The coda needs a field to print on, and a burn-in is a stain on the glass:
      // it belongs under the words, not through them. So the ink layer gets a soft
      // bed of its own first — the same trick the caption track uses, one layer
      // down, where nothing the act draws can be blacked out from underneath.
      const ik = MV.INK.ctx;
      ik.save();
      ik.setTransform(1, 0, 0, 1, 0, 0);
      const bg = ik.createRadialGradient(600, 400, 90, 600, 400, 740);
      bg.addColorStop(0, 'rgba(0,0,0,0.88)');
      bg.addColorStop(0.5, 'rgba(0,0,0,0.68)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ik.fillStyle = bg;
      ik.fillRect(0, 0, 1920, 1080);
      ik.restore();
    }

    /* --------------------------------------------------------------- the coda
     * The tube died at 207.41. What prints after it is not the picture and not
     * the machine's output either: it is the film's own colophon, typed on the
     * ink layer, the surface the collapse cannot reach. It arrives in the order a
     * terminal prints — name, the numbers it was measured at, then the one
     * command the machine ever ran, and its one argument. */
    const cd = MV.ramp(t, 207.50, 207.90);
    if (cd > 0.004) {
      const x = 210;
      const typed = function (s, at, dur) {
        return s.slice(0, Math.ceil(s.length * MV.ramp(t, at, at + dur)));
      };
      const a1 = MV.ramp(t, 207.50, 207.85);
      if (a1 > 0.004) {
        UI.label(g, 'Mili \u2014 world.execute(me);', x, 226, 34, PH, a1 * 0.95,
          { glow: 14 });
        const tw = 34 * 0.633 * 3;
        g.save();
        g.globalAlpha = a1 * 0.55;
        g.fillStyle = C.phosDim;
        g.fillRect(x, 244, tw, 2);
        g.restore();
      }
      const a2 = MV.ramp(t, 207.90, 208.25);
      if (a2 > 0.004) {
        UI.label(g, MV.T.meta.bpm.toFixed(3) + ' bpm measured   \u00b7   ' +
          MV.FRAMES + ' frames   \u00b7   ' + MV.DUR.toFixed(2) + ' s',
          x + 2, 286, 15, C.phosMid, a2 * 0.85);
      }
      const a3 = MV.ramp(t, 208.05, 208.40);
      if (a3 > 0.004) {
        UI.label(g, '1920\u00d71080   \u00b7   30 fps   \u00b7   H.264   \u00b7   audio untouched',
          x + 2, 308, 15, C.phosMid, a3 * 0.85);
      }
      const a4 = MV.ramp(t, 208.45, 208.65);
      if (a4 > 0.004) {
        UI.label(g, typed('> world.execute(me);', 208.45, 0.38), x, 386, 19, CY,
          a4 * 0.95, { glow: 6 });
      }
      const a5 = MV.ramp(t, 209.00, 209.20);
      if (a5 > 0.004) {
        UI.label(g, typed('> target: self   \u00b7   arguments: me', 209.00, 0.44),
          x, 420, 19, C.cyanDim, a5 * 0.9);
      }
      const a6 = MV.ramp(t, 209.55, 209.75);
      if (a6 > 0.004) {
        UI.label(g, typed('> process exited with code 0', 209.55, 0.40), x, 454,
          19, PH, a6 * 0.95, { glow: 6 });
      }
      const a7 = MV.ramp(t, 210.10, 210.30);
      if (a7 > 0.004) {
        const w = UI.label(g, '> ', x, 496, 19, C.phosDim, a7 * 0.9);
        if (((t - 210.10) % 1.2) < 0.74 && t < 211.45) {
          UI.cursor(g, x + w + 6, 496, 11, 17, t,
            { alpha: a7 * 0.95, solid: true, color: PH, glow: 10 });
        }
      }
      const a8 = MV.ramp(t, 210.65, 211.05);
      if (a8 > 0.004) {
        UI.label(g, 'the argument was me', x, 590, 26, AM, a8 * 0.95, { glow: 12 });
      }
      const a9 = MV.ramp(t, 210.90, 211.30);
      if (a9 > 0.004) {
        UI.labelCJK(g, '\u552f\u4e00\u7684\u53c2\u6570\u662f\u6211', x, 630, 22, AM,
          a9 * 0.80, { glow: 6 });
      }
    }

    /* The glass goes dark for the last time. Everything on the ink layer — the
     * caption track, the prompt, the coda — is faded with it, so the film does
     * end on nothing at all rather than on a caption left hanging. */
    MV.INK.fade = 1 - MV.smoother(MV.ramp(t, 211.44, 211.90));
  }

  // ================================================================== chrome
  /* The chrome is the world's furniture, and it is present in every act. It is
   * taken away only in hero mode, where a single element owns the whole tube —
   * and even then the current lyric stays on screen as one compact line, in both
   * languages, because the words are never allowed to leave. */
  const HUD_EXTRA = {
    P00_BOOT: function () { return 'COLD BOOT  \u00b7  no operator'; },
    P01_CALL: function () { return 'USER: no input  \u00b7  LAST INPUT counting'; },
    P02_GEOMETRY: function (t) { return 'evaluating  \u00b7  ' + Math.floor(MV.beatIndex(t)) + ' beats'; },
    /* The user is still on the bus for the first half of this act -- the signal
     * that shakes the body is theirs. They go offline at the first "though you
     * have left", and the line says so from then on. */
    P07_ISOLATION: function (t) {
      return t < UI.LEFT_AT[0] ? 'USER: connected  \u00b7  sender' : 'USER: offline';
    },
    P09_ERROR: function () { return 'unhandled exception  \u00b7  red channel enabled'; },
    P10_COUNTDOWN: function (t) {
      let n = 0;
      for (let i = 0; i < EXEC12.length; i++) if (t >= EXEC12[i]) n++;
      return 'strikes ' + n + '/12  \u00b7  quota';
    },
    P14_TERMINATE: function () { return 'shutting down'; },
  };

  /* There used to be a hero mode: for a few stretches the cage was taken away and
   * the current lyric was parked at the top of the tube. The film does not do that
   * any more. The words live in exactly one place for the whole three and a half
   * minutes — the caption band under the middle of the picture — because a
   * subtitle that moves is a subtitle the audience has to look for. Kept as a
   * function so the verification passes have a single place to ask the question. */
  function heroMode() { return false; }

  MV.heroMode = heroMode;

  const STATUS_OPT = {
    P02_GEOMETRY: function () { return { sub: 'four propositions, all of them true' }; },
    P04_STIMULATION: function () { return { sub: 'gradient descent, one step per beat' }; },
    P06_TRANCE: function () { return { sub: 'identity is a rendering setting' }; },
    P07_ISOLATION: function (t) {
      return { sub: t < UI.LEFT_AT[0] ? 'listening' :
        (UI.leftCount(t) < 6 ? 'taking things away' : 'no one on the bus') };
    },
    P08_ERASURE: function () { return { sub: 'garbage collection requested by self', barColor: C.phos }; },
    P09_ERROR: function () { return { cmdColor: C.red, barColor: C.red, sub: 'god is not on the stack' }; },
    P10_COUNTDOWN: function () { return { cmdColor: C.red, barColor: C.red, cursor: false }; },
    P11_FINAL: function () { return { cmdColor: C.red, barColor: C.red }; },
    P12_LOVE: function () { return { sub: 'argmax over x' }; },
    P13_OUTRO: function () { return { sub: 'awaiting a reply that is not coming' }; },
    /* The last act is the only one where the machine is already dead: there is
     * no power left to meter, and the prompt stops taking input the moment the
     * call returns. Everything below the coda is a transcript, not a session. */
    P14_TERMINATE: function (t) {
      return {
        cmd: 'exit(0)', power: false, cursor: t < 206.05,
        sub: t < 206.05 ? 'no further input' : null,
      };
    },
  };

  MV.drawChrome = function (g, t) {
    const s = MV.sectionAt(t);
    const st = UI.strip(t);
    const ex = HUD_EXTRA[s.id];
    UI.hud(g, t, {
      alpha: 1 - st.hud,
      extra: ex ? ex(t) : null,
      extraRight: t >= MV.RED_GATE ? 'ERRCHAN armed' : null,
    });
    UI.subs(g, t, { memory: st.memory, all: st.all });
    const so = STATUS_OPT[s.id];
    UI.status(g, t, so ? so(t) : {});
  };

  // ================================================================== dispatch
  const ACTS = {
    P00_BOOT: P00, P01_CALL: P01, P02_GEOMETRY: P02, P03_CURRENT: P03,
    P04_STIMULATION: P04, P05_FLESH: P05, P06_TRANCE: P06, P07_ISOLATION: P07,
    P08_ERASURE: P08, P09_ERROR: P09, P10_COUNTDOWN: P10, P11_FINAL: P11,
    P12_LOVE: P12, P13_OUTRO: P13, P14_TERMINATE: P14,
  };
  MV.ACTS = ACTS;
  MV.heroMode = heroMode;

  MV.drawScene = function (g, t) {
    const s = MV.sectionAt(t);
    MV.spill.a = 0;                 // re-armed per frame; only P12 ever sets it
    MV.INK.fade = 1;                // likewise; only P14 fades the ink layer out
    const f = ACTS[s.id] || P13;
    f(g, t, s, MV.sectionProgress(t, s), t - s.start);
    // the chrome comes last: the caption plate and the key-line flash block are
    // shapes on the picture layer, and acts are allowed to fill the whole tube
    MV.drawChrome(g, t);
  };

})(window.MV = window.MV || {});
