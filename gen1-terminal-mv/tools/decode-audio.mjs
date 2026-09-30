
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

/* Bring your own song: MV_SONG overrides, otherwise input/song.mp3.
   The master this film was cut to is not redistributed with this repository. */
const SRC = process.env.MV_SONG || path.join(ROOT, "input", "song.mp3");

/* The shared resolver in tools/lib/ffmpeg.cjs already knows every plausible
   location, so ask it rather than guessing a path here. That module is CommonJS,
   hence createRequire. */
const { ffmpeg: FF } = createRequire(import.meta.url)("./lib/ffmpeg.cjs");

const BUILD = path.join(ROOT, "build");
fs.mkdirSync(BUILD, { recursive: true });

const SR = 22050;
const pcmPath = path.join(BUILD, "audio_mono22050.f32");
if (!fs.existsSync(pcmPath)) {
  console.log("decoding " + SRC + " -> raw pcm ...");
  execFileSync(FF, ["-y", "-i", SRC, "-f", "f32le", "-ac", "1", "-ar", String(SR), pcmPath], { stdio: "inherit" });
}
const buf = fs.readFileSync(pcmPath);
const n = Math.floor(buf.length / 4);
const x = new Float32Array(buf.buffer, buf.byteOffset, n);
console.log("samples:", n, "duration:", (n / SR).toFixed(4), "s");
fs.writeFileSync(path.join(BUILD, "meta_audio.json"), JSON.stringify({ SR, samples: n, duration: n / SR }, null, 2));
