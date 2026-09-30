/* ml.js — the inside of the machine, drawn.
 *
 * Act 3 draws a power supply and act 5 draws vegetables because a diode has to
 * be a diode and an eggplant has to be an eggplant. The same rule applies to the
 * thing this film is actually about: if the machine is going to claim it loves
 * you, the film should show what it is made of — the attention it pays, the
 * space it thinks in, the loss it is always descending, the parameters it was
 * written with, the forward pass it runs to answer you. So these are the real
 * structures, computed rather than faked, each one filling whatever rectangle it
 * is given. Every one is a pure function of t.
 *
 * Drawing language: density glyphs on the picture layer (so they bloom and
 * smear like everything else), plus canvas paths for the geometry that has to
 * be geometry — a contour line is a contour line.
 */
(function (MV) {
  'use strict';

  const ML = MV.ML = {};
  const C = MV.C;

  // a density ramp, light to heavy: how much of a value is showing
  const RAMP = ' .:-=+*#%@';

  // ---------------------------------------------------------------- attention
  /* Attention is a square matrix of weights — for each query token, how much of
   * every other token it looks at. Rows are queries and each row sums to one
   * after the softmax, so the drawing shows the actual normalised weights: the
   * bright cell in a row is the token that row is attending to. `o.at` picks
   * which cell is being computed right now. */
  ML.attn = function (g, r, t, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const n = o.n || 12;
    const cw = r.w / n, ch = r.h / n;
    const seed = o.seed || 3;
    const head = o.at === undefined ? 0.5 : o.at;
    const px = Math.min(ch * 1.15, cw * 2.1);
    MV.mono(g, Math.round(px));
    for (let q = 0; q < n; q++) {
      // the query row being computed, front to back, six times a minute
      const rowPhase = ((t * 0.42 + q / n) % 1 + 1) % 1;
      const live = Math.exp(-Math.pow((rowPhase - head) / 0.09, 2));
      for (let k = 0; k < n; k++) {
        const w = MV.hash2(k, q, seed);
        const w2 = MV.hash2(q * 7 + k, 11, seed + 4);
        // a peaked weight, so one key stands out in every row: an attach
        const v = Math.pow(0.5 + 0.5 * Math.sin(w * 9.1 + w2 * 3.7), 3.2);
        let cell = v * (0.28 + 0.72 * live);
        if (o.rule && o.rule(q, k)) cell = 1;
        const ch2 = RAMP[Math.min(RAMP.length - 1, Math.floor(cell * RAMP.length))];
        if (ch2 === ' ') continue;
        g.globalAlpha = a * (0.30 + 0.70 * cell) * (0.45 + 0.55 * live);
        g.fillStyle = o.color || C.cyan;
        MV.picText(g, ch2, r.x + k * cw, r.y + q * ch);
      }
    }
    g.globalAlpha = 1;
  };

  // ------------------------------------------------------------------ latent
  /* The space the machine thinks in, projected to two dimensions: clusters of
   * things it has learned are alike, and the path of the current input walking
   * between them. The clouds are seeded noise, so this is a picture of a latent
   * space rather than a measurement of one — but the trajectory is real, and it
   * is the only thing here that moves. */
  ML.latent = function (g, r, t, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const N = o.points || 260;
    const seed = o.seed || 5;
    const clusters = o.clusters || [
      { x: 0.24, y: 0.30, s: 0.10 }, { x: 0.68, y: 0.22, s: 0.08 },
      { x: 0.44, y: 0.66, s: 0.13 }, { x: 0.80, y: 0.62, s: 0.07 },
      { x: 0.14, y: 0.76, s: 0.06 },
    ];
    const cw = 11.6, ch = 20.4;
    MV.mono(g, 16);
    for (let i = 0; i < N; i++) {
      const cl = clusters[i % clusters.length];
      const r1 = MV.hash2(i * 3, 1, seed), r2 = MV.hash2(i * 5, 2, seed + 7);
      const rr = Math.sqrt(r1) * cl.s * (1 + 0.02 * Math.sin(t * 0.5 + i));
      const ang = r2 * Math.PI * 2 + t * 0.03;
      const x = r.x + (cl.x + Math.cos(ang) * rr) * r.w;
      const y = r.y + (cl.y + Math.sin(ang) * rr * 0.9) * r.h;
      const col = i % clusters.length;
      g.globalAlpha = a * (0.22 + 0.5 * MV.hash2(i, 9, seed + 3));
      g.fillStyle = o.colors ? o.colors[col] : (col === o.hot ? C.white : (o.color || C.violet));
      MV.picText(g, o.mark || '\u00b7', x, y);
    }
    g.globalAlpha = 1;
    if (o.path) {
      // the walk: each waypoint is a cluster centre, and it eases between them
      const q = o.path(t);
      const pts = o.way || [0, 2, 1, 3, 4];
      const seg = Math.min(pts.length - 1.0001, Math.max(0, q * (pts.length - 1)));
      const i0 = Math.floor(seg), u = MV.smooth(seg - i0);
      const A = clusters[pts[i0]], B = clusters[Math.min(pts.length - 1, i0 + 1)];
      const hx = r.x + MV.lerp(A.x, B.x, u) * r.w;
      const hy = r.y + MV.lerp(A.y, B.y, u) * r.h;
      g.globalAlpha = a;
      g.strokeStyle = o.color || C.violet;
      g.lineWidth = 1.4;
      if (o.glow) { g.shadowColor = o.color || C.violet; g.shadowBlur = o.glow; }
      g.beginPath();
      g.moveTo(r.x + clusters[pts[0]].x * r.w, r.y + clusters[pts[0]].y * r.h);
      for (let i = 1; i <= i0; i++) {
        g.lineTo(r.x + clusters[pts[i]].x * r.w, r.y + clusters[pts[i]].y * r.h);
      }
      g.lineTo(hx, hy);
      g.stroke();
      if (o.glow) g.shadowBlur = 0;
      g.globalAlpha = a;
      g.fillStyle = C.white;
      g.beginPath(); g.arc(hx, hy, 4.5, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  };

  // -------------------------------------------------------------------- loss
  /* A loss surface with two minima and a saddle, and a ball rolling down it by
   * gradient descent. The descent is not animated: the path is integrated here,
   * at a fixed number of steps, and the ball's position is looked up from the
   * path. So the ball is where the gradient actually put it. */
  ML.loss = function (g, r, t, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;

    // f(x, y): two valleys and a plateau, in normalised coordinates
    const f = function (x, y) {
      const g1 = Math.exp(-((x - 0.28) * (x - 0.28) * 3.4 + (y - 0.34) * (y - 0.34) * 3.0));
      const g2 = Math.exp(-((x - 0.74) * (x - 0.74) * 4.6 + (y - 0.68) * (y - 0.68) * 3.6));
      return 0.95 - g1 * 0.85 - g2 * 0.72 + 0.16 * Math.sin(x * 7.3) * Math.cos(y * 5.1);
    };
    const fx = function (x, y) { return (f(x + 0.004, y) - f(x - 0.004, y)) / 0.008; };
    const fy = function (x, y) { return (f(x, y + 0.004) - f(x, y - 0.004)) / 0.008; };

    // the field as its own contour lines: a glyph is printed only where the
    // value is within a hair of a level, so what shows up is the shape of the
    // surface and not a wash of density
    const ny = o.ny || 20;
    MV.mono(g, Math.max(8, Math.round((r.h / ny) * 0.98)));
    const cw = g.measureText('M').width, ch = r.h / ny;
    const nx = Math.max(8, Math.round(r.w / cw));
    const LEVELS = o.levels || 7;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const u = (i + 0.5) / nx, v2 = (j + 0.5) / ny;
        const v = f(u, v2);
        const d = Math.abs(v * LEVELS - Math.round(v * LEVELS));
        if (d > 0.09) continue;
        const s = d < 0.028 ? '#' : (d < 0.058 ? '+' : '.');
        g.globalAlpha = a * (0.40 + 0.55 * (1 - v));
        g.fillStyle = (o.hot && v < 0.55) ? o.hot : (o.color || C.violetDim);
        MV.picText(g, s, r.x + (i + 0.5) * cw, r.y + (j + 0.5) * ch);
      }
    }

    // the descent itself: fixed steps, recorded once
    const START = o.start || [0.92, 0.13];
    const N = 220, lr = 0.028;
    let px = START[0], py = START[1];
    const path = [[px, py]];
    for (let i = 0; i < N; i++) {
      px -= lr * fx(px, py); py -= lr * fy(px, py);
      px = MV.clamp(px, 0.02, 0.98); py = MV.clamp(py, 0.02, 0.98);
      path.push([px, py]);
    }
    const q = MV.clamp(t * (o.speed || 0.20) - (o.delay || 0), 0, 1);
    const step = q * (path.length - 1);
    const k0 = Math.floor(step);
    g.globalAlpha = a * 0.85;
    g.strokeStyle = o.pathColor || C.amber;
    g.lineWidth = 1.8;
    if (o.glow) { g.shadowColor = o.pathColor || C.amber; g.shadowBlur = o.glow; }
    g.beginPath();
    for (let i = 0; i <= k0; i++) {
      const X = r.x + path[i][0] * r.w, Y = r.y + path[i][1] * r.h;
      if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
    }
    g.stroke();
    if (o.glow) g.shadowBlur = 0;
    const B = path[Math.min(path.length - 1, k0)];
    g.fillStyle = C.white;
    g.beginPath(); g.arc(r.x + B[0] * r.w, r.y + B[1] * r.h, 6, 0, Math.PI * 2); g.fill();
    if (o.label) {
      UI.label(g, o.label, r.x + B[0] * r.w + 14, r.y + B[1] * r.h + 6, 15,
        o.pathColor || C.amber, a * 0.95);
    }
    g.globalAlpha = 1;
  };

  // --------------------------------------------------------------- parameters
  /* The parameter matrix. Every cell is a number the machine was initialised
   * with, written as a density glyph; the head sweeps it and the values it
   * writes are the ones it is learning now. This is what "fill in my data
   * parameters" looks like from inside. */
  ML.params = function (g, r, t, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const rows = o.rows || 20;
    const seed = o.seed || 2;
    const write = o.write === undefined ? 1 : o.write;
    const head = MV.clamp(o.head === undefined ? (t * 0.22) % 1 : o.head, 0, 1);
    const ch = r.h / rows;
    MV.mono(g, Math.max(8, Math.round(ch * 0.98)));
    const cw = g.measureText('M').width;
    const cols = Math.max(8, Math.round(r.w / cw));
    const DIG = '-.0123456789';
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const u = (j + 0.5) / rows;
        const old = MV.hash2(i, j, seed);
        const fresh = MV.hash2(i * 3 + 7, j * 5 + 1, seed + 21);
        const w = MV.clamp((head - u) / 0.10, 0, 1) * write;
        const v = old + (fresh - old) * MV.smooth(w);
        const dead = o.dead && w > 0.6;
        let s, al;
        if (o.numeric) {
          s = dead ? (o.deadChar || 'N') : DIG[Math.min(DIG.length - 1, Math.floor(v * DIG.length))];
          al = dead ? 0.95 : 0.22 + 0.55 * v;
        } else {
          s = ' .,:;+*#%@'[Math.round(v * 9)];
          if (s === ' ') continue;
          al = 0.16 + 0.55 * v;
        }
        g.globalAlpha = a * al;
        g.fillStyle = dead ? (o.hot || C.red) : (o.color || C.phosDim);
        MV.picText(g, s, r.x + (i + 0.5) * cw, r.y + (j + 0.5) * ch);
      }
    }
    // the write head: the row being written right now
    const hy = r.y + head * r.h;
    g.globalAlpha = a * 0.9;
    g.strokeStyle = o.headColor || C.phos;
    g.lineWidth = 2;
    if (o.glow) { g.shadowColor = o.headColor || C.phos; g.shadowBlur = o.glow; }
    g.beginPath(); g.moveTo(r.x, hy + 0.5); g.lineTo(r.x + r.w, hy + 0.5); g.stroke();
    if (o.glow) g.shadowBlur = 0;
    g.globalAlpha = 1;
  };

  // ------------------------------------------------------------- forward pass
  /* Inference: layers as columns, units as dots, and the activation of the
   * current input moving left to right through them. Weights are the lines
   * between neighbouring columns; the ones carrying signal light up. The pulse
   * crosses in a fixed time per layer, so what you see is a forward pass and
   * not a decoration. */
  ML.forward = function (g, r, t, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const layers = o.layers || [7, 11, 9, 5, 3];
    const seed = o.seed || 4;
    const cols = layers.length;
    const cw = r.w / (cols - 1);
    const at = MV.clamp(o.at === undefined ? (t * (o.speed || 0.55)) % (cols + 0.8) : o.at, 0, cols + 0.8);
    const unitY = function (li, k) {
      const n = layers[li];
      const span = r.h * 0.86;
      return r.y + r.h / 2 + (n === 1 ? 0 : (k / (n - 1) - 0.5) * span);
    };
    // the wiring first, dim, then the signal on top of it
    for (let li = 0; li < cols - 1; li++) {
      for (let k = 0; k < layers[li]; k++) {
        for (let m = 0; m < layers[li + 1]; m++) {
          const w = MV.hash2(k + li * 31, m, seed);
          if (w < 0.68) continue;
          const carry = MV.clamp(1 - Math.abs(at - (li + 0.5)), 0, 1);
          g.globalAlpha = a * 0.10 + a * 0.55 * carry * w;
          g.strokeStyle = carry > 0.35 && o.color === undefined ? C.phos : (o.color || C.phosDim);
          g.lineWidth = carry > 0.35 ? 1.2 : 0.7;
          g.beginPath();
          g.moveTo(r.x + li * cw, unitY(li, k));
          g.lineTo(r.x + (li + 1) * cw, unitY(li + 1, m));
          g.stroke();
        }
      }
    }
    for (let li = 0; li < cols; li++) {
      const fire = MV.clamp(1 - Math.abs(at - li) * 1.15, 0, 1);
      for (let k = 0; k < layers[li]; k++) {
        const base = MV.hash2(k, li, seed + 13);
        const v = base * 0.45 + fire * (0.35 + 0.65 * base);
        g.globalAlpha = a * (0.25 + 0.75 * v);
        g.fillStyle = fire > 0.5 ? C.white : (o.nodeColor || C.phos);
        g.beginPath();
        g.arc(r.x + li * cw, unitY(li, k), 3.2 + 2.4 * fire, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (o.caption) {
      UI.label(g, o.caption(at), r.x, r.y + r.h + 26, 16, o.color || C.phos, a * 0.9);
    }
    g.globalAlpha = 1;
  };

  // ------------------------------------------------------------------- tokens
  /* The input itself: words as they arrive, each becoming a row of numbers and
   * then a point in the space. `o.words` is the sequence and `o.upto` the time
   * it is at, so the river is the song's own text and nothing else. */
  ML.tokens = function (g, r, t, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const words = o.words || [];
    const upto = o.upto === undefined ? t : o.upto;
    const n = Math.max(0, Math.min(words.length, Math.floor(upto)));
    MV.mono(g, 17);
    for (let i = 0; i < n; i++) {
      const age = upto - i;
      const y = r.y + 10 + i * 26;
      if (y > r.y + r.h) break;
      const fade = MV.clamp(1 - (age - words.length * 0.5) / 6, 0.25, 1);
      g.globalAlpha = a * (i === n - 1 ? 1 : 0.42 + 0.4 * MV.hash2(i, 1, 9)) * fade;
      g.fillStyle = i === n - 1 ? C.white : (o.color || C.phos);
      MV.picText(g, '\u203a ' + words[i], r.x, y);
    }
    // each word leaves a vector behind it: the same word, hashed into numbers
    if (o.vectors) {
      const cols = 8;
      for (let i = 0; i < n; i++) {
        const y = r.y + 10 + i * 26;
        if (y > r.y + r.h) break;
        for (let c = 0; c < cols; c++) {
          const v = MV.hash2(i * 13 + c, 3, 17);
          g.globalAlpha = a * (0.2 + 0.6 * v) * (i === n - 1 ? 1 : 0.5);
          g.fillStyle = v > 0.5 ? C.cyan : C.cyanDim;
          MV.picText(g, (v * 2 - 1).toFixed(1), r.x + o.vecX + c * 30, y);
        }
      }
    }
    g.globalAlpha = 1;
  };

  // --------------------------------------------------------------------- grid
  /* A plain character grid filled from a function of (u, v, t). The workhorse
   * under everything else here: 90 columns of glyphs that can cover the whole
   * tube, which is how a picture of a machine gets to be as big as the frame. */
  ML.grid = function (g, r, t, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const cols = o.cols || 90, rows = o.rows || 34;
    const cw = r.w / cols, ch = r.h / rows;
    const fn = o.fn;
    const ramp = o.ramp || ' .:-=+*#%@';
    MV.mono(g, Math.round(Math.min(ch * 1.08, cw * 2.0)));
    for (let j = 0; j < rows; j++) {
      const v = (j + 0.5) / rows;
      for (let i = 0; i < cols; i++) {
        const u = (i + 0.5) / cols;
        const q = fn(u, v, i, j);
        if (q <= 0.02) continue;
        const s = ramp[Math.min(ramp.length - 1, Math.floor(q * ramp.length))];
        if (s === ' ') continue;
        g.globalAlpha = a * (o.floor === undefined ? 0.18 : o.floor) + a * (1 - (o.floor === undefined ? 0.18 : o.floor)) * q;
        g.fillStyle = q > 0.72 && o.hot ? o.hot : (o.color || C.phos);
        MV.picText(g, s, r.x + i * cw, r.y + j * ch);
      }
    }
    g.globalAlpha = 1;
  };

  // a labelled frame around a region, so a big figure can be named on screen
  ML.tag = function (g, x, y, s, color, alpha, o) {
    UI.label(g, s, x, y, (o && o.px) || 16, color, alpha, o);
  };
})(window.MV = window.MV || {});
