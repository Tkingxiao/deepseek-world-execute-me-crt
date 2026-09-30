
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "timeline.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "beat-energy.json"), "utf8"));
const out = {
  meta: tl.meta,
  sections: tl.sections,
  beats: tl.beats.map(b => ({ k: b.k, t: b.t, bar: b.bar, downbeat: b.downbeat })),
  lines: tl.lines.map(l => ({ t: l.t, tOn: l.tOn, text: l.text, key: l.key, end: l.end, section: l.section, beatIndex: l.beatIndex, snapped: l.snapped })),
  energy: en.beats.map(b => ({ k: b.k, onset: b.onset, low: b.low, mid: b.mid, high: b.high }))
};
fs.writeFileSync(path.join(ROOT, "src", "data.js"), "window.MV_DATA=" + JSON.stringify(out) + ";");
console.log("data.js written, bytes =", fs.statSync(path.join(ROOT,"src","data.js")).size);
