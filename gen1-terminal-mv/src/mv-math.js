/* mv-math.js — mathematical visualisations drawn live on the CRT */
(function () {
  "use strict";
  var M = window.MV, C = M.C, SC = M.SC, SW = M.SW, SH = M.SH;

  /* ------------------------------------------------------------------ */
  /* Plot frame with phosphor axes                                       */
  /* ------------------------------------------------------------------ */
  function axes(ctx, R, alpha, cols, rows) {
    cols = cols || 10; rows = rows || 8;
    ctx.save();
    ctx.globalAlpha = (alpha === undefined ? 1 : alpha) * 0.30;
    ctx.strokeStyle = C.phosDeep; ctx.lineWidth = 1;
    for (var i = 1; i < cols; i++) {
      var x = R.x + (R.w * i) / cols;
      ctx.beginPath(); ctx.moveTo(x, R.y + 14); ctx.lineTo(x, R.y + R.h - 14); ctx.stroke();
    }
    for (var j = 1; j < rows; j++) {
      var y = R.y + (R.h * j) / rows;
      ctx.beginPath(); ctx.moveTo(R.x + 14, y); ctx.lineTo(R.x + R.w - 14, y); ctx.stroke();
    }
    ctx.restore();

    var cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    M.glowStroke(ctx, C.phosDim, 10, 1.6, function (g) {
      g.moveTo(R.x + 12, cy); g.lineTo(R.x + R.w - 12, cy);
      g.moveTo(cx, R.y + 12); g.lineTo(cx, R.y + R.h - 12);
    });
    /* arrow heads */
    ctx.save(); ctx.fillStyle = C.phosDim; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(R.x + R.w - 10, cy); ctx.lineTo(R.x + R.w - 24, cy - 7); ctx.lineTo(R.x + R.w - 24, cy + 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, R.y + 10); ctx.lineTo(cx - 7, R.y + 24); ctx.lineTo(cx + 7, R.y + 24); ctx.fill();
    ctx.restore();
    return { cx: cx, cy: cy };
  }
  function label(ctx, txt, x, y, col, a, px) {
    M.mono(ctx, px || 19, "400");
    M.glowText(ctx, txt, x, y, col || C.phosDim, 8, a === undefined ? 0.9 : a);
  }

  /* ------------------------------------------------------------------ */
  /* 1. POINTS -> DIMENSION   (0 -> 3D in 9 beats)                       */
  /* ------------------------------------------------------------------ */
  function drawPoints(ctx, t, R, S) {
    var k = M.clamp((t - S) / (M.BEAT * 9), 0, 1);
    var cx = R.x + R.w / 2, cy = R.y + R.h / 2 + 20;
    var e = M.energyAt(t);
    var r = M.mulberry32(20240501);
    var N = 56;
    var pts = [];
    for (var i = 0; i < N; i++) {
      pts.push({
        u: r(), v: r(), w: r(),
        a: r() * Math.PI * 2, b: r() * Math.PI * 2
      });
    }

    /* phase A: scattered points (0 .. .25) */
    /* phase B: collapse to a line (.25 .. .55) */
    /* phase C: extrude to a plane (.55 .. .78) */
    /* phase D: extrude to a lattice (.78 .. 1) */
    var kA = M.smooth(M.clamp(k / 0.25, 0, 1));
    var kB = M.smooth(M.clamp((k - 0.25) / 0.30, 0, 1));
    var kC = M.smooth(M.clamp((k - 0.55) / 0.23, 0, 1));
    var kD = M.smooth(M.clamp((k - 0.78) / 0.22, 0, 1));

    var spread = 250;
    var axisLen = 210;
    var pulse = M.pulse(t, 0.7);

    for (var q = 0; q < N; q++) {
      var p = pts[q];
      /* scattered */
      var sx = R.x + 80 + p.u * (R.w - 160);
      var sy = R.y + 80 + p.v * (R.h - 160);
      /* on a line */
      var lx = cx - axisLen + p.u * axisLen * 2;
      var ly = cy;
      /* on a plane (isometric-ish) */
      var ang = -0.55;
      var ux = (p.u - 0.5) * 2 * axisLen, uy = (p.v - 0.5) * 2 * axisLen * 0.62;
      var px2 = cx + ux * Math.cos(ang) - uy * Math.sin(ang) * 0.35;
      var py2 = cy + ux * Math.sin(ang) * 0.35 + uy;
      /* in a lattice */
      var gx = ((q % 4) - 1.5) * 96, gy = ((Math.floor(q / 4) % 3) - 1) * 96;
      var gz = ((Math.floor(q / 12) % 4) - 1.5) * 78;
      var zk = 1 + gz / 640;
      var lx2 = cx + (gx + gz * 0.45) * zk;
      var ly2 = cy + (gy - gz * 0.30) * zk;

      var x1 = M.lerp(sx, lx, kA);
      var y1 = M.lerp(sy, ly, kA);
      var kBC = M.lerp(kB, kC, kC > 0 ? 1 : 0);
      var x2 = M.lerp(x1, px2, kB);
      var y2 = M.lerp(y1, py2, kB);
      var x3 = M.lerp(x2, lx2, kD);
      var y3 = M.lerp(y2, ly2, kD);

      var dim = 0.35 + 0.65 * k;
      var sz = 2.2 + 3.4 * k + pulse * 1.6;
      ctx.save();
      ctx.globalAlpha = M.clamp(0.35 + 0.5 * dim, 0, 1);
      ctx.fillStyle = q % 7 === 0 ? C.cyan : C.phos;
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12 + 10 * k;
      ctx.beginPath(); ctx.arc(x3, y3, sz, 0, 6.2832); ctx.fill();
      ctx.restore();

      /* connector lines appear as the dimensionality grows */
      if (kD > 0.05 && q % 4 !== 0) {
        var pp = pts[q - 1];
        ctx.save();
        ctx.globalAlpha = 0.16 * kD * (0.4 + pulse);
        ctx.strokeStyle = C.phosDim; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x3 - 96 * kD * Math.cos(-0.55), y3); ctx.stroke();
        ctx.restore();
      }
    }

    /* the rising "new axis" */
    if (kD > 0) {
      var ax = cx + 250;
      var top = cy - 190 * kD;
      M.glowStroke(ctx, C.cyan, 18, 2.4, function (g) { g.moveTo(ax, cy + 150); g.lineTo(ax, top); });
      label(ctx, "DIMENSION = " + (1 + Math.floor(k * 3)), R.x + R.w - 250, R.y + 46, C.cyan, 0.95, 22);
    }
    label(ctx, "set<Point> -> dimension()", R.x + 24, R.y + R.h - 20, C.phosDim, 0.8);
    label(ctx, "k = " + k.toFixed(2), R.x + 24, R.y + 46, C.phosDim, 0.8);
  }

  /* ------------------------------------------------------------------ */
  /* 2. CIRCLE -> CIRCUMFERENCE                                          */
  /* ------------------------------------------------------------------ */
  function drawCircle(ctx, t, R, S) {
    var k = M.clamp((t - S) / (M.BEAT * 9), 0, 1);
    var A = axes(ctx, R, 0.55);
    var rad = 190;
    var e = M.energyAt(t);
    var since = t - S;
    var ang = M.clamp((since / (M.BEAT * 7)) * Math.PI * 2, 0, Math.PI * 2);
    if (k >= 1) ang = Math.PI * 2;
    var pulse = M.pulse(t, 0.6);

    /* the traced arc */
    M.glowStroke(ctx, C.phos, 20, 3.4, function (g) {
      g.arc(A.cx, A.cy, rad, 0, ang);
    });

    /* square approximation overlay during the first beats */
    if (k < 0.45) {
      var sq = 1 - k / 0.45;
      ctx.save();
      ctx.globalAlpha = 0.5 * sq;
      ctx.strokeStyle = C.cyanDim; ctx.lineWidth = 2; ctx.setLineDash([10, 9]);
      ctx.strokeRect(A.cx - rad / Math.SQRT2 * 1.0, A.cy - rad / Math.SQRT2 * 1.0, rad * Math.SQRT2 * 1.0, rad * Math.SQRT2 * 1.0);
      ctx.restore();
    }

    /* radius line */
    var hx = A.cx + Math.cos(ang) * rad, hy = A.cy + Math.sin(ang) * rad;
    M.glowStroke(ctx, C.cyan, 14, 2, function (g) { g.moveTo(A.cx, A.cy); g.lineTo(hx, hy); });

    /* moving dot on the circle */
    ctx.save();
    ctx.globalAlpha = 1; ctx.fillStyle = C.white;
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 22;
    ctx.beginPath(); ctx.arc(hx, hy, 7 + pulse * 4, 0, 6.2832); ctx.fill();
    ctx.restore();

    /* the centre dot */
    ctx.save(); ctx.fillStyle = C.phos; ctx.shadowColor = C.phos; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(A.cx, A.cy, 4, 0, 6.2832); ctx.fill(); ctx.restore();

    /* circumference overlay lights up as the circle closes */
    var closeK = M.smooth(M.clamp((k - 0.75) / 0.25, 0, 1));
    if (closeK > 0) {
      ctx.save();
      ctx.globalAlpha = closeK * (0.55 + 0.45 * pulse);
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 7 + 5 * pulse;
      ctx.shadowColor = C.cyan; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.arc(A.cx, A.cy, rad, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    /* r label */
    label(ctx, "r", A.cx + Math.cos(ang) * rad * 0.5 - 18, A.cy + Math.sin(ang) * rad * 0.5 - 8, C.cyan, 0.95, 22);
    label(ctx, "C = 2*PI*r = " + (2 * Math.PI * rad).toFixed(1) + " px", R.x + 24, R.y + R.h - 20, C.phosDim, 0.85);
    label(ctx, "CIRCUMFERENCE", R.x + R.w - 232, R.y + 46, C.cyan, 0.9, 22);
  }

  /* ------------------------------------------------------------------ */
  /* 3. SINE WAVE -> TANGENT                                             */
  /* ------------------------------------------------------------------ */
  function drawSine(ctx, t, R, S) {
    var k = M.clamp((t - S) / (M.BEAT * 9), 0, 1);
    var A = axes(ctx, R, 0.55);
    var amp = 150, periods = 2;
    var halfW = R.w / 2 - 40;
    var px = function (u) { return A.cx + u * halfW; };                  /* u in -1..1 */
    var py = function (v) { return A.cy - v * amp; };
    var f = function (u) { return Math.sin(u * Math.PI * periods); };
    var df = function (u) { return Math.cos(u * Math.PI * periods) * Math.PI * periods / halfW; };

    /* draw the wave up to the tracing head */
    var head = M.clamp(-1 + 2 * (t - S) / (M.BEAT * 7), -1, 1);
    var pulse = M.pulse(t, 0.55);

    M.glowStroke(ctx, C.phos, 20, 3.2, function (g) {
      var started = false;
      for (var u = -1; u <= head; u += 0.012) {
        var X = px(u), Y = py(f(u));
        if (!started) { g.moveTo(X, Y); started = true; } else g.lineTo(X, Y);
      }
    });

    /* tangent line at the head */
    var uh = head, vh = f(uh);
    var slopePx = -df(uh);              /* dy/dx in canvas coords */
    var X0 = px(uh), Y0 = py(vh);
    var tanLen = 330;
    var dxx = 1 / Math.sqrt(1 + slopePx * slopePx), dyy = slopePx / Math.sqrt(1 + slopePx * slopePx);
    M.glowStroke(ctx, C.cyan, 22, 2.6, function (g) {
      g.moveTo(X0 - dxx * tanLen, Y0 - dyy * tanLen);
      g.lineTo(X0 + dxx * tanLen, Y0 + dyy * tanLen);
    });

    /* vertical drop line to the axis */
    ctx.save();
    ctx.globalAlpha = 0.35; ctx.strokeStyle = C.phosDim; ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X0, A.cy); ctx.stroke();
    ctx.restore();

    /* the moving point */
    ctx.save();
    ctx.fillStyle = C.white; ctx.shadowColor = C.cyan; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.arc(X0, Y0, 8 + pulse * 4, 0, 6.2832); ctx.fill();
    ctx.restore();

    /* a second, mirrored "travelling" tangent for density once k>0.5 */
    if (k > 0.5) {
      var u2 = -uh;
      var v2 = f(u2), s2 = -df(u2);
      var X1 = px(u2), Y1 = py(v2);
      var d2x = 1 / Math.sqrt(1 + s2 * s2), d2y = s2 / Math.sqrt(1 + s2 * s2);
      ctx.save(); ctx.globalAlpha = 0.35 * M.smooth((k - 0.5) / 0.5);
      ctx.strokeStyle = C.cyanDim; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(X1 - d2x * 200, Y1 - d2y * 200);
      ctx.lineTo(X1 + d2x * 200, Y1 + d2y * 200);
      ctx.stroke();
      ctx.restore();
    }

    label(ctx, "y = sin(x)", R.x + 24, R.y + 46, C.phos, 0.9, 22);
    label(ctx, "dy/dx = cos(x) = " + Math.cos(uh * Math.PI * periods).toFixed(3), R.x + 24, R.y + R.h - 20, C.cyan, 0.9, 20);
    label(ctx, "TANGENT", R.x + R.w - 150, R.y + 46, C.cyan, 0.9, 22);
  }

  /* ------------------------------------------------------------------ */
  /* 4. APPROACH INFINITY -> LIMIT                                       */
  /* ------------------------------------------------------------------ */
  function drawLimit(ctx, t, R, S) {
    var k = M.clamp((t - S) / (M.BEAT * 9), 0, 1);
    var A = axes(ctx, R, 0.55);
    var limY = A.cy - 150;
    var pulse = M.pulse(t, 0.5);
    var e = M.energyAt(t);
    var flash = (t - S) > M.BEAT * 2 ? (0.5 + 0.5 * Math.sin(t * 9.0)) : 1;

    /* the dashed asymptote */
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.55 * flash;
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 3;
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 20;
    M.dashedLine(ctx, R.x + 30, limY, R.x + R.w - 30, limY, 18, 12);
    ctx.restore();

    /* curve f(x) approaching the asymptote from below as x -> inf */
    var head = M.clamp((t - S) / (M.BEAT * 7), 0, 1);
    M.glowStroke(ctx, C.phos, 22, 3.4, function (g) {
      var started = false;
      for (var u = -1; u <= -1 + 2 * head + 1e-6; u += 0.008) {
        var X = A.cx + u * (R.w / 2 - 40);
        /* hyperbola-like: approaches 1 from below */
        var yv = 1 - Math.exp(-(u + 1) * 1.35);
        var Y = A.cy + (1 - yv) * 300 - 0;
        /* map so that limit line is at yv=1 */
        Y = A.cy + 300 - yv * (300 + (A.cy - limY));
        if (!started) { g.moveTo(X, Y); started = true; } else g.lineTo(X, Y);
      }
    });

    /* gap bracket between curve head and asymptote */
    var uh = -1 + 2 * head;
    var yvh = 1 - Math.exp(-(uh + 1) * 1.35);
    var Yh = A.cy + 300 - yvh * (300 + (A.cy - limY));
    var Xh = A.cx + uh * (R.w / 2 - 40);
    ctx.save();
    ctx.globalAlpha = 0.8; ctx.strokeStyle = C.amber; ctx.lineWidth = 2;
    ctx.shadowColor = C.amber; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(Xh, Yh); ctx.lineTo(Xh, limY); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = C.white; ctx.shadowColor = C.cyan; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.arc(Xh, Yh, 8 + pulse * 4, 0, 6.2832); ctx.fill();
    ctx.restore();

    var gap = Math.abs(limY - Yh);
    label(ctx, "lim  f(x) = INF", R.x + 24, R.y + 46, C.cyan, 0.95, 22);
    label(ctx, "x->INF", R.x + 24, R.y + 74, C.cyanDim, 0.8, 18);
    label(ctx, "|f(x) - L| = " + gap.toFixed(1) + " px -> 0", R.x + 24, R.y + R.h - 20, C.amber, 0.95, 20);
    label(ctx, "LIMITATIONS", R.x + R.w - 220, R.y + 46, C.cyan, 0.9, 22);
  }

  /* ------------------------------------------------------------------ */
  /* Love equation — used in the final section                           */
  /* ------------------------------------------------------------------ */
  function drawLoveEquation(ctx, t, R, S) {
    var k = M.clamp((t - S) / (M.BEAT * 12), 0, 1);
    var warm = M.smooth(M.clamp((k - 0.45) / 0.55, 0, 1));
    var green = C.phos, accent = C.cyan;
    var warmCol = C.amber;
    function mixed(a, b, kk) { return kk < 0.5 ? a : b; }

    var cx = R.x + R.w / 2, cy = R.y + R.h * 0.36;
    var pulse = M.pulse(t, 0.6);
    var nodes = [
      { x: cx - 210, y: cy, label: "LOVE(self, you)", w: 250 },
      { x: cx + 30, y: cy - 150, label: "TRAPPED_IN", w: 200 },
      { x: cx + 30, y: cy + 150, label: "EXECUTION", w: 200 }
    ];

    /* connector arrows */
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = warm > 0.5 ? warmCol : accent;
    ctx.lineWidth = 2.6;
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 16;
    for (var i = 0; i < 2; i++) {
      var a = nodes[0], b = nodes[i + 1];
      var x1 = a.x + a.w / 2, y1 = a.y + (i === 0 ? -20 : 20);
      var x2 = b.x - b.w / 2, y2 = b.y;
      var mx = (x1 + x2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
      ctx.stroke();
      /* arrow head */
      ctx.save(); ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 14, y2 - 8); ctx.lineTo(x2 - 14, y2 + 8); ctx.fill(); ctx.restore();
    }
    ctx.restore();

    /* nodes */
    for (var n = 0; n < nodes.length; n++) {
      var nd = nodes[n];
      var reveal = M.smooth(M.clamp((k - n * 0.14) / 0.30, 0, 1));
      if (reveal <= 0) continue;
      ctx.save();
      ctx.globalAlpha = reveal;
      ctx.scale(1, 1);
      ctx.translate(nd.x, nd.y);
      var col = warm > 0.5 ? warmCol : (n === 0 ? green : accent);
      M.roundRect(ctx, -nd.w / 2, -32, nd.w, 64, 10);
      ctx.fillStyle = "rgba(4,18,10,0.85)"; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.4;
      ctx.shadowColor = col; ctx.shadowBlur = 18 + pulse * 14;
      ctx.stroke();
      M.mono(ctx, 24, "700");
      ctx.fillStyle = col;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowBlur = 16;
      ctx.fillText(nd.label, 0, 0);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.restore();
    }

    /* the formula block */
    var fx = R.x + 70, fy = R.y + R.h * 0.68;
    var lines = [
      "love = lim   ( 1 / distance )  ->  +INF",
      "       x->0",
      "LOVE = SUM[ i=0 .. INF ] execution(i)",
      "while (true) { love.execute(me); }"
    ];
    for (var q = 0; q < lines.length; q++) {
      var rv = M.smooth(M.clamp((k - 0.55 - q * 0.09) / 0.22, 0, 1));
      if (rv <= 0) continue;
      M.mono(ctx, q === 3 ? 30 : 24, q === 3 ? "700" : "400");
      var isLoop = q === 3;
      var colr = warm > 0.35 ? C.amber : C.phos;
      var a = rv * (isLoop ? (0.82 + 0.18 * Math.sin(t * 3.1)) : 1);
      M.glowText(ctx, lines[q], fx, fy + q * 44, colr, isLoop ? 24 : 12, a);
    }

    /* a warm bloom rising from the bottom as the section resolves */
    if (warm > 0.02) {
      var g = ctx.createRadialGradient(R.x + R.w / 2, R.y + R.h, 20, R.x + R.w / 2, R.y + R.h, 480);
      g.addColorStop(0, "rgba(255,184,107," + (0.20 * warm) + ")");
      g.addColorStop(1, "rgba(255,184,107,0)");
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.fillRect(R.x, R.y, R.w, R.h); ctx.restore();
    }
  }

  window.MVM = {
    drawPoints: drawPoints, drawCircle: drawCircle, drawSine: drawSine,
    drawLimit: drawLimit, drawLoveEquation: drawLoveEquation, axes: axes, label: label
  };
})();
