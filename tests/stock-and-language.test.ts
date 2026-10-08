import assert from "node:assert/strict";
import { test } from "node:test";
import { queryLadder, relevanceOf, scoreWithRelevance } from "../src/lib/stock/relevance.ts";
import { isNorwegian } from "../src/lib/creative/language.ts";

test("results whose own tags name the query words score higher than ones that do not", () => {
  const match = scoreWithRelevance(100, "highway toll road", "highway, road, traffic, cars");
  const miss = scoreWithRelevance(100, "highway toll road", "snow, forest, winter, trees");
  assert.ok(match > 110, `match ${match}`);
  assert.ok(miss < 70, `miss ${miss}`);
});

test("plural and -ing forms still count as a match", () => {
  assert.equal(relevanceOf("ferry sailing sea", "ferries sail across the sea"), 1);
  assert.equal(relevanceOf("electric car charging", "electric cars charge at a station"), 1);
});

test("results without any text are not judged", () => {
  assert.equal(relevanceOf("road", undefined), null);
  assert.equal(scoreWithRelevance(100, "road", ""), 100);
});

test("the query ladder goes from the full phrase to shorter ones", () => {
  assert.deepEqual(queryLadder("long straight road drive"), ["long straight road drive", "road drive", "long"]);
  assert.deepEqual(queryLadder("fuel station"), ["fuel station", "fuel"]);
});

test("only Norwegian page languages count as Norwegian", () => {
  for (const value of ["no", "nb", "nn", "nb-NO", "no-NO", "NB"]) assert.equal(isNorwegian(value), true, value);
  for (const value of ["nl", "ne", "en", "sv", "", undefined]) assert.equal(isNorwegian(value), false, String(value));
});
