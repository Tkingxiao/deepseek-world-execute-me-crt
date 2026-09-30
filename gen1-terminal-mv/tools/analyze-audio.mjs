
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ESM has no __dirname; derive it from this module's own URL so the script runs
   from the project root on any machine, not just the one it was written on. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BUILD = path.join(ROOT, "build");
const meta = JSON.parse(fs.readFileSync(path.join(BUILD, "meta_audio.json"), "utf8"));
const SR = meta.SR;
const buf = fs.readFileSync(path.join(BUILD, "audio_mono22050.f32"));
const n = Math.floor(buf.length / 4);
const x = new Float32Array(buf.buffer, buf.byteOffset, n);

// ---------- FFT (radix-2, in-place, float64) ----------
function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
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
const nFrames = Math.floor((n - NFFT) / HOP);
const fps = SR / HOP;
const win = new Float64Array(NFFT);
for (let i = 0; i < NFFT; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (NFFT - 1)); // hann

const NBANDS = 96;
const binsPer = Math.floor(NFFT / 2 / NBANDS);
const bands = new Float64Array(NBANDS);
const prev = new Float64Array(NBANDS);
const flux = new Float64Array(nFrames);
const rms = new Float64Array(nFrames);

const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
for (let f = 0; f < nFrames; f++) {
  const off = f * HOP;
  let e = 0;
  for (let i = 0; i < NFFT; i++) { const s = x[off + i]; e += s * s; re[i] = s * win[i]; im[i] = 0; }
  rms[f] = Math.sqrt(e / NFFT);
  fft(re, im);
  bands.fill(0);
  for (let b = 0; b < NBANDS; b++) {
    let acc = 0;
    for (let k = 0; k < binsPer; k++) {
      const idx = b * binsPer + k;
      acc += Math.sqrt(re[idx] * re[idx] + im[idx] * im[idx]);
    }
    bands[b] = Math.log1p(acc);
  }
  let s = 0;
  for (let b = 0; b < NBANDS; b++) { const d = bands[b] - prev[b]; if (d > 0) s += d; prev[b] = bands[b]; }
  flux[f] = s;
}
// normalize flux (subtract local mean over 0.35s, half-wave rectify)
const W = Math.round(0.35 * fps);
const fluxN = new Float64Array(nFrames);
for (let f = 0; f < nFrames; f++) {
  let acc = 0, c = 0;
  for (let k = Math.max(0, f - W); k <= Math.min(nFrames - 1, f + W); k++) { acc += flux[k]; c++; }
  const m = acc / c;
  fluxN[f] = Math.max(0, flux[f] - m);
}
let fmax = 0; for (let f = 0; f < nFrames; f++) fmax = Math.max(fmax, fluxN[f]);
for (let f = 0; f < nFrames; f++) fluxN[f] /= fmax;

// ---------- tempo via autocorrelation ----------
const minBPM = 70, maxBPM = 200;
const lagMin = Math.floor(60 / maxBPM * fps), lagMax = Math.ceil(60 / minBPM * fps);
const ac = [];
for (let lag = lagMin; lag <= lagMax; lag++) {
  let s = 0, c = 0;
  for (let f = 0; f + lag < nFrames; f++) { s += fluxN[f] * fluxN[f + lag]; c++; }
  ac.push({ lag, bpm: 60 * fps / lag, v: s / c });
}
ac.sort((a, b) => b.v - a.v);
console.log("TOP autocorrelation tempo candidates (lag, bpm, score):");
for (const a of ac.slice(0, 12)) console.log("  ", a.lag, a.bpm.toFixed(3), a.v.toFixed(5));

// ---------- phase refinement for a given BPM ----------
function bestPhase(bpm) {
  const period = 60 / bpm * fps;
  let best = { off: 0, v: -1 };
  const steps = Math.round(period * 20); // 1/20 beat resolution
  for (let s = 0; s < steps; s++) {
    const off = (s / steps) * period;
    let acc = 0, c = 0;
    for (let k = 0; ; k++) {
      const idx = off + k * period;
      if (idx >= nFrames - 1) break;
      const i0 = Math.floor(idx), fr = idx - i0;
      acc += fluxN[i0] * (1 - fr) + fluxN[i0 + 1] * fr;
      c++;
    }
    if (c > 0) { const v = acc / c; if (v > best.v) best = { off, v }; }
  }
  return { ...best, period };
}

// ---------- energy envelope / structure ----------
const secFrames = Math.round(fps);
const nSec = Math.floor(nFrames / secFrames);
const secRms = new Float64Array(nSec);
for (let s = 0; s < nSec; s++) {
  let acc = 0;
  for (let f = s * secFrames; f < (s + 1) * secFrames; f++) acc += rms[f] * rms[f];
  secRms[s] = Math.sqrt(acc / secFrames);
}
let rmax = 0; for (let s = 0; s < nSec; s++) rmax = Math.max(rmax, secRms[s]);
const secDb = Array.from(secRms, v => 20 * Math.log10(Math.max(v, 1e-9) / rmax));

// onset strength per beat for a given grid
function beatEnergies(bpm, offFrames) {
  const period = 60 / bpm * fps;
  const out = [];
  for (let k = 0; ; k++) {
    const idx = offFrames + k * period;
    if (idx >= nFrames - 2) break;
    const i0 = Math.floor(idx), fr = idx - i0;
    const v = fluxN[i0] * (1 - fr) + fluxN[i0 + 1] * fr;
    out.push({ beat: k, t: idx / fps, onset: v });
  }
  return out;
}

const result = { SR, nFrames, fps, duration: n / SR, candidates: ac.slice(0, 12), nSec, secDb };
for (const cand of [130, 65, 129.5, 130.5, 86.667, 173.333]) {
  const ph = bestPhase(cand);
  result["grid_" + cand] = { bpm: cand, periodFrames: ph.period, offFrames: ph.off, offSec: ph.off / fps, meanOnset: ph.v };
}
fs.writeFileSync(path.join(BUILD, "analysis.json"), JSON.stringify(result, null, 2));

// per-beat table for 130
const ph130 = bestPhase(130);
const beats = beatEnergies(130, ph130.off);
fs.writeFileSync(path.join(BUILD, "beats130.json"), JSON.stringify({ bpm: 130, offSec: ph130.off / fps, period: 60 / 130, beats }, null, 2));
console.log("\n130 BPM grid: offset =", (ph130.off / fps).toFixed(4), "s, mean onset =", ph130.v.toFixed(4), ", beats =", beats.length);
console.log("last beat time =", beats[beats.length - 1].t.toFixed(3));

// strong beats (onset in top 25%)
const sorted = [...beats].sort((a, b) => b.onset - a.onset);
const thr = sorted[Math.floor(sorted.length * 0.25)].onset;
console.log("\nStrong downbeat candidates (t, onset) — first 60:");
console.log(beats.slice(0, 60).map(b => (b.onset >= thr ? "*" : " ") + b.t.toFixed(3) + ":" + b.onset.toFixed(2)).join("  "));

// structure: per-second dB table, 4-second grouped
console.log("\nPer-second RMS (dB rel max), 4s per row:");
for (let s = 0; s + 4 <= nSec; s += 4) {
  const row = [];
  for (let k = 0; k < 4; k++) row.push(String(Math.round(secDb[s + k])).padStart(4));
  console.log("  " + (s + "s").padStart(5) + " |" + row.join(""));
}
