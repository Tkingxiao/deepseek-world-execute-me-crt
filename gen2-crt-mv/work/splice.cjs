/* work/splice.cjs — replace one act's body in src/scenes.js from a patch file.
 *   node work/splice.cjs p10.txt P10_COUNTDOWN P11_FINAL
 * The act runs from the line after the `// === NAME` header (which must be the
 * `function PNN(...)` line) up to the closing `}` two lines above the next
 * header. Prints the new syntax status. */
const fs = require('fs');
const P = require('path');
const root = P.resolve(__dirname, '..');
const file = process.argv[2];
const here = process.argv[3];
const next = process.argv[4];
if (!file || !here || !next) {
  console.log('usage: node work/splice.cjs <patch.txt> <THIS_HEADER> <NEXT_HEADER>');
  process.exit(1);
}
const srcPath = P.join(root, 'src', 'scenes.js');
const src = fs.readFileSync(srcPath, 'utf8').split('\n');
const find = function (k, from) {
  for (let i = from; i < src.length; i++) if (src[i].indexOf(k) >= 0) return i;
  return -1;
};
const h0 = find(here, 0);
const h1 = find(next, h0 + 1);
if (h0 < 0 || h1 < 0) throw new Error('headers not found: ' + h0 + ' ' + h1);
const i0 = h0 + 2;
const i1 = h1 - 2;
if (src[h0 + 1].indexOf('function P') < 0) throw new Error('head: ' + src[h0 + 1]);
if (src[i1].trim() !== '}') throw new Error('tail: ' + JSON.stringify(src[i1]));
const add = fs.readFileSync(P.join(root, 'work', file), 'utf8').replace(/\s+$/, '').split('\n');
const out = src.slice(0, i0).concat(add).concat(src.slice(i1 + 1));
fs.writeFileSync(srcPath, out.join('\n'));
console.log('replaced ' + (i0 + 1) + '..' + (i1 + 1) + ' (' + (i1 - i0 + 1) +
  ' lines) with ' + add.length + ' from work/' + file);
try {
  new (require('vm').Script)(fs.readFileSync(srcPath, 'utf8'));
  console.log('syntax OK');
} catch (e) {
  console.log('SYNTAX ERROR: ' + e.message);
  process.exit(1);
}
