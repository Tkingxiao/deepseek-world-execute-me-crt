/* work/psnr-scan.cjs — where exactly did the caption-hold fix change the master?
 *
 * Diffs the previous master against the new one frame by frame (work/psnr.txt,
 * written by ffmpeg's psnr filter) and checks every changed frame against the
 * line onsets from the timeline. If the fix is surgical, every changed frame
 * must sit inside [tOn - 0.06 s, tOn + 0.00 s] of some line — the deck's old
 * lead window — and nothing else in the film may move.
 *
 *   node work/psnr-scan.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'src', 'data', 'timeline.js'));
const T = global.window.MV_TIMELINE;
const FPS = T.meta.fps;

const onsets = T.lines.filter((L) => L.text && L.text.trim()).map((L) => L.tOn);
const txt = fs.readFileSync(path.join(ROOT, 'work', 'psnr.txt'), 'utf8');
const frames = [];
for (const line of txt.split('\n')) {
  if (!line.trim()) continue;
  const n = Number((line.match(/^n:(\d+)/) || [])[1]);
  const p = /psnr_avg:([\d.a-z]+)/.exec(line);
  if (n === undefined || !p) continue;
  frames.push({ n: n, psnr: p[1] === 'inf' ? Infinity : Number(p[1]) });
}
console.log('frames compared ' + frames.length);
const moved = frames.filter((f) => f.psnr < 60);
console.log('frames that moved (psnr_avg < 60 dB): ' + moved.length +
  '  (' + (100 * moved.length / frames.length).toFixed(1) + ' % of the film)');
const strong = frames.filter((f) => f.psnr < 40);
console.log('frames changed hard (psnr_avg < 40 dB): ' + strong.length);

/* cluster the moved frames into runs */
const runs = [];
for (const f of moved) {
  const last = runs[runs.length - 1];
  if (last && f.n === last.to + 1) { last.to = f.n; last.min = Math.min(last.min, f.psnr); }
  else runs.push({ from: f.n, to: f.n, min: f.psnr });
}
console.log('runs of changed frames: ' + runs.length +
  '  longest ' + Math.max.apply(null, runs.map((r) => r.to - r.from + 1)) + ' frame(s)');

/* every changed frame must be inside an old lead window [tOn-0.06, tOn] */
const near = (f) => onsets.some((o) => {
  const t = f / FPS;
  return t >= o - 0.06 - 1e-9 && t <= o + 1e-9;
});
const outside = moved.filter((f) => !near(f));
console.log('changed frames OUTSIDE every [tOn − 0.06 s, tOn] window: ' + outside.length);
for (const f of outside.slice(0, 10)) {
  console.log('   f=' + f.n + '  t=' + (f.n / FPS).toFixed(3) + '  psnr ' + f.psnr.toFixed(1));
}
const widest = runs.slice().sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
console.log('widest run  f' + widest.from + '..' + widest.to + '  t=' +
  (widest.from / FPS).toFixed(2) + '..' + ((widest.to + 1) / FPS).toFixed(2) + '  min ' +
  widest.min.toFixed(1) + ' dB');
console.log('untouched frames (psnr_avg = inf, bit-identical decode): ' +
  frames.filter((f) => f.psnr === Infinity).length + ' / ' + frames.length);
