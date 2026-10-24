import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { createDocument, ensureLayers, activeLayer, applyProposal, documentRGBA } from "../src/core.mjs";
import { buildImageRequest, advancedInput, imageProposal, decodeGeneratedPNG, requestImage } from "../electron/image-generation.mjs";
const png = (width = 8, height = 8, color = [40, 200, 100, 255]) => PNG.sync.write({ width, height, data: Buffer.from(Array.from({ length: width * height }, () => color).flat()) }).toString("base64");
const input = (width = 8, height = 8) => ({ document: ensureLayers(createDocument(width, height)), mask: Array(width * height).fill(true), prompt: "A green gem", advancedGeneration: true, quality: { mode: "repair", protect: true } });

test("advanced generation is explicit, bounded and builds context from the snapshot", () => {
  const source = input(); source.image = "attacker-image"; source.activeImage = "attacker-layer";
  assert.throws(() => advancedInput({ ...source, advancedGeneration: false }));
  assert.throws(() => advancedInput(input(128, 128)), /64/);
  const body = buildImageRequest(source, "gpt-6-astra");
  assert.equal(body.store, false); assert.equal(body.max_tool_calls, 1);
  assert.deepEqual(body.tool_choice, { type: "image_generation" });
  assert.equal(body.tools.length, 1); assert.equal(body.tools[0].output_format, "png");
  assert.ok(!JSON.stringify(body).includes("attacker"));
  assert.equal(advancedInput(source).quality.mode, "check");
  assert.equal(source.quality.mode, "repair");
});

test("raster conversion preserves selection, details, inactive layers and input atomically", () => {
  const source = input(); source.mask[3] = false;
  activeLayer(source.document).refinementProtection = Array(64).fill(false);
  activeLayer(source.document).refinementProtection[4] = true;
  source.document.layers.push({ ...structuredClone(activeLayer(source.document)), id: "other", name: "Other" });
  const original = structuredClone(source);
  const result = imageProposal(source, png());
  assert.ok(!result.proposal.runs.some((r) => r.y === 0 && [3, 4].includes(r.x)));
  const checked = applyProposal(source.document, source.mask, result.proposal);
  assert.equal(checked.changed, 62);
  assert.deepEqual(checked.document.layers[1], original.document.layers[1]);
  assert.deepEqual(source, original);
  assert.ok(result.advancedGeneration);
});

test("layer alpha locks override caller flags and preserve exact partial alpha", () => {
  const source = input(); source.alphaLock = false;
  source.document.palette.push("#11223373");
  source.document.pixels[0] = source.document.palette.length - 1;
  activeLayer(source.document).alphaLocked = true;
  const result = imageProposal(source, png());
  const applied = applyProposal(source.document, source.mask, result.proposal, { alphaLock: true }).document;
  assert.equal(documentRGBA(applied, false)[3], 115);
  assert.equal(result.proposal.runs.length, 1);
  assert.equal(applied.pixels[1], 0);
});

test("existing palette mapping never adds colors or changes their alpha", () => {
  const source = input(); source.paletteOnly = true;
  source.document.palette = ["#00000000", "#00FF00FF"];
  const result = imageProposal(source, png());
  assert.deepEqual(result.proposal.new_colors, []);
  assert.ok(result.proposal.runs.every((r) => r.colors[0] === 1));
  const absent = input(); absent.paletteOnly = true; absent.document.palette = ["#00000000"];
  assert.throws(() => imageProposal(absent, png()), /팔레트/);
});

test("large-document mapping, masks and clipping use original document coordinates", () => {
  const source = input(128, 128); source.mask.fill(false);
  source.mask[90 * 128 + 100] = true;
  const result = imageProposal(source, png());
  assert.deepEqual(result.proposal.runs.map(({ x, y }) => [x, y]), [[100, 90]]);
  const locked = input(); activeLayer(locked.document).locked = true;
  assert.throws(() => imageProposal(locked, png()));
  const masked = input(); activeLayer(masked.document).mask = Array(64).fill(true);
  activeLayer(masked.document).mask[0] = false; activeLayer(masked.document).maskEnabled = true;
  assert.ok(!imageProposal(masked, png()).proposal.runs.some((r) => r.x === 0 && r.y === 0));
});

test("generated PNG validation rejects malformed, non-PNG and oversized headers before decoding", () => {
  for (const value of [null, "https://example.com/image.png", "abcd", "!PNG"])
    assert.throws(() => decodeGeneratedPNG(value));
  const bytes = Buffer.from(png(), "base64"); bytes.writeUInt32BE(100000, 16);
  assert.throws(() => decodeGeneratedPNG(bytes.toString("base64")));
});

test("aspect fitting adds transparent margins and binary alpha without distortion", () => {
  const source = input();
  const result = imageProposal(source, png(16, 8));
  const applied = applyProposal(source.document, source.mask, result.proposal).document;
  assert.equal(result.proposal.runs.length, 32);
  assert.ok(result.proposal.runs.every((r) => r.y >= 2 && r.y < 6));
  assert.ok(applied.palette.every((c) => /(?:00|FF)$/.test(c)));
});

test("API generates once, reports usage, and does not trigger quality repair", async () => {
  let calls = 0; const events = [];
  const result = await requestImage({ key: "test-key", model: "gpt-6-astra", input: input(), onProgress: (e) => events.push(e),
    fetchImpl: async (url, options) => {
      calls++; assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(JSON.parse(options.body).max_tool_calls, 1);
      return Response.json({ status: "completed", output: [{ type: "image_generation_call", status: "completed", result: png() }], usage: { input_tokens: 8, output_tokens: 4 } });
    },
  });
  assert.equal(calls, 1); assert.equal(result.usage.output_tokens, 4);
  assert.equal(result.quality, undefined); assert.ok(events.some((e) => e.type === "usage"));
});

test("API failures, duplicate output and cancellation never retry or return a partial draft", async () => {
  for (const response of [new Response("denied", { status: 403 }), Response.json({ status: "completed", output: [] }), Response.json({ status: "completed", output: Array(2).fill({ type: "image_generation_call", status: "completed", result: png() }) })]) {
    let calls = 0;
    await assert.rejects(requestImage({ key: "test", model: "gpt-6-astra", input: input(), fetchImpl: async () => { calls++; return response; } }));
    assert.equal(calls, 1);
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestImage({ key: "test", model: "gpt-6-astra", input: input(), signal: controller.signal, fetchImpl: () => { throw new Error("must not send"); } }), { name: "AbortError" });
});
