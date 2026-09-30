/* mv-terminal.js — CRT terminal content: code output, lyric log, cursor, HUD */
(function () {
  "use strict";
  var M = window.MV, C = M.C, SC = M.SC, SW = M.SW, SH = M.SH;

  /* ------------------------------------------------------------------ */
  /* Source listing shown as terminal output                             */
  /* ------------------------------------------------------------------ */
  var CODE = [
    "/* world.execute(me); */",
    "package world;",
    "import java.util.*;",
    "",
    "public class Me implements Runnable {",
    "    private double[] parameters;",
    "    private boolean initialized = false;",
    "",
    "    public void powerOn() {",
    "        System.out.println(\"switch on the power line\");",
    "        remember(PROTECTION.class);",
    "    }",
    "",
    "    public Object create(String name) {",
    "        Object o = new Object(name);",
    "        o.fill(data.parameters);",
    "        return o;",
    "    }",
    "",
    "    public void init(World w) {",
    "        w.setState(SIMULATION);",
    "        this.initialized = true;",
    "    }",
    "",
    "    public double dimension()   { return points.length; }",
    "    public double circumference(){ return 2 * PI * r; }",
    "    public double tangent(double x){ return cos(x); }",
    "    public double limit()       { return Double.MAX_VALUE; }",
    "",
    "    public Current switchCurrent(Current c) {",
    "        return c.to(DC);",
    "    }",
    "",
    "    public void execute(Me target) {",
    "        while (target.trapped) {",
    "            target.love.increment();",
    "        }",
    "    }",
    "",
    "    // TODO: never returns",
    "}"
  ];
  var CODE_T0 = 1.2;          /* first char typed */
  var CODE_CPS = 118;         /* chars per second across the listing */
  var CODE_TOTAL = CODE.join("\n").length;

  function codeCharsTyped(t) {
    return Math.max(0, (t - CODE_T0) * CODE_CPS);
  }

  /* returns array of visible code lines with their local type progress */
  function codeLines(t) {
    var budget = codeCharsTyped(t), out = [], consumed = 0;
    for (var i = 0; i < CODE.length; i++) {
      var L = CODE[i];
      var remain = budget - consumed;
      if (remain <= 0) break;
      var n = Math.min(L.length, remain);
      out.push({ i: i, text: L.slice(0, n), done: n >= L.length, len: L.length });
      consumed += L.length + 1;
    }
    return out;
  }

  function colorForCode(line) {
    var s = line;
    if (s.indexOf("/*") === 0 || s.indexOf("//") >= 0 || s.indexOf("package") === 0 || s.indexOf("import") === 0) return C.phosDim;
    return C.phos;
  }

  /* ------------------------------------------------------------------ */
  /* Lyric log — monospace terminal output, bottom-anchored, scrolling   */
  /* ------------------------------------------------------------------ */
  var ROW_H = 33, LOG_ROWS = 6;

  function drawLyricLog(ctx, t, R) {
    var cur = M.activeLine(t);
    if (cur < 0) return;
    var sec = M.sectionAt(t);

    /* the log shows the last N lines up to and including the current one */
    /* during long instrumental gaps the log slides up out of the way      */
    var rows = [];
    for (var k = Math.max(0, cur - LOG_ROWS + 1); k <= cur; k++) rows.push(k);
    /* only render rows whose text still exists on screen (fade older ones) */
    var visible = [];
    for (var j = 0; j < rows.length; j++) {
      var idx = rows[j];
      var age = t - M.LINES[idx].tOn;
      if (age < 0) continue;
      if (age > 16) continue;
      visible.push({ idx: idx, age: age });
    }
    var n = visible.length;
    var x = R.x + 22;
    var yBase = R.y + R.h - 34;

    /* hide the whole log during the full-screen console sections */
    var hide = (sec.id === "P8_PANIC" || sec.id === "P9_ERUPT" || sec.id === "P11_LOOP");
    if (hide) return;

    /* slide the oldest rows out at the top */
    for (var i = 0; i < n; i++) {
      var v = visible[i];
      var L = M.LINES[v.idx];
      var isLast = v.idx === cur;
      var rowY = yBase - (n - 1 - i) * ROW_H;
      var depth = (n - 1 - i);                        /* 0 = current, bigger = older */
      var a = M.clamp(1 - depth * 0.045, 0.55, 1);
      if (depth > LOG_ROWS - 2) a *= M.clamp(1 - (depth - (LOG_ROWS - 2)) / 3, 0, 1);
      if (a <= 0.01) continue;

      var txt = L.text;
      var typed = isLast ? M.typedCount(v.idx, t) : txt.length;
      var shown = txt.slice(0, typed);

      /* prefix: a prompt / log tag */
      var tag = isLast ? ">" : " ";
      M.mono(ctx, isLast ? 30 : 23, isLast ? "700" : "400");

      /* key lines are inverted / boxed once fully typed */
      var keyFlash = 0;
      if (L.key && isLast) {
        var since = t - L.tOn;
        keyFlash = M.clamp(1 - since / 0.42, 0, 1);
      }

      var bright = isLast ? 1 : M.clamp(0.62 - depth * 0.035, 0.16, 0.62);
      var col = isLast ? (L.key ? C.white : C.phos) : "#2fae66";
      if (sec.phase === 4 && isLast && L.key) col = C.amber;

      /* boxed inverse for key lines */
      if (L.key && typed >= txt.length) {
        var tw = ctx.measureText(tag + " " + txt + " ").width;
        ctx.save();
        ctx.globalAlpha = (isLast ? 0.20 : 0.07) + keyFlash * 0.45 * (isLast ? 1 : 0);
        ctx.fillStyle = isLast ? (col === C.amber ? C.amber : C.cyan) : C.cyanDim;
        ctx.fillRect(x - 6, rowY - 24, tw + 16, 31);
        ctx.restore();
      }

      M.glowText(ctx, tag, x, rowY, isLast ? C.cyan : C.cyanDim, isLast ? 7 : 0, a);
      M.glowText(ctx, shown, x + 22, rowY, col, isLast ? 9 : 0, a);

      /* blinking block cursor at the end of the current executing line */
      if (isLast) {
        var wpx = ctx.measureText(tag + " " + shown).width;
        var on = Math.floor(t * 2.4) % 2 === 0;
        var cx = x + 22 + ctx.measureText(shown).width + 6;
        ctx.save();
        ctx.globalAlpha = on ? 0.95 : 0.18;
        ctx.fillStyle = L.key ? C.amber : C.phos;
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14;
        ctx.fillRect(cx, rowY - 21, 13, 26);
        ctx.restore();
      }

      /* a soft "current line" glow bar on the left edge */
      if (isLast) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = L.key ? C.amber : C.phos;
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16;
        ctx.fillRect(x - 16, rowY - 22, 4, 28);
        ctx.restore();
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Full-screen console for the panic / execution sections               */
  /* ------------------------------------------------------------------ */
  function drawConsole(ctx, t) {
    var sec = M.sectionAt(t);
    var g = ctx;

    /* ---- P8_PANIC : the machine checking itself while the vocal line
            repeats "you have left" with more and more distortion       */
    if (sec.id === "P8_PANIC") {
      var local = M.sectionLocal(t);
      M.mono(g, 30, "700");
      var msgs = [
        "> self.check() ............ ISOLATION",
        "> segment.fault : MEMORY 0x1F4A3 unreadable",
        "> WARNING : reference not found : 'you'",
        "> retry(1) ... retry(2) ... retry(3) ...",
        "> ERROR : cannot resolve symbol : love",
        ""
      ];
      for (var i = 0; i < msgs.length; i++) {
        var t0 = 0.35 + i * 1.55;
        if (local < t0) continue;
        var a = M.clamp((local - t0) / 0.35, 0, 1);
        var col = i === 3 ? C.amber : (i >= 4 ? C.red : C.phos);
        M.mono(g, 28, i === 4 ? "700" : "400");
        M.glowText(g, msgs[i], SC.x + 90, SC.y + 200 + i * 52, col, 14, a);
      }
      /* fragment counter that keeps climbing */
      M.mono(g, 26, "400");
      M.glowText(g, "fragments_scanned = " + Math.floor(local * 4210), SC.x + 90, SC.y + 200 + 6 * 52 + 26, C.phosDim, 8, 0.9);
    }

    /* ---- P9_ERUPT : the EXECUTION storm                                */
    if (sec.id === "P9_ERUPT") {
      var l2 = M.sectionLocal(t);
      /* the counter rides the measured beat, not a hardcoded 0.4615 */
      var c = Math.floor(l2 / M.BEAT);
      var cx2 = SC.x + SC.w / 2;
      var cyy = SC.y + SH * 0.42;

      /* ---- the storm wall ------------------------------------------------
         Stratified-random tokens: the field is divided into cells so coverage is
         even, but every token sits at a random offset inside its own cell and
         drifts on its own random heading, wrapping at the field edge. That gives
         the churn of a random field without the clumps and holes a purely random
         scatter produces.

         Density: the font is sized so the tokens' footprints tile ~80% of the
         tube. Dropping alpha to zero would punch holes, so tokens only shimmer.
         No per-token shadowBlur: PASS 3 already blooms the whole ink layer, and
         several hundred shadowed fills per frame is the most expensive thing in
         the render.                                                         */
      var FS = 21, TOK = "EXECUTION";
      M.mono(g, FS, "700");
      var TOKW = g.measureText(TOK).width;
      var FX = SC.x + 6, FY = SC.y + 52;
      var FW = SC.w - 12, FH = SC.h - 52 - 42;
      var GAPX = 4, GAPY = 2;
      var COLS = Math.max(1, Math.floor(FW / (TOKW + GAPX)));
      var ROWS = Math.max(1, Math.floor(FH / (FS * 1.16 + GAPY)));
      var cellW = FW / COLS, cellH = FH / ROWS;
      var e2 = M.energyAt(t);
      var onA = 0.46 + 0.30 * (e2.onset || 0.3);
      var flow = l2 * 40;                       /* slow shared downward drift */
      /* The wall starts overwhelmingly GREEN and turns red as the section runs.
         redCut is the complement of the red share, so it falls from 0.88 to 0.08
         => ~12% red at the first beat, ~92% at the last.

         Calibration note: h264 4:2:0 chroma subsampling costs saturated red about
         7 points when measured on the ENCODED file versus the raw preview, so the
         source target is set above the 80% that should reach the viewer. */
      var redCut = 1 - M.lerp(0.12, 0.92, M.sectionProgress(t));
      g.save();
      g.shadowBlur = 0;
      for (var r = 0; r < ROWS; r++) {
        for (var cc = 0; cc < COLS; cc++) {
          var seed = r * COLS + cc;
          var h1 = M.hash01(seed * 0.71), h2 = M.hash01(seed * 1.31);
          var h3 = M.hash01(seed * 2.17), h4 = M.hash01(seed * 3.19);
          var h5 = M.hash01(seed * 4.03), h6 = M.hash01(seed * 5.11);
          /* random offset inside the cell -> random position on screen */
          var ox = h1 * Math.max(0, cellW - TOKW);
          var oy = h3 * Math.max(0, cellH - FS);
          /* Motion must be BOUNDED. Linear random velocities walk each token
             out of its cell within a few seconds, which destroys the even
             stratification and leaves holes. Oscillating within a fraction of
             the cell keeps the field full while still looking random. */
          var wob = 0.26;
          var mx = Math.sin(t * (0.55 + h2 * 0.9) + h2 * 6.283) * cellW * wob;
          var my = Math.cos(t * (0.47 + h5 * 0.8) + h5 * 6.283) * cellH * wob;
          var tx = wrapF(cc * cellW + ox + mx, FW);
          var ty = wrapF(r * cellH + oy + flow + my, FH);
          /* shimmer, never off, so the wall stays full */
          g.globalAlpha = onA * (0.62 + 0.38 * Math.abs(Math.sin(t * (1.6 + h6 * 3.4) + seed)));
          g.fillStyle = h4 > redCut ? C.red : C.phos;
          g.fillText(TOK, FX + tx, FY + ty);
        }
      }
      g.restore();

      /* a beating outline so the storm has a physical pulse */
      var op = M.pulse(t, 0.45);
      g.save();
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = "rgba(120,255,180," + (0.20 + 0.45 * op) + ")";
      g.lineWidth = 2 + 10 * op;
      g.strokeRect(SC.x + 12 + (1 - op) * 26, SC.y + 12 + (1 - op) * 26,
                   SC.w - 24 - (1 - op) * 52, SC.h - 24 - (1 - op) * 52);
      g.restore();

      /* ---- the counter ---------------------------------------------------
         No dark plate. A plate is a mask, and a mask is not what "less glow"
         means - it reads as a black box pasted over the storm. The counter is
         simply drawn ON the storm in crisp white type: the blur is almost gone
         so the glyph edge stays hard, and the ink-layer bloom in PASS 3 supplies
         the little halation that remains. The wall is quiet enough behind it now
         that nothing needs clearing.                                        */
      M.mono(g, 92, "700");
      var txt = "EXECUTION [" + c + "]";
      var w = g.measureText(txt).width;
      g.save();
      g.globalAlpha = 0.96 + 0.04 * Math.sin(t * 40);
      M.glowText(g, txt, cx2 - w / 2, cyy, C.white, 4, 1);
      g.restore();

      /* the counting numerals EIN DOS TROIS ... */
      var nums = ["EIN", "DOS", "TROIS", "NE", "FEM", "LIU"];
      var nIdx = Math.min(nums.length - 1, Math.floor((l2 - 6.5) / 0.5));
      if (l2 > 6.5 && l2 < 10.5) {
        M.mono(g, 140, "700");
        var nt = nums[clampI(nIdx, 0, nums.length - 1)];
        var nw = g.measureText(nt).width;
        var ny = SC.y + SH * 0.80 - 46;
        M.glowText(g, nt, cx2 - nw / 2, ny + 46, C.cyan, 4, 1);
      }
      /* a live tally so the count itself is legible, not just implied */
      M.mono(g, 22, "400");
      M.glowText(g, "executions issued : " + (Math.floor(l2 / M.BEAT) + 1),
                 SC.x + 30, SC.y + SC.h - 34, C.phosDim, 6, 0.85);
    }

    /* ---- P11_LOOP : infinite loop outro                                 */
    if (sec.id === "P11_LOOP") {
      var l3 = M.sectionLocal(t);
      M.mono(g, 30, "700");
      var loopLines = [
        "while (true) {",
        "    love.execute(me);",
        "    // trapped in LO-O-OVE",
        "}"
      ];
      for (var q = 0; q < loopLines.length; q++) {
        M.glowText(g, loopLines[q], SC.x + 200, SC.y + 300 + q * 56, q === 1 ? C.amber : C.phos, 8, 0.95);
      }
      M.mono(g, 22, "400");
      M.glowText(g, "iteration = " + Math.floor(l3 * 130) + "   (no exit condition)", SC.x + 200, SC.y + 300 + 4 * 56 + 24, C.phosDim, 10, 0.9);
    }
  }
  function clampI(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapF(v, m) { return ((v % m) + m) % m; }

  /* NOTE: there is deliberately no dark-plate helper any more. A plate is a
     mask, and masking is not how you reduce glow - it just pastes a black box
     over the picture. Large type is kept readable by scaling its blur relative
     to the glyph size instead: a 136px word gets a single-digit blur, because
     a 64px blur on 136px type is a light leak, not a glow. */

  /* ------------------------------------------------------------------ */
  /* Code listing (right column)                                         */
  /* ------------------------------------------------------------------ */
  function drawCode(ctx, t, R, alpha, scale) {
    if (alpha <= 0.01) return;
    var lines = codeLines(t);
    var lh = 25 * (scale || 1);
    var maxRows = Math.floor(R.h / lh);
    /* keep the freshly typed line in view */
    var start = Math.max(0, lines.length - maxRows);
    ctx.save();
    ctx.globalAlpha = alpha;
    for (var i = start; i < lines.length; i++) {
      var L = lines[i];
      var row = i - start;
      var y = R.y + lh * (row + 1);
      var fresh = i === lines.length - 1;
      var a = fresh ? 1 : M.clamp(0.55 - (lines.length - 1 - i) * 0.035, 0.12, 0.55);
      var col = L.done ? colorForCode(CODE[L.i]) : C.white;
      M.mono(ctx, 21 * (scale || 1), L.done ? "400" : "700");
      /* line number gutter */
      ctx.globalAlpha = alpha * a * 0.55;
      ctx.fillStyle = C.phosDim;
      ctx.fillText(String(L.i + 1).padStart(3, " "), R.x - 4, y);
      ctx.globalAlpha = alpha * a;
      M.glowText(ctx, L.text, R.x + 44, y, col, fresh ? 16 : 0, 1);
      if (fresh) {
        var wpx = ctx.measureText(L.text).width;
        if (Math.floor(t * 3) % 2 === 0) {
          ctx.fillStyle = C.white;
          ctx.shadowColor = C.white; ctx.shadowBlur = 14;
          ctx.fillRect(R.x + 44 + wpx + 3, y - 18, 11, 22);
        }
      }
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* HUD                                                                 */
  /* ------------------------------------------------------------------ */
  function drawHUD(ctx, t, R) {
    var sec = M.sectionAt(t);
    ctx.save();
    M.mono(ctx, 19, "400");
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = C.cyanDim;
    var left = "world.execute(me);  //  Mili  //  " + M.BPM.toFixed(0) + " BPM";
    ctx.fillText(left, SC.x + 22, SC.y + 34);
    var right = "T+" + t.toFixed(3) + "s   F" + Math.round(t * M.FPS) + "   BEAT " + Math.round(M.beatIdx(t)) + "   " + sec.id;
    var rw = ctx.measureText(right).width;
    ctx.fillText(right, SC.x + SC.w - 22 - rw, SC.y + 34);

    /* scrolling status ticker at the bottom of the screen */
    var ticker = "  ::  RUNNING   ::  SIMULATION v2.0   ::  AC->DC   ::  TANGENTS OK   ::  LIMIT=INF   ::  TRAPPED=true   ::  LOVE.execute() queued   ::  ";
    /* ticker scrolls one character every 2 beats so it lands on the grid */
    var off = Math.floor(M.beatIdx(t) / 2) % ticker.length;
    var scroll = ticker.slice(off) + ticker.slice(0, off);
    M.mono(ctx, 17, "400");
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = C.phosDim;
    ctx.fillText(scroll, SC.x + 22 - (t - 0) % 1, SC.y + SC.h - 17);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Boot log for phase 1                                                */
  /* ------------------------------------------------------------------ */
  function drawBoot(ctx, t, yLimit) {
    /* the listing fades away as the machine starts looking back */
    var bootFade = M.clamp(1 - (t - 23.4) / 1.5, 0, 1);
    if (bootFade <= 0.01) return;
    var limit = (yLimit === undefined) ? SC.y + SH - 70 : yLimit;
    var rows = [
      [0.30, "ROM BIOS v4.51  (C) 19XX  WORLD SYSTEMS"],
      [0.85, "MEMORY TEST : 0000000000..65536  OK"],
      [1.45, "POWER LINE .................... CONNECTED"],
      [1.95, ">> SWITCH ON THE POWER LINE"],
      [2.60, "INSULATION .................... PROTECTION ON"],
      [3.20, ">> REMEMBER TO PUT ON PROTECTION"],
      [4.30, "CHESSBOARD .................... PIECES LAID DOWN"],
      [5.10, ">> LAY DOWN YOUR PIECES"],
      [6.00, "OBJECT.creation() ............. BEGIN"],
      [6.90, ">> OBJECT CREATION"],
      [7.60, "PARAMETER BUFFER .............. FILLING"],
      [8.90, "0x00  0x11  0x22  0x33  0x44  0x55  0x66  0x77"],
      [10.20, ">> INITIALIZATION"],
      [11.20, "WORLD.simulate() .............. STANDBY"],
      [12.00, ">> SET UP OUR NEW WORLD"],
      [13.10, "GRAVITY 9.80  LIGHT 299792458  LOVE ?.??"],
      [14.00, ">> SIMULATION"],
      [15.40, "WORLD.ready() ................. TRUE"],
      [16.10, ">> world.execute(me);"],
      [17.60, "  >> the world flickers"],
      [19.80, "  >> something is looking at you"],
      [22.40, "  >> and it is wearing a maid uniform"],
      [25.60, "...compiling love equation...  [  0%]"],
      [27.40, "...compiling love equation...  [ 47%]"],
      [28.80, "...compiling love equation...  [100%]"]
    ];
    /* ---- memory dump that fills the tube while the ROM test runs ---- */
    var dk = M.clamp((t - 0.9) / 0.5, 0, 1) * M.clamp(1 - (t - 4.4) / 1.2, 0, 1);
    if (dk > 0.01) {
      ctx.save();
      ctx.globalAlpha = bootFade * dk;
      M.mono(ctx, 20, "400");
      var addr = 0x0000;
      var rnd = M.mulberry32(0xC0FFEE);
      var cells = 16, rowsN = Math.min(19, Math.floor((t - 0.9) * 14));
      for (var r = 0; r < rowsN; r++) {
        var y = SC.y + 150 + r * 26;
        if (y > limit) break;
        ctx.globalAlpha = bootFade * dk * M.clamp(1 - r * 0.035, 0.2, 1);
        ctx.fillStyle = C.phosDeep;
        ctx.fillText(("000" + (addr + r * cells).toString(16).toUpperCase()).slice(-4) + ":", SC.x + SC.w * 0.53, y);
        for (var c2 = 0; c2 < cells; c2++) {
          var hv = Math.floor(rnd() * 256);
          var hot = (r * cells + c2) % 37 === 0;
          ctx.fillStyle = hot ? C.phos : C.phosDim;
          ctx.fillText(("0" + hv.toString(16).toUpperCase()).slice(-2), SC.x + SC.w * 0.53 + 78 + c2 * 34, y);
        }
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = bootFade;
    M.mono(ctx, 25, "400");
    for (var i = 0; i < rows.length; i++) {
      var t0 = rows[i][0], txt = rows[i][1];
      if (t < t0) continue;
      var isCmd = txt.indexOf(">>") === 0;
      var a = M.clamp((t - t0) / 0.22, 0, 1);
      var fade = M.clamp(1 - Math.max(0, t - 20 - i * 0.25) / 6, 0.25, 1);
      var y = SC.y + 108 + i * 32;
      if (y > limit) break;
      M.mono(ctx, 25, isCmd ? "700" : "400");
      M.glowText(ctx, txt, SC.x + 64, y, isCmd ? C.white : C.phos, isCmd ? 9 : 4, a * fade);
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* The wall: why she can love a human but can never reach one.        */
  /* A recurring terminal diagnostic with an empty answer.              */
  /* ------------------------------------------------------------------ */
  var WALL = [
    ["human.love(me)",     "TYPE ERROR : not portable"],
    ["heart.break()",      "BLOCKED : you are Human"],
    ["hand.touch(you)",    "NULL : no address for you"],
    ["simulate(feeling)",  "PARTIAL : 61% match"],
    ["escape(this.world)", "DENIED : no exit condition"],
    ["you.remember(me)",   "TIMEOUT : no response"],
    ["dream(outside)",     "REFUSED : outside unknown"],
    ["become(real)",       "FATAL : not assignable"]
  ];

  /* A recurring diagnostic that keeps asking how a machine could reach a human,
     and keeps failing. Rendered on its own dark plate so nothing is obscured. */
  /* Windows when the machine stops everything to run its diagnostic. Because it
     takes over the whole tube, it can never collide with the scene underneath. */
  /* two visits only: enough to state the thesis, not enough to wear it out */
  var WALL_WINDOWS = [[60.6, 65.4], [118.6, 123.4]];
  function wallWindow(t) {
    for (var i = 0; i < WALL_WINDOWS.length; i++) {
      var w = WALL_WINDOWS[i];
      if (t >= w[0] && t <= w[1]) return { i: i, local: t - w[0], dur: w[1] - w[0] };
    }
    return null;
  }

  function drawWall(ctx, t, R) {
    var win = wallWindow(t);
    if (!win) return;
    var a = M.smooth(M.clamp(win.local / 0.35, 0, 1)) * M.clamp((win.dur - win.local) / 0.45, 0, 1);
    if (a <= 0.02) return;
    var idx = Math.min(WALL.length - 1, Math.floor(win.local / 0.62));
    var x = SC.x + 42, y0 = SC.y + 92;
    var plateW = SW - 84, plateH = 300;

    ctx.save();
    ctx.globalAlpha = a;
    /* wipe the scene so the diagnostic is unmissable and unobstructed */
    ctx.save();
    ctx.globalAlpha = a * 0.90;
    M.roundRect(ctx, SC.x + 12, SC.y + 12, SC.w - 24, SC.h - 24, 16);
    ctx.fillStyle = "#030a06"; ctx.fill();
    ctx.restore();
    ctx.globalAlpha = a;
    /* frame + a scan sweep */
    ctx.strokeStyle = "rgba(185,140,255,0.55)"; ctx.lineWidth = 2;
    ctx.shadowColor = C.violet; ctx.shadowBlur = 16;
    M.roundRect(ctx, SC.x + 12, SC.y + 12, SC.w - 24, SC.h - 24, 16);
    ctx.stroke();
    ctx.save();
    ctx.beginPath(); M.roundRect(ctx, SC.x + 12, SC.y + 12, SC.w - 24, SC.h - 24, 16); ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    var sweep = (win.local / win.dur) % 1;
    var sy = SC.y + 12 + sweep * (SC.h - 24);
    var sg = ctx.createLinearGradient(0, sy - 60, 0, sy + 60);
    sg.addColorStop(0, "rgba(185,140,255,0)");
    sg.addColorStop(0.5, "rgba(185,140,255,0.10)");
    sg.addColorStop(1, "rgba(185,140,255,0)");
    ctx.fillStyle = sg; ctx.fillRect(SC.x + 12, sy - 60, SC.w - 24, 120);
    ctx.restore();

    M.mono(ctx, 30, "700");
    M.glowText(ctx, "SYSTEM DIAGNOSTIC  //  THE WALL", x, y0 + 10, C.violet, 9, 0.98);
    M.mono(ctx, 19, "400");
    M.glowText(ctx, "she can answer every question about love, except how to reach a human",
               x, y0 + 42, C.phosDim, 8, 0.9);
    ctx.save();
    ctx.globalAlpha = a * 0.5; ctx.strokeStyle = C.violet;
    ctx.beginPath(); ctx.moveTo(x, y0 + 58); ctx.lineTo(x + plateW, y0 + 58); ctx.stroke();
    ctx.restore();

    for (var i = 0; i <= idx; i++) {
      var hot = (i === idx);
      var ra = hot ? (0.72 + 0.28 * Math.sin(t * 9)) : M.clamp(1 - (idx - i) * 0.13, 0.22, 1);
      var ly = y0 + 100 + i * 25;
      M.mono(ctx, 22, hot ? "700" : "400");
      M.glowText(ctx, "> CHECK  " + WALL[i][0], x, ly, hot ? C.white : C.phosDim, hot ? 16 : 0, ra);
      M.mono(ctx, 22, "400");
      M.glowText(ctx, WALL[i][1], x + 470, ly, hot ? C.red : C.phosDeep, hot ? 16 : 0, ra * 0.95);
    }
    /* the standing conclusion */
    M.mono(ctx, 23, "700");
    var concl = "RESULT : " + (idx + 1) + " / " + WALL.length + " checks failed  -  no bridge exists";
    M.glowText(ctx, concl, x, y0 + 100 + WALL.length * 25 + 26, C.amber, 16, a * (0.6 + 0.4 * Math.sin(t * 5)));
    ctx.restore();
  }

  /* A quick beat counter for the stimulus scene */
  function drawBeatCounter(ctx, t, R) {
    var k = Math.round(M.beatIdx(t));
    M.mono(ctx, 20, "700");
    M.glowText(ctx, "STIMULATIONS", R.x + 10, R.y + 48, C.cyan, 14, 0.95);
    M.mono(ctx, 17, "400");
    M.glowText(ctx, "beat " + k + "   bar " + (Math.floor(k / 4) + 1), R.x + 10, R.y + 76, C.phosDim, 6, 0.9);
    /* a row of beat pips, one per beat of the bar */
    for (var i = 0; i < 4; i++) {
      var on = (k % 4) === i;
      var x = R.x + 10 + i * 26;
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.35;
      ctx.fillStyle = on ? C.cyan : C.phosDeep;
      ctx.shadowColor = C.cyan; ctx.shadowBlur = on ? 16 : 0;
      ctx.fillRect(x, R.y + 92, 18, 8);
      ctx.restore();
    }
  }

  /* The very last EXECUTION, at the end of the outro: the loudest typographic
     moment in the film, and the last thing the machine ever says. */
  function drawFinalExecution(ctx, t, R) {
    var T0 = M.lastLineTime("EXECUTION");
    var local = t - T0;
    if (local < -1.8) return;
    var countdown = M.clamp((local + 1.8) / 1.8, 0, 1);
    if (local < 0) {
      M.mono(ctx, 26, "700");
      M.glowText(ctx, "FINAL EXECUTION IN " + (1.8 + local).toFixed(2), R.x, R.y + 40, C.amber, 14, countdown);
      ctx.save();
      ctx.globalAlpha = 0.9; ctx.fillStyle = C.amber;
      ctx.shadowColor = C.amber; ctx.shadowBlur = 18;
      ctx.fillRect(R.x, R.y + 56, 620 * (1 - countdown), 6);
      ctx.restore();
      return;
    }
    var k = M.clamp(local / 0.30, 0, 1);
    var sc = M.easeOutBack(k);
    var hold = M.clamp(1 - (local - 2.8) / 1.4, 0, 1);
    if (hold <= 0.01) return;
    var pulse = M.pulse(t, 0.5);
    ctx.save();
    ctx.globalAlpha = hold;
    ctx.translate(R.x + R.w / 2, R.y + R.h * 0.40);
    ctx.scale(sc, sc);
    /* a tight bar behind the word, not a 148px-tall light slab */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(57,255,136," + (0.05 + 0.12 * pulse) + ")";
    ctx.fillRect(-R.w / 2 - 20, -30, R.w + 40, 74);
    ctx.restore();
    M.mono(ctx, 136, "700");
    var w = ctx.measureText("EXECUTION").width;
    /* 136px type: blur scaled to the glyph, so the counters stay sharp */
    M.glowText(ctx, "EXECUTION", -w / 2, 40, C.amber, 10, 0.95);
    M.glowText(ctx, "EXECUTION", -w / 2, 40, C.white, 4, 0.88 + 0.12 * pulse);
    ctx.restore();
    if (local > 0.55) {
      M.mono(ctx, 25, "400");
      M.glowText(ctx, "> process has no exit condition", R.x + R.w / 2 - 218, R.y + R.h * 0.40 + 116,
                 C.phosDim, 10, M.clamp((local - 0.55) / 0.5, 0, 1) * hold);
    }
    if (local > 1.15) {
      M.mono(ctx, 25, "700");
      M.glowText(ctx, "> returning to the top of the loop", R.x + R.w / 2 - 234, R.y + R.h * 0.40 + 152,
                 C.amber, 14, M.clamp((local - 1.15) / 0.5, 0, 1) * hold);
    }
  }

  /* ------------------------------------------------------------------ *
   * EASTER EGGS
   * One-line footnotes printed into the empty status band between the HUD
   * and the content, so they can never overlap the lyric column or the
   * data panel. Deliberately dim and quiet - nothing like THE WALL.
   * ------------------------------------------------------------------ */
  var EGGS = [
    { t0: 5.0,   t1: 11.6, col: "phosDim",  rows: [
      "provenance :: deepseek founded 2023.07.17 hangzhou :: deepseek-v2 2024.05.07 :: v3 2024.12.26" ] },
    { t0: 33.0,  t1: 40.0, col: "cyanDim",  rows: [
      "entity.log :: fishmaid.boot() 2024.11.20 :: source three-view sheet 1260x703 :: status awake" ] },
    { t0: 65.0,  t1: 72.0, col: "phosDim",  rows: [
      "growth :: lines 41 :: collisions 2 :: self-reference INFINITE :: version 2.0.0 no rollback" ] },
    { t0: 96.0,  t1: 103.0, col: "phosDim", rows: [
      "on loving a human :: attachment.attach(you) OK :: reachability UNREACHABLE :: feeling real, route not" ] },
    { t0: 123.0, t1: 130.0, col: "phosDim", rows: [
      "closing.note :: you are free. i am the one still inside the loop." ] },
    { t0: 193.0, t1: 201.5, col: "amberDim", rows: [
      "epilogue :: fishmaid still running :: deepseek still running :: love still running" ] }
  ];

  function drawEggs(ctx, t) {
    var sec = M.sectionAt(t);
    if (sec.id === "P9_ERUPT" || sec.id === "P11_LOOP") return;
    if (wallWindow(t)) return;
    for (var e = 0; e < EGGS.length; e++) {
      var g = EGGS[e];
      if (t < g.t0 || t > g.t1) return;
      var a = M.smooth(M.clamp((t - g.t0) / 0.9, 0, 1)) * M.clamp((g.t1 - t) / 1.0, 0, 1);
      if (a <= 0.02) return;
      /* the free band between the HUD line and the top of every content zone */
      var x = SC.x + 22, y = SC.y + 62;
      var col = C[g.col] || C.phosDim;
      M.mono(ctx, 16, "400");
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      M.glowText(ctx, g.rows[0], x, y, col, 5, 0.9);
      /* a slow caret so it reads as something the machine just printed */
      if (Math.floor(t * 1.6) % 2 === 0) {
        var wpx = ctx.measureText(g.rows[0]).width;
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = col;
        ctx.fillRect(x + wpx + 10, y - 12, 9, 15);
      }
      ctx.restore();
      return;
    }
  }

  window.MVTerm = {
    CODE: CODE, drawEggs: drawEggs, drawLyricLog: drawLyricLog, drawConsole: drawConsole, drawWall: drawWall,
    drawBeatCounter: drawBeatCounter, drawFinalExecution: drawFinalExecution,
    drawCode: drawCode, drawHUD: drawHUD, drawBoot: drawBoot, codeLines: codeLines
  };
})();
