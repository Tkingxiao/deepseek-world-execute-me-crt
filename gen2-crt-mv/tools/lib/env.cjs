/* tools/lib/env.cjs — resolve this project's paths and the Chrome binary Playwright drives.
 *
 * No script in this repository may hardcode a machine-specific absolute path. This
 * module is the single place that knows where things live, so a clone on another
 * machine runs unchanged.
 *
 *   ROOT    the generation-2 project root (the folder that holds src/ and tools/)
 *   chrome  a Chrome/Chromium executable, or undefined to let Playwright use its own
 *           download (playwright-core ships no browser, so on a machine without
 *           Chrome you must run `npx playwright install chromium`)
 *
 * Overrides:
 *   MV_CHROME / CHROME_PATH   full path to chrome.exe / chrome
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

/* tools/lib/env.cjs -> tools/lib -> tools -> <project root> */
const ROOT = path.resolve(__dirname, "..", "..");

function exists(p) {
  try {
    return !!p && fs.existsSync(p);
  } catch (e) {
    return false;
  }
}

function listDirs(p) {
  try {
    return fs.readdirSync(p).map((d) => path.join(p, d));
  } catch (e) {
    return [];
  }
}

/* "chromium-1194" -> 1194, so several downloaded generations can be ranked. */
function buildNo(p) {
  const m = /-(\d+)$/.exec(path.basename(p));
  return m ? parseInt(m[1], 10) : -1;
}

/* Confirm the candidate really is a browser before trusting it: a stale or partial
   playwright download is a common cause of "chrome.exe is not a valid application". */
function isChrome(p) {
  if (process.platform === "win32" && !/\.exe$/i.test(p)) return false;
  try {
    const { execFileSync } = require("child_process");
    const out = execFileSync(p, ["--version"], {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return /chrom/i.test(out);
  } catch (e) {
    return false;
  }
}

function findChrome() {
  const cands = [];

  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const pwRoots = [
    pw || null,
    pw ? null : path.join(os.homedir(), "AppData", "Local", "ms-playwright"),
    pw ? null : path.join(os.homedir(), ".cache", "ms-playwright"),
    pw ? null : path.join(os.homedir(), "Library", "Caches", "ms-playwright"),
  ].filter(Boolean);

  for (const root of pwRoots) {
    /* newest build first: directory order is not sorted on all filesystems, and an
       older generation that happens to sort early would otherwise win */
    const dirs = listDirs(root)
      .filter((d) => /^chromium/i.test(path.basename(d)))
      .sort((a, b) => buildNo(b) - buildNo(a));
    for (const dir of dirs) {
      cands.push(
        path.join(dir, "chrome-win", "chrome.exe"),
        path.join(dir, "chrome-linux", "chrome"),
        path.join(dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      );
    }
  }

  if (process.platform === "win32") {
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    cands.push(
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  } else if (process.platform === "darwin") {
    cands.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    cands.push(
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    );
  }

  for (const c of cands) if (exists(c) && isChrome(c)) return c;
  /* Fall back to a candidate that exists but could not be probed, so a locked-down
     machine still gets a useful error from Playwright instead of `undefined`. */
  for (const c of cands) if (exists(c)) return c;
  return undefined;
}

let cached;
function chrome() {
  if (cached === undefined) {
    const override = process.env.MV_CHROME || process.env.CHROME_PATH;
    cached = exists(override) ? override : findChrome();
  }
  return cached;
}

function fromPath(name) {
  const dirs = (process.env.PATH || "").split(path.delimiter);
  const exts = process.platform === "win32" ? [".exe", ""] : [""];
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, name + e);
      if (exists(p)) return p;
    }
  }
  return null;
}

/* ffmpeg and ffprobe travel together in every build worth using, so they are found
   together: a lone ffmpeg without ffprobe cannot pass verification. */
let cachedFf = null;
function ffmpeg() {
  if (cachedFf) return cachedFf;
  const win = process.platform === "win32";
  const exe = (n) => n + (win ? ".exe" : "");
  const cands = [
    { ffmpeg: process.env.MV_FFMPEG || process.env.FFMPEG, ffprobe: process.env.MV_FFPROBE || process.env.FFPROBE },
    {
      ffmpeg: path.join(ROOT, "ffmpeg", exe("ffmpeg")),
      ffprobe: path.join(ROOT, "ffmpeg", exe("ffprobe")),
    },
    { ffmpeg: fromPath("ffmpeg"), ffprobe: fromPath("ffprobe") },
  ];
  for (const c of cands) {
    if (exists(c.ffmpeg)) {
      cachedFf = { ffmpeg: c.ffmpeg, ffprobe: exists(c.ffprobe) ? c.ffprobe : null, hasProbe: exists(c.ffprobe) };
      return cachedFf;
    }
  }
  /* Nothing found: hand the bare name to the OS so the failure message comes from
     the tool itself, and say nothing more here. */
  cachedFf = { ffmpeg: "ffmpeg", ffprobe: null, hasProbe: false };
  return cachedFf;
}

module.exports = { ROOT, chrome, findChrome, ffmpeg, ffprobe: () => ffmpeg().ffprobe, hasProbe: () => ffmpeg().hasProbe };

/* Fail loudly at require time if there is no browser at all: playwright-core ships
   none, and a silent `executablePath: undefined` produces a confusing error much
   later, inside a render, after the frames have already started. */
if (require.main !== module) {
  if (chrome() === undefined) {
    console.error("[env] no Chrome/Chromium found. Set MV_CHROME (or CHROME_PATH), or run:");
    console.error("      npx playwright install chromium");
  }
  if (!exists(ffmpeg().ffmpeg)) {
    console.error("[env] no ffmpeg found. Set MV_FFMPEG, or drop ffmpeg.exe/ffprobe.exe into:");
    console.error("      " + path.join(ROOT, "ffmpeg"));
    console.error("      Playwright's bundled build is decode-only and cannot encode H.264.");
  }
}
