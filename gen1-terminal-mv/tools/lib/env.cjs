/* tools/lib/env.cjs — resolve this project's paths and the external binaries it calls.
 *
 * Nothing here may hardcode a machine-specific absolute path: the scripts shipped in
 * this repository have to run on a machine that is not the one they were written on.
 *
 *   ROOT    the generation-1 project root (the folder that holds src/ and tools/)
 *   chrome  a Chrome/Chromium executable for Playwright, or undefined to let
 *           Playwright use its own download
 *   ffmpeg  a full ffmpeg/ffprobe (see tools/lib/ffmpeg.cjs, which owns the search)
 *
 * Overrides, so a user can point the scripts anywhere without editing them:
 *   MV_CHROME   full path to chrome.exe / chrome
 *   MV_FFMPEG   full path to ffmpeg
 *   MV_FFPROBE  full path to ffprobe
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

/* Does this file run and announce itself as a browser? */
function isChrome(p) {
  if (!/\.exe$/i.test(p) && process.platform === "win32") return false;
  try {
    const { execFileSync } = require("child_process");
    const out = execFileSync(p, ["--version"], {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return /chrom/i.test(out);
  } catch (e) {
    /* A browser whose --version probe fails may still work, but we cannot confirm
       it, so treat the candidate as unusable and keep looking. */
    return false;
  }
}

/* Chrome/Chromium, newest playwright download first, then the usual install spots. */
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
      const base = path.join(dir, "chrome-win");
      cands.push(
        path.join(base, "chrome.exe"),
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

  for (const c of cands) {
    if (exists(c) && isChrome(c)) return c;
  }
  /* Last resort: return the newest existing candidate unverified rather than a
     hardcoded path that certainly does not exist on someone else's machine. */
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

const { ffmpeg, ffprobe, hasProbe, audioCapable } = require("./ffmpeg.cjs");

module.exports = { ROOT, chrome, ffmpeg, ffprobe, hasProbe, audioCapable };

/* Fail loudly if there is no browser at all: a silent `executablePath: undefined`
   produces a confusing error much later, after the frames have already started. */
if (require.main !== module && chrome() === undefined) {
  console.error("[env] no Chrome/Chromium found. Set MV_CHROME (or CHROME_PATH),");
  console.error("      or install one (winget install Google.Chrome).");
}
