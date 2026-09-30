/* mv-images.js — character art + manim sprite sheets */
(function () {
  "use strict";
  var BASE = "assets/character/tinted/";
  var TINTS = ["green", "cyan", "amber", "white"];
  var KINDS = ["bust", "front"];
  var IMG = {};
  var pending = 0, failed = [];

  function load(src, onok) {
    var im = new Image();
    pending++;
    im.onload = function () { pending--; if (onok) onok(im); check(); };
    im.onerror = function () { pending--; failed.push(src); check(); };
    im.src = src;
    return im;
  }
  function check() {
    if (pending === 0) {
      window.MV_IMG = IMG;
      window.MV_IMG_FAILED = failed;
      window.__imagesReady = true;
      if (failed.length) console.error("IMAGE LOAD FAILED: " + failed.join(", "));
    }
  }

  /* the CRT eyes, produced from the reference sheet with the image-to-css-art skill */
  IMG.eye_left = load("assets/character/eye_left.png");
  IMG.eye_right = load("assets/character/eye_right.png");

  for (var k = 0; k < KINDS.length; k++) {
    IMG[KINDS[k]] = {};
    for (var t = 0; t < TINTS.length; t++) {
      (function (kind, tint) {
        IMG[kind][tint] = load(BASE + "fishmaid_" + kind + "_" + tint + ".png");
      })(KINDS[k], TINTS[t]);
    }
  }

  /* ---- Manim sprite sheets ---------------------------------------- */
  var SHEETS = {};
  var S = {};
  for (var name in window.MV_SHEET_META) {
    (function (nm) {
      load("assets/math/sheets/" + nm + ".png", function (im) { SHEETS[nm] = im; });
    })(name);
  }
  /* topFrac: draw only the top fraction of the cell, so text baked into a
     rendered sheet can be dropped and replaced with crisp canvas text */
  function drawSheet(ctx, name, frame, R, alpha, topFrac) {
    var m = window.MV_SHEET_META[name], img = SHEETS[name];
    if (!m || !img || !img.width) return false;
    var n = m.frames;
    frame = ((Math.floor(frame) % n) + n) % n;
    var col = frame % m.cols, row = Math.floor(frame / m.cols);
    var tf = topFrac === undefined ? 1 : topFrac;
    var sx = col * m.cellW, sy = row * m.cellH;
    var sw = m.cellW, sh = m.cellH * tf;
    var boxW = R.w, boxH = R.h * tf;
    var sc = Math.min(boxW / sw, boxH / sh);
    var dw = sw * sc, dh = sh * sc;
    var dx = R.x + R.w / 2 - dw / 2, dy = R.y + R.h * tf / 2 - dh / 2;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (alpha === undefined ? 1 : alpha) * 0.45;
    ctx.drawImage(img, sx, sy, sw, sh, dx - 3, dy - 2, dw, dh);
    ctx.drawImage(img, sx, sy, sw, sh, dx + 3, dy + 2, dw, dh);
    ctx.restore();
    return true;
  }
  window.MVSheets = { draw: drawSheet, ready: function () { return Object.keys(SHEETS).length === Object.keys(window.MV_SHEET_META).length; } };

  window.MV_IMG = IMG;
  if (pending === 0) window.__imagesReady = true;
})();
