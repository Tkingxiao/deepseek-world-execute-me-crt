
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BUILD = path.join(ROOT, "build");
const meta = JSON.parse(fs.readFileSync(path.join(BUILD, "meta_audio.json"), "utf8"));
const SR = meta.SR, fps = SR / 256;

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
        const ur = re[i+k], ui = im[i+k];
        const vr = re[i+k+len/2]*cr - im[i+k+len/2]*ci, vi = re[i+k+len/2]*ci + im[i+k+len/2]*cr;
        re[i+k] = ur+vr; im[i+k] = ui+vi; re[i+k+len/2] = ur-vr; im[i+k+len/2] = ui-vi;
        const ncr = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = ncr;
      }
    }
  }
}
const NFFT = 1024, HOP = 256;
const buf = fs.readFileSync(path.join(BUILD, "audio_mono22050.f32"));
const n = Math.floor(buf.length / 4);
const x = new Float32Array(buf.buffer, buf.byteOffset, n);
const nFrames = Math.floor((n - NFFT) / HOP);
const win = new Float64Array(NFFT);
for (let i = 0; i < NFFT; i++) win[i] = 0.5 - 0.5 * Math.cos(2*Math.PI*i/(NFFT-1));
const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
const bands = new Float64Array(96), prev = new Float64Array(96);
const flux = new Float64Array(nFrames), rms = new Float64Array(nFrames);
const lowE = new Float64Array(nFrames), midE = new Float64Array(nFrames), hiE = new Float64Array(nFrames);
const binHz = SR / NFFT;
for (let f = 0; f < nFrames; f++) {
  const off = f * HOP; let e = 0;
  for (let i = 0; i < NFFT; i++) { const s = x[off+i]; e += s*s; re[i] = s*win[i]; im[i] = 0; }
  rms[f] = Math.sqrt(e/NFFT); fft(re, im);
  let l=0,m=0,h=0;
  for (let k = 1; k < NFFT/2; k++) {
    const hz = k*binHz, mag = Math.sqrt(re[k]*re[k]+im[k]*im[k]);
    if (hz < 250) l += mag; else if (hz < 2000) m += mag; else h += mag;
  }
  lowE[f]=l; midE[f]=m; hiE[f]=h;
  bands.fill(0);
  for (let b=0;b<96;b++){let acc=0;for(let k=0;k<5;k++){const idx=b*5+k;acc+=Math.sqrt(re[idx]*re[idx]+im[idx]*im[idx]);}bands[b]=Math.log1p(acc);}
  let s=0; for(let b=0;b<96;b++){const d=bands[b]-prev[b]; if(d>0)s+=d; prev[b]=bands[b];}
  flux[f]=s;
}
const W = Math.round(0.35*fps), fluxN = new Float64Array(nFrames);
for (let f=0;f<nFrames;f++){let acc=0,c=0;for(let k=Math.max(0,f-W);k<=Math.min(nFrames-1,f+W);k++){acc+=flux[k];c++;}fluxN[f]=Math.max(0,flux[f]-acc/c);}
let fm=0;for(let f=0;f<nFrames;f++)fm=Math.max(fm,fluxN[f]);
for(let f=0;f<nFrames;f++)fluxN[f]/=fm;

// moving-median-ish local average of band energies (0.5s window) for normalisation
const W2 = Math.round(0.5*fps);
const avg = (arr) => { const out = new Float64Array(nFrames); for(let f=0;f<nFrames;f++){let a=0,c=0;for(let k=Math.max(0,f-W2);k<=Math.min(nFrames-1,f+W2);k++){a+=arr[k];c++;}out[f]=a/c;} return out; };
const lowA=avg(lowE),midA=avg(midE),hiA=avg(hiE);
const pk = (arr) => { let m=0; for(const v of arr) m=Math.max(m,v); return m||1; };
const lP=pk(lowE),mP=pk(midE),hP=pk(hiE);

const tl = JSON.parse(fs.readFileSync(path.join(ROOT,"data","timeline.json"),"utf8"));
const BPM = tl.meta.bpm, BEAT = tl.meta.beat, OFF = tl.meta.beatOffset;
const sample = (arr, t) => { const idx = t*fps; const i0=Math.floor(idx); if(i0<0) return arr[0]; if(i0>=nFrames-1) return arr[nFrames-1]; const fr=idx-i0; return arr[i0]*(1-fr)+arr[i0+1]*fr; };

const beats = [];
for (const b of tl.beats) {
  const onset = sample(fluxN, b.t);
  const lo = sample(lowE,b.t)/lowA[Math.min(nFrames-1,Math.round(b.t*fps))]/ (lP/Math.max(1e-9, lowA[0]||1));
  beats.push({
    k: b.k, t: b.t,
    onset: +onset.toFixed(4),
    low:  +Math.min(2,(sample(lowE,b.t)/Math.max(1e-9,lowA[Math.round(b.t*fps)]))).toFixed(3),
    mid:  +Math.min(2,(sample(midE,b.t)/Math.max(1e-9,midA[Math.round(b.t*fps)]))).toFixed(3),
    high: +Math.min(2,(sample(hiE,b.t)/Math.max(1e-9,hiA[Math.round(b.t*fps)]))).toFixed(3),
    rms:  +Math.min(1, sample(rms,b.t)/ (Math.max(...Array.from(rms).map(v=>v))||1)).toFixed(4),
  });
}
// normalise low/mid/high globally to 0..1 by their own 95th percentile
for (const key of ["low","mid","high"]) {
  const vals = beats.map(b=>b[key]).sort((a,b)=>a-b);
  const p95 = vals[Math.floor(vals.length*0.95)] || 1;
  beats.forEach(b => b[key] = +(b[key]/p95).toFixed(3));
}
fs.writeFileSync(path.join(ROOT,"data","beat-energy.json"), JSON.stringify({ fps, bpm: BPM, beat: BEAT, offset: OFF, beats }, null, 0));
console.log("wrote beat-energy.json:", beats.length, "beats");
console.log("onset stats: max", Math.max(...beats.map(b=>b.onset)).toFixed(3), "mean", (beats.reduce((a,b)=>a+b.onset,0)/beats.length).toFixed(3));
console.log("sample beats 0..12:", beats.slice(0,12).map(b=>b.t.toFixed(2)+" o"+b.onset+" l"+b.low+" m"+b.mid+" h"+b.high).join(" | "));
console.log("sample beats 320..332 (EXECUTION):", beats.slice(320,332).map(b=>b.t.toFixed(2)+" o"+b.onset+" l"+b.low).join(" | "));
