import assert from "node:assert/strict";
import { test } from "node:test";
import { detectGraphic } from "../src/lib/creative/graphics.ts";

test("a choice list in the scene text becomes choice chips", () => {
  const graphic = detectGraphic("Bil, bobil eller motorsykkel");
  assert.deepEqual(graphic, { kind: "choices", items: ["Bil", "Bobil", "Motorsykkel"], selected: 0 });
  assert.equal(detectGraphic("Car or motorcycle")?.kind, "choices");
});

test("an ordinary sentence is never turned into chips", () => {
  assert.equal(detectGraphic("Compare costs, plan trips and save money"), undefined);
  assert.equal(detectGraphic("Plan European road trips with exact toll"), undefined);
  assert.equal(detectGraphic("Is this something for you?", "Tolls, vignettes and fuel costs by country"), undefined);
});

test("too long or too many items are not chips", () => {
  assert.equal(detectGraphic("Fast shipping across the whole country or slow shipping with extra steps"), undefined);
  assert.equal(detectGraphic("A, B, C, D, E or F"), undefined);
});

test("a from-to phrase becomes a route card in the scene's language", () => {
  assert.deepEqual(detectGraphic("Fra Oslo til Bergen"), { kind: "route", from: "Oslo", to: "Bergen", fromLabel: "Fra", toLabel: "Til" });
  const english = detectGraphic("Drive from Oslo to Bergen in one day");
  assert.equal(english?.kind, "route");
  if (english?.kind === "route") assert.deepEqual([english.from, english.to, english.fromLabel], ["Oslo", "Bergen", "From"]);
});

test("text without a list or route draws nothing special", () => {
  assert.equal(detectGraphic("Hele turen. Før du kjører."), undefined);
});
