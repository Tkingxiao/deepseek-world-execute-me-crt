
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BUILD = path.join(ROOT, "build");
const meta = JSON.parse(fs.readFileSync(path.join(BUILD, "meta_audio.json"), "utf8"));
const SR = meta.SR;

// recompute onset envelope quickly using the same pipeline, but keep it in memory this time
function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
const NFFT = 1024, HOP = 256;
const buf = fs.readFileSync(path.join(BUILD, "audio_mono22050.f32"));
const n = Math.floor(buf.length / 4);
const x = new Float32Array(buf.buffer, buf.byteOffset, n);
const nFrames = Math.floor((n - NFFT) / HOP);
const fps = SR / HOP;
const win = new Float64Array(NFFT);
for (let i = 0; i < NFFT; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (NFFT - 1));
const NB = 96, binsPer = Math.floor(NFFT / 2 / NB);
const bands = new Float64Array(NB), prev = new Float64Array(NB);
const flux = new Float64Array(nFrames);
const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
for (let f = 0; f < nFrames; f++) {
  const off = f * HOP;
  for (let i = 0; i < NFFT; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
  fft(re, im); bands.fill(0);
  for (let b = 0; b < NB; b++) { let acc = 0; for (let k = 0; k < binsPer; k++) { const idx = b * binsPer + k; acc += Math.sqrt(re[idx] * re[idx] + im[idx] * im[idx]); } bands[b] = Math.log1p(acc); }
  let s = 0; for (let b = 0; b < NB; b++) { const d = bands[b] - prev[b]; if (d > 0) s += d; prev[b] = bands[b]; }
  flux[f] = s;
}
const W = Math.round(0.35 * fps), fluxN = new Float64Array(nFrames);
for (let f = 0; f < nFrames; f++) { let acc = 0, c = 0; for (let k = Math.max(0, f - W); k <= Math.min(nFrames - 1, f + W); k++) { acc += flux[k]; c++; } fluxN[f] = Math.max(0, flux[f] - acc / c); }
let fmax = 0; for (let f = 0; f < nFrames; f++) fmax = Math.max(fmax, fluxN[f]);
for (let f = 0; f < nFrames; f++) fluxN[f] /= fmax;

function scoreAt(bpm, offFrames, f0, f1) {
  const period = 60 / bpm * fps;
  let acc = 0, c = 0;
  for (let k = 0; ; k++) {
    const idx = offFrames + k * period;
    if (idx > f1) break;
    if (idx < f0) continue;
    const i0 = Math.floor(idx), fr = idx - i0;
    acc += fluxN[i0] * (1 - fr) + fluxN[i0 + 1] * fr; c++;
  }
  return c ? acc / c : 0;
}
function bestPhase(bpm, f0, f1) {
  const period = 60 / bpm * fps;
  let bv = -1, bo = 0;
  const steps = 400;
  for (let s = 0; s < steps; s++) {
    const off = (s / steps) * period;
    const v = scoreAt(bpm, off, f0, f1);
    if (v > bv) { bv = v; bo = off; }
  }
  return { off: bo, v: bv, period };
}

const f0 = 0, f1 = nFrames - 1;
console.log("BPM scan (whole song), step 0.005:");
const scan = [];
for (let bpm = 125; bpm <= 135.0001; bpm += 0.005) {
  const b = bestPhase(bpm, f0, f1);
  scan.push({ bpm: +bpm.toFixed(3), offSec: b.off / fps, score: b.v });
}
scan.sort((a, b) => b.score - a.score);
console.log("TOP 15 by global score:");
for (const s of scan.slice(0, 15)) console.log("   ", s.bpm.toFixed(3), "off", s.offSec.toFixed(4), "score", s.score.toFixed(4));

// For the top few candidates, check drift: score in first half vs second half
console.log("\nDrift check (first half vs second half, each locally re-phased vs globally fixed):");
const half = Math.floor(nFrames / 2);
for (const cand of ["129.199","129.5","130","130.5","129.0"]) {
  const bpm = parseFloat(cand);
  const g = bestPhase(bpm, f0, f1);
  const period = 60 / bpm * fps;
  const s1 = scoreAt(bpm, g.off, 0, half);
  const s2 = scoreAt(bpm, g.off, half, nFrames - 1);
  const p1 = bestPhase(bpm, 0, half), p2 = bestPhase(bpm, half, nFrames - 1);
  console.log("  bpm " + bpm + " : globalOff " + (g.off / fps).toFixed(4) + "  score H1 " + s1.toFixed(4) + " H2 " + s2.toFixed(4) + " | local best off H1 " + (p1.off / fps).toFixed(4) + " (sc " + p1.v.toFixed(4) + ")  H2 " + (p2.off / fps).toFixed(4) + " (sc " + p2.v.toFixed(4) + ")");
  // phase of best local phase in beats relative to global
  const db1 = (p1.off - g.off) / period, db2 = (p2.off - g.off) / period;
  console.log("      local phase shift vs global: H1 " + db1.toFixed(3) + " beats, H2 " + db2.toFixed(3) + " beats");
}

// Verify against the LRC line onset times: measure onset strength exactly at each lyric time for each candidate
const lrcTimes = [0.100,1.740,2.920,3.873,5.491,6.380,7.446,10.091,11.095,12.906,13.891,16.000,29.709,31.116,32.682,33.412,34.646,36.287,37.067,38.596,40.049,40.706,42.346,43.507,44.452,45.850,47.672,49.534,51.363,53.225,55.083,56.916,59.223,59.687,61.958,62.589,63.535,65.397,66.601,68.252,69.259,70.084,71.764,73.169,74.045,75.422,76.959,77.576,79.226,80.620,81.351,82.833,84.268,85.078,86.538,87.922,88.587,90.197,92.015,93.953,95.465,97.739,99.349,101.474,103.489,104.197,106.293,107.220,107.903,110.221,110.900,112.220,113.100,114.180,114.920,115.780,117.274,118.333,118.979,120.860,121.728,122.714,124.890,125.708,128.661,131.224,147.660,148.600];
console.log("\nLyric-line onset alignment (mean of top onset values at lyric times, and phase in beats):");
for (const cand of [130, 129.199, 129.5, 130.5, 65]) {
  const period = 60 / cand * fps;
  let acc = 0; const phases = [];
  for (const t of lrcTimes) {
    const idx = t * fps;
    const i0 = Math.floor(idx), fr = idx - i0;
    acc += fluxN[i0] * (1 - fr) + fluxN[i0 + 1] * fr;
    // distance to nearest grid line given a nominal offset
    const g = bestPhase(cand, 0, nFrames - 1);
    let d = ((idx - g.off) / period) % 1; if (d < 0) d += 1;
    phases.push(Math.min(d, 1 - d));
  }
  const meanPhaseDist = phases.reduce((a, b) => a + b, 0) / phases.length;
  console.log("  bpm " + cand + " meanOnsetAtLyric " + (acc / lrcTimes.length).toFixed(4) + "  meanDistToGrid(beats) " + meanPhaseDist.toFixed(4));
}
