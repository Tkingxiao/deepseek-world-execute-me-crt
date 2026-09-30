/* For every lyric line: when does the English reveal finish, and does it finish
 * before the line leaves? Same arithmetic the page runs. */
const path = require('path');
const root = path.resolve(__dirname, '..');
global.window = {};
require(path.join(root, 'src/data/timeline.js'));
const T = window.MV_TIMELINE;
const BEAT = T.meta.beat;

function typed(L, t) {
  const n = L.text.length;
  if (t <= L.tOn) return 0;
  const stepT = BEAT * 0.5;
  const room = Math.max(1, Math.floor((L.dur * 0.92) / stepT));
  const per = Math.max(1, Math.round(L.cps * stepT), Math.ceil(n / room));
  const steps = Math.ceil(n / per);
  const k = Math.floor((t - L.tOn) / stepT) + 1;
  return Math.min(Math.min(k, steps) * per, n);
}
function typedOld(L, t) {
  const n = L.text.length;
  if (t <= L.tOn) return 0;
  const stepT = BEAT * 0.5;
  const per = Math.max(1, Math.round(L.cps * stepT));
  const steps = Math.ceil(n / per);
  const k = Math.floor((t - L.tOn) / stepT) + 1;
  const minK = Math.ceil(n / per);
  const kk = Math.min(k, Math.max(minK, steps + 2));
  return Math.min(kk * per, n);
}

let overEn = 0, overOld = 0, overZh = 0;
const worst = [];
const durs = [];
for (const L of T.lines) {
  if (!L.text) continue;
  durs.push(L.dur);
  const end = L.tOn + L.dur;
  // first t at which the full text is on screen
  let done = null;
  for (let t = L.tOn + 0.01; t <= L.tOn + L.dur + 1.5; t += 0.005) {
    if (typed(L, t) >= L.text.length) { done = t; break; }
  }
  let doneOld = null;
  for (let t = L.tOn + 0.01; t <= L.tOn + L.dur + 1.5; t += 0.005) {
    if (typedOld(L, t) >= L.text.length) { doneOld = t; break; }
  }
  if (done === null || done > end - 0.02) { overEn++; worst.push(['EN', L.text, L.dur, done && (done - end)]); }
  if (doneOld === null || doneOld > end - 0.02) overOld++;
  // chinese
  const n = L.gloss ? L.gloss.length : 0;
  if (n) {
    const delay = Math.max(L.dur * 0.30, 0.16);
    const steps = Math.min(6, Math.max(1, Math.floor((L.dur * 0.85 - delay) / BEAT)));
    const per = Math.max(1, Math.ceil(n / steps));
    const k = Math.floor((end - delay - L.tOn) / BEAT) + 1;
    if (Math.min(k * per, n) < n) overZh++;
  }
}
durs.sort((a, b) => a - b);
console.log('lines: ' + durs.length);
console.log('median dur ' + durs[durs.length >> 1].toFixed(3) + 's   min ' + durs[0].toFixed(3) +
  's   max ' + durs[durs.length - 1].toFixed(3) + 's');
console.log('english unfinished at line end:  before ' + overOld + '   now ' + overEn);
console.log('chinese unfinished at line end:  ' + overZh);
if (worst.length) { console.log('still over:'); for (const w of worst) console.log('   ' + w.join('  ')); }
