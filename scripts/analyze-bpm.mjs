// Estimates the tempo of every library track (ffmpeg decodes, src/lib/audio/beats.ts analyses) and writes scripts/bpm.json.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { estimateBeatGrid } from "../src/lib/audio/beats.ts";

const dir = "public/music";
const result = {};
for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".mp3"))) {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", `${dir}/${file}`, "-t", "90", "-ac", "1", "-ar", "22050", "-f", "f32le", "-"], { maxBuffer: 200 * 1024 * 1024 });
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
  const grid = estimateBeatGrid(samples, 22050);
  result[file] = grid ? { bpm: grid.bpm, confidence: Math.round(grid.confidence * 100) / 100 } : null;
  console.log(file, result[file]);
}
fs.writeFileSync("scripts/bpm.json", `${JSON.stringify(result, null, 2)}\n`);
