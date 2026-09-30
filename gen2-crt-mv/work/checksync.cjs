/* work/checksync.cjs — verify every work/pNN.txt patch is byte-identical to the
 * corresponding act body in src/scenes.js (so the patches are still a faithful
 * source for a future re-splice).
 *   node work/checksync.cjs          report only
 *   node work/checksync.cjs --write  also rewrite the out-of-sync patches from
 *                                    scenes.js (the live, shot-verified code) */
const fs = require('fs');
const P = require('path');
const root = P.resolve(__dirname, '..');
const WRITE = process.argv.indexOf('--write') >= 0;
const src = fs.readFileSync(P.join(root, 'src', 'scenes.js'), 'utf8').split('\n');
const HEAD = /\/\/ =+ [A-Za-z]/;

const patches = fs.readdirSync(P.join(root, 'work'))
  .filter(function (f) { return /^p\d\d\.txt$/.test(f); }).sort();

let bad = 0;
patches.forEach(function (f) {
  const nn = f.slice(1, 3);
  const body = fs.readFileSync(P.join(root, 'work', f), 'utf8').replace(/\s+$/, '').split('\n');
  let h0 = -1;
  for (let i = 0; i < src.length; i++) {
    if (/\/\/ =+ P\d\d /.test(src[i]) && src[i].indexOf('P' + nn + ' ') >= 0) { h0 = i; break; }
  }
  if (h0 < 0) { console.log('MISS  p' + nn + ': header not found'); bad++; return; }
  if (src[h0 + 1].indexOf('function P') < 0) {
    console.log('MISS  p' + nn + ': header not followed by function (' + JSON.stringify(src[h0 + 1]) + ')');
    bad++; return;
  }
  let h1 = -1;
  for (let i = h0 + 2; i < src.length; i++) { if (HEAD.test(src[i])) { h1 = i; break; } }
  if (h1 < 0) { console.log('MISS  p' + nn + ': next header not found'); bad++; return; }
  const live = src.slice(h0 + 2, h1 - 1);
  const same = live.length === body.length &&
    live.every(function (l, i) { return l === body[i]; });
  if (same) {
    console.log('OK    p' + nn + '  ' + live.length + ' lines  (scenes.js ' +
      (h0 + 3) + '..' + (h1 - 1) + ')');
  } else {
    bad++;
    let d = -1;
    for (let i = 0; i < Math.max(live.length, body.length); i++) {
      if (live[i] !== body[i]) { d = i; break; }
    }
    console.log('DIFF  p' + nn + '  live ' + live.length + ' lines, patch ' + body.length +
      ' lines; first difference at body line ' + (d + 1));
    console.log('      scenes.js: ' + JSON.stringify((live[d] || '').slice(0, 110)));
    console.log('      patch    : ' + JSON.stringify((body[d] || '').slice(0, 110)));
    if (WRITE) {
      fs.writeFileSync(P.join(root, 'work', f), live.join('\n') + '\n');
      console.log('      -> rewrote work/' + f + ' from scenes.js');
    }
  }
});
console.log(bad ? ('\n' + bad + ' of ' + patches.length + ' patches OUT OF SYNC') :
  ('\nall ' + patches.length + ' patches in sync with src/scenes.js'));
