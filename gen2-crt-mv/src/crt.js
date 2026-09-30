/* crt.js — the whole world is one old CRT. Glass, and every degradation pass.
 *
 * There is no case and no bezel: the film is not a photograph of a television,
 * it IS the display of a tube. The picture therefore covers the entire frame and
 * the only geometry is the corner the glass falls away at, which everything is
 * clipped to. Draw order follows references/crt-visual-system.md — the opaque
 * background first, the picture into the glass opening, then the glass over it.
 */
(function (MV) {
  'use strict';

  const C = MV.C;
  const W = 1920, H = 1080;

  // the tube covers the whole frame; declared in core.js so every module can
  // measure against it regardless of script order
  const SC = MV.SC;

  // ---------------------------------------------------------------- init
  MV.CRT = {};

  MV.CRT.init = function () {
    const R = MV.rng(0x51ed270b);
    // 8 deterministic grain tiles, cycled by frame index
    MV.CRT.grainTiles = [];
    for (let k = 0; k < 8; k++) {
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 512;
      const g = cv.getContext('2d');
      const im = g.createImageData(512, 512);
      const d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = R();
        const a = (v < 0.5 ? 0 : 255);
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = a * (0.35 + 0.65 * R());
      }
      g.putImageData(im, 0, 0);
      MV.CRT.grainTiles.push(cv);
    }
    // aperture grille pattern
    const gr = document.createElement('canvas');
    gr.width = 3; gr.height = 1;
    const gg = gr.getContext('2d');
    gg.fillStyle = '#ff0000'; gg.fillRect(0, 0, 1, 1);
    gg.fillStyle = '#00ff00'; gg.fillRect(1, 0, 1, 1);
    gg.fillStyle = '#0000ff'; gg.fillRect(2, 0, 1, 1);
    MV.CRT.grille = gr;

    // scratch canvases for tinted chroma copies
    const mk = function () {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      return c;
    };
    MV.CRT.scrA = mk();
    MV.CRT.scrB = mk();

    // Bloom runs at half resolution. A 26 px blur over the full frame is both
    // expensive and allocation-happy, and none of that detail survives a blur
    // this wide — the downscale is invisible and the frame stops spiking.
    MV.CRT.half = document.createElement('canvas');
    MV.CRT.half.width = W >> 1;
    MV.CRT.half.height = H >> 1;
    MV.CRT.halfCtx = MV.CRT.half.getContext('2d');
  };

  // Patterns are built once per context and reused. createPattern every frame
  // is pure garbage.
  MV.CRT.patterns = null;
  function patterns(g) {
    if (!MV.CRT.patterns) {
      MV.CRT.patterns = {
        grille: g.createPattern(MV.CRT.grille, 'repeat'),
        grain: MV.CRT.grainTiles.map(function (t) { return g.createPattern(t, 'repeat'); }),
      };
    }
    return MV.CRT.patterns;
  }

  // rounded tube path — the tube face, one frame wide
  MV.CRT.tubePath = function (g) {
    const r = MV.GLASS_R;
    g.beginPath();
    g.moveTo(SC.x + r, SC.y);
    g.lineTo(SC.x + SC.w - r, SC.y);
    g.quadraticCurveTo(SC.x + SC.w, SC.y, SC.x + SC.w, SC.y + r);
    g.lineTo(SC.x + SC.w, SC.y + SC.h - r);
    g.quadraticCurveTo(SC.x + SC.w, SC.y + SC.h, SC.x + SC.w - r, SC.y + SC.h);
    g.lineTo(SC.x + r, SC.y + SC.h);
    g.quadraticCurveTo(SC.x, SC.y + SC.h, SC.x, SC.y + SC.h - r);
    g.lineTo(SC.x, SC.y + r);
    g.quadraticCurveTo(SC.x, SC.y, SC.x + r, SC.y);
    g.closePath();
  };

  // ---------------------------------------------------------------- 1. the glass edge
  /* Nothing surrounds the picture, so this pass only darkens the few pixels the
   * tube face does not reach: the corners outside the mask. The phosphor falls
   * off towards the edge the way a real tube's does — the world simply gets
   * darker as it approaches the glass, and then the glass ends. */
  MV.CRT.drawCase = function (g, t) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);

    g.save();
    MV.CRT.tubePath(g);
    g.clip();
    // the tube's own phosphor lift, so the black inside the glass is never dead
    const glowAmt = 0.05 + 0.05 * MV.pulse(t, 0.5);
    const rg = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 1180);
    rg.addColorStop(0, 'rgba(40,120,80,' + (0.08 + 0.05 * glowAmt) + ')');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    g.restore();
  };

  // ---------------------------------------------------------------- 2. tube base
  MV.CRT.tubeBase = function (g) {
    g.save();
    MV.CRT.tubePath(g);
    g.clip();
    g.fillStyle = C.bg;
    g.fillRect(SC.x, SC.y, SC.w, SC.h);
    g.restore();
  };

  // ---------------------------------------------------------------- 3. phosphor bloom
  MV.CRT.bloom = function (g, tube, t) {
    // downscale the picture once, then blur the small copy twice. A blur this
    // wide throws away the extra resolution anyway.
    const hc = MV.CRT.halfCtx, hw = MV.CRT.half.width, hh = MV.CRT.half.height;
    hc.setTransform(1, 0, 0, 1, 0, 0);
    hc.globalAlpha = 1;
    hc.globalCompositeOperation = 'source-over';
    hc.filter = 'none';
    hc.clearRect(0, 0, hw, hh);
    hc.drawImage(tube, 0, 0, hw, hh);

    g.save();
    MV.CRT.tubePath(g);
    g.clip();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.20 + 0.10 * MV.pulse(t, 0.5);
    g.filter = 'blur(6px)';
    g.drawImage(MV.CRT.half, SC.x - 2, SC.y - 2, SC.w + 4, SC.h + 4);
    g.filter = 'none';
    g.globalAlpha = 0.10;
    g.filter = 'blur(14px)';
    g.drawImage(MV.CRT.half, SC.x - 5, SC.y - 5, SC.w + 10, SC.h + 10);
    g.filter = 'none';
    g.restore();
  };

  // ---------------------------------------------------------------- 4. beat pump
  MV.CRT.pump = function (g, t) {
    const a = MV.pulse(t, 0.28);
    g.save();
    MV.CRT.tubePath(g);
    g.clip();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.11 * a;
    g.fillStyle = C.phos;
    g.fillRect(SC.x, SC.y, SC.w, SC.h);
    // refresh band travelling down the tube
    const ry = SC.y + ((MV.beatFloat(t) * 0.37) % 1) * SC.h;
    g.globalAlpha = 0.05 + 0.05 * a;
    const rbg = g.createLinearGradient(0, ry - 70, 0, ry + 70);
    rbg.addColorStop(0, 'rgba(160,255,200,0)');
    rbg.addColorStop(0.5, 'rgba(190,255,215,0.9)');
    rbg.addColorStop(1, 'rgba(160,255,200,0)');
    g.fillStyle = rbg;
    g.fillRect(SC.x, ry - 70, SC.w, 140);
    g.restore();
  };

  // ---------------------------------------------------------------- 5. glitch
  MV.CRT.glitch = function (g, tube, t) {
    const L = MV.glitchLevel(t);
    if (L < 0.015) return;
    const f = Math.floor(t * MV.fps);
    const R = MV.rng(f * 2654435761);
    // red is reserved until RED_GATE, so before it the split is violet/cyan.
    // The moment the fringe turns red is itself a story beat.
    const late = t >= MV.RED_GATE;
    const scR = late ? '#ff5566' : '#c07cff';
    const scB = late ? '#44d4ff' : '#44d4ff';

    g.save();
    MV.CRT.tubePath(g);
    g.clip();

    // --- chromatic split: tinted copies pushed left and right
    const dx = 2 + 16 * L * L;
    const tint = function (scr, color) {
      const sg = scr.getContext('2d');
      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.globalCompositeOperation = 'source-over';
      sg.globalAlpha = 1;
      sg.clearRect(0, 0, W, H);
      sg.drawImage(tube, 0, 0);
      sg.globalCompositeOperation = 'multiply';
      sg.fillStyle = color;
      sg.fillRect(0, 0, W, H);
      sg.globalCompositeOperation = 'source-over';
    };
    tint(MV.CRT.scrA, scR);
    tint(MV.CRT.scrB, scB);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.16 + 0.22 * L;
    g.drawImage(MV.CRT.scrA, -dx, 0);
    g.drawImage(MV.CRT.scrB, dx, 0);

    // --- tear: horizontal bands redrawn shifted, with a bright 1.5 px seam.
    // Most tears are a few pixels wide; one in six is a real break. A tear that
    // displaces a band further than the glyph it crosses stops being damage and
    // becomes scrambled content, which is the one thing a CRT look must not do.
    const n = Math.floor(L * 16 * (0.35 + 0.65 * R()));
    for (let i = 0; i < n; i++) {
      const by = SC.y + R() * SC.h;
      const bh = 6 + R() * (18 + 60 * L);
      let bdx = (R() - 0.5) * 2 * (6 + 44 * L);
      if (R() < 0.17) bdx *= 3.2;
      g.globalAlpha = 0.75 + 0.25 * R();
      g.globalCompositeOperation = 'source-over';
      g.drawImage(tube, SC.x, by, SC.w, bh, SC.x + bdx, by, SC.w, bh);
      g.globalAlpha = 0.5 * L;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = R() < 0.5 ? C.cyan : C.white;
      g.fillRect(SC.x, by, SC.w, 1.5);
    }
    g.restore();
  };

  // ---------------------------------------------------------------- 6. tube surface
  MV.CRT.scan = function (g, t) {
    g.save();
    MV.CRT.tubePath(g);
    g.clip();
    // scanlines, phase rolling slowly
    const roll = Math.floor((t * 26) % 3);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.30)';
    for (let y = SC.y - 3 + roll; y < SC.y + SC.h; y += 3) g.fillRect(SC.x, y, SC.w, 1);

    // aperture grille at very low alpha — overdo it and the picture turns muddy
    g.globalAlpha = 0.07;
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = patterns(g).grille;
    g.fillRect(SC.x, SC.y, SC.w, SC.h);

    // vignette
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    const vg = g.createRadialGradient(
      SC.x + SC.w / 2, SC.y + SC.h / 2, SC.h * 0.30,
      SC.x + SC.w / 2, SC.y + SC.h / 2, SC.h * 0.92);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.72, 'rgba(0,0,0,0.20)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    g.fillStyle = vg;
    g.fillRect(SC.x, SC.y, SC.w, SC.h);
    g.restore();
  };

  MV.CRT.grain = function (g, t) {
    const f = Math.floor(t * MV.fps);
    const tile = MV.CRT.grainTiles[f % 8];
    const ox = (MV.hash1(f, 11) * 512) | 0;
    const oy = (MV.hash1(f, 23) * 512) | 0;
    g.save();
    MV.CRT.tubePath(g);
    g.clip();
    g.globalAlpha = 0.030;
    g.globalCompositeOperation = 'overlay';
    g.translate(-ox, -oy);
    g.fillStyle = patterns(g).grain[f % 8];
    g.fillRect(SC.x + ox, SC.y + oy, SC.w, SC.h);
    g.restore();
  };

  // ---------------------------------------------------------------- 7. glass
  /* P12: the white point leaves. With no case to catch the light, what the tube
   * does instead is bloom — the light that would have spilled onto the moulding
   * now brightens the glass it is passing through. */
  MV.spill = { a: 0, x: 0, y: 0 };

  MV.CRT.spill = function (g) {
    const s = MV.spill;
    if (!s || s.a <= 0.004) return;
    g.save();
    MV.CRT.tubePath(g);
    g.clip();
    g.globalCompositeOperation = 'lighter';
    const R = 560;
    const sg = g.createRadialGradient(s.x, s.y, 6, s.x, s.y, R);
    sg.addColorStop(0, 'rgba(226,255,242,' + (0.52 * s.a).toFixed(3) + ')');
    sg.addColorStop(0.30, 'rgba(150,235,205,' + (0.20 * s.a).toFixed(3) + ')');
    sg.addColorStop(1, 'rgba(120,200,170,0)');
    g.fillStyle = sg;
    g.fillRect(SC.x, SC.y, SC.w, SC.h);
    g.restore();
  };

  MV.CRT.glass = function (g, t, overInk) {
    g.save();
    MV.CRT.tubePath(g);
    g.clip();
    if (!overInk) {
      // diagonal reflection streak across the upper left
      g.globalAlpha = 0.055;
      g.globalCompositeOperation = 'lighter';
      const rl = g.createLinearGradient(SC.x, SC.y + SC.h * 0.62, SC.x + SC.w * 0.72, SC.y);
      rl.addColorStop(0, 'rgba(255,255,255,0)');
      rl.addColorStop(0.42, 'rgba(228,255,244,0.55)');
      rl.addColorStop(0.55, 'rgba(228,255,244,0.16)');
      rl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rl;
      g.beginPath();
      g.moveTo(SC.x, SC.y + SC.h * 0.66);
      g.lineTo(SC.x + SC.w * 0.80, SC.y);
      g.lineTo(SC.x + SC.w * 0.96, SC.y);
      g.lineTo(SC.x, SC.y + SC.h * 0.86);
      g.closePath();
      g.fill();

      // corner highlight — the tube glass catches the room
      g.globalAlpha = 0.10;
      const ch = g.createRadialGradient(SC.x + 90, SC.y + 80, 10, SC.x + 90, SC.y + 80, 460);
      ch.addColorStop(0, 'rgba(220,255,238,0.85)');
      ch.addColorStop(1, 'rgba(220,255,238,0)');
      g.fillStyle = ch;
      g.fillRect(SC.x, SC.y, 620, 520);
    }
    g.restore();
    // glass edge: a thin bright rim, brighter at the top. Stroked OUTSIDE the
    // clip so the full width survives.
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = overInk ? 0.16 : 0.26;
    g.lineWidth = overInk ? 2 : 3;
    const eg = g.createLinearGradient(0, SC.y, 0, SC.y + SC.h);
    eg.addColorStop(0, 'rgba(215,255,235,0.9)');
    eg.addColorStop(0.5, 'rgba(160,210,190,0.25)');
    eg.addColorStop(1, 'rgba(120,160,150,0.10)');
    g.strokeStyle = eg;
    MV.CRT.tubePath(g);
    g.stroke();
    g.restore();
  };

  // ---------------------------------------------------------------- 9. frame grade
  MV.CRT.grade = function (g, t) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    /* P07 step five: two of the three guns die and the picture falls back to a
     * single green channel. Done as a saturation descent rather than a tint, so
     * the collapse reads as the tube losing emitters. */
    const mo = MV.UI && MV.UI.strip ? MV.UI.strip(t).mono : 0;
    if (mo > 0.01) {
      g.save();
      MV.CRT.tubePath(g);
      g.clip();
      g.globalAlpha = mo;
      g.globalCompositeOperation = 'saturation';
      g.fillStyle = '#808080';
      g.fillRect(SC.x, SC.y, SC.w, SC.h);
      g.globalAlpha = 0.30 * mo;
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = '#7dffb0';
      g.fillRect(SC.x, SC.y, SC.w, SC.h);
      g.restore();
    }

    // a faint phosphor lift over the whole glass — the tube's own light
    const L = MV.glitchLevel(t);
    g.fillStyle = 'rgba(10,40,26,0.10)';
    g.fillRect(0, 0, W, H);
    if (L > 0.3) {
      // when the machine is dying the whole tube takes its colour
      g.globalAlpha = (L - 0.3) * 0.22;
      g.fillStyle = t > MV.RED_GATE ? 'rgba(90,10,18,1)' : 'rgba(60,20,60,1)';
      g.fillRect(0, 0, W, H);
    }
    // the tube face is one surface: its shading is the vignette in the scan pass,
    // and there is nothing outside it to photograph
    g.restore();
  };

  // ---------------------------------------------------------------- 10. ink composite
  MV.CRT.compositeInk = function (g, t) {
    const ink = MV.INK.canvas;
    const fade = MV.INK.fade === undefined ? 1 : MV.INK.fade;
    if (!ink || fade <= 0.004) return;
    g.save();
    MV.CRT.tubePath(g);
    g.clip();
    // a little glow first, so the text still reads as phosphor
    g.globalAlpha = 0.30 * fade;
    g.filter = 'blur(6px)';
    g.drawImage(ink, 0, 0);
    g.filter = 'none';
    g.globalAlpha = fade;
    g.drawImage(ink, 0, 0);
    // ONE scanline pass over the text so it belongs to the tube
    const roll = Math.floor((t * 26) % 3);
    g.globalAlpha = 0.18;
    g.fillStyle = 'rgba(0,0,0,1)';
    for (let y = SC.y - 3 + roll; y < SC.y + SC.h; y += 3) g.fillRect(SC.x, y, SC.w, 1);
    g.restore();
    // the reflection streak covers the text too, very faintly, so text is
    // composited under the glass rather than pasted on top of it
    MV.CRT.glass(g, t, true);
  };

  // ---------------------------------------------------------------- glitch curve
  /* One function for the whole timeline. The degradation is a performance, not
   * a constant: it is raised deliberately across acts and spiked on named words. */
  MV.glitchLevel = function (t) {
    let L = 0;
    const s = MV.sectionAt(t);
    const u = MV.sectionProgress(t, s);
    switch (s.id) {
      case 'P00_BOOT':      L = 0.0; break;
      case 'P01_CALL':      L = 0.02 + 0.04 * (1 - u); break;
      case 'P02_GEOMETRY':  L = 0.02; break;
      case 'P03_CURRENT':   L = 0.03 + 0.10 * MV.ramp(u, 0.35, 0.62); break;
      case 'P04_STIMULATION': L = 0.03; break;
      case 'P05_FLESH':     L = 0.02; break;
      case 'P06_TRANCE':    L = 0.04 + 0.22 * MV.ramp(u, 0.55, 1.0); break;
      case 'P07_ISOLATION': L = 0.03; break;
      case 'P08_ERASURE':   L = 0.10 + 0.20 * MV.ramp(u, 0.15, 0.6); break;
      case 'P09_ERROR':     L = 0.28 + 0.30 * MV.ramp(u, 0.05, 0.5); break;
      case 'P10_COUNTDOWN': L = 0.30 + 0.55 * u; break;
      case 'P11_FINAL':     L = 0.55; break;
      case 'P12_LOVE':      L = 0.22; break;
      case 'P13_OUTRO':     L = 0.16 * (1 - MV.ramp(u, 0.4, 1.0)); break;
      case 'P14_TERMINATE': L = 0.35 * (1 - MV.ramp(u, 0.0, 0.35)); break;
    }
    // spikes pinned to specific words
    if (MV.near(t, 'world.execute', 0.35))  L += 0.25;
    if (MV.near(t, 'So dizzy', 0.7))        L += 0.18;
    if (MV.near(t, 'ISOLATION', 0.5))       L += 0.45;
    if (MV.near(t, 'DISHEARTENED', 0.5))    L += 0.18;
    if (MV.near(t, 'ILLEGAL ARGUMENTS', 0.7)) L += 0.40;
    if (MV.near(t, 'LO-O-OVE', 0.35))       L += 0.10;
    if (MV.near(t, 'We are trapped ah', 0.5)) L += 0.35;
    if (t >= MV.RED_GATE) {
      // the execution barrage: one strike per logged EXECUTION, driven by the
      // LRC's real times rather than an even subdivision
      for (let i = 0; i < MV.lines.length; i++) {
        const Ln = MV.lines[i];
        if (Ln.text !== 'EXECUTION') continue;
        const d = Math.abs(t - Ln.tOn);
        if (d < 0.30) L += 0.45 * Math.exp(-d / 0.085) * (0.4 + 0.6 * Ln.dur / 1.0);
      }
    }
    return MV.clamp(L, 0, 1);
  };

  // ---------------------------------------------------------------- power off
  /* The raster collapse at the very end, anchored to the real timecode of the
   * last EXECUTION (205.811 s). The picture dies first; the LED follows half a
   * second later, so the last event in the film is the indicator lamp. */
  const PO = {
    strike: 205.811,
    raster: [205.960, 206.510],   // vertical collapse
    dot:    [206.510, 206.960],   // horizontal collapse to a point
    fade:   [206.960, 207.410],   // the dot's phosphor dies
    led:    [207.410, 207.910],
  };

  MV.powerOff = function (t) {
    const flash = t < PO.strike ? 0
      : Math.max(0, 1 - (t - PO.strike) / 0.075);
    if (t < PO.raster[0]) {
      return { on: 1, flash: flash, raster: 0, dot: 0, pic: 1, led: 1 };
    }
    const raster = MV.clamp((t - PO.raster[0]) / (PO.raster[1] - PO.raster[0]), 0, 1);
    const dot = MV.clamp((t - PO.dot[0]) / (PO.dot[1] - PO.dot[0]), 0, 1);
    const fade = MV.clamp((t - PO.fade[0]) / (PO.fade[1] - PO.fade[0]), 0, 1);
    const led = 1 - MV.clamp((t - PO.led[0]) / (PO.led[1] - PO.led[0]), 0, 1);
    return { on: 1 - fade, flash: flash, raster: raster, dot: dot,
             pic: 1 - fade, led: led };
  };

  /* Draw the collapsing raster. Called inside the tube clip, after the scene. */
  MV.CRT.collapse = function (g, t) {
    const p = MV.powerOff(t);
    if (p.raster <= 0 && p.flash <= 0) return;
    g.save();
    MV.CRT.tubePath(g);
    g.clip();
    if (p.flash > 0) {
      g.globalCompositeOperation = 'lighter';
      // a strike, not a wash: past about half the frame goes to paper and the
      // word that lands on the beat is lost inside it
      g.globalAlpha = p.flash * 0.55;
      g.fillStyle = C.white;
      g.fillRect(SC.x, SC.y, SC.w, SC.h);
    }
    if (p.raster <= 0) { g.restore(); return; }
    const cy = SC.y + SC.h / 2;
    // the tube is painted over from the top and bottom toward the centre line
    const bar = SC.h / 2 * (1 - p.raster) + 1.5;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(SC.x, SC.y, SC.w, Math.max(0, cy - bar - SC.y));
    g.fillRect(SC.x, cy + bar, SC.w, Math.max(0, SC.y + SC.h - cy - bar));
    // the line itself: brighter as it narrows
    const hw = SC.w / 2 * (1 - p.dot);
    if (hw > 0.5) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55 + 0.45 * p.raster;
      const lg = g.createLinearGradient(0, cy - bar, 0, cy + bar);
      lg.addColorStop(0, 'rgba(57,255,136,0)');
      lg.addColorStop(0.5, 'rgba(232,255,242,1)');
      lg.addColorStop(1, 'rgba(57,255,136,0)');
      g.fillStyle = lg;
      g.fillRect(SC.x + SC.w / 2 - hw, cy - Math.min(bar, 3.2), hw * 2, Math.min(bar, 3.2) * 2);
      g.globalAlpha = 0.5;
      g.filter = 'blur(7px)';
      g.fillStyle = C.white;
      g.beginPath();
      // the dot's own glow. It is capped: a halo that scales with hw is a disc the
      // size of the frame at the start of the collapse, which is not a tube dying
      g.arc(SC.x + SC.w / 2, cy, Math.max(Math.min(hw * 0.55, 22), 3), 0, 6.2832);
      g.fill();
      g.filter = 'none';
    }
    // and the strip the dot left behind is extinguished after it: a tube does not
    // leave a line of phosphor burning on its glass for the rest of the film
    if (p.dot >= 1 && p.pic < 1) {
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1 - p.pic;
      g.fillStyle = '#000';
      g.fillRect(SC.x, cy - bar - 1, SC.w, bar * 2 + 2);
    }
    g.restore();
  };

  /* Whether the scene should be drawn at all, and how much of it survives. */
  MV.CRT.alive = function (t) {
    const p = MV.powerOff(t);
    return p.raster <= 0;
  };

})(window.MV = window.MV || {});
