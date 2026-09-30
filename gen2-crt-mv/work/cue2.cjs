/* Replays every MV.cue() / MV.since() call site in src/scenes.js through the
 * same resolution rule the page now uses, and prints what each one lands on.
 * Flags keys that match nothing, and keys that appear more than once with
 * different resolved times (the chorus). */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
global.window = {};
require(path.join(root, 'src/data/timeline.js'));
const lines = window.MV_TIMELINE.lines.filter(L => L.text);

function cue(key, from) {
  const t0 = from || 0;
  for (const L of lines) if (L.tOn >= t0 && L.text.indexOf(key) === 0) return L.tOn;
  return null;
}

const src = fs.readFileSync(path.join(root, 'src/scenes.js'), 'utf8');
const re = /MV\.(cue|since)\(\s*(?:t\s*,\s*)?(['"])((?:(?!\2).)*)\2\s*(?:,\s*([0-9.]+)\s*)?\)/g;
const rows = [];
let m;
while ((m = re.exec(src))) {
  const ln = src.slice(0, m.index).split('\n').length;
  const key = m[3], from = m[4] ? parseFloat(m[4]) : 0;
  const t = cue(key, from);
  rows.push({ ln, key, from, t, comment: m[0] });
}

const seen = new Map();
let none = 0;
console.log('line  key'.padEnd(46) + 'from    resolves');
for (const r of rows) {
  const tag = r.t === null ? '  *** NO MATCH ***' : '';
  if (r.t === null) none++;
  const k = r.key + (r.from ? ' @' + r.from : '');
  if (seen.has(k) && seen.get(k) !== r.t) console.log('  !! same key, different times: ' + k + '  ' + seen.get(k) + ' vs ' + r.t);
  if (!seen.has(k)) seen.set(k, r.t);
  console.log(String(r.ln).padStart(4) + '  ' + JSON.stringify(r.key).padEnd(42) +
    (r.from ? String(r.from).padStart(5) : '     ') + '  ' +
    (r.t === null ? 'null' : r.t.toFixed(3)) + tag);
}
console.log('\ncall sites: ' + rows.length + ', distinct keys: ' + seen.size + ', unmatched: ' + none);
