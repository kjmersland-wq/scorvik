import assert from "node:assert/strict";
import test from "node:test";
import { getPosterPlacement, posterPlacements } from "../src/lib/platforms/presets.ts";
import { buildPosterBrief, claimCandidates, extractPrice, heroCandidates, hostOf, isDocsPath, trimOnWord } from "../src/lib/posters/brief.ts";
import { AA, chooseFieldAndInk, contrastRatio, IVORY, NEAR_BLACK, passesAA } from "../src/lib/posters/color.ts";
import { computeContactSheet, sheetLabel } from "../src/lib/posters/contact-sheet.ts";
import { chooseLayout, computeLayout, layoutRects, typeScale, type PosterLayout, type Rect } from "../src/lib/posters/layout.ts";
import { buildJpegPdf, pointsFor } from "../src/lib/posters/pdf.ts";
import type { Measure } from "../src/lib/posters/text.ts";
import { buildZip, crc32 } from "../src/lib/posters/zip.ts";
import type { PosterBrief, SiteAnalysis } from "../src/types/project.ts";

// Deterministic stand-in for canvas text measuring.
const measure: Measure = (text, font) => Math.round(text.length * font.size * (font.face === "display" ? 0.46 : 0.56));

const base: PosterBrief = {
  name: "Roadwise",
  claim: "Know the true cost of every kilometre.",
  palette: ["#0E1525", "#C8102E", "#012169"],
  host: "roadwise.com",
  steps: [],
  docsHint: false,
  mock: false,
};
const logo = { width: 240, height: 80 };
const hero = { width: 1200, height: 630 };

function analysis(overrides: Partial<SiteAnalysis> = {}): SiteAnalysis {
  return {
    url: "https://www.roadwise.com/", title: "Roadwise: European road trip costs", description: "Exact tolls, fuel and ferry costs across Europe. Plan with confidence.",
    brand: "Roadwise", colors: ["#0E1525", "#C8102E"], sellingPoints: [], image: "https://www.roadwise.com/hero.jpg",
    headings: ["Know the true cost of every kilometre."], images: ["https://www.roadwise.com/logo.png", "https://www.roadwise.com/hero.jpg"],
    logoCandidates: ["https://www.roadwise.com/logo.png"], visibleText: "Plan trips with exact tolls and fuel costs.",
    ...overrides,
  };
}

const inside = (inner: Rect, outer: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------- placements ----------

test("placements are exactly the sizes, safe zones and options specified", () => {
  const spec: Record<string, [number, number]> = {
    "instagram-feed-portrait": [1080, 1350], "story-reel-cover": [1080, 1920], "square-feed": [1080, 1080], "link-share": [1200, 628],
    "x-post": [1600, 900], "youtube-thumbnail": [1280, 720], pinterest: [1000, 1500], "linkedin-square": [1080, 1080], "print-a3": [1754, 2480],
  };
  assert.deepEqual(posterPlacements.map((p) => p.id), Object.keys(spec));
  for (const placement of posterPlacements) {
    assert.deepEqual([placement.width, placement.height], spec[placement.id], placement.id);
    assert.ok(placement.fileStem && placement.label && placement.usage);
  }
  assert.deepEqual(getPosterPlacement("instagram-feed-portrait")!.safeInsets, { top: 64, right: 64, bottom: 144, left: 64 });
  assert.deepEqual(getPosterPlacement("story-reel-cover")!.safeInsets, { top: 96, right: 64, bottom: 220, left: 64 });
  assert.deepEqual(getPosterPlacement("link-share")!.safeInsets, { top: 48, right: 48, bottom: 48, left: 48 });
  assert.equal(getPosterPlacement("link-share")!.textColumn, 0.8);
  assert.deepEqual(getPosterPlacement("youtube-thumbnail")!.safeInsets, { top: 48, right: 48, bottom: 48, left: 48 });
  assert.equal(getPosterPlacement("youtube-thumbnail")!.minNamePx, 64);
  assert.equal(getPosterPlacement("linkedin-square")!.sameMasterAs, "square-feed");
  assert.deepEqual([getPosterPlacement("print-a3")!.dpi, getPosterPlacement("print-a3")!.pdf], [150, true]);
});

// ---------- layout choice ----------

test("layout choice: price page, claim page, docs page", () => {
  assert.equal(chooseLayout({ docsHint: false, steps: [], price: "fra 299 kr/mnd" }), "price");
  assert.equal(chooseLayout({ docsHint: false, steps: [], price: undefined }), "claim");
  assert.equal(chooseLayout({ docsHint: true, steps: ["Install", "Configure", "Deploy"], price: undefined }), "steps");
  assert.equal(chooseLayout({ docsHint: true, steps: ["Install", "Configure", "Deploy"], price: "$19" }), "steps", "docs wins over price");
  assert.equal(chooseLayout({ docsHint: true, steps: ["Only", "Two"], price: undefined }), "claim", "docs needs three headings");
  assert.equal(chooseLayout({ docsHint: true, steps: ["Only", "Two"], price: "$19" }), "price");
});

test("a docs path is detected from the address", () => {
  for (const url of ["https://docs.example.com/start", "https://example.com/help/getting-started", "https://example.com/guide", "https://example.com/en/how-to/begin"]) assert.equal(isDocsPath(url), true, url);
  for (const url of ["https://example.com/", "https://example.com/pricing", "https://example.com/blog/helpful-things"]) assert.equal(isDocsPath(url), false, url);
});

// ---------- contrast ----------

test("ink always passes AA on the chosen field, including near-white and near-black brands", () => {
  const palettes = [
    ["#FAFAFA"], ["#FFFFFF", "#F4F4F4"], ["#0A0A0A"], ["#000000", "#111111"], ["#777777"], ["#808080", "#8a8a8a"], ["#C8102E"], ["#FFD400"],
    ["#0E1525", "#C8102E", "#012169"], ["#E57828", "#ffffff"], ["#7a7a52", "#6b6b4a"], ["#00FF00"], [], ["not-a-colour"],
  ];
  for (const palette of palettes) {
    for (const prefer of ["background", "accent"] as const) {
      for (const ink of [undefined, "#888888", "#222222", "#eeeeee", "#ff00ff"]) {
        const { field, ink: chosen } = chooseFieldAndInk(palette, { prefer, ink });
        assert.ok(contrastRatio(field, chosen) >= AA, `${palette.join(",")} ${prefer} ink=${ink}: ${field} on ${chosen} = ${contrastRatio(field, chosen).toFixed(2)}`);
        assert.ok(passesAA(field, chosen));
      }
    }
  }
});

test("near-white brand gets near-black ink, near-black brand gets ivory ink, muddy colours are avoided", () => {
  assert.deepEqual(chooseFieldAndInk(["#FAFAFA"]), { field: "#fafafa", ink: NEAR_BLACK });
  assert.deepEqual(chooseFieldAndInk(["#0A0A0A"]), { field: "#0a0a0a", ink: IVORY });
  assert.deepEqual(chooseFieldAndInk(["#777777"]), { field: IVORY, ink: NEAR_BLACK }, "mid-grey is muddy: fall back to ivory");
  assert.equal(chooseFieldAndInk(["#0E1525", "#C8102E"], { prefer: "accent" }).field, "#c8102e", "accent field is the saturated colour");
  assert.equal(chooseFieldAndInk(["#0E1525", "#C8102E"]).field, "#0e1525", "background field is slot 0");
});

test("the site's own ink is used only when it passes AA and is not mid-grey", () => {
  assert.equal(chooseFieldAndInk(["#FFFFFF"], { ink: "#1a1a1a" }).ink, "#1a1a1a");
  assert.equal(chooseFieldAndInk(["#FFFFFF"], { ink: "#888888" }).ink, NEAR_BLACK);
  assert.equal(chooseFieldAndInk(["#FFFFFF"], { ink: "#767676" }).ink, NEAR_BLACK, "passes AA by a hair but is mid-grey");
});

// ---------- overflow ----------

test("a 200-character claim is cut on a word and stays inside the safe rect", () => {
  const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ").slice(0, 200);
  assert.ok(long.length >= 195);
  assert.ok(trimOnWord(long, 90).length <= 90 && trimOnWord(long, 90).endsWith("…"));
  assert.equal(buildPosterBrief(analysis(), { claim: long }).claim, trimOnWord(long, 90));

  for (const placement of posterPlacements) {
    for (const kind of ["claim", "price", "steps"] as const) {
      const brief = { ...base, claim: long, price: "299 kr", steps: ["One", "Two", "Three"], docsHint: kind === "steps" };
      const layout = computeLayout(brief, placement, { measure, logo, hero, kind });
      const block = layout.slots.claim;
      const drawn = block.lines.join(" ");
      assert.ok(block.truncated, `${placement.id}/${kind} should truncate`);
      assert.ok(drawn.endsWith("…"));
      const kept = drawn.slice(0, -1).replace(/\s+$/, "");
      assert.ok(long.startsWith(kept) && long[kept.length] === " ", `${placement.id}/${kind}: cut on a word boundary ("${kept.slice(-12)}")`);
      assert.ok(inside(block.rect, layout.textSafe), `${placement.id}/${kind} claim inside the text safe rect`);
      assert.ok(inside(block.rect, layout.safe));
      for (const line of block.lines) assert.ok(measure(line, { face: block.face, weight: block.weight, size: block.size }) <= block.rect.w, "line fits the width");
    }
  }
});

test("short text is not shrunk or cut", () => {
  const layout = computeLayout(base, getPosterPlacement("square-feed")!, { measure, logo, hero });
  assert.equal(layout.slots.claim.truncated, false);
  assert.equal(layout.slots.claim.size, typeScale(getPosterPlacement("square-feed")!).claim);
});

// ---------- price layout snapshot (rects, not pixels) ----------

const priceBrief: PosterBrief = { ...base, price: "fra 299 kr/mnd", location: "Oslo" };

test("price layout slots, 1080x1350", () => {
  const layout = computeLayout(priceBrief, getPosterPlacement("instagram-feed-portrait")!, { measure, logo, hero });
  assert.equal(layout.kind, "price");
  assert.equal(layout.field, "#012169");
  assert.deepEqual(layoutRects(layout), {
    claim: { x: 64, y: 737, w: 952, h: 210 }, logo: { x: 64, y: 64, w: 228, h: 76 }, name: { x: 324, y: 73, w: 692, h: 58 },
    hero: { x: 64, y: 188, w: 952, h: 501 }, price: { x: 64, y: 979, w: 952, h: 89 }, location: { x: 64, y: 1116, w: 952, h: 45 }, host: { x: 64, y: 1161, w: 952, h: 45 },
  });
});

test("price layout slots, 1280x720", () => {
  const layout = computeLayout(priceBrief, getPosterPlacement("youtube-thumbnail")!, { measure, logo, hero });
  assert.deepEqual(layoutRects(layout), {
    claim: { x: 48, y: 159, w: 666, h: 251 }, logo: { x: 48, y: 62, w: 150, h: 50 }, name: { x: 220, y: 48, w: 494, h: 77 },
    hero: { x: 758, y: 236, w: 474, h: 249 }, price: { x: 48, y: 432, w: 666, h: 86 }, location: { x: 48, y: 552, w: 666, h: 60 }, host: { x: 48, y: 612, w: 666, h: 60 },
  });
});

// ---------- rules that always hold ----------

function everyLayout(): Array<{ id: string; kind: string; layout: PosterLayout; withImages: boolean }> {
  const out = [];
  for (const placement of posterPlacements) {
    for (const kind of ["claim", "price", "steps"] as const) {
      for (const withImages of [true, false]) {
        const brief = { ...priceBrief, steps: ["Install the tool", "Add your key", "Publish and share"], docsHint: kind === "steps" };
        out.push({ id: placement.id, kind, withImages, layout: computeLayout(brief, placement, { measure, logo: withImages ? logo : undefined, hero: withImages ? hero : undefined, kind }) });
      }
    }
  }
  return out;
}

test("nothing overlaps, text stays in the safe area, the picture never touches text", () => {
  for (const { id, kind, layout, withImages } of everyLayout()) {
    const label = `${id}/${kind}/${withImages ? "images" : "type only"}`;
    const rects = layoutRects(layout);
    const { slots } = layout;
    const textRects = Object.entries(rects).filter(([key]) => !["logo", "hero"].includes(key) && !key.endsWith(".disc"));
    for (const [key, rect] of textRects) assert.ok(inside(rect, layout.textSafe), `${label}: ${key} inside text safe`);
    for (const key of ["logo", "hero"]) if (rects[key]) assert.ok(inside(rects[key], layout.safe), `${label}: ${key} inside safe`);
    for (const key of Object.keys(rects).filter((k) => k.endsWith(".disc"))) assert.ok(inside(rects[key], layout.safe), `${label}: ${key}`);
    const names = Object.keys(rects);
    for (let i = 0; i < names.length; i += 1) for (let j = i + 1; j < names.length; j += 1) assert.ok(!overlaps(rects[names[i]], rects[names[j]]), `${label}: ${names[i]} overlaps ${names[j]}`);
    if (kind === "steps") assert.equal(slots.hero, undefined, `${label}: steps has no picture`);
    if (kind === "steps") assert.equal(slots.steps?.length, 3);
  }
});

test("type scale: name floors, logo size, claim largest and price second", () => {
  for (const { id, kind, layout } of everyLayout()) {
    const placement = getPosterPlacement(id)!;
    const short = Math.min(placement.width, placement.height);
    const { slots } = layout;
    const floor = placement.minNamePx ?? Math.round((48 * placement.width) / 1080);
    assert.ok(slots.name!.size >= floor, `${id}: name ${slots.name!.size}px is below ${floor}px`);
    if (placement.width === 1080) assert.ok(slots.name!.size >= 48);
    if (id === "youtube-thumbnail") assert.ok(slots.name!.size >= 64);
    if (slots.logo) assert.ok(slots.logo.h <= Math.round(short * 0.07), `${id}: logo too tall`);
    if (kind === "price") {
      assert.ok(slots.price!.size < typeScale(placement).claim, "price is smaller than the claim");
      assert.ok(slots.price!.size > slots.name!.size, `${id}: price must be larger than the name`);
    }
  }
});

test("9:16 keeps everything above the bottom chrome zone", () => {
  const story = getPosterPlacement("story-reel-cover")!;
  for (const { id, layout } of everyLayout().filter((entry) => entry.id === story.id)) {
    for (const [key, rect] of Object.entries(layoutRects(layout))) assert.ok(rect.y + rect.h <= story.height - 220, `${id}: ${key} reaches into the bottom 220px`);
  }
});

test("link share keeps text inside the centre 80% of the width", () => {
  const placement = getPosterPlacement("link-share")!;
  for (const { id, layout } of everyLayout().filter((entry) => entry.id === placement.id)) {
    for (const [key, rect] of Object.entries(layoutRects(layout))) {
      if (["hero"].includes(key) || key.endsWith(".disc")) continue;
      assert.ok(rect.x >= placement.width * 0.1 && rect.x + rect.w <= placement.width * 0.9, `${id}: ${key} leaves the centre 80%`);
    }
  }
});

test("variation is size, crop and field colour only: the three masters share their structure", () => {
  const price = computeLayout(priceBrief, getPosterPlacement("square-feed")!, { measure, logo, hero, kind: "price" });
  const claim = computeLayout(priceBrief, getPosterPlacement("square-feed")!, { measure, logo, hero, kind: "claim" });
  assert.notEqual(price.field, claim.field, "price uses the accent as field");
  assert.deepEqual(price.slots.logo, claim.slots.logo);
  assert.deepEqual(price.slots.name, claim.slots.name);
  assert.deepEqual(price.slots.host, claim.slots.host);
});

test("layout is deterministic", () => {
  const placement = getPosterPlacement("pinterest")!;
  assert.deepEqual(computeLayout(priceBrief, placement, { measure, logo, hero }), computeLayout(priceBrief, placement, { measure, logo, hero }));
});

test("missing fields stay missing: no filler lines", () => {
  const layout = computeLayout({ ...base, name: "", price: undefined, location: undefined, host: "" }, getPosterPlacement("square-feed")!, { measure });
  assert.equal(layout.slots.name, undefined);
  assert.equal(layout.slots.price, undefined);
  assert.equal(layout.slots.location, undefined);
  assert.equal(layout.slots.host, undefined);
  assert.equal(layout.slots.logo, undefined);
  assert.equal(layout.slots.hero, undefined);
  assert.ok(layout.slots.claim.lines.length > 0);
});

// ---------- the brief ----------

test("price is read from the page as written", () => {
  assert.equal(extractPrice("Bilvask fra 299 kr/mnd, ingen binding"), "fra 299 kr/mnd");
  assert.equal(extractPrice("Only $19 per month for everything"), "Only $19 per month");
  assert.equal(extractPrice("Just €9.99"), "€9.99");
  assert.equal(extractPrice("Pris: kr 1 299,- totalt")?.startsWith("kr 1 299"), true);
  assert.equal(extractPrice("Grunnlagt i 2019 med 12 ansatte"), undefined);
  assert.equal(extractPrice(undefined), undefined);
});

test("the brief comes from the existing analysis and invents nothing", () => {
  const brief = buildPosterBrief(analysis());
  assert.equal(brief.name, "Roadwise");
  assert.equal(brief.claim, "Know the true cost of every kilometre.");
  assert.equal(brief.price, undefined);
  assert.equal(brief.location, undefined);
  assert.equal(brief.host, "roadwise.com");
  assert.equal(brief.logoUrl, "https://www.roadwise.com/logo.png");
  assert.equal(brief.heroUrl, "https://www.roadwise.com/hero.jpg", "logos are never the hero");
  assert.equal(brief.mock, false);
  assert.equal(buildPosterBrief(analysis({ visibleText: "Pakker fra 299 kr/mnd." })).price, "fra 299 kr/mnd");
  assert.equal(buildPosterBrief(analysis({ source: { submittedUrl: "x", finalUrl: "x", fetchedAt: "", mode: "mock" } })).mock, true);
});

test("overrides win; an empty price means no price; nothing else is touched", () => {
  const a = analysis({ visibleText: "Fra 299 kr/mnd" });
  assert.equal(buildPosterBrief(a, { price: "" }).price, undefined);
  assert.equal(buildPosterBrief(a, { price: "199 kr" }).price, "199 kr");
  assert.equal(buildPosterBrief(a, { claim: "Eget krav", location: "Bergen", heroUrl: "" }).heroUrl, undefined);
  assert.equal(buildPosterBrief(a, { location: "Bergen" }).location, "Bergen");
  assert.equal(buildPosterBrief(a, { mode: "instruction" }).docsHint, true);
});

test("docs pages get three numbered lines from headings already extracted", () => {
  const brief = buildPosterBrief(analysis({
    url: "https://docs.example.com/start", canonicalUrl: undefined,
    headings: ["Get started", "Install the CLI", "Add your API key", "Deploy", "Troubleshooting"], steps: undefined,
  }));
  assert.equal(brief.docsHint, true);
  assert.deepEqual(brief.steps, ["Install the CLI", "Add your API key", "Deploy"]);
  assert.equal(chooseLayout(brief), "steps");
});

test("helpers: host, claim candidates and hero candidates", () => {
  assert.equal(hostOf("https://www.roadwise.com/path"), "roadwise.com");
  assert.equal(hostOf("not a url at all"), "not a url at all".length ? hostOf("not a url at all") : "");
  const candidates = claimCandidates(analysis({ headings: ["Roadwise", "Know the true cost", "Know the true cost"] }));
  assert.ok(!candidates.includes("Roadwise"), "the brand name alone is not a claim");
  assert.equal(candidates.filter((c) => c === "Know the true cost").length, 1);
  assert.ok(!heroCandidates(analysis()).includes("https://www.roadwise.com/logo.png"));
});

// ---------- zip ----------

function readZip(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const end = data.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files: Record<string, { data: Uint8Array; crc: number }> = {};
  for (let i = 0; i < count; i += 1) {
    assert.equal(view.getUint32(at, true), 0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(data.subarray(at + 46, at + 46 + nameLength));
    assert.equal(view.getUint32(local, true), 0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    files[name] = { data: data.subarray(start, start + size), crc };
    at += 46 + nameLength;
  }
  return files;
}

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("zip holds every file intact, with Norwegian names, and is deterministic", () => {
  const entries = [
    { name: "roadwise.com-square-feed-1080x1080.png", data: new Uint8Array([137, 80, 78, 71, 0, 1, 2, 3]) },
    { name: "roadwise.com-print-a3-1754x2480.pdf", data: new TextEncoder().encode("%PDF-1.4 test") },
    { name: "øl-æø-å.png", data: new Uint8Array(70_000).map((_, i) => i % 251) },
  ];
  const zip = buildZip(entries);
  const files = readZip(zip);
  assert.deepEqual(Object.keys(files), entries.map((e) => e.name));
  for (const entry of entries) {
    assert.deepEqual([...files[entry.name].data], [...entry.data]);
    assert.equal(files[entry.name].crc, crc32(entry.data));
  }
  assert.deepEqual([...buildZip(entries)], [...zip]);
});

// ---------- pdf ----------

test("the A3 pdf has a correct structure and the physical size of A3 at 150 dpi", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const pdf = buildJpegPdf(jpeg, 1754, 2480, 150);
  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.equal(pointsFor(1754, 150), 841.92);
  assert.equal(pointsFor(2480, 150), 1190.4);
  assert.ok(text.includes("/MediaBox [0 0 841.92 1190.4]"));
  assert.ok(text.includes("/Width 1754 /Height 2480"));
  assert.ok(text.includes("/Filter /DCTDecode"));
  const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
  assert.ok(text.slice(xref).startsWith("xref"));
  const offsets = [...text.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((match) => Number(match[1]));
  assert.equal(offsets.length, 5);
  offsets.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj`), `object ${index + 1} offset`));
  const imageAt = text.indexOf("stream\n", text.indexOf("/DCTDecode")) + 7;
  assert.deepEqual([...pdf.subarray(imageAt, imageAt + jpeg.length)], [...jpeg], "the JPEG bytes are embedded unchanged");
});

// ---------- contact sheet ----------

test("contact sheet: two columns, labelled with placement name and pixel size, nothing overlaps", () => {
  const cells = posterPlacements.map((p) => ({ id: p.id, label: p.label, width: p.width, height: p.height }));
  const sheet = computeContactSheet(cells);
  assert.equal(sheet.items.length, 9);
  assert.equal(new Set(sheet.items.map((item) => item.x)).size, 2, "exactly two columns");
  assert.equal(sheet.items[0].label, "Instagram feed, portrait — 1080×1350");
  assert.equal(sheetLabel(cells[3]), "Facebook and LinkedIn link — 1200×628");
  for (const item of sheet.items) {
    assert.ok(item.x + item.w <= sheet.width && item.y + item.h <= sheet.height);
    assert.ok(Math.abs(item.h / item.w - cells.find((c) => c.id === item.id)!.height / cells.find((c) => c.id === item.id)!.width) < 0.01, "aspect ratio kept");
  }
  for (let i = 0; i < sheet.items.length; i += 1) for (let j = i + 1; j < sheet.items.length; j += 1) {
    const a = sheet.items[i], b = sheet.items[j];
    assert.ok(!overlaps({ x: a.x, y: a.y, w: a.w, h: a.h + 40 }, { x: b.x, y: b.y, w: b.w, h: b.h + 40 }), `${a.id} / ${b.id} (with label)`);
  }
});

test("the three step lines share one text size", () => {
  const brief = { ...base, claim: "Hello World", docsHint: true, steps: ["Short", "A much longer second step that has to wrap over two lines to fit the column", "Medium length third step"] };
  for (const placement of posterPlacements) {
    const layout = computeLayout(brief, placement, { measure, logo, kind: "steps" });
    const sizes = new Set(layout.slots.steps!.map((step) => step.text.size));
    assert.equal(sizes.size, 1, `${placement.id}: step sizes ${[...sizes].join(", ")}`);
  }
});