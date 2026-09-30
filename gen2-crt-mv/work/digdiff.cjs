/* work/digdiff.cjs — per-frame PNG digest diff between two captures.
 *
 *   node work/digdiff.cjs work/render/benchA/digest.json work/render/benchC/digest.json
 *
 * Then, for every frame that changed, ask whether the timeline explains it:
 * the caption-hold fix may only touch [tOn - 0.06 s, tOn], and the reverse-block
 * fix only the first 0.13 s after a key line's onset.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'src', 'data', 'timeline.js'));
const T = global.window.MV_TIMELINE;

const [a, b] = process.argv.slice(2);
const A = JSON.parse(fs.readFileSync(path.join(ROOT, a), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(ROOT, b), 'utf8'));
const map = (d) => new Map(d.hashes.map((h) => h.split(' ').map((x, i) => i ? x : Number(x))));
const MA = map(A), MB = map(B);
const fps = A.fps;
const lines = T.lines;
const why = (f) => {
  const t = f / fps;
  const hold = lines.find((L) => L.text && L.text.trim() &&
    t >= L.tOn - 0.06 - 1e-9 && t <= L.tOn + 1e-9);
  if (hold) return 'caption hold  ' + JSON.stringify(hold.text);
  const flash = lines.find((L) => L.key && t >= L.tOn - 0.13 && t <= L.tOn + 0.13);
  if (flash) return 'key flash     ' + JSON.stringify(flash.text);
  return null;
};
let same = 0; const diff = [];
for (const [f, h] of MA) {
  if (!MB.has(f)) continue;
  if (MB.get(f) === h) same++;
  else diff.push(f);
}
console.log('frames ' + A.from + '..' + A.to + '  ' + MA.size + ' compared');
console.log('bit-identical: ' + same + '   changed: ' + diff.length);
const unexplained = [];
for (const f of diff) {
  const w = why(f);
  console.log('  f' + String(f).padStart(4) + '  t=' + (f / fps).toFixed(3) + '  ' +
    (w || 'NO KNOWN CAUSE'));
  if (!w) unexplained.push(f);
}
console.log('changed frames with no known cause: ' + unexplained.length);
console.log('digest A ' + A.sha1 + '   digest B ' + B.sha1);
