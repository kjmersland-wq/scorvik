import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRange, safeMusicFile } from "../src/lib/music/serve.ts";

test("only plain mp3 file names are served", () => {
  assert.equal(safeMusicFile("warm-104-ad.mp3"), "warm-104-ad.mp3");
  assert.equal(safeMusicFile("jakob_welik-bla-bla-radio-edit-550257.mp3"), "jakob_welik-bla-bla-radio-edit-550257.mp3");
  for (const bad of ["../.env", "..%2f.env", "a/b.mp3", "a\b.mp3", ".hidden.mp3", "track.wav", "track.mp3.exe", "track (1).mp3", "a..b.mp3", "", "x".repeat(200) + ".mp3"]) assert.equal(safeMusicFile(bad), null, bad);
});

test("byte ranges are parsed for audio seeking and bad ones are refused", () => {
  assert.equal(parseRange(null, 1000), null);
  assert.deepEqual(parseRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange("bytes=500-", 1000), { start: 500, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=900-5000", 1000), { start: 900, end: 999 });
  for (const bad of ["bytes=1000-", "bytes=5-2", "bytes=-", "items=0-1", "bytes=0-1,5-6"]) assert.equal(parseRange(bad, 1000), "invalid", bad);
});
