/* tools/render-all.cjs — the whole film, sharded, then welded back into one file.
 *
 *   node tools/render-all.cjs [--workers 6] [--out "world.execute(me).CRT.mp4"]
 *
 * Each shard is a separate browser process rendering a separate range of frames.
 * Nothing is shared between them but the source tree, which is exactly why the
 * per-shard digests exist: a shard that does not reproduce is not a style
 * difference, it is a bug, and the render stops before anything is published.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
/* resolve ffmpeg and the source master centrally; no absolute paths here */
const FF = require('./lib/env.cjs').ffmpeg().ffmpeg;
const AUDIO = process.env.MV_SONG || path.join(ROOT, 'input', 'song.mp3');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? def : process.argv[i + 1];
}

const WORKERS = Number(arg('workers', 6));
const OUT = path.resolve(arg('out', path.join(ROOT, 'work', 'out',
  'world.execute.me.CRT.1080p.mp4')));
const REND = path.join(ROOT, 'work', 'render');
const MUX_ONLY = process.argv.includes('--mux-only');

global.window = {};
require(path.join(ROOT, 'src', 'data', 'timeline.js'));
const T = global.window.MV_TIMELINE;
const FRAMES = T.meta.frames;
const FPS = T.meta.fps;
// The mp3 is 211.931995 s, the picture is 211.933333 s. `-shortest` resolves to
// the audio and silently drops frame 6357; the output is cut at the picture's
// own end instead, a hair past the last frame's timestamp.
const VID_END = (FRAMES / FPS + 0.0005).toFixed(5);

function shard(i) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath,
      [path.join(ROOT, 'tools', 'render-chunk.cjs'), '--chunk', String(i),
        '--of', String(WORKERS)],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      const line = out.trim().split('\n').filter((l) => l.startsWith('chunk ')).pop() || '';
      res({ i: i, code: code, line: line });
    });
    p.on('error', rej);
  });
}

function run(cmd, args, label) {
  const r = require('child_process').spawnSync(cmd, args,
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('--- ' + label + ' failed');
    console.error((r.stderr || '').slice(-4000));
    process.exit(1);
  }
}

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const t0 = Date.now();
  // A shard is written in place, so concatting while a render is running reads a
  // half-written .ts and silently publishes a short film. The marker makes that
  // state visible instead.
  const BUSY = path.join(REND, '.rendering');
  if (MUX_ONLY && fs.existsSync(BUSY)) {
    console.error('refusing to mux: ' + BUSY + ' exists (a render is in flight)');
    process.exit(1);
  }
  if (!MUX_ONLY) fs.writeFileSync(BUSY, String(process.pid));
  try {
    if (!MUX_ONLY) {
      console.log('rendering ' + FRAMES + ' frames on ' + WORKERS + ' workers');

      const rs = await Promise.all(Array.from({ length: WORKERS }, (_, i) => shard(i)));
      let bad = 0;
      for (const r of rs) { console.log('  ' + r.line); if (r.code !== 0) bad++; }
      if (bad) { console.error(bad + ' shard(s) failed'); process.exit(1); }
      console.log('all shards done in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
    } else {
      console.log('mux only: reusing the shards in work/render');
    }

    // --- concat: every segment is already CFR 30, closed-GOP and independent
    const list = path.join(REND, 'concat.txt');
    fs.writeFileSync(list, Array.from({ length: WORKERS },
      (_, i) => "file 'c" + String(i).padStart(2, '0') + ".ts'").join('\n') + '\n');
    const video = path.join(REND, 'video.ts');
    run(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
      '-c', 'copy', '-f', 'mpegts', video], 'concat');

  // --- mux: the picture is copied, never re-encoded; the mp3 goes in untouched
  run(FF, ['-y', '-loglevel', 'error', '-i', video, '-i', AUDIO,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'copy', '-t', VID_END,
    '-movflags', '+faststart', OUT], 'mux');

  // --- and a second container with AAC, for players that refuse mp3-in-mp4
  const compat = OUT.replace(/\.mp4$/, '.aac.mp4');
  run(FF, ['-y', '-loglevel', 'error', '-i', video, '-i', AUDIO,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-t', VID_END,
    '-movflags', '+faststart', compat], 'mux-aac');

  const h = crypto.createHash('sha1');
  h.update(fs.readFileSync(video));
  console.log('video.ts sha1 ' + h.digest('hex'));
  for (const f of [OUT, compat]) {
    console.log('  ' + path.relative(ROOT, f) + '  ' +
      (fs.statSync(f).size / 1048576).toFixed(1) + ' MB');
  }
  } finally {
    fs.rmSync(BUSY, { force: true });
  }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
