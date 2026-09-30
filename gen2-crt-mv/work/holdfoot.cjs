/* work/holdfoot.cjs — measure the footprint of the caption-hold fix across the film.
 *
 * Captures six 24-frame windows around line onsets in different acts twice:
 * once with the two lines reverted to their pre-fix form, once with the fix in
 * place. Every frame that differs must fall inside [tOn - 0.06 s, tOn] of some
 * line; every frame outside must be bit-identical.
 *
 *   node work/holdfoot.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const UI = path.join(ROOT, 'src', 'ui.js');
const SRC = fs.readFileSync(UI, 'utf8');
const A = 'if (t >= L[i].tOn) best = i; else break;';
const B = 'if (t < L.tOn) return 0;';
const A0 = 'if (t >= L[i].tOn - 0.06) best = i; else break;';
const B0 = 'if (t <= L.tOn) return 0;';
if (SRC.split(A).length !== 2 || SRC.split(B).length !== 2) {
  console.error('anchors not found — source has moved'); process.exit(1);
}
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const before = sha(SRC);

global.window = {};
require(path.join(ROOT, 'src', 'data', 'timeline.js'));
const T = global.window.MV_TIMELINE;
const fps = T.meta.fps;
const src = T.lines.filter((L) => L.text && L.text.trim());
const WIN = [3, 30, 55, 80, 100, 112].map((i) => {
  const f = Math.floor(src[i].tOn * fps);
  return { line: src[i], from: f - 10, to: f + 13 };
});

const run = (tag, code, w, k) => {
  fs.writeFileSync(UI, code);
  const out = path.join(ROOT, 'work', 'render', 'hold' + tag + k);
  execFileSync(process.execPath,
    [path.join(ROOT, 'tools', 'capture-frames.cjs'), '--from', String(w.from),
      '--to', String(w.to), '--out', out, '--digest', path.join(out, 'digest.json'),
      '--quiet'], { stdio: 'inherit' });
  return JSON.parse(fs.readFileSync(path.join(out, 'digest.json'), 'utf8'));
};

const oldCode = SRC.replace(A, A0).replace(B, B0);
let out;
try {
  out = WIN.map((w, k) => ({ w: w, a: run('old', oldCode, w, k), b: run('new', SRC, w, k) }));
} finally {
  fs.writeFileSync(UI, SRC);
}
if (sha(fs.readFileSync(UI, 'utf8')) !== before) { console.error('SOURCE NOT RESTORED'); process.exit(2); }
console.log('src/ui.js restored, sha1 ' + before);

const why = (f) => {
  const t = f / fps;
  const hold = src.find((L) => t >= L.tOn - 0.06 - 1e-9 && t <= L.tOn + 1e-9);
  return hold ? JSON.stringify(hold.text) : null;
};
let same = 0, moved = 0, loose = 0;
for (const o of out) {
  const ma = new Map(o.a.hashes.map((h) => h.split(' ').map((x, i) => i ? x : Number(x))));
  const mb = new Map(o.b.hashes.map((h) => h.split(' ').map((x, i) => i ? x : Number(x))));
  const diff = [];
  for (const [f, h] of ma) if (mb.get(f) !== h) diff.push(f);
  same += ma.size - diff.length; moved += diff.length;
  for (const f of diff) if (!why(f)) loose++;
  console.log('window f' + o.w.from + '..' + o.w.to + '  t=' + (o.w.from / fps).toFixed(1) +
    '  line ' + JSON.stringify(o.w.line.text).slice(0, 32).padEnd(34) +
    '  changed ' + diff.length + '/' + ma.size +
    (diff.length ? '  f' + diff.join(',f') : ''));
}
console.log('all windows: ' + same + ' frames bit-identical, ' + moved + ' changed, ' +
  loose + ' changed frame(s) with no line onset to explain them');
