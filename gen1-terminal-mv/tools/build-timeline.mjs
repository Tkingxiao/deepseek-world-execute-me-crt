
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

/* Bring your own lyrics: point MV_LRC at any [mm:ss.xx] LRC file, or drop one at
   input/lyrics.lrc. No lyrics are redistributed with this repository. */
const LRC_PATH = process.env.MV_LRC || path.join(ROOT, "input", "lyrics.lrc");
const FPS = 30;
const BPM = 130;
const BEAT_OFFSET = 0.1535;          // measured, see build/analysis.json
const BEAT = 60 / BPM;               // 0.4615384615
const BAR = BEAT * 4;                // 1.8461538462
const DURATION = 211.9667;           // audio 211.9325s + 0.034 tail
const FRAMES = Math.round(DURATION * FPS);
const SNAP_TOL = 0.120;              // snap a lyric onset onto a beat when within 120 ms

// ---------- parse LRC ----------
const raw = fs.readFileSync(LRC_PATH, "utf8").split(/\r?\n/);
const lyricRe = /^\[(\d+):(\d+\.\d+)\](.*)$/;
const lines = [];
for (const r of raw) {
  const m = r.match(lyricRe);
  if (!m) continue;
  const t = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
  const text = m[3].trim();
  if (!text) continue;
  lines.push({ t: +t.toFixed(4), text });
}
lines.sort((a, b) => a.t - b.t);

// ---------- classify each line ----------
const isKey = (s) => s === s.toUpperCase() && /[A-Z]/.test(s) && !/^[a-z]/.test(s);
const KEY_ALWAYS = new Set(["LO-O-OVE"]);
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  L.key = isKey(L.text) || KEY_ALWAYS.has(L.text);
  L.end = i + 1 < lines.length ? lines[i + 1].t : DURATION;
  // snap to beat grid
  const k = Math.round((L.t - BEAT_OFFSET) / BEAT);
  const gridT = BEAT_OFFSET + k * BEAT;
  L.beatIndex = k;
  L.gridT = +gridT.toFixed(4);
  L.snapped = Math.abs(gridT - L.t) <= SNAP_TOL;
  L.tOn = L.snapped ? +gridT.toFixed(4) : L.t;      // when the line starts to be "typed"
  L.deltaBeats = +((L.t - BEAT_OFFSET) / BEAT - k).toFixed(4);
}

// ---------- beat grid ----------
const beats = [];
for (let k = 0; BEAT_OFFSET + k * BEAT < DURATION; k++) {
  const t = BEAT_OFFSET + k * BEAT;
  beats.push({ k, t: +t.toFixed(4), bar: Math.floor(k / 4), beatInBar: k % 4, downbeat: k % 4 === 0 });
}
const bars = [];
for (let b = 0; b * BAR + BEAT_OFFSET - BAR < DURATION; b++) {
  const t = BEAT_OFFSET + (b - 1) * BAR;  // bar 0 is the bar whose first beat is BEAT_OFFSET
  if (t < -BAR) continue;
  bars.push({ b, t: +t.toFixed(4) });
}

// ---------- sections ----------
const S = [
  // id, label(zh), phase, start, end
  ["P1_BOOT",   "程序初始化 Boot",       1,  0.000, 29.709],
  ["P2_VERSE",  "数学隐喻 Verse",        2, 29.709, 44.452],
  ["P3_CURRENT","电流陷阱 Chorus A",     3, 44.452, 59.223],
  ["P4_STIM",   "刺激与困局 Chorus B",   3, 59.223, 74.045],
  ["P5_ORGANIC","有机体变奏 Chorus C",   3, 74.045, 88.587],
  ["P6_SWITCH", "角色切换 Chorus D",     3, 88.587, 103.489],
  ["P7_COLLAPSE","崩塌 Bridge A",        3,103.489,128.661],
  ["P8_PANIC",  "死机自检 Break",        4,128.661,147.660],
  ["P9_ERUPT",  "EXECUTION 连打",        4,147.660,162.632],
  ["P10_FINAL", "爱的代数式 Final",      4,162.632,191.356],
  ["P11_LOOP",  "无限循环 Outro",        4,191.356,211.9667],
];
const sections = S.map(([id, label, phase, start, end]) => ({ id, label, phase, start, end, dur: +(end - start).toFixed(4) }));
for (const L of lines) {
  const s = sections.find((x) => L.t >= x.start && L.t < x.end) || sections[sections.length - 1];
  L.section = s.id;
}

const out = {
  meta: {
    title: "world.execute(me);",
    artist: "Mili",
    bpm: BPM, beat: +BEAT.toFixed(6), bar: +BAR.toFixed(6), beatOffset: BEAT_OFFSET,
    fps: FPS, duration: DURATION, frames: FRAMES,
    width: 1920, height: 1080,
    tempoMethod: "spectral flux 96-band onset envelope, 1024/256 STFT @22050Hz; tempo scan 125-135 step 0.005; phase drift check first-half vs second-half",
    tempoConfidence: "peak 130.000 BPM (score 0.1786) vs neighbours <=0.10; phase drift < 0.005 beat across the full 212 s",
    lyricSnapToleranceSec: SNAP_TOL,
  },
  sections, beats, bars, lines,
};
fs.writeFileSync(path.join(ROOT, "data", "timeline.json"), JSON.stringify(out, null, 1));

// ---------- report ----------
console.log("frames:", FRAMES, "duration:", DURATION.toFixed(3), "beats:", beats.length, "bars:", bars.length);
console.log("lyric lines:", lines.length, " snappable to a beat:", lines.filter(l=>l.snapped).length);
console.log("\nsections:");
for (const s of sections) console.log("  " + s.id.padEnd(11), s.start.toFixed(3).padStart(8), "->", s.end.toFixed(3).padStart(8), " (" + s.dur.toFixed(2) + "s)", " phase", s.phase);
console.log("\nfirst 30 lyric lines:  t / key / snapped / text");
for (const L of lines.slice(0, 30)) console.log("  " + L.t.toFixed(3).padStart(8), L.key ? "KEY" : "   ", L.snapped ? "SNAP" : "    ", L.text);
console.log("\nlast 20:");
for (const L of lines.slice(-20)) console.log("  " + L.t.toFixed(3).padStart(8), L.key ? "KEY" : "   ", L.snapped ? "SNAP" : "    ", L.text);
console.log("\nbar times (first 12):", bars.slice(0,12).map(b=>b.t.toFixed(3)).join(", "));
