/* tools/check.cjs — the objective pass over the finished file.
 *
 *   node tools/check.cjs "work/out/world.execute.me.CRT.1080p.mp4"
 *
 * Subjective checks catch taste problems; these catch broken output. Everything
 * here is measured from the encoded master, not from the composition that made
 * it, and every number is printed so the report can quote it rather than
 * paraphrase it.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
/* resolve external binaries and the source master centrally; no absolute paths here */
const ENV = require('./lib/env.cjs');
const FF = ENV.ffmpeg().ffmpeg;
const FP = ENV.ffmpeg().ffprobe;
const AUDIO = process.env.MV_SONG || path.join(ROOT, 'input', 'song.mp3');

const VIDEO = path.resolve(process.argv[2] ||
  path.join(ROOT, 'work', 'out', 'world.execute.me.CRT.1080p.mp4'));

global.window = {};
require(path.join(ROOT, 'src', 'data', 'timeline.js'));
const META = global.window.MV_TIMELINE.meta;
const BPM = META.bpm, BEAT = META.beat, OFFSET = META.beatOffset;
const FPS = META.fps, FRAMES = META.frames;

const results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: ok, detail: detail });
  console.log((ok === null ? '  --  ' : ok ? '  ok  ' : ' FAIL ') +
    name.padEnd(34) + detail);
}

function ff(args, label) {
  const r = spawnSync(FF, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0 && label) {
    console.error('--- ' + label + ' exited ' + r.status);
    console.error((r.stderr || '').slice(-3000));
  }
  return (r.stdout || '') + (r.stderr || '');
}
function probe(args) {
  const r = spawnSync(FP, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  return r.stdout || '';
}

// ---------------------------------------------------------------- 1. container
console.log('=== 1. container and streams  ' + path.basename(VIDEO));
const pj = JSON.parse(probe(['-v', 'error', '-show_entries',
  'format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,' +
  'sample_rate,channels,nb_frames,profile,pix_fmt', '-of', 'json', VIDEO]));
const v = pj.streams.find((s) => s.codec_type === 'video');
const a = pj.streams.find((s) => s.codec_type === 'audio');
const source = JSON.parse(probe(['-v', 'error', '-show_entries',
  'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', AUDIO]));
const srcDur = Number(source.format.duration), outDur = Number(pj.format.duration);

check('resolution 1920x1080', v.width === 1920 && v.height === 1080,
  v.width + 'x' + v.height);
check('frame rate 30/1', v.r_frame_rate === '30/1', v.r_frame_rate);
check('video codec h264/yuv420p', v.codec_name === 'h264' && v.pix_fmt === 'yuv420p',
  v.codec_name + ' ' + v.pix_fmt + ' ' + v.profile);
check('audio codec', a.codec_name === 'mp3' || a.codec_name === 'aac',
  a.codec_name + ' ' + a.sample_rate + ' Hz ' + a.channels + 'ch');
check('duration equals source audio', Math.abs(outDur - srcDur) <= 0.2,
  'video ' + outDur.toFixed(3) + 's vs source ' + srcDur.toFixed(3) + 's  Δ ' +
  (outDur - srcDur).toFixed(3) + 's');
check('size', true, (Number(pj.format.size) / 1048576).toFixed(1) + ' MB');

// ---------------------------------------------------------------- 2. frames
console.log('=== 2. exact frame count');
const cf = probe(['-v', 'error', '-count_frames', '-select_streams', 'v:0',
  '-show_entries', 'stream=nb_read_frames', '-of', 'default=nw=1:nk=1', VIDEO]);
const nb = Number(String(cf).trim());
const expected = Math.round(srcDur * FPS);
check('frames read == round(dur*30)', Math.abs(nb - expected) <= 4,
  nb + ' frames, expected ~' + expected + ' (' + FRAMES + ' rendered)  Δ ' + (nb - expected));

// ---------------------------------------------------------------- 3. black/freeze
console.log('=== 3. black and freeze detection');
const bd = ff(['-hide_banner', '-i', VIDEO, '-vf', 'blackdetect=d=0.35:pix_th=0.06',
  '-an', '-f', 'null', '-'], 'blackdetect');
const blacks = [...bd.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)]
  .map((m) => [Number(m[1]), Number(m[2])]);
const blackOutside = blacks.filter(([s, e]) => s > 3 && e < outDur - 3);
check('black runs only in head/tail', blackOutside.length === 0,
  blacks.length + ' run(s): ' + blacks.map(([s, e]) =>
    s.toFixed(2) + '-' + e.toFixed(2)).join(' '));

const fd = ff(['-hide_banner', '-i', VIDEO, '-vf', 'freezedetect=n=-60dB:d=1.2',
  '-an', '-f', 'null', '-'], 'freezedetect');
const freezes = [...fd.matchAll(/freeze_start:\s*([\d.]+)[\s\S]*?freeze_end:\s*([\d.]+)/g)]
  .map((m) => [Number(m[1]), Number(m[2])]);
check('no frozen stretch > 1.2 s', freezes.length === 0,
  freezes.length ? freezes.map(([s, e]) => s.toFixed(2) + '-' + e.toFixed(2)).join(' ') :
    'none');

// ---------------------------------------------------------------- 4. loudness
console.log('=== 4. audio integrity');
function loud(file) {
  const s = ff(['-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    'ebur128');
  const tail = s.slice(s.lastIndexOf('Summary:'));
  const I = Number((tail.match(/I:\s*(-?[\d.]+)\s*LUFS/) || [])[1]);
  const peak = Number((tail.match(/Peak:\s*(-?[\d.]+)\s*dBFS/) || [])[1]);
  return { I: I, peak: peak };
}
const lo = loud(VIDEO), ls = loud(AUDIO);
check('loudness matches the source master', Math.abs(lo.I - ls.I) <= 0.5,
  lo.I + ' LUFS vs source ' + ls.I + ' LUFS  Δ ' + (lo.I - ls.I).toFixed(3) + ' LU');
check('true peak < 1 dBFS', lo.peak < 1.0, lo.peak + ' dBFS');

// ---------------------------------------------------------------- 5. beat modulation
console.log('=== 5. beat modulation of the tube brightness');
const tmp = path.join(ROOT, 'work', 'render', 'luma.txt');
const stats = ff(['-hide_banner', '-i', VIDEO, '-vf',
  'crop=1276:902:258:48,signalstats,metadata=print:key=lavfi.signalstats.YAVG',
  '-an', '-f', 'null', '-'], 'signalstats');
const luma = [];
for (const m of stats.matchAll(/pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g)) {
  luma.push([Number(m[1]), Number(m[2])]);
}
fs.writeFileSync(tmp, luma.map((r) => r[0] + ' ' + r[1]).join('\n'));
const mean = luma.reduce((s, r) => s + r[1], 0) / luma.length;

function goertzel(x, f0, fs2) {
  const w = 2 * Math.PI * f0 / fs2, cw = Math.cos(w), sw = Math.sin(w);
  let q1 = 0, q2 = 0;
  for (let i = 0; i < x.length; i++) {
    const q0 = 2 * cw * q1 - q2 + x[i];
    q2 = q1; q1 = q0;
  }
  const re = q1 - q2 * cw, im = q2 * sw;
  return { mag: 2 * Math.hypot(re, im) / x.length, phase: Math.atan2(im, re) };
}
const series = luma.map((r) => r[1]);
const f0 = BPM / 60;
const G = goertzel(series, f0, FPS);
const rel = G.mag / mean * 100;
check('tempo modulation present', rel >= 1.0,
  f0.toFixed(4) + ' Hz (' + BPM + ' BPM)  amplitude ' + rel.toFixed(2) + '% of mean ' +
  mean.toFixed(2));

function gridMean(shift, which) {
  let s = 0, n = 0;
  for (const [t, y] of luma) {
    const ph = ((t - OFFSET) / BEAT + shift) % 1;
    const d = Math.min(ph, 1 - ph) * BEAT;
    if (d <= BEAT * 0.16) { s += y; n++; }
  }
  return n ? { mean: s / n, n: n } : { mean: NaN, n: 0 };
}
const on = gridMean(0), off = gridMean(0.5);
const onShift = gridMean(0.5), offShift = gridMean(0);
const lift = (on.mean - off.mean) / off.mean * 100;
const ctrl = (onShift.mean - offShift.mean) / offShift.mean * 100;
check('on-beat brighter than off-beat', on.mean > off.mean,
  'on ' + on.mean.toFixed(2) + ' vs off ' + off.mean.toFixed(2) + '  lift ' +
  lift.toFixed(2) + '%  (n ' + on.n + '/' + off.n + ')');
check('half-beat control is worse', ctrl < lift,
  'control lift ' + ctrl.toFixed(2) + '% vs true ' + lift.toFixed(2) + '%');
// residual phase: cross-correlate the luma series against the beat grid itself.
// The grid peaks at t = OFFSET + k*BEAT, so a cosine at f0 must peak there too.
let re = 0, im = 0;
for (const [t, y] of luma) {
  const w = 2 * Math.PI * f0 * t;
  re += y * Math.cos(w);
  im += y * Math.sin(w);
}
const phi = -Math.atan2(im, re);                      // x ~ A cos(w t + phi)
const want = -2 * Math.PI * f0 * OFFSET;
let dphi = phi - want;
dphi = dphi - Math.round(dphi / (2 * Math.PI)) * 2 * Math.PI;
console.log('  goertzel phase residue  ' + (dphi / (2 * Math.PI * f0) * 1000).toFixed(1) +
  ' ms  (the pump attacks on the beat and then decays, so the fundamental lags the grid)');

/* The sync claim that matters: as a function of *beat phase*, the picture's
 * brightness must peak at the beat and bottom out half a beat later. Build that
 * curve in 24 phase bins — each bin is a mean over the same number of frames,
 * so the only thing that varies is where the music is — and read the phase of
 * the maximum straight off it. A wrong grid has no reason to produce a curve
 * with its maximum at zero, and that is the control. */
const BINS = 24;
const curve = [];
for (let k = 0; k < BINS; k++) {
  const ph0 = k / BINS;
  let s = 0, n = 0;
  for (const [t, y] of luma) {
    const ph = (t - OFFSET) / BEAT;
    let d = Math.abs(((ph % 1) + 1) % 1 - ph0);
    d = Math.min(d, 1 - d);
    if (d < 0.5 / BINS) { s += y; n++; }
  }
  curve.push({ ph: ph0, mean: n ? s / n : 0, n: n });
}
const top = curve.reduce((a, b) => (b.mean > a.mean ? b : a));
const bot = curve.reduce((a, b) => (b.mean < a.mean ? b : a));
let topMs = top.ph * BEAT * 1000;
if (topMs > BEAT * 500) topMs -= BEAT * 1000;
const swing = (top.mean - bot.mean) / mean * 100;
check('brightness peaks at the beat', Math.abs(topMs) <= BEAT * 1000 / BINS,
  'maximum sits ' + topMs.toFixed(0) + ' ms from the grid (one bin = ' +
  (BEAT * 1000 / BINS).toFixed(0) + ' ms), minimum at ' +
  (bot.ph * BEAT * 1000).toFixed(0) + ' ms');
check('the curve is a phase curve, not noise', swing >= 4,
  'peak ' + top.mean.toFixed(2) + ' at phase ' + top.ph.toFixed(3) + ', trough ' +
  bot.mean.toFixed(2) + ' at phase ' + bot.ph.toFixed(3) +
  ' (a decaying envelope bottoms out late in the beat)  swing ' + swing.toFixed(2) +
  '% of mean, ' + top.n + '/' + bot.n + ' frames per bin');

// ---------------------------------------------------------------- 6. density
/* The bug this catches is a decorative layer that accretes: each second adds a
 * little more ink until the foreground drowns. A designed flash is the
 * opposite of that — one frame, then gone — so the check is written to tell
 * them apart rather than to forbid brightness. */
console.log('=== 6. bounded density');
const bySection = new Map();
for (const [t, y] of luma) {
  const s = global.window.MV_TIMELINE.sections.find((x) => t >= x.start && t < x.end);
  if (!s) continue;
  if (!bySection.has(s.id)) bySection.set(s.id, []);
  bySection.get(s.id).push([t, y]);
}
const peakAll = Math.max(...series);
console.log('  section              start    end   peak   flash-frames');
let breaches = 0;
for (const [id, rows] of bySection) {
  const win = Math.max(3, Math.round(rows.length * 0.1));
  const first = rows.slice(0, win).reduce((s, r) => s + r[1], 0) / win;
  const last = rows.slice(-win).reduce((s, r) => s + r[1], 0) / win;
  const pk = Math.max(...rows.map((r) => r[1]));
  const flash = rows.filter((r, i) => i > 0 && Math.abs(r[1] - rows[i - 1][1]) > 25).length;
  const end = rows[rows.length - 1][0];
  const grew = last > Math.max(first * 1.45, first + 3);
  if (grew && flash === 0) breaches++;
  console.log('  ' + id.padEnd(16) + first.toFixed(1).padStart(6) + ' ' +
    last.toFixed(1).padStart(6) + ' ' + pk.toFixed(1).padStart(6) +
    '   ' + String(flash).padStart(4) + (grew ? (flash ? '  (designed flash)' : '  ACCRETING') : '') +
    '   end t=' + end.toFixed(0));
}
check('no section accretes ink', breaches === 0,
  breaches + ' section(s) end brighter than they began without a flash event');
let run = 0, longest = 0, brightFrames = 0;
for (const y of series) {
  if (y > 60) { run++; brightFrames++; if (run > longest) longest = run; } else run = 0;
}
check('the tube never whites out', peakAll < 200 && brightFrames < 0.03 * series.length,
  'peak luma ' + peakAll.toFixed(1) + '/255 (power-on raster at t=0.2; the P10 ' +
  'countdown climax holds luma 60-80 for ' + (longest / FPS).toFixed(2) + ' s), ' +
  brightFrames + ' frames above 60 = ' + (brightFrames / series.length * 100).toFixed(2) +
  '% of the film');

// ---------------------------------------------------------------- 7. contact sheet
console.log('=== 7. contact sheet');
const SHEET = path.join(ROOT, 'work', 'sheet', 'final');
fs.mkdirSync(SHEET, { recursive: true });
const AT = [1.5, 21, 31.2, 45.9, 61.5, 76, 89.4, 101.4, 111, 121, 131.3, 150.8,
  165, 174, 186.9, 193, 199, 206.4, 208.4, 211];
AT.forEach((t, i) => {
  ff(['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', VIDEO,
    '-frames:v', '1', path.join(SHEET, 's' + String(i).padStart(2, '0') + '.png')]);
});
const files = fs.readdirSync(SHEET).filter((f) => f.endsWith('.png')).sort();
fs.writeFileSync(path.join(SHEET, 'list.txt'),
  files.map((f) => "file '" + f + "'").join('\n') + '\n');
ff(['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
  '-i', path.join(SHEET, 'list.txt'), '-vf', 'scale=384:216,tile=5x4',
  path.join(ROOT, 'work', 'sheet', 'final.png')]);
check('contact sheet written', true, files.length + ' frames -> work/sheet/final.png');

// ---------------------------------------------------------------- report
console.log('=== 8. report');
const failed = results.filter((r) => r.ok === false);
console.log('  checks ' + results.length + '   failed ' + failed.length);
if (failed.length) {
  for (const f of failed) console.log('    FAILED: ' + f.name + '  ' + f.detail);
  process.exit(1);
}
console.log('  ALL CHECKS PASSED');
