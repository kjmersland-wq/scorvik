import assert from "node:assert/strict";
import test from "node:test";
import { integratedLoudness } from "../src/lib/audio/loudness.ts";

function sine(frequency: number, amplitude: number, seconds: number, rate = 48000) {
  const data = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < data.length; i += 1) data[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / rate);
  return data;
}

test("loudness follows BS.1770: a full-scale 1 kHz tone is -3 LUFS on one channel and about 0 LUFS on two and level changes are exact", () => {
  const loud = sine(1000, 1, 3);
  const measured = integratedLoudness([loud, loud], 48000);
  assert.ok(Math.abs(measured) < 0.5, `stereo full-scale tone should be near 0 LUFS, got ${measured}`);
  const mono = integratedLoudness([loud, new Float32Array(loud.length)], 48000);
  assert.ok(Math.abs(mono - -3.01) < 0.5, `mono ${mono}`);
  const quiet = sine(1000, 0.5, 3);
  const diff = measured - integratedLoudness([quiet, quiet], 48000);
  assert.ok(Math.abs(diff - 6.02) < 0.1, `diff ${diff}`);
  assert.equal(integratedLoudness([new Float32Array(48000 * 2), new Float32Array(48000 * 2)], 48000), -Infinity);
});
