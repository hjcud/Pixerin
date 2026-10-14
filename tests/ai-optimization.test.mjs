import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { createDocument, ensureLayers, applyProposal, activeLayer } from "../src/core.mjs";
import { buildRequest, parseResponse } from "../electron/ai.mjs";
import { fixedScope } from "../electron/fixed-patch.mjs";
import { buildImageRequest, imageProposal } from "../electron/image-generation.mjs";
import { GeneratedSourceCache } from "../electron/generated-source-cache.mjs";
import { publicUsage } from "../electron/progress.mjs";

const input = (width = 32, height = 16) => ({ document: ensureLayers(createDocument(width, height)), mask: Array(width * height).fill(true), prompt: "Green gem", advancedGeneration: true });
const png = (alpha = 255) => PNG.sync.write({ width: 8, height: 8, data: Buffer.from(Array.from({ length: 64 }, () => [30, 190, 80, alpha]).flat()) }).toString("base64");

test("fitting preserves painted margins while source transparency can still erase", () => {
  const source = input(); source.document.pixels.fill(1);
  const result = imageProposal(source, png());
  const applied = applyProposal(source.document, source.mask, result.proposal).document;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    assert.equal(applied.pixels[y * 32 + x] === 1, x < 8 || x >= 24);
    assert.notEqual(applied.pixels[y * 32 + x], 0);
  }
  const erased = applyProposal(source.document, source.mask, imageProposal(source, png(0)).proposal).document;
  assert.equal(erased.pixels[0], 1);
  assert.equal(erased.pixels[8], 0);
  assert.ok(source.document.pixels.every((value) => value === 1));
});

test("local reconversion changes threshold and placement, preserves locks and rejects invalid options", () => {
  const source = input();
  const converted = imageProposal(source, png(100), null, { threshold: 64, colors: 8, anchor: "end" });
  assert.equal(converted.proposal.runs.length, 256);
  assert.ok(converted.proposal.runs.every((run) => run.x >= 16));
  assert.equal(imageProposal(source, png(100)).proposal.runs.length, 0);
  for (const conversion of [{ colors: 0 }, { threshold: 256 }, { anchor: "stretch" }])
    assert.throws(() => imageProposal(source, png(), null, conversion));
  source.paletteOnly = true;
  source.document.pixels.fill(1);
  activeLayer(source.document).alphaLocked = true;
  source.mask[20] = false;
  const locked = imageProposal(source, png(), null, { colors: 64, anchor: "end" });
  assert.deepEqual(locked.proposal.new_colors, []);
  assert.ok(!locked.proposal.runs.some((run) => run.y === 0 && run.x === 20));
});

test("economy crops context with margins but immutable IDs map to original pixels", () => {
  const source = input(64, 64); source.mask.fill(false);
  for (let y = 20; y < 28; y++) for (let x = 30; x < 38; x++) source.mask[y * 64 + x] = true;
  const full = fixedScope(source);
  source.economy = true;
  const scope = fixedScope(source), body = buildRequest(source, "mock");
  const payload = JSON.parse(body.input[0].content[0].text);
  assert.deepEqual(scope.segments, full.segments);
  assert.equal(payload.rows.flat().length, 256);
  assert.equal(scope.region.x, 26); assert.equal(scope.region.y, 16);
  assert.equal(payload.editable_segments[0].x, 4);
  const response = { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "Edit", new_colors: [], segments: [{ id: 0, colors: [1, null, null, null, null, null, null, null] }] }) }] }] };
  const checked = applyProposal(source.document, source.mask, parseResponse(response, source).proposal);
  assert.equal(checked.changed, 1); assert.equal(checked.document.pixels[20 * 64 + 30], 1);
  assert.equal(source.document.pixels[20 * 64 + 30], 0);
  source.mask.fill(false);
  source.mask[0] = true;
  assert.deepEqual(fixedScope(source).region, { x: 0, y: 0, width: 5, height: 5, cropped: true });
  source.mask.fill(true);
  assert.equal(fixedScope(source).region.cropped, false);
  source.document.tileMode = { material: "water", wrap: true };
  assert.equal(fixedScope(source).region.cropped, false);
  source.economy = "true";
  assert.throws(() => fixedScope(source));
});

test("requests omit duplicate/empty generated context and unrelated mode instructions", () => {
  const source = input(8, 8);
  const images = (body) => body.input[0].content.filter((item) => item.type === "input_image");
  assert.equal(images(buildImageRequest(source, "mock")).length, 0);
  source.document.pixels.fill(1);
  assert.equal(images(buildImageRequest(source, "mock")).length, 1);
  source.document.layers.push({ ...structuredClone(activeLayer(source.document)), id: "other", name: "Other", pixels: Array(64).fill(3) });
  assert.equal(images(buildImageRequest(source, "mock")).length, 2);
  source.activeImage = source.image = "data:image/png;base64," + png();
  const basic = buildRequest(source, "mock");
  assert.equal(images(basic).length, 1);
  assert.ok(!basic.instructions.includes("When tile_mode"));
  assert.ok(!basic.instructions.includes("When autotile_guide"));
  assert.ok(!basic.instructions.includes("Under geometry_guide"));
  assert.match(basic.instructions, /immutable segment IDs/);
});

test("generated source cache isolates owners, freezes input, bounds retention and releases artwork", () => {
  const source = input(), result = imageProposal(source, png());
  const cache = new GeneratedSourceCache(), owner = {}, other = {};
  const stored = cache.put(owner, source, result);
  assert.ok(stored.sourceId); assert.ok(!("sourceImage" in stored));
  assert.throws(() => cache.get(other, stored.sourceId));
  cache.release(other, stored.sourceId);
  source.prompt = "changed";
  const cached = cache.get(owner, stored.sourceId);
  assert.equal(cached.input.prompt, "Green gem");
  cached.input.prompt = "mutated";
  assert.equal(cache.get(owner, stored.sourceId).input.prompt, "Green gem");
  cache.limit = cache.bytes;
  const newer = cache.put(other, input(), result);
  assert.ok(cache.bytes <= cache.limit);
  assert.throws(() => cache.get(owner, stored.sourceId));
  cache.release(other, newer.sourceId);
  assert.equal(cache.bytes, 0);
  assert.throws(() => cache.get(other, newer.sourceId));
  assert.ok(!new GeneratedSourceCache(1).put(owner, source, result).sourceId);
});

test("nested provider usage retains cache and reasoning counts without inventing values", () => {
  assert.deepEqual(publicUsage({ input_tokens: 100, output_tokens: 50, input_tokens_details: { cached_tokens: 80 }, output_tokens_details: { reasoning_tokens: 20 } }), { input_tokens: 100, output_tokens: 50, reasoning_tokens: 20, cached_tokens: 80 });
  assert.equal(publicUsage({ input_tokens_details: { cached_tokens: -1 }, output_tokens_details: { reasoning_tokens: Infinity } }), null);
});
