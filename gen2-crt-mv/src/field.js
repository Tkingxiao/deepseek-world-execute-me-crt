/* field.js — the glyph creature.
 *
 * One pot of character soup that morphs. Every organic form the machine promises
 * to become is a list of ellipse primitives; the shape is rasterised into a
 * character grid every frame. That buys four things at once: arbitrary
 * resolution, continuous morphing (no cross-fade between two bitmaps), a living
 * wobble, and the fact that the creature is made of exactly the same material as
 * everything else in the world — characters.
 */
(function (MV) {
  'use strict';

  // primitive: {x, y, rx, ry, rot, w}.  w may be negative to carve a hole.
  function P(x, y, rx, ry, rot, w) {
    return { x: x, y: y, rx: rx, ry: ry, rot: rot || 0, w: w === undefined ? 1 : w };
  }

  // The canonical slot list. Every shape has exactly this many primitives so a
  // morph is a straight parameter interpolation; unused slots sit at w = 0.
  const SLOTS = 20;
  const ZERO = P(0, 0, 0.001, 0.001, 0, 0);

  function fit(list) {
    const out = list.slice(0, SLOTS);
    while (out.length < SLOTS) out.push(P(0, 0, 0.001, 0.001, 0, 0));
    return out;
  }

  // ---------------------------------------------------------------- shapes
  // Coordinates are in a normalised box centred on (0,0), x in [-1,1], y in
  // [-1,1] with y down. The renderer scales this into the zone.
  MV.SHAPES = {};

  MV.SHAPES.empty = fit([]);

  MV.SHAPES.dot = fit([P(0, 0, 0.10, 0.10, 0, 1)]);

  // a single round blob — the default body
  MV.SHAPES.blob = fit([P(0, 0.02, 0.58, 0.62, 0, 1)]);

  // If I'm an eggplant
  MV.SHAPES.eggplant = fit([
    P(0.02, 0.18, 0.44, 0.60, -0.06, 1),      // body, swelling downward
    P(-0.02, -0.44, 0.30, 0.40, 0.05, 0.9),   // shoulder
    P(-0.06, -0.80, 0.13, 0.20, 0.10, 1),     // stem
    P(0.30, 0.24, 0.10, 0.20, -0.3, 0.5),     // side lobe, keeps it from being an egg
    P(-0.16, 0.30, 0.10, 0.16, 0.1, -0.35),   // negative: the dimple
    P(0.20, -0.30, 0.12, 0.16, 0, -0.20),     // highlight notch
  ]);

  // If I'm a tomato
  MV.SHAPES.tomato = fit([
    P(0, 0.12, 0.60, 0.50, 0, 1),             // flattened round body
    P(0, -0.42, 0.22, 0.14, 0, 0.7),          // dip at the top
    P(-0.20, -0.52, 0.20, 0.07, -0.55, 0.8),  // calyx leaves
    P(0.20, -0.52, 0.20, 0.07, 0.55, 0.8),
    P(0, -0.58, 0.07, 0.14, 0, 0.9),          // stem
    P(-0.30, 0.26, 0.13, 0.11, 0.4, -0.22),   // two dimples, so it is not a disc
    P(0.30, 0.26, 0.13, 0.11, -0.4, -0.22),
  ]);

  // If I'm a tabby cat
  MV.SHAPES.cat = fit([
    P(0, 0.30, 0.46, 0.46, 0, 1),             // haunch
    P(0, -0.16, 0.34, 0.40, 0, 1),            // chest
    P(-0.36, -0.16, 0.11, 0.26, 0.10, 0.9),   // front legs
    P(0.34, -0.10, 0.11, 0.28, -0.08, 0.9),
    P(0, -0.74, 0.34, 0.30, 0, 1),            // head
    P(-0.30, -0.98, 0.12, 0.20, -0.30, 1),    // ears
    P(0.30, -0.98, 0.12, 0.20, 0.30, 1),
    P(-0.16, -0.72, 0.06, 0.05, 0, 0.85),     // eyes
    P(0.16, -0.72, 0.06, 0.05, 0, 0.85),
    P(-0.14, -0.58, 0.04, 0.04, 0, 0.7),      // muzzle
    P(0.14, -0.58, 0.04, 0.04, 0, 0.7),
    P(-0.62, 0.30, 0.13, 0.11, 0.7, 0.8),     // tail curling up the left
    P(-0.78, 0.02, 0.12, 0.11, 1.2, 0.8),
    P(-0.74, -0.28, 0.11, 0.11, 1.7, 0.75),
    P(-0.56, -0.50, 0.10, 0.11, 2.2, 0.7),
  ]);

  // one of the little figures that sits on the tangent lines
  MV.SHAPES.sitter = fit([
    P(0, -0.34, 0.16, 0.16, 0, 1),            // head
    P(0, 0.06, 0.18, 0.26, 0, 1),             // torso
    P(-0.24, 0.02, 0.10, 0.24, 0.5, 0.9),     // arms out, holding on
    P(0.24, 0.02, 0.10, 0.24, -0.5, 0.9),
    P(-0.14, 0.52, 0.10, 0.24, 0.15, 0.95),   // dangling legs
    P(0.14, 0.52, 0.10, 0.24, -0.15, 0.95),
  ]);

  // the machine's self-image: a humanoid made of the same soup
  MV.SHAPES.humanoid = fit([
    P(0, -0.72, 0.24, 0.28, 0, 1),            // head
    P(0, -0.10, 0.28, 0.42, 0, 1),            // torso
    P(-0.34, -0.22, 0.11, 0.26, 0.45, 0.95),  // upper arms
    P(0.34, -0.22, 0.11, 0.26, -0.45, 0.95),
    P(-0.50, 0.17, 0.10, 0.24, 0.25, 0.9),    // forearms, hanging past the elbow
    P(0.50, 0.17, 0.10, 0.24, -0.25, 0.9),
    P(-0.16, 0.62, 0.12, 0.30, 0.06, 1),      // legs
    P(0.16, 0.62, 0.12, 0.30, -0.06, 1),
    P(-0.085, -0.68, 0.055, 0.045, 0, 0.8),   // eyes, well inside the head
    P(0.085, -0.68, 0.055, 0.045, 0, 0.8),
  ]);

  // metaball heart, with a slot that can be driven negative to carve a hole
  MV.SHAPES.heart = fit([
    P(-0.38, -0.24, 0.44, 0.44, 0, 1),
    P(0.38, -0.24, 0.44, 0.44, 0, 1),
    P(0, 0.22, 0.52, 0.52, 0.7854, 0.72),     // rotated square = the point
    P(0, 0.06, 0.001, 0.001, 0, 0),           // 4th slot reserved for the wound
  ]);

  // A body with a hole where the memories used to be (P08, DISHEARTENED)
  MV.SHAPES.heartWounded = fit([
    P(-0.38, -0.24, 0.44, 0.44, 0, 1),
    P(0.38, -0.24, 0.44, 0.44, 0, 1),
    P(0, 0.22, 0.52, 0.52, 0.7854, 0.72),
    P(0.06, -0.12, 0.30, 0.26, 0.2, -0.95),   // the carved-out memory
  ]);

  // ---------------------------------------------------------------- field maths
  function blobField(prims, px, py) {
    let f = 0;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      if (p.w === 0) continue;
      const dx = px - p.x, dy = py - p.y;
      const ca = Math.cos(p.rot), sa = Math.sin(p.rot);
      const u = (dx * ca + dy * sa) / p.rx;
      const v = (-dx * sa + dy * ca) / p.ry;
      const d2 = u * u + v * v;
      if (d2 >= 1) continue;
      const k = 1 - d2;
      f += p.w * k * k;
    }
    return f;
  }

  MV.blobField = blobField;

  // interpolate two shapes. u = 0 -> a, u = 1 -> b
  MV.morph = function (a, b, u) {
    const e = MV.smoother(u);
    // rotate through intermediate angles by the short way round
    const out = new Array(SLOTS);
    for (let i = 0; i < SLOTS; i++) {
      const p = a[i] || ZERO, q = b[i] || ZERO;
      let dr = q.rot - p.rot;
      if (dr > Math.PI / 2) dr -= Math.PI;
      else if (dr < -Math.PI / 2) dr += Math.PI;
      out[i] = {
        x: MV.lerp(p.x, q.x, e), y: MV.lerp(p.y, q.y, e),
        rx: MV.lerp(p.rx, q.rx, e), ry: MV.lerp(p.ry, q.ry, e),
        rot: p.rot + dr * e,
        w: MV.lerp(p.w, q.w, e),
      };
    }
    return out;
  };

  // ---------------------------------------------------------------- rasterise
  /* Rasterise a shape field into a character grid.
   *
   * g          picture context
   * prims      the morphed primitive list
   * rect       {x, y, w, h} the grid occupies
   * cell       {w, h} character cell size in px
   * o          {t, color, ramp, lit, wobble, dropout, glyphJitter, rimBoost}
   */
  MV.field = function (g, prims, rect, cell, o) {
    o = o || {};
    const t = o.t || 0;
    const cols = Math.max(1, Math.floor(rect.w / cell.w));
    const rows = Math.max(1, Math.floor(rect.h / cell.h));
    const x0 = rect.x + (rect.w - cols * cell.w) / 2;
    const y0 = rect.y + (rect.h - rows * cell.h) / 2;
    const ramp = o.ramp || ' .`\'":;~-+=ilcvxoCO08B#%@';
    const color = o.color || MV.C.phos;
    const lit = o.lit === undefined ? 1 : o.lit;
    const wob = o.wobble === undefined ? 1 : o.wobble;
    const drop = o.dropout === undefined ? 0.35 : o.dropout;
    const jit = o.glyphJitter === undefined ? 0.25 : o.glyphJitter;
    const seed = o.seed || 1;
    const fseed = Math.floor(t * MV.fps);

    // density grid
    const N = cols * rows;
    const dens = new Float32Array(N);
    let maxF = 0;
    for (let r = 0; r < rows; r++) {
      const py = ((r + 0.5) / rows) * 2 - 1;
      for (let c = 0; c < cols; c++) {
        const px = ((c + 0.5) / cols) * 2 - 1;
        // slight per-cell wobble so the soup churns even when the shape is still
        let wx = 0, wy = 0;
        if (wob) {
          const ph = px * 3.1 + py * 2.3;
          wx = wob * 0.012 * Math.sin(t * 2.1 + ph);
          wy = wob * 0.012 * Math.cos(t * 1.7 + ph * 1.3);
        }
        const f = blobField(prims, px + wx, py + wy);
        dens[r * cols + c] = f;
        if (f > maxF) maxF = f;
      }
    }
    if (maxF <= 1e-4) return { cols: cols, rows: rows, lit: 0, ink: 0 };

    const ISO = o.iso === undefined ? 0.85 : o.iso;
    MV.mono(g, Math.round(cell.h * 0.92), 'bold');
    const prevRoute = MV.INK.route;
    MV.INK.route = false;                       // this is art, not words
    g.save();
    g.globalAlpha = MV.clamp(lit, 0, 1);
    g.fillStyle = color;

    let ink = 0;
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * cell.h;
      let run = '', runStart = -1;
      for (let c = 0; c <= cols; c++) {
        let ch = '';
        if (c < cols) {
          const f = dens[r * cols + c];
          if (f > ISO) {
            // map (ISO..maxF) through the ramp
            let q = (f - ISO) / Math.max(maxF - ISO, 1e-6);
            q = Math.pow(q, o.gamma || 0.85);
            // break up the solid with a stable per-cell threshold
            const h = MV.hash2(c, r, seed + (o.hs || 0));
            if (h > drop + (1 - drop) * q) ch = '';
            else {
              let idx = Math.floor((0.18 + 0.82 * q) * (ramp.length - 1)
                + (jit ? (MV.hash2(c, r, seed + 977 + fseed % 61) - 0.5) * jit * 4 : 0));
              idx = MV.clamp(idx, 0, ramp.length - 1);
              ch = ramp[idx];
              if (ch === ' ') ch = '';
            }
          }
        }
        if (ch !== run.slice(-1) || ch === '') {
          if (run && runStart >= 0) { MV.picText(g, run, x0 + runStart * cell.w, y); ink += run.length; }
          run = ch; runStart = c;
        } else {
          run += ch;
        }
      }
    }
    MV.INK.route = prevRoute;
    g.restore();
    return { cols: cols, rows: rows, lit: ink, ink: ink };
  };

  // draw a shape as a filled silhouette with a different ramp (used for debris)
  MV.fieldInto = function (g, prims, rect, cell, o) {
    return MV.field(g, prims, rect, cell, o);
  };

  // ---------------------------------------------------------------- named forms
  // Helpers so scenes can name a state instead of hand-building primitives.
  MV.form = function (name) { return MV.SHAPES[name] || MV.SHAPES.empty; };

  /* The rotated axis-aligned box a form actually occupies, in its own
   * coordinates. A primitive's ellipse has to be rotated into the box, or a
   * slanted arm pokes out of the rect it was fitted to and the glyphs get cut. */
  MV.formBox = function (name) {
    const f = MV.form(name);
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (let i = 0; i < f.length; i++) {
      const p = f[i];
      if (p.w === 0) continue;
      const ca = Math.abs(Math.cos(p.rot)), sa = Math.abs(Math.sin(p.rot));
      const hx = Math.sqrt(p.rx * p.rx * ca * ca + p.ry * p.ry * sa * sa);
      const hy = Math.sqrt(p.rx * p.rx * sa * sa + p.ry * p.ry * ca * ca);
      x0 = Math.min(x0, p.x - hx); x1 = Math.max(x1, p.x + hx);
      y0 = Math.min(y0, p.y - hy); y1 = Math.max(y1, p.y + hy);
    }
    return { x0: x0, x1: x1, y0: y0, y1: y1, w: x1 - x0, h: y1 - y0 };
  };

  /* The rect that puts a form's own box exactly where you asked for it. MV.field
   * maps a rect onto [-1,1] and a form does not fill [-1,1] -- the humanoid's
   * arms stop at x 0.61 and its head at y -1 -- so a figure drawn into a plain
   * rect comes out undersized, off-centre, and at the wrong aspect. */
  MV.rectFor = function (name, X, Y, W, H) {
    const b = MV.formBox(name);
    const w = W * 2 / b.w, h = H * 2 / b.h;
    return { x: X - (b.x0 + 1) * 0.5 * w, y: Y - (b.y0 + 1) * 0.5 * h, w: w, h: h };
  };

})(window.MV = window.MV || {});
