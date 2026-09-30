/* Every lyric line whose first 24 chars repeat, and every MV.cue key in
 * scenes.js that lands on a repeated line. Ambiguous keys are the ones the
 * first-occurrence lookup silently mis-resolves. */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
global.window = {};
require(path.join(root, 'src/data/timeline.js'));
const T = window.MV_TIMELINE;

const byPrefix = new Map();
for (const L of T.lines) {
  if (!L.text) continue;
  const k = L.text.slice(0, 24);
  if (!byPrefix.has(k)) byPrefix.set(k, []);
  byPrefix.get(k).push(L);
}

const dup = [...byPrefix.entries()].filter(e => e[1].length > 1);
console.log('=== lyric lines sharing a 24-char prefix: ' + dup.length + ' ===');
for (const [k, ls] of dup) {
  console.log(k.replace(/\n/g, '\\n'));
  for (const L of ls) console.log('    ' + L.tOn.toFixed(3) + '  ' + L.section);
}

const src = fs.readFileSync(path.join(root, 'src/scenes.js'), 'utf8');
const keys = new Set();
const re = /MV\.(?:cue|since)\((?:t\s*,\s*)?(['"])((?:(?!\1).)*)\1/g;
let m;
while ((m = re.exec(src))) keys.add(m[2]);

console.log('\n=== MV.cue keys that resolve onto a repeated line ===');
let bad = 0;
for (const key of keys) {
  const hk = key.length <= 24 ? key : key.slice(0, 24);
  const hits = [...byPrefix.entries()].filter(([k]) => k.startsWith(hk));
  const all = hits.flatMap(([, ls]) => ls);
  if (all.length > 1) {
    bad++;
    console.log(JSON.stringify(key) + '  ->  resolves ' + all[0].tOn.toFixed(3) +
      '   but also exists at ' + all.slice(1).map(L => L.tOn.toFixed(3)).join(', '));
  }
}
if (!bad) console.log('(none)');
console.log('\nkeys audited: ' + keys.size + ', ambiguous: ' + bad);
