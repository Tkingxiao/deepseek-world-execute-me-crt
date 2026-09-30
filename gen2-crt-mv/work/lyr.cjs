/* work/lyr.cjs — print the lyric lines in a time window, with the Chinese
 * gloss, so an act can be written against what is actually being sung.
 *
 *   node work/lyr.cjs 162.6 177.3
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'src', 'data', 'timeline.js'));
const T = global.window.MV_TIMELINE;
const a = Number(process.argv[2] || 0);
const b = Number(process.argv[3] || T.meta.duration);
for (const L of T.lines) {
  if (L.t >= a && L.t <= b) {
    console.log(L.t.toFixed(3).padStart(8) + '  ' + (L.text || '').padEnd(42) +
      (L.tr ? '| ' + L.tr : ''));
  }
}
console.log('--- ' + T.lines.filter((L) => L.t >= a && L.t <= b).length + ' lines between ' + a + ' and ' + b);
