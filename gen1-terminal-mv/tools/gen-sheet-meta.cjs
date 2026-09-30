
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "math", "sheets", "meta.json"), "utf8"));
const scenes = {};
for (const [k, v] of Object.entries(meta.scenes)) {
  if (v.error) continue;
  scenes[k] = { cellW: v.cellW, cellH: v.cellH, cols: v.cols, rows: v.rows, frames: v.frames };
}
const out = "window.MV_SHEET_META = " + JSON.stringify(scenes) + ";\n";
fs.writeFileSync(path.join(ROOT, "src", "mv-sheet-meta.js"), out);
console.log("wrote src/mv-sheet-meta.js for", Object.keys(scenes).length, "sheets");
