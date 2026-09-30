"""tools/gloss.py — apply the Chinese translation table to an already-measured
timeline.

The audio analysis in analyze.py takes minutes and its numbers are frozen; the
translations are editorial and change often. So they are applied here instead,
straight onto work/data/timeline.json and the generated src/data/timeline.js.

    python tools/gloss.py

Fails loudly if any line the film displays would end up without a translation:
the brief requires English and Chinese together on every line, so a missing
gloss is a defect, not a fallback.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from analyze import GLOSS  # noqa: E402


def main():
    jp = os.path.join(ROOT, "work", "data", "timeline.json")
    with open(jp, encoding="utf-8") as f:
        T = json.load(f)

    missing, applied, over = [], 0, 0
    for ln in T["lines"]:
        text = ln["text"].strip()
        zh = GLOSS.get(text)
        if zh is None:
            missing.append((ln["t"], text))
            continue
        if ln.get("gloss") != zh:
            ln["gloss"] = zh
            applied += 1
        # keep the stored gloss inside the panel's field: the log gives it one row
        over += 1 if len(zh) > 18 else 0

    if missing:
        print("MISSING TRANSLATION for %d line(s):" % len(missing))
        for t, s in missing:
            print("   %8.3f  %s" % (t, s))
        raise SystemExit(1)

    with open(jp, "w", encoding="utf-8") as f:
        json.dump(T, f, ensure_ascii=False, separators=(",", ":"))

    # the browser reads a plain JS wrapper, built the same way analyze.py builds it
    js = "window.MV_TIMELINE=" + json.dumps(T, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(ROOT, "src", "data", "timeline.js"), "w", encoding="utf-8") as f:
        f.write(js)

    glossed = sum(1 for ln in T["lines"] if ln.get("gloss"))
    print("lines            %d" % len(T["lines"]))
    print("translations     %d" % glossed)
    print("changed          %d" % applied)
    print("longer than 18ch %d" % over)


if __name__ == "__main__":
    main()
