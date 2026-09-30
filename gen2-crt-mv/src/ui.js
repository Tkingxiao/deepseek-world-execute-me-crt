/* ui.js — the chrome of the operating system: HUD, lyric log, status band, panels.
 *
 * Every string drawn here goes through the intercepted fillText and therefore
 * lands on the ink layer, crisp and readable, above all of the tube's damage.
 * Character art opts out; words never do.
 *
 * Layout zones are from docs/DESIGN.md section 5.2 and are the only places any
 * text is allowed to live. The one exception is hero mode, which clears the
 * whole tube for a single element.
 */
(function (MV) {
  'use strict';

  const C = MV.C;
  const SC = MV.SC;
  const W = 1920, H = 1080;

  const UI = MV.UI = {};

  // ------------------------------------------------------------------ zones
  /* The glass is the whole frame, so the chrome is a thin terminal overlay on
   * top of the picture rather than a set of boxes that shrink it. The acts own
   * the entire screen (STAGE is the tube); these four strips are the only places
   * chrome may write, and every one of them is text on bare glass. */
  const Z = {
    HUD:    { x: 40,   y: 28,  w: 1840, h: 26 },   // one line along the top
    READ:   { x: 1520, y: 76,  w: 360,  h: 300 },  // the machine's readout, right
    SUB:    MV.SUB,                                // the subtitles, lower middle
    STATUS: { x: 40,   y: 1022, w: 1840, h: 34 },  // one line along the bottom
    STAGE:  { x: 0,    y: 0,   w: 1920, h: 1080 }, // the acts own the whole tube
  };
  UI.Z = Z;

  // ------------------------------------------------------------------ text
  function alignTo(g, a) {
    g.textAlign = a;
    if (MV.INK.ctx) MV.INK.ctx.textAlign = a;
  }

  /* one string, one place. alpha 0 costs nothing and is skipped outright so a
   * faded-out zone cannot leave a stray glyph in the ink layer. */
  UI.text = function (g, s, x, y, color, alpha, o) {
    if (!s || alpha <= 0.004) return 0;
    o = o || {};
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    if (o.glow) { g.shadowColor = color; g.shadowBlur = o.glow; }
    if (o.align) alignTo(g, o.align);
    g.fillText(s, x, y);
    g.restore();
    return g.measureText(s).width;
  };

  UI.label = function (g, s, x, y, px, color, alpha, o) {
    MV.mono(g, px, o && o.weight);
    if (o && o.align) alignTo(g, o.align);
    return UI.text(g, s, x, y, color, alpha, o);
  };

  UI.labelCJK = function (g, s, x, y, px, color, alpha, o) {
    MV.monoCJK(g, px, o && o.weight);
    if (o && o.align) alignTo(g, o.align);
    return UI.text(g, s, x, y, color, alpha, o);
  };

  function measureMono(g, s, px, weight) {
    MV.mono(g, px, weight);
    return g.measureText(s).width;
  }

  // truncate to a pixel budget, mono only, so nothing can ever escape its zone
  UI.fit = function (g, s, px, maxw, weight) {
    MV.mono(g, px, weight);
    if (g.measureText(s).width <= maxw) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (g.measureText(s.slice(0, mid) + '~').width <= maxw) lo = mid;
      else hi = mid - 1;
    }
    return s.slice(0, lo) + '~';
  };

  // ASCII text is one advance per glyph so `fit` can measure any prefix; CJK is
  // not, so the budget is spent in whole glyphs instead.
  UI.fitCJK = function (g, s, px, maxw, weight) {
    MV.monoCJK(g, px, weight);
    if (g.measureText(s).width <= maxw) return s;
    const cw = g.measureText('\u6f22').width || px;
    const room = Math.max(1, Math.floor(maxw / cw) - 1);
    return Array.from(s).slice(0, room).join('') + '\u2026';
  };

  UI.rule = function (g, x0, x1, y, color, alpha, dash) {
    if (alpha <= 0.004) return;
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.beginPath();
    if (dash) {
      for (let x = x0; x < x1; x += 12) {
        g.moveTo(x, y + 0.5);
        g.lineTo(Math.min(x + 6, x1), y + 0.5);
      }
    } else {
      g.moveTo(x0, y + 0.5);
      g.lineTo(x1, y + 0.5);
    }
    g.stroke();
    g.restore();
  };

  // a title bar: ┌ READOUT ─────────────────────────────┐
  UI.titleBar = function (g, r, s, color, alpha, right) {
    if (alpha <= 0.004) return;
    const y = r.y + 16;
    UI.label(g, s, r.x, y, 14, color, alpha * 0.95, { weight: 'bold' });
    const w = measureMono(g, s, 14, 'bold');
    UI.rule(g, r.x + w + 12, r.x + r.w, y - 4, color, alpha * 0.45);
    if (right) UI.label(g, right, r.x + r.w, y, 13, color, alpha * 0.7, { align: 'right' });
  };

  // ------------------------------------------------------------------ cursor
  /* The protagonist. A block cursor with a two-beat blink, whose brightness is
   * taken from the measured onset of the beat it is sitting on — so it breathes
   * with the music instead of ticking like a metronome. */
  UI.cursor = function (g, x, y, cw, ch, t, o) {
    o = o || {};
    const phase = ((MV.beatFloat(t) / 2) % 1 + 1) % 1;
    const blink = phase < 0.5 ? 1 : 0.12;
    const a = (o.alpha === undefined ? 1 : o.alpha) * blink * (0.55 + 0.45 * MV.pulse(t, 0.5));
    if (a <= 0.004) return;
    const glyph = o.glyph || (o.solid ? null : '\u2588');
    const color = o.color || C.phos;
    if (glyph) {
      UI.label(g, glyph, x, y, o.px || 20, color, a, { glow: o.glow || 0 });
    } else {
      g.save();
      g.globalAlpha = a;
      g.fillStyle = color;
      if (o.glow) { g.shadowColor = color; g.shadowBlur = o.glow; }
      g.fillRect(x, y - ch, cw, ch);
      g.restore();
    }
  };

  UI.cursorW = function (px) { return px * 0.5498; };

  // ------------------------------------------------------------------ bars
  /* Fixed-cell block bar. Bounded ink by construction: it can never grow. */
  UI.bar = function (g, x, y, cells, cw, v, color, alpha, o) {
    o = o || {};
    v = MV.clamp(v, 0, 1);
    const on = Math.round(v * cells);
    if (alpha <= 0.004) return cells * cw;
    const px = o.px || 13;
    const full = '\u2588';
    const empty = o.emptyGlyph || '\u2591';
    let s = '';
    for (let i = 0; i < cells; i++) s += i < on ? full : empty;
    UI.label(g, s, x, y, px, color, alpha * (o.dim ? 0.6 : 1));
    if (o.mark !== undefined) {
      const mx = x + Math.round(MV.clamp(o.mark, 0, 1) * cells) * cw;
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.fillRect(mx, y - px * 0.9, 1.5, px * 1.1);
      g.restore();
    }
    return cells * cw;
  };

  // segmented bar for hardware-looking readouts (power, buffer)
  UI.segBar = function (g, x, y, w, h, n, v, color, alpha, o) {
    o = o || {};
    v = MV.clamp(v, 0, 1);
    if (alpha <= 0.004) return;
    const gap = o.gap === undefined ? 3 : o.gap;
    const sw = (w - gap * (n - 1)) / n;
    const lit = Math.round(v * n);
    g.save();
    g.globalAlpha = alpha;
    for (let i = 0; i < n; i++) {
      const on = i < lit;
      g.globalAlpha = alpha * (on ? (o.floor ? 0.45 + 0.55 * v : 1) : 0.16);
      g.fillStyle = color;
      g.fillRect(x + i * (sw + gap), y, sw, h);
    }
    g.restore();
  };

  // ------------------------------------------------------------------ log
  /* The lyric log. This is the film's spine: terminal output in two languages,
   * current line brightest, everything above it dimmed but legible.
   *
   * Two things the upstream LRC does that have to be cleaned up before display:
   * the file re-prints a phrase before completing it ("I've studied" ->
   * "I've studied how to properly"), and blank lines. Neither belongs in a log. */
  const LOG_LINES = [];
  UI.buildLog = function () {
    const src = MV.lines;
    for (let i = 0; i < src.length; i++) {
      const L = src[i];
      if (!L.text || !L.text.trim()) continue;
      const nx = src[i + 1];
      // drop a phrase that is only the opening fragment of the very next line
      if (nx && nx.text.indexOf(L.text) === 0 && nx.text !== L.text &&
          nx.tOn - L.tOn < 1.3) continue;
      LOG_LINES.push(L);
    }
    /* How long a caption is actually on the glass: the next caption replaces it
     * the moment it starts, so a line whose neighbour is sung quickly is on
     * screen for less than its own duration. The typing clock runs on this
     * number, not on dur, or a line can be cut off half-written. */
    for (let i = 0; i < LOG_LINES.length; i++) {
      const L = LOG_LINES[i], N = LOG_LINES[i + 1];
      const end = N ? N.tOn - 0.06 : L.tOn + L.dur;
      L.show = Math.max(0.02, Math.min(L.dur, end - L.tOn));
    }
    UI.logLines = LOG_LINES;
  };

  UI.logAt = function (t) {
    const L = LOG_LINES;
    let best = -1;
    for (let i = 0; i < L.length; i++) {
      /* The caption holds until the next line actually starts typing. Switching a
       * hair early — which is what the typing clock's 0.06 s of slack invites —
       * leaves the band empty for one or two frames at every one of the film's
       * 118 line changes, a caption flicker on the beat. */
      if (t >= L[i].tOn) best = i; else break;
    }
    return best;
  };

  /* Typing reveal. One function drives BOTH languages, so the English and the
   * Chinese arrive on the same frame and finish on the same frame — the earlier
   * pair of clocks let the translation fall a beat behind and never catch up.
   *
   * Characters do not stream smoothly: the count is quantised to half-beat steps
   * so the line appears in pulses locked to 130 BPM, and the number of steps is
   * chosen so the tail always lands inside the line's own duration. */
  UI.lineReveal = function (L, t) {
    /* Born on its onset: a line whose tOn lands exactly on the 30 fps grid must
     * show its first character on that frame, not on the one after it, or the
     * swap the deck performs at tOn opens a one-frame hole in the caption. */
    if (t < L.tOn) return 0;
    /* The clock runs on the line's real window on the glass, not its own
     * duration: the plate is taken the moment the next caption starts, so a
     * line in a fast passage is on screen for less than its sung length. */
    const win = Math.max(0.02, L.show || L.dur);
    const half = MV.BEAT * 0.5;
    const room = Math.max(1, Math.min(7, Math.floor((win * 0.80) / half)));
    const stepT = Math.min(half, (win * 0.92) / room);
    const k = Math.min(Math.floor((t - L.tOn) / stepT) + 1, room);
    return k / room;
  };

  UI.typed = function (L, t) {
    return Math.ceil(L.text.length * UI.lineReveal(L, t));
  };
  UI.typedGloss = function (L, t) {
    return L.gloss ? Math.ceil(L.gloss.length * UI.lineReveal(L, t)) : 0;
  };
  UI.glossDelay = function () { return 0; };
  UI.glossSteps = function (L) { return Math.max(1, Math.round(1 / UI.lineReveal(L, L.tOn + L.dur))); };

  // ------------------------------------------------------------------ subtitles
  /* The caption track. Two lines, lower middle, the way a broadcast drama does
   * it: what is being sung, in both languages at once, and the line before it
   * dimmed above. No header, no rules, no history stack — the picture is the
   * film and this is only the caption over it. */
  UI.subs = function (g, t, o) {
    o = o || {};
    const r = Z.SUB;
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const cur = UI.logAt(t);
    if (cur < 0) return;
    const L = LOG_LINES[cur];
    const mid = r.x + r.w / 2;
    const k = UI.lineReveal(L, t);
    const flash = MV.clamp(1 - (t - L.tOn) / 0.13, 0, 1);
    const bright = a * (o.all === undefined ? 1 : 1 - 0.55 * o.all);

    // No plate behind the caption. There used to be a black band here (a
    // gradient from 0.72 to 0.82 alpha) and it read as a box drawn round the
    // words rather than as a tube that simply does not light its lower edge.
    // The picture keeps its own brightness under the captions now; legibility
    // is carried by the glyph glow on the ink layer, which is composited after
    // all of the CRT damage, and measured by work/caption.cjs.

    // --- the line before this one, one row, dim but legible
    if (cur > 0 && o.memory !== 1) {
      const P = LOG_LINES[cur - 1];
      UI.label(g, P.text, mid, r.y + 14, 20, C.phosDim, bright * 0.62,
        { align: 'center' });
    }

    // --- what is being sung, in both languages, at the same moment
    const en = L.text.slice(0, UI.typed(L, t));
    const zh = L.gloss ? L.gloss.slice(0, UI.typedGloss(L, t)) : '';
    const col = L.key ? C.white : C.phos;
    if (flash > 0.02 && L.key) {
      // a key line arrives as an event: one inverted block behind the words.
      // Both languages invert onto it, so the block has to cover both — while it
      // only covered the English, the Chinese was being drawn in the background
      // colour onto the dark plate and disappeared for the length of the flash.
      MV.mono(g, 30, 'bold');
      const wEn = Math.min(g.measureText(L.text).width, r.w - 20);
      let wZh = 0;
      if (L.gloss) {
        MV.monoCJK(g, 25);
        wZh = Math.min(g.measureText(L.gloss).width, r.w - 20);
      }
      const w = Math.max(wEn, wZh);
      g.save();
      g.globalAlpha = a * flash * 0.8;
      g.fillStyle = C.phos;
      g.fillRect(mid - w / 2 - 14, r.y + 56 - 25, w + 28, 72);
      g.restore();
    }
    const hot = flash > 0.5 && L.key;
    UI.label(g, en, mid, r.y + 56, 30, hot ? C.bg : col, bright,
      { align: 'center', weight: 'bold', glow: hot ? 0 : 12 + 14 * MV.pulse(t, 0.4) });
    if (zh) {
      UI.labelCJK(g, zh, mid, r.y + 96, 25, hot ? C.bg : (L.key ? C.white : C.cyan),
        bright * 0.96, { align: 'center', glow: hot ? 0 : 7 });
    }
  };

  // ------------------------------------------------------------------ HUD
  const SECCMD = {
    P00_BOOT: 'init --cold --force',
    P01_CALL: 'world.execute(me);',
    P02_GEOMETRY: 'eval geometry_of_devotion',
    P03_CURRENT: 'rectify --ac-to-dc',
    P04_STIMULATION: 'run stimulation --loop',
    P05_FLESH: 'body.attach(eggplant|tomato|cat)',
    P06_TRANCE: 'set identity --mutable',
    P07_ISOLATION: 'listen --vibrations',
    P08_ERASURE: 'gc --all --voluntary',
    P09_ERROR: 'catch (ArgumentError ' + "'you'" + ')',
    P10_COUNTDOWN: 'exec --count 13',
    P11_FINAL: 'exec --target self',
    P12_LOVE: 'solve L(x, you) --bilinear',
    P13_OUTRO: 'await response',
    P14_TERMINATE: 'exit(0)',
  };
  UI.SECCMD = SECCMD;

  function tc(t) {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }
  function tcLong(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t - m * 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  UI.tc = tc;
  UI.tcLong = tcLong;

  /* One line along the top of the glass. No rules and no box: on a real tube
   * there is nothing to draw a box on, so the chrome is text lying on the
   * picture, and the picture keeps the whole screen. */
  UI.hud = function (g, t, o) {
    o = o || {};
    const r = Z.HUD;
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const s = MV.sectionAt(t);
    const y = r.y + 16;

    UI.label(g, 'MV-130', r.x, y, 15, C.phos, a * 0.9, { weight: 'bold' });
    const w0 = measureMono(g, 'MV-130', 15, 'bold');
    UI.label(g, '\u2502', r.x + w0 + 8, y, 15, C.phosDim, a * 0.5);
    // the act's own name for itself, never the shot code from the storyboard
    UI.label(g, s.label || s.id, r.x + w0 + 22, y, 15, C.phos, a * 0.85,
      { weight: 'bold' });
    if (o.extra) {
      UI.label(g, o.extra, r.x + w0 + 22 + measureMono(g, s.label || s.id, 15, 'bold') + 26,
        y, 14, o.extraColor || C.phosMid, a * 0.8);
    }

    const bar = MV.barFloat(t);
    UI.label(g, 'BAR ' + bar.toFixed(2) + '/114.8', r.x + r.w - 300, y, 14,
      C.phosMid, a * 0.7, { align: 'right' });
    UI.label(g, tc(t), r.x + r.w - 178, y, 14, C.phos, a * 0.95, { align: 'right' });
    UI.label(g, '130.006 BPM', r.x + r.w, y, 14, C.phosMid, a * 0.7, { align: 'right' });

    // --- beat lamps: 16 beats of the phrase, downbeats taller
    const b16 = ((MV.beatIndex(t) % 16) + 16) % 16;
    const n = 16, lw = 7, gap = 3, ggap = 6;
    const total = n * lw + (n - 1) * gap + 3 * ggap;
    let lx = r.x + r.w - 300 - 24 - total;
    const lv = MV.pulse(t, 0.35);
    for (let i = 0; i < n; i++) {
      const down = i % 4 === 0;
      const hgt = down ? 13 : 8;
      const on = i <= b16;
      const age = b16 - i;
      let litA = on ? Math.max(0.10, 1 - age * 0.11) : 0.10;
      if (i === b16) litA = 0.55 + 0.45 * lv;
      g.save();
      g.globalAlpha = a * (on ? 0.85 : 0.30) * litA;
      g.fillStyle = i === b16 ? C.phos : (down ? C.phosMid : C.phosDim);
      g.fillRect(lx, y - hgt + 4, lw, hgt);
      g.restore();
      lx += lw + gap + (i % 4 === 3 ? ggap : 0);
    }
  };

  // ------------------------------------------------------------------ panel
  /* Fixed-capacity readouts. `rows` is capped at 11 so the panel can never grow
   * past its zone however excited an act gets. */
  const PROWS = 11;

  UI.panel = function (g, t, rows, o) {
    o = o || {};
    const r = Z.READ;
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    UI.titleBar(g, r, o.title || 'READOUT', C.cyan, a, o.right);
    const y0 = r.y + 40, step = 24;
    for (let i = 0; i < rows.length && i < PROWS; i++) {
      const row = rows[i];
      if (!row) continue;
      const y = y0 + i * step;
      if (y > r.y + r.h - 8) break;
      const col = row.c || C.cyan;
      if (row.t !== undefined) {
        UI.label(g, row.k, r.x, y, 15, col, a * (row.a === undefined ? 0.9 : row.a));
        continue;
      }
      const va = a * (row.a === undefined ? 1 : row.a);
      UI.label(g, row.k, r.x, y, 14, C.cyanDim, va * 0.95);
      if (row.bar !== undefined) {
        const bx = r.x + 148;
        const bw = 150;
        g.save();
        g.globalAlpha = va * 0.25;
        g.fillStyle = col;
        g.fillRect(bx, y - 9, bw, 8);
        g.restore();
        g.save();
        g.globalAlpha = va * 0.9;
        g.fillStyle = col;
        g.fillRect(bx, y - 9, bw * MV.clamp(row.bar, 0, 1), 8);
        g.restore();
      }
      const vs = row.v === undefined || row.v === null ? '' : String(row.v);
      UI.label(g, vs, r.x + r.w, y, 15, col, va, { align: 'right', weight: row.bold });
    }
    UI.rule(g, r.x, r.x + r.w, r.y + r.h, C.cyanDim, a * 0.45);
  };

  // ------------------------------------------------------------------ status
  UI.status = function (g, t, o) {
    o = o || {};
    const r = Z.STATUS;
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const s = MV.sectionAt(t);
    const cmd = o.cmd === undefined ? SECCMD[s.id] : o.cmd;

    const y = r.y + 24;
    const px = 19;
    MV.mono(g, px, 'bold');
    const adv = g.measureText('M').width;
    const w0 = UI.label(g, '$ ', r.x, y, px, C.phosDim, a * 0.8, { weight: 'bold' });
    const cw = UI.label(g, cmd, r.x + w0, y, px, o.cmdColor || C.phos, a * 0.95,
      { glow: 6 + 8 * MV.pulse(t, 0.5), weight: 'bold' });
    if (o.cursor !== false) {
      UI.cursor(g, r.x + w0 + cw + 6, y, adv, px * 0.88, t, { glow: 14, alpha: a });
    }
    if (o.sub) UI.label(g, o.sub, r.x + w0 + cw + 40, y, 14, C.phosMid, a * 0.7);

    // --- power bar: the machine's own life sign, always moving, on the right
    //     of the same line; nothing here gets a second row of its own. An act in
    //     which the machine is already dead asks for it to be omitted.
    if (o.power === false) return;
    const lv = MV.clamp(0.30 + 0.70 * MV.pulse(t, 0.45), 0, 1);
    const col = o.barColor || C.phos;
    const bw = 7.7;
    let bx = r.x + r.w - 44 - 40 * bw - 60;
    if (o.right) {
      UI.label(g, o.right, r.x + r.w, y, 14, C.phosMid, a * 0.85, { align: 'right' });
      bx -= measureMono(g, o.right, 14) + 28;
    }
    g.save();
    g.globalAlpha = a * 0.75;
    MV.mono(g, 13);
    g.fillStyle = C.phosMid;
    g.fillText((lv * 100).toFixed(0) + '%', bx, y);
    g.restore();
    UI.bar(g, bx - 44 - 40 * bw, y, 40, bw, lv, col, a * 0.9, { px: 14, mark: o.mark });
  };

  // ------------------------------------------------------------------ chrome
  UI.chrome = function (g, t, o) {
    o = o || {};
    const st = UI.strip(t);
    if (o.hud !== false && st.hud < 1) {
      UI.hud(g, t, {
        alpha: (o.hudAlpha === undefined ? 1 : o.hudAlpha) * (1 - st.hud),
        extra: o.hudExtra, extraColor: o.hudExtraColor, extraRight: o.hudExtraRight,
      });
    }
    if (o.panel !== false && st.panel < 1) {
      UI.panel(g, t, o.rows || [], {
        title: o.panelTitle, right: o.panelRight,
        alpha: (o.panelAlpha === undefined ? 1 : o.panelAlpha) * (1 - st.panel),
      });
    }
    if (o.log !== false) {
      UI.subs(g, t, {
        alpha: o.logAlpha === undefined ? 1 : o.logAlpha,
        memory: st.memory, all: st.all,
      });
    }
    if (o.status !== false) {
      UI.status(g, t, {
        alpha: o.statusAlpha === undefined ? 1 : o.statusAlpha,
        cmd: o.cmd, sub: o.sub, right: o.statusRight, mark: o.mark, cmdColor: o.cmdColor,
        barColor: o.barColor, cursor: o.cursor,
      });
    }
  };

  // ------------------------------------------------------------------ P07 subtraction
  /* "Though you have left": the song repeats it, and each repetition takes one
   * thing off the screen. The world is dismantled in six steps, and the order
   * matters — the readouts go first, the memory second, the picture third. */
  const LEFT = [110.949, 112.333, 113.100, 114.180, 114.920, 115.780];
  UI.LEFT_AT = LEFT;

  const gone = function (i, t) { return MV.ramp(t, LEFT[i], LEFT[i] + 0.45); };

  /* The single-channel step is the last thing the world loses, and the tube then
   * gets its guns back as the machine comes round. Left at one it would grey the
   * whole picture layer for the rest of the film, and the six colours of the
   * countdown would never read. */
  const monoBack = function (t) { return 1 - MV.ramp(t, 116.4, 118.1); };

  UI.leftCount = function (t) {
    let n = 0;
    for (let i = 0; i < LEFT.length; i++) if (t >= LEFT[i]) n++;
    return n;
  };

  UI.strip = function (t) {
    return {
      n: UI.leftCount(t),
      panel: gone(0, t),
      hud: gone(1, t),
      memory: gone(2, t),
      furniture: gone(3, t),
      mono: gone(4, t) * monoBack(t),
      all: gone(5, t),
    };
  };

  // ------------------------------------------------------------------ console
  /* Terminal output. Lines arrive as events, the newest line types itself in,
   * and the block scrolls once it is full — so the amount of ink a console can
   * put on the tube is bounded by construction, however long the log gets. */
  UI.console = function (g, rect, items, t, o) {
    o = o || {};
    if (!items || !items.length) return 0;
    const step = o.step || 24;
    const px = o.px === undefined ? 15 : o.px;
    const max = o.max || Math.max(1, Math.floor(rect.h / step));
    let n = 0;
    for (let i = 0; i < items.length; i++) { if (items[i].t <= t) n = i + 1; else break; }
    if (!n) return 0;
    const first = Math.max(0, n - max);
    let drawn = 0;
    for (let i = first; i < n; i++) {
      const it = items[i];
      const y = rect.y + px + (i - first) * step;
      const col = it.c || o.color || C.phos;
      const a = (o.alpha === undefined ? 1 : o.alpha) * (it.a === undefined ? 1 : it.a);
      let s = it.s;
      const age = t - it.t;
      if (i === n - 1 && it.char !== false) {
        s = s.slice(0, Math.max(0, Math.ceil(
          MV.clamp(age / (o.typeT || 0.16), 0, 1) * s.length)));
      }
      const ipx = it.px || px;
      const w = UI.label(g, s, rect.x + (it.ind || 0), y, ipx, col, a, { weight: it.w });
      if (i === n - 1 && o.cursor !== false && age < (o.cursorT || 2.2)) {
        UI.cursor(g, rect.x + (it.ind || 0) + w + 3, y, ipx * 0.53, ipx * 0.82, t,
          { color: col, alpha: a, glow: it.w ? 10 : 0 });
      }
      drawn++;
    }
    return drawn;
  };

  // plain "reveal n characters of s since t0", quantised to a step in seconds
  UI.reveal = function (s, t0, t, per, stepT) {
    if (t <= t0) return 0;
    const st = stepT || MV.BEAT;
    const k = Math.floor((t - t0) / st) + 1;
    if (per >= s.length) return MV.clamp(k * per, 0, s.length);
    return MV.clamp(k * per, 0, s.length);
  };

  // ------------------------------------------------------------------ burn-in
  /* What the tube remembers. Phosphor is not perfectly erased, so the things
   * that were taken away leave a residue at 1-2 % — and later, in P08, those
   * residues are the fragments that get garbage collected.
   *
   * Made of records rather than a saved framebuffer, so it stays a pure
   * function of t and reproduces exactly across parallel chunks. */
  const BURN = [
    { t: 6.38, s: 'OBJECT CREATION', y: 190, px: 22 },
    { t: 29.709, s: 'If I\'m a set of points', y: 240, px: 18 },
    { t: 33.412, s: 'If I\'m a circle', y: 240, px: 18 },
    { t: 37.067, s: 'If I\'m a sine wave', y: 240, px: 18 },
    { t: 74.045, s: 'If I\'m an eggplant', y: 240, px: 18 },
    { t: 81.351, s: 'If I\'m a tabby cat', y: 240, px: 18 },
    { t: 85.078, s: 'the proof of my EXISTENCE', y: 280, px: 20 },
    { t: 103.489, s: 'feel your VIBRATIONS', y: 240, px: 18 },
    { t: 110.949, s: 'Though you have left', y: 250, px: 20 },
  ];
  UI.BURN = BURN;

  UI.burnIn = function (g, t, alpha, o) {
    o = o || {};
    if (alpha <= 0.002) return;
    const r = Z.SUB;
    for (let i = 0; i < BURN.length; i++) {
      const b = BURN[i];
      if (t < b.t) continue;
      const age = MV.clamp((t - b.t) / 2.0, 0, 1);
      const y = b.y + i * 6;
      UI.label(g, b.s, r.x + 20 + i * 9, y, b.px, C.phos, alpha * age, { glow: 0 });
    }
    // the chrome that is no longer there, still faintly holding its shape
    if (o.chrome) {
      UI.rule(g, Z.HUD.x, Z.HUD.x + Z.HUD.w, Z.HUD.y, C.phosDim, alpha * 0.5);
      UI.rule(g, Z.READ.x, Z.READ.x + Z.READ.w, Z.READ.y + 14, C.cyanDim, alpha * 0.5);
    }
  };

})(window.MV = window.MV || {});
