/* mv-scenes.js — scenes, CRT post-processing and the frame root */
(function () {
  "use strict";
  var M = window.MV, C = M.C, SC = M.SC, SW = M.SW, SH = M.SH, WM = window.MVM, WT = window.MVTerm;
  var IMG = window.MV_IMG || {};

  /* ---- layout zones (inside the tube)
     left-upper : character / equation
     left-lower : lyric log (terminal output)
     right      : maths, diagrams, source code                                */
  var R_LEFT  = { x: SC.x + 30,  y: SC.y + 76,  w: SW * 0.50, h: 452 };
  var R_LOG   = { x: SC.x + 30,  y: SC.y + 548, w: SW * 0.48, h: SH - 588 };
  var R_RIGHT = { x: SC.x + SW * 0.535, y: SC.y + 96, w: SW * 0.435, h: SH - 250 };
  var R_CODE  = { x: SC.x + SW * 0.545, y: SC.y + 88, w: SW * 0.425, h: SH - 230 };

  function zone(ctx, R, label) {
    ctx.save();
    ctx.globalAlpha = 0.35; ctx.strokeStyle = C.phosDeep; ctx.lineWidth = 1.2;
    ctx.strokeRect(R.x, R.y, R.w, R.h);
    if (label) { M.mono(ctx, 16, "400"); ctx.fillStyle = C.phosDeep; ctx.fillText(label, R.x + 8, R.y - 6); }
    ctx.restore();
  }

  /* ==================================================================== */
  /* 1. POWER ON / BOOT                                                   */
  /* ==================================================================== */
  var powerAt = 0.62;

  function scPowerOn(ctx, t) {
    if (t < powerAt) return;
    var k = M.clamp((t - powerAt) / 0.30, 0, 1);
    var open = M.smooth(k);
    if (open < 1) {
      var hh = M.lerp(3, SC.h, open);
      var y = SC.y + SC.h / 2 - hh / 2;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(180,255,210," + (0.9 * (1 - open)) + ")";
      ctx.shadowColor = C.white; ctx.shadowBlur = 60;
      ctx.fillRect(SC.x, y, SC.w, hh);
      ctx.restore();
    }
    drawInner(ctx, t, 0.25 + 0.75 * open, open);
    drawEyes(ctx, t);

    var pk = M.pulseAt(t, 16.0, 0.16);
    if (pk > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      var barY = SC.y + SC.h * 0.5 + (1 - pk) * SC.h * 0.95 - SC.h * 0.47;
      var bg = ctx.createLinearGradient(0, barY - 90, 0, barY + 90);
      bg.addColorStop(0, "rgba(120,255,180,0)");
      bg.addColorStop(0.5, "rgba(200,255,225," + (0.62 * pk) + ")");
      bg.addColorStop(1, "rgba(120,255,180,0)");
      ctx.fillStyle = bg; ctx.fillRect(SC.x, barY - 90, SC.w, 180);
      ctx.fillStyle = "rgba(90,255,170," + (0.10 * pk) + ")";
      ctx.fillRect(SC.x, SC.y, SC.w, SC.h);
      ctx.restore();
    }
    var ring = M.pulseAt(t, 16.0, 0.55);
    if (ring > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(180,255,215," + (0.30 * ring) + ")";
      ctx.lineWidth = 3 + 7 * ring;
      ctx.strokeRect(SC.x + 10, SC.y + 10, SC.w - 20, SC.h - 20);
      ctx.restore();
    }
  }

  var EYE_MODE = "canvas";
  /* The character's eyes, opening in the dark and then watching the viewer. */
  function drawEyes(ctx, t) {
    var a = M.clamp((t - 25.0) / 1.8, 0, 1) * M.clamp((29.9 - t) / 1.0, 0, 1);
    a *= 0.62;
    if (a <= 0.01) return;
    /* EYE_MODE: "canvas" = the original drawn eyes (default), "sprite" = the
       CSS-art traced eyes. Flip to "sprite" to use the traced art instead. */
    if (EYE_MODE === "sprite" && IMG.eye_left && IMG.eye_right && IMG.eye_left.width) {
      drawEyesSprite(ctx, t, a);
      return;
    }
    var cx = SC.x + SW * 0.40, cy = SC.y + SH * 0.47;
    var blink = (Math.sin(t * 2.1) > 0.97) ? 0.06 : 1;
    var open = blink * M.smooth(M.clamp((t - 25.0) / 2.2, 0, 1));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = "lighter";
    for (var s = -1; s <= 1; s += 2) {
      var ex = cx + s * 104, ey = cy;
      var ow = 60, oh = 46 * open;
      /* the lit eye shape */
      M.glowFill(ctx, "#0e6b3f", 20, function (g) { g.ellipse(ex, ey, ow, oh, 0, 0, 6.2832); });
      /* iris with a bright rim */
      ctx.save();
      ctx.fillStyle = "#02170d"; ctx.shadowColor = C.cyan; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(ex, ey, 35 * open, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 3.5; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(ex, ey, 35 * open, 0, 6.2832); ctx.stroke();
      ctx.restore();
      /* pupil */
      ctx.save();
      ctx.fillStyle = "#000000"; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(ex, ey, 15 * open, 0, 6.2832); ctx.fill();
      ctx.restore();
      /* specular highlights */
      ctx.save();
      ctx.fillStyle = C.white; ctx.shadowColor = C.white; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(ex + 13, ey - 15, 9 * open, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(ex - 10, ey + 12, 5 * open, 0, 6.2832); ctx.fill();
      ctx.restore();
      /* upper lash */
      ctx.save();
      ctx.globalAlpha = a * 0.85; ctx.strokeStyle = C.phos; ctx.lineWidth = 6;
      ctx.shadowColor = C.phos; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.ellipse(ex, ey - 8, ow, oh + 4, 0, Math.PI * 1.06, Math.PI * 1.94); ctx.stroke();
      ctx.restore();
    }
    var gl2 = M.pulseAt(t, 26.6, 0.25);
    if (gl2 > 0.02) {
      ctx.save(); ctx.globalAlpha = gl2 * 0.9;
      ctx.fillStyle = C.white; ctx.shadowColor = C.white; ctx.shadowBlur = 40;
      ctx.fillRect(SC.x, cy - 2, SC.w, 3); ctx.restore();
    }
    ctx.restore();
  }

  /* the eye sprites, opening and then blinking */
  function drawEyesSprite(ctx, t, a) {
    var L = IMG.eye_left, Rimg = IMG.eye_right;
    /* the eyes sit in the left column, where the girl will later appear */
    var eyeW = 272;
    var gap = 52;
    var totW = eyeW * 2 + gap;
    var cx = SC.x + SW * 0.27;
    var cy = SC.y + SH * 0.50;
    var k = function (img) { return eyeW / img.width; };

    /* opening: lids part vertically. blink after 27s. */
    var openK = M.smooth(M.clamp((t - 24.2) / 2.0, 0, 1));
    var bl = 1;
    var bt = t - 27.0;
    if (bt > 0) {
      var cyc = bt % 4.6;
      if (cyc < 0.24) bl = 1 - Math.sin((cyc / 0.24) * Math.PI);
      else if (cyc > 2.5 && cyc < 2.7) bl = 1 - Math.sin(((cyc - 2.5) / 0.2) * Math.PI) * 0.85;
    }
    var oh = M.clamp(openK * bl, 0.02, 1);

    /* a soft glow behind the eyes so they read as light in the dark */
    var gl = ctx.createRadialGradient(cx, cy, 20, cx, cy, 420);
    var gp = 0.10 + 0.10 * M.pulse(t, 0.6);
    gl.addColorStop(0, "rgba(110,240,255," + (gp * a) + ")");
    gl.addColorStop(1, "rgba(110,240,255,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.ellipse(cx, cy, 460, 260, 0, 0, 6.2832); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 2; i++) {
      var img = i === 0 ? L : Rimg;
      var s = k(img);
      var w = img.width * s, h = img.height * s * oh;
      var x = cx - totW / 2 + (i === 0 ? 0 : eyeW + gap);
      var y = cy - h / 2;
      ctx.globalAlpha = a * 0.98;
      ctx.drawImage(img, x, y, w, h);
      ctx.globalAlpha = a * 0.16;
      ctx.drawImage(img, x - 3, y - 1, w, h);
      ctx.drawImage(img, x + 3, y + 1, w, h);
    }
    ctx.restore();

    /* the glint on world.execute(me); */
    var q = M.pulseAt(t, 26.6, 0.25);
    if (q > 0.02) {
      ctx.save(); ctx.globalAlpha = q * 0.85; ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = C.white; ctx.shadowColor = C.white; ctx.shadowBlur = 40;
      for (var j = 0; j < 2; j++) {
        var ex = cx - totW / 2 + eyeW / 2 + j * (eyeW + gap);
        ctx.fillRect(ex - 150, cy - 2, 300, 3);
      }
      ctx.restore();
    }
  }

  /* ==================================================================== */
  /* 2. VERSE                                                             */
  /* ==================================================================== */
  function scVerse(ctx, t) {
    var pH = M.lastLineTime("If I'm a set of points");
    var cH = M.lastLineTime("If I'm a circle");
    var sH = M.lastLineTime("If I'm a sine wave");
    var iH = M.lastLineTime("If I approach infinity");
    var which = -1;
    if (t >= iH) which = 3; else if (t >= sH) which = 2; else if (t >= cH) which = 1; else if (t >= pH) which = 0;
    if (which < 0) return;
    var starts = [pH, cH, sH, iH];
    var S = starts[which];
    /* the rendered maths animation is time-warped so it completes exactly
       when the next lyric line takes over */
    var segEnd = (starts[which + 1] !== undefined) ? starts[which + 1] : S + M.BEAT * 9.5;
    var kk = M.clamp((t - S) / (segEnd - S), 0, 1);

    zone(ctx, R_RIGHT, "graphics.buffer");
    var names = ["points_dim", "circle_circ", "sine_tangent", "infinity_limit"];
    var frames = [180, 180, 180, 180];
    var drew = false;
    if (window.MVSheets) {
      drew = window.MVSheets.draw(ctx, names[which], Math.round(kk * (frames[which] - 1)), R_RIGHT, 1);
    }
    if (!drew) {
      var runT = Math.min(t, S + M.BEAT * 9.5);
      if (which === 0) WM.drawPoints(ctx, runT, R_RIGHT, S);
      if (which === 1) WM.drawCircle(ctx, runT, R_RIGHT, S);
      if (which === 2) WM.drawSine(ctx, runT, R_RIGHT, S);
      if (which === 3) WM.drawLimit(ctx, runT, R_RIGHT, S);
    }

    drawFishGirl(ctx, t, "verse", R_LEFT);
  }

  /* ==================================================================== */
  /* 3..7 CHORUS VARIANTS                                                 */
  /* ==================================================================== */
  function scCurrent(ctx, t, S) {
    var k = M.clamp((t - S) / (M.BEAT * 10), 0, 1);
    zone(ctx, R_RIGHT, "circuit.ac_dc");
    drawRectifier(ctx, t, R_RIGHT, k);
    drawReadout(ctx, t, R_RIGHT);
    drawFishGirl(ctx, t, "chorus", R_LEFT);
    var d = M.lastLineTime("So dizzy so dizzy");
    if (t > d && t < d + 1.2) {
      var pk = M.pulseAt(t, d, 0.25);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,120,120," + 0.22 * pk + ")";
      ctx.fillRect(SC.x, SC.y, SC.w, SC.h); ctx.restore();
    }
  }

  function scStim(ctx, t, S) {
    zone(ctx, R_RIGHT, "stimulus.bars");
    WT.drawBeatCounter(ctx, t, R_RIGHT);
    /* bars sit between the beat pips and the data block: 52 px of clear air below */
    drawEnergyBars(ctx, t, { x: R_RIGHT.x + 10, y: R_RIGHT.y + 150, w: R_RIGHT.w - 20, h: 150 });
    drawReadout(ctx, t, R_RIGHT);
    drawFishGirl(ctx, t, "chorus", R_LEFT);
  }

  function scOrganic(ctx, t, S) {
    zone(ctx, R_RIGHT, "organic.inputs");
    var names = ["NUTRIENTS", "ANTIOXIDANTS", "ENJOYMENT", "EXISTENCE"];
    var bidx = Math.floor(M.beatIdx(t) / 2) % 4;
    /* four compact cells above the data block: 176 px tall cells, 2 rows */
    for (var i = 0; i < 4; i++) {
      var cx = R_RIGHT.x + R_RIGHT.w * (i % 2 === 0 ? 0.27 : 0.73);
      var cy = R_RIGHT.y + (i < 2 ? 88 : 240);
      var on = i === bidx;
      var p = on ? M.pulse(t, 0.8) : 0;
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.55;
      ctx.strokeStyle = on ? C.cyan : C.phosDim; ctx.lineWidth = on ? 3 : 1.6;
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = on ? 22 : 0;
      M.roundRect(ctx, cx - 96, cy - 66, 192, 132, 12); ctx.stroke();
      M.mono(ctx, 16, "400");
      ctx.fillStyle = on ? C.cyan : C.phosDim; ctx.textAlign = "center";
      ctx.fillText(names[i], cx, cy + 54);
      ctx.textAlign = "left"; ctx.restore();
      drawIcon(ctx, i, cx, cy - 14, on ? 1 : 0.62, on ? C.cyan : C.phosDim, p, t, 0.72);
    }
    drawReadout(ctx, t, R_RIGHT);
    drawFishGirl(ctx, t, "chorus", R_LEFT);
  }

  function scSwitch(ctx, t, S) {
    zone(ctx, R_RIGHT, "role.register");
    var y0 = R_RIGHT.y + 74;
    var bidx = Math.floor(M.beatIdx(t) / 2) % 4;
    var labels = ["F <-> M", "AM <-> PM", "S <-> M", "TRANCE"];
    for (var i = 0; i < 4; i++) {
      var y = y0 + i * 84;
      var on = i === bidx;
      var p = on ? M.pulse(t, 0.9) : 0;
      var x = R_RIGHT.x + 16;
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.40;
      var col = on ? (i === 3 ? C.amber : C.cyan) : C.phosDim;
      M.mono(ctx, 32, "700");
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = on ? 24 : 0;
      ctx.fillText(labels[i], x, y);
      var tw = R_RIGHT.w - 268;
      M.roundRect(ctx, x + 232, y - 18, tw, 24, 12);
      ctx.globalAlpha = (on ? 1 : 0.4) * 0.5; ctx.fillStyle = C.phosDeep; ctx.fill();
      ctx.globalAlpha = on ? 1 : 0.4; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      var knob = on ? x + 232 + tw - 13 : x + 232 + 13;
      ctx.beginPath(); ctx.arc(knob, y - 7, 11 + p * 5, 0, 6.2832);
      ctx.fillStyle = col; ctx.shadowBlur = 20 + p * 20; ctx.fill();
      ctx.restore();
    }
    drawReadout(ctx, t, R_RIGHT);
    drawFishGirl(ctx, t, "chorus", R_LEFT);
  }

  function scCollapse(ctx, t, S) {
    zone(ctx, R_RIGHT, "reference.graph");
    var iso = (t >= M.lastLineTime("ISOLATION"));
    drawRefTree(ctx, t, { cx: R_RIGHT.x + R_RIGHT.w * 0.5, cy: R_RIGHT.y + 200 }, M.clamp((t - S) / (M.BEAT * 16), 0, 1), iso);
    drawReadout(ctx, t, R_RIGHT);
    /* ---- "you have left": the loudest words in the song, so the loudest type ---- */
    var rep = M.lastLineTime("You have left");
    if (t > rep - 4.6 && t < rep + 2.2) {
      ctx.save();
      /* a red wash behind the block so it cannot be missed */
      var wash = M.clamp(1 - Math.abs(t - (rep + 0.2)) / 3.6, 0, 1);
      if (wash > 0.02) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.13 * wash;
        ctx.fillStyle = C.red;
        ctx.fillRect(R_RIGHT.x - 30, R_RIGHT.y + 300, R_RIGHT.w + 60, 300);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      for (var i = 0; i < 6; i++) {
        var t0 = rep - 4.6 + i * 0.9;
        var a = M.clamp((t - t0) / 0.20, 0, 1) * M.clamp(1 - (t - t0 - 2.1) / 1.4, 0, 1);
        if (a <= 0.02) continue;
        /* each echo lands bigger and lower than the last, slammed in on the beat */
        var size = 44 + i * 6;
        var drop = M.easeOutBack(M.clamp((t - t0) / 0.22, 0, 1));
        var yy = R_RIGHT.y + 300 + i * 50 - (1 - drop) * 26;
        var xx = R_RIGHT.x - 34 + i * 10;
        var puls = M.pulse(t, 0.5);
        ctx.save();
        ctx.globalAlpha = a;
        /* dark plate so the words read against any background */
        M.mono(ctx, size, "700");
        var wpx = ctx.measureText("you have left").width;
        ctx.fillStyle = "rgba(20,0,4," + (0.55 * a) + ")";
        ctx.fillRect(xx - 10, yy - size * 0.82, wpx + 20, size * 1.06);
        /* the word itself: deep red core with a hot rim */
        /* 44-74px type: blur kept proportional to the glyph, not to the drama */
        M.glowText(ctx, "you have left", xx, yy, C.red, 9 + 7 * puls, 0.96);
        M.glowText(ctx, "you have left", xx, yy, "#ffd7dd", 4, 0.34 + 0.22 * puls);
        ctx.restore();
      }
      ctx.restore();
    }
    drawFishGirl(ctx, t, "chorus", R_LEFT);
  }

  /* ==================================================================== */
  /* 8. PANIC                                                             */
  /* ==================================================================== */
  function scPanic(ctx, t, S) {
    var local = t - S;
    var stampAt = M.lastLineTime("Challenging your god") + 2.4;
    if (local > 12.4) drawFishGirl(ctx, t, "glitch", { x: SC.x + SW * 0.52, y: SC.y + 60, w: SW * 0.44, h: SH - 160 });
    if (t > stampAt && t < stampAt + 3.0) {
      var k = M.clamp((t - stampAt) / 0.22, 0, 1);
      var sc = M.easeOutBack(k);
      M.mono(ctx, 74, "700");
      var w = ctx.measureText("ILLEGAL ARGUMENTS").width;
      ctx.save();
      ctx.globalAlpha = 0.95; ctx.translate(SC.x + SW / 2, SC.y + SH * 0.26);
      ctx.scale(sc, sc);
      M.glowText(ctx, "ILLEGAL ARGUMENTS", -w / 2, 0, C.red, 8, 1);
      ctx.restore();
      for (var i = 1; i < 6; i++) {
        ctx.save();
        ctx.translate(SC.x + SW / 2 + i * 9, SC.y + SH * 0.26 + i * 7);
        ctx.scale(sc, sc); ctx.globalAlpha = 0.10;
        M.mono(ctx, 74, "700"); ctx.fillStyle = C.red;
        ctx.fillText("ILLEGAL ARGUMENTS", -w / 2, 0);
        ctx.restore();
      }
    }
  }

  /* ==================================================================== */
  /* 9. FINAL                                                             */
  /* ==================================================================== */
  function scFinal(ctx, t, S) {
    zone(ctx, R_LEFT, "equation.love");
    var k = M.clamp((t - S) / (M.BEAT * 17), 0, 1);
    var drew = false;
    /* the rendered cell carries its own formula text, which turns to mush once
       the tube degrades: draw only the diagram (top 52%) and set the formula
       in crisp canvas type underneath it */
    if (window.MVSheets) drew = window.MVSheets.draw(ctx, "love_equation", Math.round(k * 239), R_LEFT, 1, 0.42);
    if (!drew) WM.drawLoveEquation(ctx, t, R_LEFT, S);
    drawLoveNodeLabels(ctx, t, R_LEFT, S, k);
    drawLoveFormulae(ctx, t, R_LEFT, S, k);
    drawFishGirl(ctx, t, "warm", R_RIGHT);
  }

  /* The diagram's three node labels, re-set as crisp terminal type directly under
     the boxes. The rendered cell carries them too, but at this size and with the
     tube degrading they turn to mush, and these are the three words that matter. */
  function drawLoveNodeLabels(ctx, t, R, S, k) {
    var warmK = M.smooth(M.clamp((t - M.lastLineTime("I've studied")) / (M.BEAT * 6), 0, 1));
    var labels = ["LOVE(self, you)", "TRAPPED_IN", "EXECUTION"];
    var xs = [R.x + 34, R.x + 236, R.x + 438];
    var y = R.y + 158;
    for (var i = 0; i < 3; i++) {
      var rev = M.smooth(M.clamp((k - i * 0.13) / 0.28, 0, 1));
      if (rev <= 0.01) continue;
      var hot = (i === 2);
      M.mono(ctx, 22, "700");
      M.glowText(ctx, labels[i], xs[i], y, warmK > 0.5 ? C.amber : (hot ? C.cyan : C.phos), 14, rev * 0.99);
    }
    /* the loop arrow between the last two nodes, so the cycle reads */
    if (k > 0.35) {
      var a2 = M.smooth(M.clamp((k - 0.35) / 0.2, 0, 1));
      M.glowStroke(ctx, warmK > 0.5 ? C.amberDim : C.cyanDim, 10, 2, function (g) {
        g.moveTo(R.x + 250, y + 14); g.lineTo(R.x + 380, y + 14);
      });
      ctx.save();
      ctx.globalAlpha = a2 * 0.9;
      ctx.fillStyle = warmK > 0.5 ? C.amber : C.cyan;
      ctx.beginPath();
      ctx.moveTo(R.x + 380, y + 14); ctx.lineTo(R.x + 366, y + 7); ctx.lineTo(R.x + 366, y + 21);
      ctx.fill();
      ctx.restore();
    }
  }

  /* the formula block of the finale, set as crisp terminal text */
  function drawLoveFormulae(ctx, t, R, S, k) {
    var warmK = M.smooth(M.clamp((t - M.lastLineTime("I've studied")) / (M.BEAT * 6), 0, 1));
    var lines = [
      "love = lim   ( 1 / distance )  ->  +INF",
      "       x->0",
      "LOVE = SUM[ i = 0 .. INF ] execution(i)"
    ];
    var y0 = R.y + R.h * 0.62;
    for (var q = 0; q < lines.length; q++) {
      var rv = M.smooth(M.clamp((k - 0.52 - q * 0.06) / 0.20, 0, 1));
      if (rv <= 0.01) continue;
      M.mono(ctx, 25, "400");
      var col = warmK > 0.35 ? C.amber : C.phos;
      M.glowText(ctx, lines[q], R.x + 24, y0 + q * 40, col, 12, rv * 0.98);
    }
  }

  /* ==================================================================== */
  /* 10. LOOP                                                             */
  /* ==================================================================== */
  function scLoop(ctx, t, S) {
    zone(ctx, R_LEFT, "loop.forever");
    var cx = R_LEFT.x + 210, cy = R_LEFT.y + 205, r = 132;
    M.glowStroke(ctx, C.amberDim, 12, 2.4, function (g) { g.arc(cx, cy, r, 0, 6.2832); });
    var a = (t * 1.4) % (Math.PI * 2);
    ctx.save();
    ctx.fillStyle = C.amber; ctx.shadowColor = C.amber; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 10, 0, 6.2832); ctx.fill();
    ctx.restore();
    M.mono(ctx, 23, "700");
    ctx.fillStyle = C.amber; ctx.textAlign = "center";
    ctx.shadowColor = C.amber; ctx.shadowBlur = 18;
    ctx.fillText("while (true)", cx, cy - 6);
    ctx.fillText("execute(me);", cx, cy + 30);
    ctx.textAlign = "left";
    M.mono(ctx, 20, "400");
    M.glowText(ctx, "iterations = " + Math.floor((t - S) * 130), R_LEFT.x + 400, R_LEFT.y + 200, C.amberDim, 10, 0.95);
    M.glowText(ctx, "exit condition : none", R_LEFT.x + 400, R_LEFT.y + 232, C.amberDim, 10, 0.9);
    drawFishGirl(ctx, t, "warm", R_RIGHT);
  }

  /* ==================================================================== */
  /* the girl                                                             */
  /* ==================================================================== */
  function drawFishGirl(ctx, t, mode, R) {
    var src = IMG.front;
    if (!src) return;
    var alpha = 0, tint = "green", dx = 0, dy = 0, sc = 1;

    if (mode === "verse") {
      var since = t - M.lastLineTime("If I'm a set of points");
      alpha = 0.16 + 0.42 * M.smooth(M.clamp((since - M.BEAT * 4) / (M.BEAT * 6), 0, 1));
      tint = "cyan";
      dy = -M.pulse(t, 0.5) * 5;
      sc = 1 + M.pulse(t, 0.5) * 0.02;
    } else if (mode === "chorus") {
      alpha = 0.46;
      dy = -M.pulse(t, 0.4) * 12;
      sc = 1 + M.pulse(t, 0.4) * 0.03;
      if (M.beatIdx(t) % 8 < 1) alpha *= 0.5 + 0.5 * Math.abs(Math.sin(t * 30));
    } else if (mode === "glitch") {
      alpha = 0.55;
      dx = (Math.sin(t * 37) + Math.sin(t * 11.3)) * 9;
      dy = Math.sin(t * 23) * 6;
      tint = "white";
    } else if (mode === "warm") {
      var warmK = M.smooth(M.clamp((t - M.lastLineTime("I've studied")) / (M.BEAT * 6), 0, 1));
      alpha = 0.22 + 0.20 * warmK;
      tint = warmK > 0.55 ? "amber" : "cyan";
      dy = -M.pulse(t, 0.5) * 6;
      sc = 1 + M.pulse(t, 0.5) * 0.02;
    }
    if (alpha <= 0.02) return;

    var im = src[tint] || src.green;
    if (!im || !im.width) return;
    var box = fitBox(im, R, 0.94);
    var cxp = R.x + R.w * 0.5 + dx, cyp = R.y + R.h * 0.5 + dy;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(cxp, cyp);
    ctx.scale(sc, sc);
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, -box.w / 2, -box.h / 2, box.w, box.h);
    ctx.globalAlpha = alpha * 0.18;
    ctx.drawImage(im, -box.w / 2 - 4, -box.h / 2 - 1, box.w, box.h);
    ctx.drawImage(im, -box.w / 2 + 4, -box.h / 2 + 1, box.w, box.h);
    ctx.restore();

  }

  function fitBox(im, R, fill) {
    var s = Math.min((R.w * fill) / im.width, (R.h * fill) / im.height);
    return { w: im.width * s, h: im.height * s };
  }

  /* a live terminal readout that fills the right column in the choruses */
  function drawReadout(ctx, t, R, rows) {
    var e = M.energyAt(t);
    var k = Math.round(M.beatIdx(t));
    var lines = rows || [
      ["SESSION", "0x" + (0x1F4A3 + k).toString(16).toUpperCase()],
      ["BEAT", String(k) + "  BAR " + Math.floor(k / 4)],
      ["ONSET", (e.onset || 0).toFixed(4)],
      ["LOW", (e.low || 0).toFixed(3)],
      ["MID", (e.mid || 0).toFixed(3)],
      ["HIGH", (e.high || 0).toFixed(3)],
      ["CURRENT", "DC  " + (5.00 + 0.02 * Math.sin(t)).toFixed(3) + " A"],
      ["TEMP", (36.5 + M.pulse(t, 0.6) * 9).toFixed(1) + " C"],
      ["TRAPPED", "true"],
      ["LOVE", "RUNNING"]
    ];
    var lh = 30;
    ctx.save();
    for (var i = 0; i < lines.length; i++) {
      var y = R.y + R.h - lines.length * lh + i * lh;
      var hot = (i === 2);
      M.mono(ctx, 19, hot ? "700" : "400");
      ctx.globalAlpha = hot ? 0.95 : 0.62;
      ctx.fillStyle = C.phosDim;
      ctx.fillText(lines[i][0], R.x, y);
      M.mono(ctx, 19, hot ? "700" : "400");
      M.glowText(ctx, lines[i][1], R.x + 130, y, hot ? C.cyan : C.phos, hot ? 12 : 0, 1);
      if (hot) {
        var wpx = ctx.measureText(lines[i][1]).width;
        ctx.save(); ctx.globalAlpha = 0.5 * M.pulse(t, 0.5);
        ctx.fillStyle = C.cyan; ctx.shadowColor = C.cyan; ctx.shadowBlur = 14;
        ctx.fillRect(R.x + 130 + wpx + 12, y - 16, 10, 20); ctx.restore();
      }
    }
    ctx.restore();
  }

  /* ==================================================================== */
  /* diagrams                                                             */
  /* ==================================================================== */
  /* geometry of the converter: left half = sine, right half = square */
  function rectGeom(R) {
    var half = R.w * 0.40;
    return {
      half: half,
      h: 96,
      cx: R.x + R.w * 0.50,
      cy: R.y + 176,
      gap: 30
    };
  }

  /* AC -> DC shown as a real waveshape conversion:
     a sine on the left, a barrier in the middle, a square wave on the right.
     The square is the sine "rounded" by the switching stage, so the right-hand
     trace is derived from the same phase as the left one. */
  function drawRectifier(ctx, t, R, k) {
    var g = rectGeom(R), half = g.half, h = g.h, cx = g.cx, cy = g.cy, gap = g.gap;
    var amp = h * 0.5, period = half / 1.75;   /* 1.75 cycles per side */

    M.mono(ctx, 21, "700");
    M.glowText(ctx, "SWITCH MY CURRENT   AC -> DC", R.x + 6, R.y + 40, C.cyan, 14, 0.95);

    var x0 = cx - gap * 0.5 - half, x1 = cx - gap * 0.5;
    var x2 = cx + gap * 0.5, x3 = cx + gap * 0.5 + half;

    /* --- left: the sine ------------------------------------------------- */
    M.mono(ctx, 18, "700");
    M.glowText(ctx, "AC   SINE", x0, cy - amp - 24, C.phos, 10, 0.95);
    M.glowStroke(ctx, C.phos, 16, 2.6, function (c) {
      var started = false;
      for (var x = x0; x <= x1; x += 2) {
        var ph = ((x - x0) / period) * Math.PI * 2 - t * 3.2;
        var y = cy - Math.sin(ph) * amp;
        if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
      }
    });
    /* a solid axis under each half so the shape reads as a waveform */
    M.glowStroke(ctx, C.phosDeep, 0, 1.4, function (c) { c.moveTo(x0, cy); c.lineTo(x1, cy); });

    /* --- the barrier: the switching stage ------------------------------- */
    var kb = M.clamp(k * 1.25, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.55 * kb;
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 3 + 4 * kb;
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 18 + 18 * kb;
    ctx.beginPath(); ctx.moveTo(cx, cy - amp - 34); ctx.lineTo(cx, cy + amp + 34); ctx.stroke();
    ctx.restore();
    /* energy crossing the barrier */
    for (var s = 0; s < 5; s++) {
      var prog = ((t * 1.1 + s * 0.2) % 1);
      var px = M.lerp(x1 + 2, x2 - 2, prog);
      var py = cy + (M.hash01(s * 9.1) - 0.5) * amp * 0.7;
      ctx.save();
      ctx.globalAlpha = 0.75 * kb * (1 - Math.abs(prog - 0.5) * 0.8);
      ctx.fillStyle = C.cyan;
      ctx.shadowColor = C.cyan; ctx.shadowBlur = 14;
      ctx.fillRect(px - 4, py - 2, 8, 4);
      ctx.restore();
    }
    /* the diode symbol on the barrier */
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * kb;
    ctx.strokeStyle = C.white; ctx.lineWidth = 2.2;
    ctx.fillStyle = "rgba(4,18,10,0.9)";
    var dy = cy + amp + 52;
    ctx.beginPath(); ctx.moveTo(cx - 12, dy - 10); ctx.lineTo(cx + 12, dy); ctx.lineTo(cx - 12, dy + 10);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 12, dy - 13); ctx.lineTo(cx + 12, dy + 13); ctx.stroke();
    ctx.restore();

    /* --- right: the square wave ----------------------------------------- */
    M.mono(ctx, 18, "700");
    M.glowText(ctx, "DC   SQUARE", x2, cy - amp - 24, C.cyan, 12, 0.97);
    M.glowStroke(ctx, C.cyan, 18, 2.8, function (c) {
      /* the square is the sine driven into saturation: the same phase, hard
         limited. k ramps the limiting in so the conversion is visible.       */
      var started = false;
      /* limit starts above 1 so the wave begins as a pure sine, then falls
         well below 1 so it ends as a genuine square */
      var lim = 1.30 - 1.00 * M.smooth(k);
      for (var x = x2; x <= x3; x += 2) {
        var ph = ((x - x2) / period) * Math.PI * 2 - t * 3.2;
        var sv = Math.sin(ph);
        var q = sv / Math.max(lim, 1e-3);
        q = Math.max(-1, Math.min(1, q));       /* hard clip */
        var y = cy - q * amp;
        if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
      }
    });
    M.glowStroke(ctx, C.cyanDeep || C.cyanDim, 0, 1.4, function (c) { c.moveTo(x2, cy); c.lineTo(x3, cy); });

    /* --- readouts ------------------------------------------------------- */
    M.mono(ctx, 15, "400");
    var limNow = 1.30 - 1.00 * M.smooth(k);
    M.glowText(ctx, k > 0.9 ? "LIMIT 0.30   output : SQUARE DC" : "LIMIT " + limNow.toFixed(2) + "   output : SATURATING",
               R.x + 6, cy + amp + 92, k > 0.9 ? C.white : C.cyanDim, 10, 0.92);
    M.glowText(ctx, "BRIDGE RECTIFIER + SATURATION STAGE", R.x + 6, cy + amp + 114, C.cyanDim, 6, 0.85);
  }

  function drawEnergyBars(ctx, t, A) {
    var n = 30, bw = A.w / n;
    var e = M.energyAt(t);
    for (var i = 0; i < n; i++) {
      var v = M.hash01(i * 12.9 + Math.floor(M.beatIdx(t) / 2) * 3.7);
      var hh = 24 + v * A.h * (0.35 + 0.65 * (e.onset || 0.3));
      var x = A.x + i * bw;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.6 * v;
      ctx.fillStyle = i % 7 === 0 ? C.cyan : C.phos;
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
      ctx.fillRect(x + 3, A.y + A.h - hh, bw - 6, hh);
      ctx.restore();
    }
  }

  function drawIcon(ctx, kind, x, y, a, col, p, t) {
    ctx.save();
    ctx.globalAlpha = a; ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 1.1 + kind) * 0.06);
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.beginPath();
    if (kind === 0) {
      ctx.ellipse(0, 6, 26, 36, 0.25, 0, 6.2832); ctx.stroke();
      ctx.moveTo(14, -28); ctx.lineTo(30, -44); ctx.stroke();
    } else if (kind === 1) {
      ctx.arc(0, 6, 32, 0, 6.2832); ctx.stroke();
      ctx.moveTo(0, -26); ctx.lineTo(-10, -42); ctx.moveTo(0, -26); ctx.lineTo(10, -42); ctx.stroke();
    } else if (kind === 2) {
      ctx.moveTo(-30, 22); ctx.lineTo(-30, -14); ctx.lineTo(-14, 2);
      ctx.lineTo(14, 2); ctx.lineTo(30, -14); ctx.lineTo(30, 22); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-12, 6, 3, 0, 6.2832); ctx.arc(12, 6, 3, 0, 6.2832); ctx.fill();
    } else {
      ctx.arc(0, 10, 30, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -30, 34, 12, 0, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRefTree(ctx, t, A, k, iso) {
    var cx = A.cx, cy = A.cy, pulse = M.pulse(t, 0.5);
    var leaves = 14;
    for (var i = 0; i < leaves; i++) {
      var ang = -Math.PI / 2 + (i - (leaves - 1) / 2) * 0.22;
      var len = 168 + M.hash01(i) * 86;
      var x = cx + Math.cos(ang) * len, y = cy + Math.sin(ang) * len;
      var alive = 1 - M.clamp((k - 0.3) / 0.55, 0, 1) * (M.hash01(i * 3.3) * 1.4);
      if (alive <= 0.02) continue;
      ctx.save();
      ctx.globalAlpha = alive * 0.9;
      ctx.strokeStyle = iso ? C.red : C.phosDim; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 5 + pulse * 3, 0, 6.2832);
      ctx.fillStyle = iso ? C.red : C.phos;
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14; ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.arc(cx, cy, 14 + pulse * 6, 0, 6.2832);
    ctx.fillStyle = iso ? C.red : C.white;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 26; ctx.fill();
    ctx.restore();
    M.mono(ctx, 20, "700");
    M.glowText(ctx, iso ? "ISOLATION" : "SELF", cx - 46, cy + 78, iso ? C.red : C.white, 14, 0.95);
  }

  /* ==================================================================== */
  /* inner dispatcher                                                     */
  /* ==================================================================== */
  function drawInner(ctx, t, alpha, powerK) {
    var sec = M.sectionAt(t);
    ctx.save();
    ctx.beginPath(); ctx.rect(SC.x, SC.y, SC.w, SC.h); ctx.clip();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = C.bg; ctx.fillRect(SC.x, SC.y, SC.w, SC.h);
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = "rgba(28,122,68,0.16)"; ctx.lineWidth = 1;
    for (var gx = SC.x; gx < SC.x + SC.w; gx += 42) { ctx.beginPath(); ctx.moveTo(gx, SC.y); ctx.lineTo(gx, SC.y + SC.h); ctx.stroke(); }
    for (var gy = SC.y; gy < SC.y + SC.h; gy += 42) { ctx.beginPath(); ctx.moveTo(SC.x, gy); ctx.lineTo(SC.x + SC.w, gy); ctx.stroke(); }
    ctx.restore();

    if (sec.id === "P1_BOOT") {
      WT.drawBoot(ctx, t, R_LOG.y - 24);
      WT.drawCode(ctx, t, R_CODE, M.clamp((t - 3.6) / 2.0, 0, 1), 1);
    }
    if (sec.id === "P2_VERSE") scVerse(ctx, t);
    if (sec.id === "P3_CURRENT") scCurrent(ctx, t, sec.start);
    if (sec.id === "P4_STIM") scStim(ctx, t, sec.start);
    if (sec.id === "P5_ORGANIC") scOrganic(ctx, t, sec.start);
    if (sec.id === "P6_SWITCH") scSwitch(ctx, t, sec.start);
    if (sec.id === "P7_COLLAPSE") scCollapse(ctx, t, sec.start);
    if (sec.id === "P8_PANIC") { scPanic(ctx, t, sec.start); WT.drawConsole(ctx, t); }
    if (sec.id === "P9_ERUPT") WT.drawConsole(ctx, t);
    if (sec.id === "P10_FINAL") scFinal(ctx, t, sec.start);
    if (sec.id === "P11_LOOP") {
      scLoop(ctx, t, sec.start);
      WT.drawFinalExecution(ctx, t, { x: SC.x + 40, y: SC.y + SW * 0.30, w: SW - 80, h: SH * 0.46 });
    }

    WT.drawLyricLog(ctx, t, R_LOG);
    WT.drawEggs(ctx, t);
    WT.drawWall(ctx, t, R_LOG);
    WT.drawHUD(ctx, t, R_LOG);
    ctx.restore();
  }

  /* ==================================================================== */
  /* CRT post fx                                                          */
  /* ==================================================================== */
  function glitchLevel(t) {
    var sec = M.sectionAt(t);
    var L = 0;
    if (sec.id === "P3_CURRENT") L = 0.25 + 0.30 * M.sectionProgress(t);
    else if (sec.id === "P4_STIM") L = 0.55;
    else if (sec.id === "P5_ORGANIC") L = 0.30;
    else if (sec.id === "P6_SWITCH") L = 0.45;
    else if (sec.id === "P7_COLLAPSE") L = 0.25 + 0.6 * M.sectionProgress(t);
    else if (sec.id === "P8_PANIC") L = 0.35;
    else if (sec.id === "P9_ERUPT") L = 0.30;
    else if (sec.id === "P11_LOOP") L = 0.10;
    var d = M.lastLineTime("Trapped in");
    if (t > d && t < d + 0.5) L += 0.5 * (1 - (t - d) / 0.5);
    var iso = M.lastLineTime("ISOLATION");
    if (t > iso && t < iso + 0.6) L += 0.7 * (1 - (t - iso) / 0.6);
    var trap = M.lastLineTime("Though we are trapped");
    if (t > trap && t < trap + 0.45) L += 0.8;
    var trap2 = M.lastLineTime("We are trapped ah");
    if (t > trap2 && t < trap2 + 0.45) L += 0.8;
    return M.clamp(L, 0, 1);
  }

  var _snap = null;
  function grab(ctx) {
    if (!_snap) { _snap = document.createElement("canvas"); _snap.width = SW; _snap.height = SH; }
    _snap.getContext("2d").drawImage(ctx.canvas, SC.x, SC.y, SW, SH, 0, 0, SW, SH);
    return _snap;
  }

  function chromaticSplit(ctx, amt) {
    if (amt < 0.01) return;
    var off = 3 + amt * 15;
    var snap = grab(ctx);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.34 * amt;
    ctx.drawImage(snap, -off, 0, SW, SH, SC.x, SC.y, SW, SH);
    ctx.drawImage(snap, off, 0, SW, SH, SC.x, SC.y, SW, SH);
    ctx.restore();
  }

  function tear(ctx, t, amt) {
    if (amt < 0.02) return;
    var n = Math.floor(2 + amt * 9);
    var r = M.mulberry32(Math.floor(t * 30) * 977 + 5);
    var snap = grab(ctx);
    for (var i = 0; i < n; i++) {
      var y = Math.floor(r() * SH), hh = 6 + Math.floor(r() * 44 * amt);
      var dx = (r() - 0.5) * 70 * amt;
      ctx.save();
      ctx.beginPath(); ctx.rect(SC.x, SC.y + y, SC.w, hh); ctx.clip();
      ctx.drawImage(snap, 0, y, SW, hh, SC.x + dx, SC.y + y, SW, hh);
      ctx.globalAlpha = 0.25 * amt; ctx.fillStyle = C.white;
      ctx.fillRect(SC.x, SC.y + y, SC.w, 1.5);
      ctx.restore();
    }
  }

  /* ---- the beat pump: the tube visibly breathes on every measured onset ---- */
  function drawBeatPump(ctx, t) {
    var a = M.pulse(t, 0.28);
    if (a < 0.004) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(SC.x, SC.y, SC.w, SC.h); ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    /* the whole phosphor face lifts on the beat */
    ctx.globalAlpha = 0.11 * a;
    ctx.fillStyle = C.phos;
    ctx.fillRect(SC.x, SC.y, SC.w, SC.h);
    /* a refresh band travels down the tube once per beat */
    var yb = SC.y - 130 + (1 - a) * (SC.h + 260);
    var g = ctx.createLinearGradient(0, yb - 95, 0, yb + 95);
    g.addColorStop(0, "rgba(120,255,180,0)");
    g.addColorStop(0.5, "rgba(190,255,215," + (0.30 * a) + ")");
    g.addColorStop(1, "rgba(120,255,180,0)");
    ctx.fillStyle = g;
    ctx.fillRect(SC.x, yb - 95, SC.w, 190);
    ctx.restore();
  }

  function drawCase(ctx, t, powerK) {
    ctx.save();
    var g = ctx.createRadialGradient(960, 540, 200, 960, 540, 1200);
    g.addColorStop(0, "rgba(18,36,26,0.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080);
    var bx = SC.x - 60, by = SC.y - 60, bw = SC.w + 120, bh = SC.h + 158;
    M.roundRect(ctx, bx, by, bw, bh, 42);
    ctx.fillStyle = "#111411"; ctx.fill();
    ctx.strokeStyle = "#2a312b"; ctx.lineWidth = 3; ctx.stroke();
    M.roundRect(ctx, SC.x - 26, SC.y - 26, SC.w + 52, SC.h + 52, 30);
    ctx.fillStyle = "#070907"; ctx.fill();
    ctx.restore();
  }

  function drawGlassOverlay(ctx, t, powerK) {
    var bx = SC.x - 60, bw = SC.w + 120;
    ctx.save();
    var gg = ctx.createRadialGradient(SC.x + SW * 0.42, SC.y + SH * 0.34, 60, SC.x + SW / 2, SC.y + SH / 2, SW * 0.78);
    gg.addColorStop(0, "rgba(120,255,180," + (0.045 + 0.035 * powerK) + ")");
    gg.addColorStop(0.6, "rgba(40,120,80,0.012)");
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.fillRect(SC.x - 20, SC.y - 20, SC.w + 40, SC.h + 40);
    ctx.globalAlpha = 0.10; ctx.strokeStyle = "#9fe8c0"; ctx.lineWidth = 2;
    M.roundRect(ctx, SC.x - 14, SC.y - 14, SC.w + 28, SC.h + 28, 24);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.75; M.mono(ctx, 22, "700"); ctx.fillStyle = "#4c5a4f";
    ctx.fillText("WORLD  SYSTEMS", SC.x + 24, SC.y + SC.h + 82);
    ctx.globalAlpha = 0.5; M.mono(ctx, 17, "400"); ctx.fillStyle = "#3d4a40";
    ctx.fillText("CRT-130  TRINITRON-STYLE   MODEL ME-01   " + M.BPM.toFixed(0) + " BPM SYNC",
      SC.x + 250, SC.y + SC.h + 82);
    ctx.restore();

    var on = powerK > 0.02;
    ctx.save();
    ctx.beginPath(); ctx.arc(bx + bw - 60, SC.y + SC.h + 78, 9, 0, 6.2832);
    var ledCol = M.sectionAt(t).phase === 4 ? C.amber : C.phos;
    ctx.fillStyle = on ? ledCol : "#333";
    ctx.shadowColor = on ? ledCol : "transparent";
    ctx.shadowBlur = on ? 22 : 0;
    ctx.globalAlpha = on ? (0.75 + 0.25 * Math.sin(t * 3)) : 1;
    ctx.fill();
    ctx.restore();

    for (var i = 0; i < 2; i++) {
      var kx = bx + bw - 190 - i * 44, ky = SC.y + SC.h + 78;
      ctx.save();
      ctx.beginPath(); ctx.arc(kx, ky, 12, 0, 6.2832);
      ctx.fillStyle = "#1c211c"; ctx.fill();
      ctx.strokeStyle = "#39423a"; ctx.lineWidth = 2; ctx.stroke();
      var a = -1.2 + i * 0.5 + Math.sin(t * 0.4 + i) * 0.05;
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + Math.cos(a) * 8, ky + Math.sin(a) * 8);
      ctx.strokeStyle = "#5b6a5d"; ctx.stroke();
      ctx.restore();
    }
  }

  /* ==================================================================== */
  /* root                                                                 */
  /* ==================================================================== */
  window.__draw = function (t) {
    var cv = document.getElementById("screen");
    var ctx = cv.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.filter = "none";
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1920, 1080);

    var powerK = M.clamp((t - powerAt) / 0.9, 0, 1);
    var sec = M.sectionAt(t);

    /* --- PASS 1: the glowing picture. Text drawn here is captured. --- */
    M.inkBegin(ctx);
    drawCase(ctx, t, powerK);

    if (powerK > 0.001) {
      if (sec.id === "P1_BOOT") scPowerOn(ctx, t);
      else drawInner(ctx, t, 1, powerK);

      ctx.save();
      ctx.beginPath(); ctx.rect(SC.x, SC.y, SC.w, SC.h); ctx.clip();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.20 + 0.10 * M.pulse(t, 0.6);
      ctx.filter = "blur(11px)";
      ctx.drawImage(ctx.canvas, SC.x, SC.y, SW, SH, SC.x - 4, SC.y - 4, SW + 8, SH + 8);
      ctx.filter = "none";
      ctx.restore();

      drawBeatPump(ctx, t);

      var G = glitchLevel(t);
      tear(ctx, t, G * 0.9);
      chromaticSplit(ctx, G);

      ctx.save();
      ctx.beginPath(); ctx.rect(SC.x, SC.y, SC.w, SC.h); ctx.clip();
      ctx.globalAlpha = 0.20; ctx.fillStyle = "#000";
      var roll = Math.floor((t * 26) % 3);
      for (var y = SC.y - 3 + roll; y < SC.y + SC.h; y += 3) ctx.fillRect(SC.x, y, SC.w, 1);
      ctx.globalAlpha = 0.07;
      for (var x = SC.x; x < SC.x + SC.w; x += 3) {
        ctx.fillStyle = "#ff0000"; ctx.fillRect(x, SC.y, 1, SC.h);
        ctx.fillStyle = "#00ff00"; ctx.fillRect(x + 1, SC.y, 1, SC.h);
        ctx.fillStyle = "#0000ff"; ctx.fillRect(x + 2, SC.y, 1, SC.h);
      }
      var rr = M.mulberry32(Math.floor(t * 60) * 7919 + 13);
      ctx.globalAlpha = 0.05; ctx.fillStyle = "#c8ffdc";
      for (var i = 0; i < 900; i++) ctx.fillRect(SC.x + rr() * SC.w, SC.y + rr() * SC.h, 2, 2);
      var vg = ctx.createRadialGradient(SC.x + SW * 0.45, SC.y + SH * 0.42, SH * 0.30, SC.x + SW / 2, SC.y + SH / 2, SH * 0.92);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(0.7, "rgba(0,0,0,0.30)");
      vg.addColorStop(1, "rgba(0,0,0,0.78)");
      ctx.globalAlpha = 1; ctx.fillStyle = vg; ctx.fillRect(SC.x, SC.y, SC.w, SC.h);
      ctx.restore();
    }

    /* the picture is finished; text goes into the ink layer from here on */
    M.inkEnd();

    /* --- PASS 2: the bezel, on top of the picture --- */
    drawGlassOverlay(ctx, t, powerK);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.05 + 0.03 * M.pulse(t, 0.7);
    ctx.fillStyle = "rgba(30,120,70,1)";
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.10; ctx.fillStyle = "#000";
    for (var y2 = 0; y2 < 1080; y2 += 4) ctx.fillRect(0, y2, 1920, 1);
    ctx.restore();
    var fv = ctx.createRadialGradient(960, 540, 380, 960, 540, 1250);
    fv.addColorStop(0, "rgba(0,0,0,0)"); fv.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = fv; ctx.fillRect(0, 0, 1920, 1080);

    /* --- PASS 3: the crisp text layer, after every CRT blur and glitch --- */
    if (powerK > 0.02) {
      var ink = M.inkCanvas();
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      /* clip the text to the tube */
      ctx.beginPath();
      M.roundRect(ctx, SC.x - 2, SC.y - 2, SC.w + 4, SC.h + 4, 26);
      ctx.clip();
      /* a very light bloom copy keeps the phosphor feel without destroying legibility */
      ctx.globalAlpha = 0.30 * powerK;
      ctx.globalCompositeOperation = "lighter";
      ctx.filter = "blur(6px)";
      ctx.drawImage(ink, 0, 0);
      ctx.filter = "none";
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = powerK;
      ctx.drawImage(ink, 0, 0);
      ctx.restore();
      /* and the tube's scanlines over the text so it still reads as a tube */
      ctx.save();
      ctx.beginPath(); M.roundRect(ctx, SC.x - 2, SC.y - 2, SC.w + 4, SC.h + 4, 26); ctx.clip();
      ctx.globalAlpha = 0.13; ctx.fillStyle = "#000";
      for (var y3 = SC.y - 3 + Math.floor((t * 26) % 3); y3 < SC.y + SC.h; y3 += 3) ctx.fillRect(SC.x, y3, SC.w, 1);
      ctx.restore();
    }
  };

  window.__ready = true;
})();
