"""
Step 1-5 of the crt-anime-mv pipeline.

Decode -> spectral-flux onset envelope -> tempo scan + phase lock -> drift proof
-> per-beat energy table -> LRC parse and snap -> timeline.json + audio.json

No scipy: numpy only, so the STFT and the autocorrelation are explicit.

  python tools/analyze.py
"""
import json
import os
import re
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from paths import ROOT as _ROOT, input_path, ffmpeg_path  # noqa: E402

ROOT = str(_ROOT)
FFMPEG = ffmpeg_path()

# Bring your own song and lyrics: MV_SONG / MV_LRC override, otherwise input/.
# Neither the master this film was cut to nor its LRC file is redistributed here.
SRC = str(input_path("MV_SONG", "song.mp3"))
LRC = str(input_path("MV_LRC", "lyrics.lrc"))
WORK = os.path.join(ROOT, "work")
AUDIO_DIR = os.path.join(WORK, "audio")
DATA_DIR = os.path.join(WORK, "data")

SR = 22050
NFFT = 1024
HOP = 256
FPS = 30
ENV_RATE = SR / HOP          # 86.13 envelope frames per second
SNAP_MS = 120.0

# ---------------------------------------------------------------- phases
# Boundaries are the LRC onsets that open each act. The design document
# (docs/DESIGN.md) and the renderer read the same table.
SECTIONS = [
    ("P00_BOOT", "BOOT SEQUENCE", 0.000, 16.000),
    ("P01_CALL", "world.execute(me);", 16.000, 29.709),
    ("P02_GEOMETRY", "GEOMETRY OF DEVOTION", 29.709, 44.452),
    ("P03_CURRENT", "SWITCH MY CURRENT", 44.452, 59.223),
    ("P04_STIMULATION", "STIMULATIONS", 59.223, 74.045),
    ("P05_FLESH", "IF I'M A VEGETABLE", 74.045, 88.587),
    ("P06_TRANCE", "THE TRANCE", 88.587, 103.489),
    ("P07_ISOLATION", "YOU HAVE LEFT", 103.489, 118.333),
    ("P08_ERASURE", "POINTLESS FRAGMENTS", 118.333, 125.708),
    ("P09_ERROR", "ILLEGAL ARGUMENTS", 125.708, 147.660),
    ("P10_COUNTDOWN", "EXECUTION x12", 147.660, 162.632),
    ("P11_FINAL", "RUN THE EXECUTION", 162.632, 177.246),
    ("P12_LOVE", "THE ALGEBRAIC EXPRESSION", 177.246, 191.356),
    ("P13_OUTRO", "TRAPPED IN LOVE", 191.356, 205.811),
    ("P14_TERMINATE", "EXIT CODE 0", 205.811, 211.944),
]


def log(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------- 1. decode
def decode():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    raw = os.path.join(AUDIO_DIR, "mono22050.f32")
    if not os.path.exists(raw):
        log("[1] decoding to f32le mono %d Hz" % SR)
        subprocess.run(
            [FFMPEG, "-v", "error", "-y", "-i", SRC, "-f", "f32le", "-ac", "1",
             "-ar", str(SR), raw],
            check=True,
        )
    x = np.fromfile(raw, dtype="<f4").astype(np.float64)
    log("    %d samples  %.3f s" % (len(x), len(x) / SR))
    return x


# ------------------------------------------------- 2. onset envelope
def onset_envelope(x):
    log("[2] spectral flux onset envelope")
    win = np.hanning(NFFT)
    nframes = 1 + (len(x) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(nframes)[:, None]
    frames = x[idx] * win
    S = np.abs(np.fft.rfft(frames, axis=1))          # (nframes, 513)

    freqs = np.fft.rfftfreq(NFFT, 1.0 / SR)
    # ~96 log-spaced bands from 30 Hz to Nyquist
    edges = np.logspace(np.log10(30.0), np.log10(SR / 2 * 0.98), 97)
    band = np.zeros((nframes, len(edges) - 1))
    for b in range(len(edges) - 1):
        m = (freqs >= edges[b]) & (freqs < edges[b + 1])
        if m.any():
            band[:, b] = S[:, m].sum(axis=1)
    band = np.log1p(band)

    flux = np.diff(band, axis=0)
    flux = np.maximum(flux, 0.0).sum(axis=1)         # positive part only
    flux = np.concatenate([[0.0], flux])             # align to nframes

    # subtract a local moving average (~0.35 s) and half-wave rectify
    w = int(round(0.35 * ENV_RATE))
    k = np.ones(2 * w + 1) / (2 * w + 1)
    pad = np.pad(flux, w, mode="edge")
    local = np.convolve(pad, k, mode="same")[w:-w]
    env = np.maximum(flux - local, 0.0)

    env -= env.min()
    if env.max() > 0:
        env /= env.max()
    log("    %d env frames, %.3f s each, peak %.4f" % (len(env), 1 / ENV_RATE, env.max()))
    return env


def env_time(i):
    return (i * HOP + NFFT / 2) / SR


# ------------------------------------------------- 3-5. tempo, phase
def coarse_tempo(env):
    log("[3] autocorrelation over 70-200 BPM")
    e = env - env.mean()
    n = len(e)
    size = 1
    while size < 2 * n:
        size *= 2
    F = np.fft.rfft(e, size)
    ac = np.fft.irfft(F * np.conj(F), size)[:n]
    ac /= ac[0] if ac[0] else 1.0

    ac = ac[1:]
    lags = np.arange(1, n)
    bpms = 60.0 * ENV_RATE / lags
    sel = (bpms >= 70) & (bpms <= 200)
    best = lags[sel][np.argmax(ac[sel])]
    log("    coarse lag %d -> %.3f BPM" % (best, 60.0 * ENV_RATE / best))
    return 60.0 * ENV_RATE / best


def scan(env, t_env, duration, centre, span, step, nphase=20):
    """
    Best (score, bpm, offset) over centre +/- span, phases at 1/nphase beat.

    The score is the MAX over phases of the mean onset strength on that phase's
    grid - never the mean over phases, which would average on-beat samples with
    off-beat ones and collapse to the envelope mean.
    """
    best = (-1.0, centre, 0.0)
    phases = np.arange(nphase) / nphase
    for bpm in np.arange(centre - span, centre + span + 1e-9, step):
        p = 60.0 / bpm
        k = np.arange(int(duration / p) + 2)
        t0 = phases[:, None] * p
        grid = t0 + p * k[None, :]
        live = grid <= duration
        counts = live.sum(axis=1)
        vals = np.interp(grid.ravel(), t_env, env).reshape(grid.shape)
        vals = np.where(live, vals, 0.0)
        means = vals.sum(axis=1) / np.maximum(counts, 1)
        means[counts < 8] = -1.0
        j = int(np.argmax(means))
        if means[j] > best[0]:
            best = (float(means[j]), bpm, float(t0[j, 0]))
    return best


def resolve_octave(env, t_env, duration, coarse):
    """
    An octave is only real if the grid lines it ADDS carry energy.

    A doubled grid whose extra lines are dead scores about half the base grid's
    mean, because that mean is taken over twice as many samples of which half are
    silence. Measured on this track: score(130)/score(65) ~ 0.99, so every
    130-beat carries an onset and 130 is the beat; score(260)/score(130) ~ 0.78,
    so 260's added subdivisions are dead and 260 is rejected.
    """
    log("[4] octave resolution (added grid lines must carry energy)")
    cands = sorted(set(round(coarse * m, 3) for m in (0.25, 0.5, 1.0, 2.0)
                       if 58.0 <= coarse * m <= 210.0))
    scored = []
    for c in cands:
        s, b, o = scan(env, t_env, duration, c, min(2.0, c * 0.02), 0.02)
        scored.append((s, b, o))
        log("    cand %8.3f -> %8.3f BPM  score %.5f  offset %.4f" % (c, b, s, o))

    score, bpm, off = max(scored, key=lambda r: r[0])
    for _ in range(4):
        if bpm * 2 > 210.0:
            break
        s2, b2, o2 = scan(env, t_env, duration, bpm * 2, min(2.0, bpm * 0.02), 0.02)
        ratio = s2 / score if score > 0 else 0.0
        log("    octave climb %.3f -> %.3f : %.5f / %.5f = %.3f"
            % (bpm, b2, s2, score, ratio))
        if ratio >= 0.85:
            score, bpm, off = s2, b2, o2
            log("      accepted - the added grid lines are live")
        else:
            log("      rejected - added lines dead (%0.0f%% of base grid)" % (ratio * 100))
            break

    s, b, o = scan(env, t_env, duration, bpm, 1.0, 0.005)
    if s >= score:
        score, bpm, off = s, b, o
    log("    --> refined %.3f BPM  offset %.4f s  score %.5f" % (bpm, off, score))
    return bpm, off, score


def fine_tempo(env, duration):
    log("[5] fine tempo + phase scan")
    t_env = np.array([env_time(i) for i in range(len(env))])
    co = coarse_tempo(env)
    bpm, off, score = resolve_octave(env, t_env, duration, co)

    log("    candidate      score          <- the ambiguity table from beat-and-timeline.md")
    for b in [bpm, bpm - 0.005, bpm + 0.005, bpm / 2, bpm * 2, 129.5, 129.0]:
        if b <= 0 or b > 400:
            continue
        s, _, _ = scan(env, t_env, duration, b, 0.02, 0.02)
        log("    %10.3f   %.5f" % (b, s))
    return bpm, off, score, t_env


def drift_proof(env, t_env, bpm, off, duration):
    log("[6] drift proof (independent phase search per half)")
    period = 60.0 / bpm
    out = []
    for name, t0, t1 in [("first half", 0.0, duration / 2),
                         ("second half", duration / 2, duration)]:
        m = (t_env >= t0) & (t_env <= t1)
        sub, sub_t = env[m], t_env[m]
        best = (-1.0, off)
        for ph in np.arange(0, 1.0, 1 / 40):
            o = ph * period
            n = int((t1 - o) / period) + 1
            times = o + period * np.arange(n)
            times = times[(times >= t0) & (times <= t1)]
            if len(times) < 8:
                continue
            s = float(np.interp(times, sub_t, sub).mean())
            if s > best[0]:
                best = (s, o)
        delta_beats = ((best[1] - off) / period + 0.5) % 1.0 - 0.5
        out.append((name, best[1], delta_beats))
        log("    %-12s best phase %.4f s  score %.5f  (%+.4f beat vs global)"
            % (name, best[1], best[0], delta_beats))
    return out


# ------------------------------------------------- 7. per-beat energy
def beat_table(env, t_env, bpm, off, duration, x):
    log("[7] per-beat energy table")
    period = 60.0 / bpm
    nb = int((duration - off) / period) + 1
    beats = []
    for k in range(nb):
        beats.append({"k": k, "t": round(off + k * period, 4), "bar": k // 4,
                      "downbeat": (k % 4 == 0)})

    times = np.array([b["t"] for b in beats])
    onset = np.interp(times, t_env, env)

    # band energy relative to a local average, per 95th percentile
    win = np.hanning(NFFT)
    nframes = 1 + (len(x) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(nframes)[:, None]
    S = np.abs(np.fft.rfft(x[idx] * win, axis=1))
    freqs = np.fft.rfftfreq(NFFT, 1.0 / SR)
    bands = {"low": (20, 160), "mid": (160, 2000), "high": (2000, SR / 2)}
    et = np.array([env_time(i) for i in range(nframes)])
    for name, (f0, f1) in bands.items():
        m = (freqs >= f0) & (freqs < f1)
        e = S[:, m].sum(axis=1)
        w = int(round(2.0 * ENV_RATE))
        k = np.ones(2 * w + 1) / (2 * w + 1)
        local = np.convolve(np.pad(e, w, mode="edge"), k, mode="same")[w:-w]
        rel = e / np.maximum(local, 1e-9)
        v = np.interp(times, et, rel)
        v = v / max(np.percentile(v, 95), 1e-9)
        for b, val in zip(beats, v):
            b[name] = round(float(np.clip(val, 0, 2.0)), 4)
    for b, val in zip(beats, onset / max(np.percentile(onset, 95), 1e-9)):
        b["onset"] = round(float(np.clip(val, 0, 2.0)), 4)
    log("    %d beats (%.1f bars)" % (len(beats), nb / 4))
    return beats


# ------------------------------------------------- 8-9. lyrics
KEY_RE = re.compile(r"\b([A-Z][A-Z0-9'\- ]{2,})\b")
TS_RE = re.compile(r"^\[(\d+):(\d+\.\d+)\](.*)$")

# The LRC carries no translation, so the Chinese is authored here — one entry per
# line, keyed by the exact English. Every line gets one; a lyric the audience
# cannot read is a lyric that is not there.
#
# Translation notes that matter to the film:
#   EXECUTION     执行 (run a program) and 处决 (put to death) are the same word.
#                 That pun is the whole song, so the gloss never picks one.
#   world.execute(me);  the same pun in miniature, and the title card.
#   LO-O-OVE       爱—情 keeps the stretched O.
#   DISHEARTENED   心碎 is dis-heartened literally, which the P08 shot draws.
GLOSS = {
    "Switch on the power line": "接通电源线",
    "Remember to put on": "记得穿上",
    "PROTECTION": "防护",
    "Lay down your pieces": "放下你的棋子",
    "And let's begin": "让我们开始",
    "OBJECT CREATION": "对象创建",
    "Fill in my data parameters": "填上我的数据参数",
    "INITIALIZATION": "初始化",
    "Set up our new world": "建立我们的新世界",
    "And let's begin the": "让我们开始这场",
    "SIMULATION": "模拟",
    "world.execute(me);": "运行我；处决我；",
    "If I'm a set of points": "如果我是一组点",
    "Then I will give you my": "那我就把我的",
    "DIMENSION": "维度",
    "If I'm a circle": "如果我是一个圆",
    "CIRCUMFERENCE": "周长",
    "If I'm a sine wave": "如果我是一条正弦波",
    "Then you can sit on all my": "那你就能坐在我所有的",
    "TANGENTS": "切线上",
    "If I approach infinity": "如果我趋近无穷",
    "Then you can be my": "那你就能成为我的",
    "LIMITATIONS": "极限",
    "Switch my current": "切换我的电流",
    "To AC to DC": "从交流到直流",
    "And then blind my vision": "然后蒙住我的眼睛",
    "So dizzy so dizzy": "好晕 好晕",
    "Oh we can travel": "哦 我们可以穿越",
    "To A.D to B.C": "从公元后到公元前",
    "And we can unite": "我们可以合一",
    "So deeply so deeply": "那么深 那么深",
    "If I can": "如果我能",
    "If I can give you all the": "如果我能给你全部的",
    "STIMULATIONS": "刺激",
    "Then I can": "那我就能",
    "Then I can be your only": "那我就能成为你唯一的",
    "SATISFACTION": "满足",
    "If I can make you happy": "如果我能让你快乐",
    "I will run the": "我就会运行",
    "EXECUTION": "执行／处决",
    "Though we are trapped": "尽管我们被困在",
    "In this strange strange": "这个奇怪的 奇怪的",
    "If I'm an eggplant": "如果我是一个茄子",
    "NUTRIENTS": "养分",
    "If I'm a tomato": "如果我是一个番茄",
    "Then I will give you": "那我就给你",
    "ANTIOXIDANTS": "抗氧化物",
    "If I'm a tabby cat": "如果我是一只虎斑猫",
    "Then I will purr for your": "那我就为你呼噜出",
    "ENJOYMENT": "享受",
    "If I'm the only god": "如果我是唯一的神",
    "Then you're the proof of my": "那你就是我",
    "EXISTENCE": "存在的证明",
    "Switch my gender": "切换我的性别",
    "To F to M": "从女到男",
    "And then do whatever": "然后做任何事",
    "From AM to PM": "从上午到下午",
    "Oh switch my role": "哦 切换我的角色",
    "To S to M": "从受方到主方",
    "So we can enter": "这样我们就能进入",
    "The trance the trance": "恍惚 恍惚",
    "If I can feel your": "如果我能感受到你的",
    "VIBRATIONS": "振动",
    "Then I can finally be": "那我终于能变得",
    "COMPLETION": "完整",
    "Though you have left": "尽管你已经离开",
    "You have left": "你已经离开",
    "You have left me in": "你把我留在了",
    "ISOLATION": "隔离",
    "If I can erase all the pointless": "如果我能抹掉所有无意义的",
    "FRAGMENTS": "碎片",
    "Then maybe": "那么也许",
    "Then maybe you won't leave me so": "那么也许你就不会把我抛下得如此",
    "DISHEARTENED": "心碎",
    "Challenging your god": "挑战你的神",
    "You have made some": "你已经给出了",
    "ILLEGAL ARGUMENTS": "非法的参数",
    "EIN": "一",
    "DOS": "二",
    "TROIS": "三",
    "NE": "四",
    "FEM": "五",
    "LIU": "六",
    "If I can give them all the": "如果我能给他们全部的",
    "If I can have you back": "如果我能把你找回来",
    "We are trapped ah": "我们被困住了 啊",
    "I've studied": "我研究过",
    "I've studied how to properly": "我研究过如何正确地",
    "LO-O-OVE": "爱—情",
    "Question me": "问我",
    "Question me I can answer all": "问我 我能回答所有关于",
    "I know the algebraic expression of": "我知道爱的代数表达式",
    "Though you are free": "尽管你是自由的",
    "I am trapped": "我被困住了",
    "Trapped in": "困在",
}


def parse_lrc():
    lines = []
    with open(LRC, encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            m = TS_RE.match(raw)
            if not m:
                continue                        # skips the composer JSON rows
            mm, ss, text = m.groups()
            t = int(mm) * 60 + float(ss)
            text = text.strip()
            if not text:
                continue
            lines.append({"t": round(t, 4), "text": text})
    lines.sort(key=lambda r: r["t"])
    return lines


def classify(lines):
    for i, ln in enumerate(lines):
        nxt = lines[i + 1]["t"] if i + 1 < len(lines) else 211.944
        ln["dur"] = round(max(nxt - ln["t"], 0.1), 4)
        # A line is "key" when its entire content is the shouted token.
        stripped = ln["text"].strip()
        ln["key"] = bool(re.fullmatch(r"[A-Z0-9'\- ]{3,}", stripped)) and not stripped[0].isdigit()
        ln["gloss"] = GLOSS.get(stripped, "")
        ln["cps"] = round(float(np.clip(len(stripped) / ln["dur"] * 0.70, 10, 32)), 2)
    return lines


def snap(lines, beats, bpm, off):
    period = 60.0 / bpm
    snapped = 0
    for ln in lines:
        k = round((ln["t"] - off) / period)
        gt = off + k * period
        if abs(gt - ln["t"]) * 1000.0 <= SNAP_MS and gt >= 0:
            ln["tOn"] = round(gt, 4)
            ln["snapped"] = True
            snapped += 1
        else:
            ln["tOn"] = ln["t"]
            ln["snapped"] = False
    log("[9] snap rate %d/%d = %.1f%%" % (snapped, len(lines), 100.0 * snapped / len(lines)))
    return lines


def assign_sections(lines):
    for ln in lines:
        for sid, label, a, b in SECTIONS:
            if a <= ln["t"] < b:
                ln["section"] = sid
                break
        else:
            ln["section"] = SECTIONS[-1][0]
    return lines


# ------------------------------------------------- audio payload for the film
def audio_payload(x, duration):
    """Real waveform + spectrum so the picture is literally made of the song."""
    log("[+] baking waveform + spectrum payload")
    # signed oscilloscope trace: min/max per 1/150 s window
    win = int(round(SR / 150.0))
    n = len(x) // win
    seg = x[:n * win].reshape(n, win)
    lo = seg.min(axis=1)
    hi = seg.max(axis=1)
    peak = max(abs(lo).max(), abs(hi).max()) or 1.0
    osc_lo = [int(round(v / peak * 120)) for v in lo]
    osc_hi = [int(round(v / peak * 120)) for v in hi]

    # 32 log bands at exact frame rate, 0-255
    freqs = np.fft.rfftfreq(NFFT, 1.0 / SR)
    edges = np.logspace(np.log10(40.0), np.log10(SR / 2 * 0.95), 33)
    nframes = 1 + (len(x) - NFFT) // HOP
    S = np.abs(np.fft.rfft(x[(np.arange(NFFT)[None, :] +
                              HOP * np.arange(nframes)[:, None])] * np.hanning(NFFT), axis=1))
    et = np.array([env_time(i) for i in range(nframes)])
    ft = np.arange(int(duration * FPS) + 1) / FPS
    spec = []
    for b in range(32):
        m = (freqs >= edges[b]) & (freqs < edges[b + 1])
        v = S[:, m].sum(axis=1) if m.any() else np.zeros(nframes)
        v = np.log1p(v)
        v = np.interp(ft, et, v)
        ref = max(np.percentile(v, 98), 1e-9)
        spec.append([int(round(min(1.0, q / ref) * 255)) for q in v])
    log("    osc %d pts, spec %dx%d" % (len(osc_lo), len(spec), len(spec[0])))
    return {"oscRate": 150, "oscLo": osc_lo, "oscHi": osc_hi,
            "specRate": FPS, "specBands": 32, "spec": spec}


# ------------------------------------------------- main
def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    x = decode()
    duration = len(x) / SR
    env = onset_envelope(x)
    bpm, off, score, t_env = fine_tempo(env, duration)
    halves = drift_proof(env, t_env, bpm, off, duration)
    beats = beat_table(env, t_env, bpm, off, duration, x)

    lines = classify(parse_lrc())
    lines = snap(lines, beats, bpm, off)
    lines = assign_sections(lines)

    timeline = {
        "meta": {
            "bpm": round(bpm, 4),
            "beat": round(60.0 / bpm, 6),
            "beatOffset": round(off, 4),
            "bar": round(4 * 60.0 / bpm, 4),
            "fps": FPS,
            "duration": round(duration, 4),
            "frames": int(round(duration * FPS)),
            "phaseScore": round(score, 5),
            "snapMs": SNAP_MS,
            "drift": [{"name": n, "phase": round(p, 4), "deltaBeats": round(d, 5)}
                      for n, p, d in halves],
        },
        "sections": [{"id": s, "label": l, "start": a, "end": b} for s, l, a, b in SECTIONS],
        "beats": beats,
        "lines": lines,
    }
    with open(os.path.join(DATA_DIR, "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(timeline, f, ensure_ascii=False, separators=(",", ":"))
    log("    -> work/data/timeline.json  (%.1f KB)"
        % (os.path.getsize(os.path.join(DATA_DIR, "timeline.json")) / 1024))

    payload = audio_payload(x, duration)
    with open(os.path.join(DATA_DIR, "audio.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    log("    -> work/data/audio.json  (%.1f KB)"
        % (os.path.getsize(os.path.join(DATA_DIR, "audio.json")) / 1024))

    log("")
    log("SUMMARY  bpm=%.3f  offset=%.4f s  beats=%d  lines=%d  frames=%d  dur=%.3f s"
        % (bpm, off, len(beats), len(lines), timeline["meta"]["frames"], duration))


if __name__ == "__main__":
    main()
