"""Settle the 65 vs 130 octave question with three independent tests."""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze import decode, onset_envelope, env_time, ENV_RATE, NFFT, HOP, SR

x = decode()
env = onset_envelope(x)
t_env = np.array([env_time(i) for i in range(len(env))])
duration = len(x) / SR


def fine(lo, hi, step=0.005):
    best = (-1, 0, 0)
    for bpm in np.arange(lo, hi, step):
        p = 60.0 / bpm
        for ph in np.arange(0, 1.0, 1 / 20):
            t0 = ph * p
            n = int((duration - t0) / p) + 1
            ts = t0 + p * np.arange(n)
            ts = ts[ts <= duration]
            s = float(np.interp(ts, t_env, env).mean())
            if s > best[0]:
                best = (s, bpm, t0)
    return best


print("== fine scans ==")
for name, lo, hi in [("~65", 64.0, 66.0), ("~130", 129.0, 131.0), ("~260", 258.0, 262.0)]:
    s, b, o = fine(lo, hi)
    print("  %-6s %.3f BPM  offset %.4f  score %.5f" % (name, b, o, s))

# --- test: at the 130 grid, are odd beats as strong as even beats?
print("\n== even/odd split at a 130 grid (offset = 130-scan offset) ==")
_, b130, o130 = fine(129.0, 131.0)
p = 60.0 / b130
for label, ph in [("global", o130 / p)]:
    n = int((duration - ph * p) / p) + 1
    ts = ph * p + p * np.arange(n)
    ts = ts[ts <= duration]
    v = np.interp(ts, t_env, env)
    even, odd = v[0::2], v[1::2]
    base = env.mean()
    print("  %s: baseline env mean %.5f" % (label, base))
    print("    even beats  n=%d  mean %.5f  (%.2fx baseline)" % (len(even), even.mean(), even.mean() / base))
    print("    odd  beats  n=%d  mean %.5f  (%.2fx baseline)" % (len(odd), odd.mean(), odd.mean() / base))
    print("    ratio odd/even = %.3f" % (odd.mean() / even.mean()))

# same split for the 65 grid: beats vs half-beats
print("\n== beat vs half-beat at a 65 grid ==")
_, b65, o65 = fine(64.0, 66.0)
p65 = 60.0 / b65
n = int((duration - o65) / p65) + 1
ts = o65 + p65 * np.arange(n)
ts = ts[ts <= duration]
v = np.interp(ts, t_env, env)
half = np.interp(ts + p65 / 2, t_env, env)
print("    on-beat    mean %.5f (%.2fx base)" % (v.mean(), v.mean() / base))
print("    half-beat  mean %.5f (%.2fx base)" % (half.mean(), half.mean() / base))

# --- autocorrelation harmonic structure
print("\n== autocorrelation peaks (period in s -> BPM) ==")
e = env - env.mean()
npad = 1
while npad < 2 * len(e):
    npad *= 2
F = np.fft.rfft(e, npad)
ac = np.fft.irfft(F * np.conj(F), npad)[:len(e)]
ac /= ac[0]
lag = np.arange(1, len(ac))
sub = (lag > 8) & (lag < 400)
lags, vals = lag[sub], ac[sub]
peaks = [i for i in range(1, len(vals) - 1) if vals[i] > vals[i - 1] and vals[i] > vals[i + 1]]
peaks.sort(key=lambda i: -vals[i])
for i in peaks[:12]:
    per = lags[i] / ENV_RATE
    print("    lag %4d  period %.4f s  %7.2f BPM  ac %.4f" % (lags[i], per, 60.0 / per, vals[i]))

# --- shortest strong subdivision (hi-hat test)
print("\n== fine structure: strongest sub-beat periodicity ==")
for lo_ms, hi_ms in [(80, 160), (160, 300), (300, 600), (600, 1200)]:
    m = (lags / ENV_RATE >= lo_ms / 1000) & (lags / ENV_RATE < hi_ms / 1000)
    if m.any():
        i = np.argmax(np.where(m, vals, -1))
        print("    %4d-%4d ms: peak at %6.1f ms  (%.2f BPM)  ac %.4f"
              % (lo_ms, hi_ms, lags[i] / ENV_RATE * 1000, 60.0 / (lags[i] / ENV_RATE), vals[i]))
