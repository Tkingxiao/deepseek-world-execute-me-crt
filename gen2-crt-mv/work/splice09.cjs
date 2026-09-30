const fs = require('fs');
const P = require('path');
const root = P.resolve(__dirname, '..');
const srcPath = P.join(root, 'src', 'scenes.js');
const src = fs.readFileSync(srcPath, 'utf8').split('\n');

const h9 = src.findIndex(function (l) { return l.indexOf('P09 ERROR') >= 0; });
const h10 = src.findIndex(function (l) { return l.indexOf('P10 COUNTDOWN') >= 0; });
if (h9 < 0 || h10 < 0) throw new Error('headers not found');
const i0 = h9 + 2;                       // first body line (0-based)
const i1 = h10 - 2;                      // closing brace of P09 (0-based)
if (src[h9 + 1].indexOf('function P09') < 0) throw new Error('i0 head: ' + src[h9 + 1]);
if (src[i1].trim() !== '}') throw new Error('i1 tail: ' + JSON.stringify(src[i1]));

const add = fs.readFileSync(P.join(root, 'work', 'p09.txt'), 'utf8').replace(/\s+$/, '').split('\n');
const out = src.slice(0, i0).concat(add).concat(src.slice(i1 + 1));
fs.writeFileSync(srcPath, out.join('\n'));
console.log('replaced lines ' + (i0 + 1) + '..' + (i1 + 1) + ' (' + (i1 - i0 + 1) + ' lines) with ' + add.length);

const body = fs.readFileSync(srcPath, 'utf8');
try {
  new (require('vm').Script)(body);
  console.log('syntax OK');
} catch (e) {
  console.log('SYNTAX ERROR: ' + e.message);
  process.exit(1);
}
