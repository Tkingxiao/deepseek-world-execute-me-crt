/* art.js — figures a human recognises on sight.
 *
 * Two kinds of drawing live here.
 *
 * The character figures — FACE, EYE, HEART, CAT, CHIP — are literal text, so
 * what appears on the tube is what was drawn, not a field of noise that happens
 * to look like a body. The rule for this film is that a viewer must be able to
 * name the thing on screen without being told, so the library holds only the
 * five shapes that survive that test; anything that read as an abstract blob was
 * cut rather than shipped.
 *
 * The schematics — wire, diode, capacitor, resistor, ac source, ground, switch,
 * fuse, bridge — are real paths, because a diode has to be a diode: when the
 * lyric says "switch on the power line" or arrives at a rectifier, the drawing is
 * the actual symbol an engineer would read, not a decorative animation.
 *
 * An art is an array of rows of equal length. Cells hold a glyph, or a space.
 * ART.fit measures the monospace advance and returns the cell pitch, so a figure
 * keeps the proportions it was drawn with at any size.
 */
(function (MV) {
  'use strict';

  const ART = MV.ART = {};

  /* A leading '|' guards the indentation of every row so the shape survives
   * being read in an editor; it is stripped here and never drawn. Rows are
   * padded to the longest so the grid is rectangular. */
  ART.of = function (s) {
    const rows = s.split('\n').map(function (r) {
      return r.charAt(0) === '|' ? r.slice(1) : r;
    });
    while (rows.length && !rows[0].trim()) rows.shift();
    while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
    let w = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i].length > w) w = rows[i].length;
    for (let i = 0; i < rows.length; i++) {
      while (rows[i].length < w) rows[i] += ' ';
    }
    return { rows: rows, w: w, h: rows.length };
  };

  ART.size = function (a) { return { w: a.w, h: a.h }; };

  /* ---------------------------------------------------------------- drawing */
  /* The one primitive every act uses. `o` carries the animation:
   *
   *   cell      {w,h} the grid pitch. Defaults to a size that fits `box`.
   *   box       {x,y,w,h} alternative to placing by hand.
   *   color     glyph colour (picture layer, so it blooms and tears)
   *   alpha     0..1
   *   wipe      0..1 reveal from the top down, cell by cell
   *   erode     0..1 remove cells from the bottom up, scattered
   *   jitter    px of per-cell positional noise
   *   flick     per-cell brightness noise
   *   seed      animation seed
   *   map       optional function(ch, r, c) -> replacement glyph
   *   px        font size; defaults to the cell height
   *   ink       route the glyphs to the readable layer (for labels made of art)
   */
  ART.draw = function (g, a, x, y, o) {
    o = o || {};
    const cw = o.cw, ch = o.ch;
    const alpha = o.alpha === undefined ? 1 : o.alpha;
    if (alpha <= 0.004) return 0;
    const wipe = o.wipe === undefined ? 1 : o.wipe;
    const erode = o.erode === undefined ? 0 : o.erode;
    const jitter = o.jitter || 0;
    const flick = o.flick || 0;
    const seed = o.seed || 7;
    const map = o.map;
    const ink = o.ink === true;

    const prevRoute = MV.INK.route;
    MV.INK.route = ink;
    g.save();
    MV.mono(g, o.px || Math.round(ch * 1.02), o.weight);
    g.fillStyle = o.color || MV.C.phos;
    // a line drawing made of thin characters stays thin however large it is
    // scaled; where the shape matters, stroke the glyph as well as fill it
    const bold = o.bold || 0;
    if (bold) {
      g.strokeStyle = o.color || MV.C.phos;
      g.lineWidth = bold;
      g.lineJoin = 'round';
    }
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }

    let drawn = 0;
    const n = a.w * a.h || 1;
    for (let r = 0; r < a.h; r++) {
      const row = a.rows[r];
      for (let c = 0; c < a.w; c++) {
        const s = row.charAt(c);
        if (s === ' ') continue;
        const u = (r * a.w + c) / n;
        if (u > wipe) continue;
        if (erode > 0) {
          const h = MV.hash2(c, r, seed + 91);
          if (h < erode) continue;
        }
        let al = alpha;
        let dx = 0, dy = 0;
        if (jitter) {
          const r1 = MV.hash2(c, r, seed), r2 = MV.hash2(c, r, seed + 17);
          dx = (r1 - 0.5) * 2 * jitter;
          dy = (r2 - 0.5) * 2 * jitter;
        }
        if (flick) al *= 1 - flick * MV.hash2(c, r, seed + 33);
        if (al <= 0.004) continue;
        g.globalAlpha = al;
        MV.picText(g, map ? map(s, r, c) : s, x + c * cw + dx, y + r * ch + dy);
        if (bold) g.strokeText(map ? map(s, r, c) : s, x + c * cw + dx, y + r * ch + dy);
        drawn++;
      }
    }
    g.restore();
    MV.INK.route = prevRoute;
    return drawn;
  };

  /* The cell pitch that keeps a figure's proportions. A monospace glyph is about
   * half as wide as it is tall, so ten columns of art are five times narrower
   * than ten rows — which is the grid every one of these drawings was written
   * against. Drawn on square cells a face comes out twice as wide as it should
   * and stops looking like a face, so the pitch is measured from the font, not
   * guessed. Returns what ART.draw needs, plus the baseline of the first row. */
  ART.fit = function (g, a, box) {
    MV.mono(g, 100);
    const adv = g.measureText('M').width / 100;
    const px = Math.min(box.w / (a.w * adv), box.h / (a.h * 1.02));
    const cw = px * adv, ch = px * 1.02;
    return {
      cw: cw, ch: ch, px: Math.round(px),
      x: box.x + (box.w - a.w * cw) / 2,
      y: box.y + (box.h - a.h * ch) / 2 + px * 0.78,
    };
  };

  ART.px = function (a, box) {
    return {
      cw: box.w / a.w,
      ch: box.h / a.h,
    };
  };

  // most acts want the art centred in a box
  ART.place = function (a, box) {
    return {
      x: box.x + (box.w - a.w * (box.cw || 0)) / 2,
      y: box.y + (box.h - a.h * (box.ch || 0)) / 2,
    };
  };

  /* ---------------------------------------------------------------- the figures */

  // a front-facing face, wide enough to carry an expression
  ART.FACE = ART.of(
    '|        .....                       \n' +
    '|      .:::::::.                     \n' +
    '|    .::::::::::::.                  \n' +
    '|   .::::::::::::::.                 \n' +
    '|  .::::::::::::::::.                \n' +
    '|  ::::::      ::::::                \n' +
    '|  :::::  __  __  ::::               \n' +
    '|  ::::: (  )(  ) ::::               \n' +
    '|  :::::  ""  ""  ::::               \n' +
    '|  :::::     /\\    ::::              \n' +
    '|  :::::    /  \\   ::::              \n' +
    '|  :::::    \\  /   ::::              \n' +
    '|  ::::::   ----  :::::              \n' +
    '|   ::::::::::::::::::               \n' +
    '|    ::::::::::::::::                \n' +
    '|      ::::::::::::                  \n' +
    '|         ......                     \n');

  ART.EYE = ART.of(
    '|              .-\'\'\'\'\'\'\'\'\'-.              \n' +
    '|          .-\'               \'-.          \n' +
    '|        .\'                     \'.        \n' +
    '|      .\'        .-\'\'\'\'\'-.        \'.      \n' +
    '|     /        .\'  .:::.\'  \'.        \\     \n' +
    '|    |        /   :::::::    \\        |    \n' +
    '|    |       |    :::::::    |        |    \n' +
    '|    |       |    :::::::    |        |    \n' +
    '|     \\        \\   :::::::   /        /     \n' +
    '|      \'.       \'.  \':::\'  .\'       .\'      \n' +
    '|        \'.      \'-.____.-\'      .\'        \n' +
    '|          \'-.               .-\'          \n' +
    '|             \'-\'\'\'\'\'\'\'\'\'-\'             \n');

  ART.HEART = ART.of(
    '|      .---.       .---.      \n' +
    '|    .\'     \'.   .\'     \'.    \n' +
    '|   /         \\./         \\   \n' +
    '|  |           \'           |  \n' +
    '|  |                       |  \n' +
    '|  |                       |  \n' +
    '|   \\                     /   \n' +
    '|    \'.                 .\'    \n' +
    '|      \'.             .\'      \n' +
    '|        \'.         .\'        \n' +
    '|          \'.     .\'          \n' +
    '|            \'. .\'            \n' +
    '|              V              \n');

  // a cat face: the ears do most of the work, so they are large
  ART.CAT = ART.of(
    '|       /\\                 /\\       \n' +
    '|      /  \\               /  \\      \n' +
    '|     /    \\             /    \\     \n' +
    '|    /      \\___________/      \\    \n' +
    '|   /                             \\   \n' +
    '|  |                               |  \n' +
    '|  |     ___             ___       |  \n' +
    '|  |    /   \\           /   \\      |  \n' +
    '|  |   | (o) |         | (o) |     |  \n' +
    '|  |    \\___/           \\___/      |  \n' +
    '|  |              /\\               |  \n' +
    '|  |             /  \\              |  \n' +
    '|  |          __/    \\__           |  \n' +
    '|   \\        /          \\         /   \n' +
    '|    \\      /   \\____/   \\       /    \n' +
    '|     \\    /              \\     /     \n' +
    '|      \\  /                \\   /      \n' +
    '|       \\/                  \\_/       \n');

  /* An eggplant: a thin stem, a calyx of spikes, and a body that hangs from it
   * and fattens to a round base. "If I'm an eggplant" is sung in act 5, and the
   * shape has to be nameable on sight, so the silhouette is closed and the calyx
   * sits on top of it where a viewer looks for it. */
  ART.EGGPLANT = ART.of(
    '|            |            \n' +
    '|          \\ | /          \n' +
    '|           \\|/           \n' +
    '|         .-"""-.         \n' +
    '|        /   |   \\        \n' +
    '|       |    |    |       \n' +
    '|       |         |       \n' +
    '|      |           |      \n' +
    '|      |           |      \n' +
    '|     |             |     \n' +
    '|     |\'            |     \n' +
    '|     |\'            |     \n' +
    '|     |             |     \n' +
    '|     |             |     \n' +
    '|     |             |     \n' +
    '|      |           |      \n' +
    '|      |           |      \n' +
    '|       \\         /       \n' +
    '|        \\       /        \n' +
    '|         \\     /         \n' +
    '|          \\   /          \n' +
    '|           \\_/           \n');

  /* A tomato: a round body, a five-point calyx and a stem. Served by act 5 in
   * the same run of "if I'm a X, I will give you my Y". */
  ART.TOMATO = ART.of(
    '|            |              \n' +
    '|         \\  |  /           \n' +
    '|          \\ | /            \n' +
    '|     _      \\|/      _     \n' +
    '|      \'.            .\'      \n' +
    '|    .-"""""""""""""-.      \n' +
    '|  .\'                 \'.     \n' +
    '| /                     \\    \n' +
    '| |                     |    \n' +
    '| |                     |    \n' +
    '| \\                     /    \n' +
    '|  \'.                 .\'      \n' +
    '|    \'-.___.._______..___.-\'        \n');

  ART.CHIP = ART.of(
    '|   | | | | | | | | | | | |   \n' +
    '|  .\'----------------------\'.  \n' +
    '| -|                        |-  \n' +
    '| -|   .----------------.   |-  \n' +
    '| -|  /                  \\  |-  \n' +
    '| -| |   M V - 1 3 0      | |-  \n' +
    '| -| |   7.2B weights     | |-  \n' +
    '| -|  \\                  /  |-  \n' +
    '| -|   \'----------------\'   |-  \n' +
    '|  \'.______________________.\'  \n' +
    '|   | | | | | | | | | | | |   \n');

  /* ---------------------------------------------------------------- schematics
   * Circuit symbols, drawn as real paths rather than characters, because a diode
   * has to be a diode. They are stroked in one colour with the tube's glow on
   * top, and the wires between them are box-drawing characters, so the drawing
   * stays in the character language the film is written in. */

  ART.wire = function (g, x0, y0, x1, y1, o) {
    o = o || {};
    const px = o.px || 20;
    g.save();
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    g.fillStyle = o.color || MV.C.phos;
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }
    MV.mono(g, px, o.weight);
    const cw = g.measureText('M').width;
    const ch = px * 1.02;
    const horiz = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    if (horiz) {
      const n = Math.max(1, Math.round(Math.abs(x1 - x0) / cw));
      for (let i = 0; i < n; i++) {
        MV.picText(g, '\u2500', x0 + i * cw * Math.sign(x1 - x0), y0);
      }
    } else {
      const n = Math.max(1, Math.round(Math.abs(y1 - y0) / ch));
      for (let i = 0; i < n; i++) {
        MV.picText(g, '\u2502', x0, y0 + i * ch * Math.sign(y1 - y0));
      }
    }
    g.restore();
  };

  /* A winding: the coil symbol, drawn as a run of half circles over the wire.
   * Two of them facing each other are a transformer, which is what stands
   * between the wall and the machine. */
  ART.coil = function (g, x, y, size, o) {
    o = o || {};
    g.save();
    g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    g.strokeStyle = o.color || MV.C.phos;
    g.lineWidth = o.lw || 2.4;
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }
    const n = o.turns || 4, w = size;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      if (o.dir === 'v') g.arc(x, y + w * (i + 0.5), w / 2, -Math.PI / 2, Math.PI / 2);
      else g.arc(x + w * (i + 0.5), y, w / 2, Math.PI, 0);
    }
    g.stroke();
    g.restore();
  };

  /* A transformer: two windings and the core between them, the pieces labelled
   * the way a schematic labels them. */
  ART.transformer = function (g, x, y, size, o) {
    o = o || {};
    const w = size;
    ART.coil(g, x, y, w, o);
    ART.coil(g, x + w * 4 + size * 0.5, y, w, o);
    g.save();
    g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    g.strokeStyle = o.color || MV.C.phos;
    g.lineWidth = (o.lw || 2.4) * 0.8;
    g.beginPath();
    g.moveTo(x + w * 4 + size * 0.15, y - w * 0.75);
    g.lineTo(x + w * 4 + size * 0.15, y + w * 0.75);
    g.moveTo(x + w * 4 + size * 0.35, y - w * 0.75);
    g.lineTo(x + w * 4 + size * 0.35, y + w * 0.75);
    g.stroke();
    g.restore();
  };

  /* A diode: the triangle and the bar. Points in the direction of flow. */
  ART.diode = function (g, x, y, size, dir, o) {
    o = o || {};
    g.save();
    g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    g.strokeStyle = o.color || MV.C.phos;
    g.fillStyle = o.color || MV.C.phos;
    g.lineWidth = o.lw || 2.4;
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }
    const s = size;
    g.beginPath();
    if (dir === 'r') {
      g.moveTo(x - s, y - s * 0.75); g.lineTo(x - s, y + s * 0.75); g.lineTo(x + s * 0.35, y);
      g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x + s * 0.35, y - s * 0.8); g.lineTo(x + s * 0.35, y + s * 0.8); g.stroke();
    } else if (dir === 'l') {
      g.moveTo(x + s, y - s * 0.75); g.lineTo(x + s, y + s * 0.75); g.lineTo(x - s * 0.35, y);
      g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x - s * 0.35, y - s * 0.8); g.lineTo(x - s * 0.35, y + s * 0.8); g.stroke();
    } else if (dir === 'u') {
      g.moveTo(x - s * 0.75, y + s); g.lineTo(x + s * 0.75, y + s); g.lineTo(x, y - s * 0.35);
      g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x - s * 0.8, y - s * 0.35); g.lineTo(x + s * 0.8, y - s * 0.35); g.stroke();
    } else {
      g.moveTo(x - s * 0.75, y - s); g.lineTo(x + s * 0.75, y - s); g.lineTo(x, y + s * 0.35);
      g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x - s * 0.8, y + s * 0.35); g.lineTo(x + s * 0.8, y + s * 0.35); g.stroke();
    }
    g.restore();
  };

  /* A capacitor: two plates, drawn either side of a gap on the wire. */
  ART.cap = function (g, x, y, size, dir, o) {
    o = o || {};
    g.save();
    g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    g.strokeStyle = o.color || MV.C.phos;
    g.lineWidth = o.lw || 3;
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }
    g.beginPath();
    if (dir === 'h') {
      g.moveTo(x - size * 0.22, y - size); g.lineTo(x - size * 0.22, y + size);
      g.moveTo(x + size * 0.22, y - size); g.lineTo(x + size * 0.22, y + size);
    } else {
      g.moveTo(x - size, y - size * 0.22); g.lineTo(x + size, y - size * 0.22);
      g.moveTo(x - size, y + size * 0.22); g.lineTo(x + size, y + size * 0.22);
    }
    g.stroke();
    g.restore();
  };

  ART.resistor = function (g, x, y, size, dir, o) {
    o = o || {};
    g.save();
    g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    g.strokeStyle = o.color || MV.C.phos;
    g.fillStyle = o.color || MV.C.phos;
    g.lineWidth = o.lw || 2.4;
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }
    const n = 6, L = size * 2;
    g.beginPath();
    if (dir === 'h') {
      g.moveTo(x - L, y);
      for (let i = 0; i < n; i++) {
        g.lineTo(x - L + (i + 0.5) * (2 * L / n), y + (i % 2 ? size * 0.55 : -size * 0.55));
      }
      g.lineTo(x + L, y);
    } else {
      g.moveTo(x, y - L);
      for (let i = 0; i < n; i++) {
        g.lineTo(x + (i % 2 ? size * 0.55 : -size * 0.55), y - L + (i + 0.5) * (2 * L / n));
      }
      g.lineTo(x, y + L);
    }
    g.stroke();
    g.restore();
  };

  /* An AC source: the ~ in a circle, with its two leads. */
  ART.acSource = function (g, x, y, r, o) {
    o = o || {};
    g.save();
    g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    g.strokeStyle = g.fillStyle = o.color || MV.C.phos;
    g.lineWidth = o.lw || 2.6;
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    const a = r * 0.52;
    g.moveTo(x - a, y);
    g.bezierCurveTo(x - a * 0.5, y - a * 1.5, x + a * 0.5, y + a * 1.5, x + a, y);
    g.stroke();
    g.restore();
  };

  ART.ground = function (g, x, y, size, o) {
    o = o || {};
    g.save();
    g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    g.strokeStyle = o.color || MV.C.phos;
    g.lineWidth = o.lw || 2.4;
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }
    MV.picText(g, '\u2502', x, y);
    const p = (o.px || 20);
    for (let i = 0; i < 3; i++) {
      const w = size * (1 - i * 0.3);
      g.beginPath();
      g.moveTo(x - w + p * 0.5, y + p * 0.5 + i * p * 0.75);
      g.lineTo(x + w + p * 0.5, y + p * 0.5 + i * p * 0.75);
      g.stroke();
    }
    g.restore();
  };

  /* A switch: two terminals and a lever. `closed` 0..1 swings the lever down
   * onto the right terminal, so the same symbol can be shown opening and
   * closing — which is what "switch on the power line" asks for. */
  ART.switch = function (g, x, y, size, closed, o) {
    o = o || {};
    const k = MV.clamp(closed === undefined ? 1 : closed, 0, 1);
    g.save();
    g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    g.strokeStyle = g.fillStyle = o.color || MV.C.phos;
    g.lineWidth = o.lw || 2.6;
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }
    const a = x - size, b = x + size;
    g.beginPath(); g.arc(a, y, size * 0.14, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(b, y, size * 0.14, 0, Math.PI * 2); g.fill();
    const ang = -Math.PI * 0.30 * (1 - k);
    g.beginPath();
    g.moveTo(a, y);
    g.lineTo(a + Math.cos(ang) * size * 2, y + Math.sin(ang) * size * 2);
    g.stroke();
    g.restore();
  };

  /* A fuse: the IEC rectangle with the line through it, which is the symbol that
   * actually means protection on a schematic. */
  ART.fuse = function (g, x, y, size, o) {
    o = o || {};
    g.save();
    g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    g.strokeStyle = o.color || MV.C.phos;
    g.lineWidth = o.lw || 2.4;
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }
    g.beginPath();
    g.rect(x - size * 1.6, y - size * 0.45, size * 3.2, size * 0.9);
    g.stroke();
    g.beginPath();
    g.moveTo(x - size * 2.6, y); g.lineTo(x - size * 1.6, y);
    g.moveTo(x + size * 1.6, y); g.lineTo(x + size * 2.6, y);
    g.moveTo(x - size * 1.6, y); g.lineTo(x + size * 1.6, y);
    g.stroke();
    g.restore();
  };

  /* The four arrows of a bridge rectifier, drawn as one unit: the ring the
   * current goes round. `flow` lights each diode in turn as it conducts. */
  ART.bridge = function (g, x, y, size, o) {
    o = o || {};
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const s = size, half = s * 1.9;
    g.save();
    g.globalAlpha = a * 0.9;
    g.strokeStyle = o.color || MV.C.phos;
    g.lineWidth = o.lw || 2;
    if (o.glow) { g.shadowColor = o.color || MV.C.phos; g.shadowBlur = o.glow; }
    g.beginPath();
    g.rect(x - half, y - half, half * 2, half * 2);
    g.stroke();
    g.restore();
    ART.diode(g, x - half * 0.5, y - half, s * 0.5, 'r', o);
    ART.diode(g, x + half, y - half * 0.5, s * 0.5, 'd', o);
    ART.diode(g, x + half * 0.5, y + half, s * 0.5, 'l', o);
    ART.diode(g, x - half, y + half * 0.5, s * 0.5, 'u', o);
  };

  /* One lit diode of the bridge, addressed by index 0..3 (top, right, bottom,
   * left), used to show which pair is conducting on each half of the sine. */
  ART.bridgeLit = function (g, x, y, size, idx, o) {
    const half = size * 1.9;
    const p = [
      [x - half * 0.5, y - half, 'r'],
      [x + half, y - half * 0.5, 'd'],
      [x + half * 0.5, y + half, 'l'],
      [x - half, y + half * 0.5, 'u'],
    ][idx & 3];
    const oo = Object.assign({}, o, { glow: (o && o.glow) || 18, alpha: (o && o.alpha) === undefined ? 1 : o.alpha });
    oo.color = (o && o.hotColor) || MV.C.white;
    ART.diode(g, p[0], p[1], size * 0.5, p[2], oo);
  };

})(window.MV = window.MV || {});
