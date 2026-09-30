/* tools/render-chunk.cjs — one shard of the master render.
 *
 *   node tools/render-chunk.cjs --chunk 3 --of 8
 *
 * Captures its own contiguous range of frames (tools/capture-frames.cjs), encodes
 * them to an MPEG-TS segment, then deletes the PNG sequence to keep the disk
 * bounded. Shards are independent because every frame is a pure function of its
 * own virtual time, and the digest each shard writes is what proves it.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
/* resolve ffmpeg centrally; no absolute paths here */
const FF = require('./lib/env.cjs').ffmpeg().ffmpeg;

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? def : process.argv[i + 1];
}

const CHUNK = Number(arg('chunk', 0));
const OF = Number(arg('of', 1));
const KEEP = process.argv.includes('--keep-png');

// frame count comes from the same frozen timeline the film itself reads
global.window = {};
require(path.join(ROOT, 'src', 'data', 'timeline.js'));
const T = global.window.MV_TIMELINE;
const FPS = T.meta.fps, FRAMES = T.meta.frames;

const FROM = Math.floor(CHUNK * FRAMES / OF);
const TO = Math.floor((CHUNK + 1) * FRAMES / OF) - 1;

const DIR = path.join(ROOT, 'work', 'render', 'c' + String(CHUNK).padStart(2, '0'));
const TS = path.join(ROOT, 'work', 'render', 'c' + String(CHUNK).padStart(2, '0') + '.ts');

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('--- ' + label + ' failed (status ' + r.status + ')');
    console.error((r.stdout || '').slice(-2000));
    console.error((r.stderr || '').slice(-4000));
    process.exit(1);
  }
  return r;
}

console.log('chunk ' + CHUNK + '/' + OF + '  frames ' + FROM + '..' + TO + '  (' +
  (TO - FROM + 1) + ')');

// --- 1. frames
run(process.execPath, [path.join(ROOT, 'tools', 'capture-frames.cjs'),
  '--from', String(FROM), '--to', String(TO), '--out', DIR, '--fps', String(FPS),
  '--quiet'], 'capture');

// --- 2. frames -> an independently decodable mpeg-ts segment
//   closed gop every 2 s, no scene-cut keyframes: the concat must be exact
run(FF, ['-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-start_number', String(FROM),
  '-i', path.join(DIR, 'f%06d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'grain',
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
  '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
  '-threads', '3',
  '-f', 'mpegts', TS], 'encode');

// --- 3. the pixels are now in the segment; the PNG sequence has done its job
const dg = JSON.parse(fs.readFileSync(path.join(DIR, 'digest.json'), 'utf8'));
if (!KEEP) fs.rmSync(DIR, { recursive: true, force: true });

const sizeMb = (fs.statSync(TS).size / 1048576).toFixed(1);
console.log('chunk ' + CHUNK + ' done  ' + (TO - FROM + 1) + ' frames  ' + sizeMb + ' MB  ' +
  'sha1 ' + dg.sha1.slice(0, 12) + '  ' + dg.wallSec + 's capture');
