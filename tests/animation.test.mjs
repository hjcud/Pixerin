import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { createDocument, ensureLayers, validateDocument, documentRGBA, History, activeLayer } from "../src/core.mjs";
import { addFrame, selectFrame, frameAt, moveFrame, deleteFrame, setFrameDuration, playbackFrame } from "../src/animation.mjs";
import { validateAnimation } from "../src/animation-data.mjs";
import { scaleDocument } from "../src/image-size.mjs";
import { resizeCanvas } from "../src/document-operations.mjs";
import { renderMotion } from "../src/sprite-motion.mjs";
import { requestMotion, buildMotionRequest } from "../electron/sprite-motion.mjs";
import { crc32, spriteBundle, animatedPNG } from "../electron/sprite-export.mjs";
import { convertSpriteDrafts } from "../electron/sprite-conversion.mjs";
import { motionFixture } from "./motion-fixture.mjs";

test("frame duplication, editing, palette changes and navigation keep independent full-layer snapshots", () => {
  const original = ensureLayers(createDocument(8, 8)); original.pixels[0] = 7;
  let doc = addFrame(original); doc.palette[7] = "#10203080"; doc.pixels[1] = 7;
  doc = selectFrame(doc, 0);
  assert.equal(doc.version, 3); assert.equal(doc.pixels[1], 0); assert.equal(doc.palette[7], original.palette[7]);
  doc = selectFrame(JSON.parse(JSON.stringify(doc)), 1);
  assert.equal(doc.pixels[1], 7); assert.equal(doc.palette[7], "#10203080");
  assert.equal(doc.animation.frames[1].document, null); assert.equal(original.version, 2); assert.equal(original.pixels[1], 0);
  const decoded = History.decode(History.encode({ document: doc })); decoded.document.pixels[3] = 8;
  assert.equal(decoded.document.layers[0].pixels[3], 8);
});

test("frame ordering, deletion and duration preserve the selected cel and last-frame invariant", () => {
  let doc = addFrame(addFrame(ensureLayers(createDocument(4, 4)))); doc.pixels[0] = 8;
  const id = doc.animation.frames[2].id;
  doc = moveFrame(doc, 2, 0); assert.equal(doc.animation.frames[0].id, id); assert.equal(doc.animation.active, 0); assert.equal(doc.pixels[0], 8);
  doc = setFrameDuration(doc, 240); assert.equal(doc.animation.frames[0].duration, 240);
  doc = deleteFrame(doc); assert.equal(doc.animation.frames.length, 2); assert.ok(validateDocument(doc));
  doc = deleteFrame(doc); assert.throws(() => deleteFrame(doc));
  assert.equal(setFrameDuration(doc, 16).animation.frames[doc.animation.active].duration, 16);
  for (const value of [9, 10001, 20.5, NaN]) assert.throws(() => setFrameDuration(doc, value));
  assert.equal(playbackFrame([100, 200], 100), 1); assert.equal(playbackFrame([100, 200], 300), 0); assert.equal(playbackFrame([100, 200], 900, false), 1);
});

test("animation validation rejects recursive/lost snapshots, wrong dimensions and allocation excess before snapshot cloning", () => {
  const doc = addFrame(ensureLayers(createDocument(4, 4)));
  for (const corrupt of [value => value.animation.frames[1].document = {}, value => value.animation.frames[0].document.width = 5,
    value => value.animation.frames[0].document.animation = {}, value => value.animation.frames[0].id = value.animation.frames[1].id,
    value => value.version = 2]) {
    const bad = structuredClone(doc); corrupt(bad); assert.throws(() => validateDocument(bad));
  }
  const current = { width: 4096, height: 4096, layers: [{}] };
  const frames = Array.from({ length: 5 }, (_, i) => ({ id: "frame-" + i, duration: 100, document: i ? { ...current, version: 2 } : null }));
  let called = false; assert.throws(() => validateAnimation({ version: 1, active: 0, loop: true, frames }, current, () => { called = true; })); assert.equal(called, false);
});

test("canvas and image size operations transform every frame atomically and respect inactive locks", () => {
  let doc = addFrame(ensureLayers(createDocument(4, 4))); doc.pixels[5] = 7; const before = JSON.stringify(doc);
  const resized = scaleDocument(doc, Array(16).fill(false), 8, 8).document;
  assert.equal(frameAt(resized, 0).width, 8); assert.equal(frameAt(resized, 1).pixels[18], 7);
  const margins = resizeCanvas(doc, Array(16).fill(false), 6, 6, "nw").document;
  assert.equal(frameAt(margins, 1).pixels[7], 7); assert.equal(frameAt(margins, 0).pixels[7], 0);
  doc.animation.frames[0].document.layers[0].locked = true;
  assert.throws(() => scaleDocument(doc, Array(16).fill(false), 8, 8));
  doc.animation.frames[0].document.layers[0].locked = false; assert.equal(JSON.stringify(doc), before);
});

test("native motion reuses exact source RGBA and palette and never accumulates previous-frame drift", () => {
  const { input, plan } = motionFixture();
  const original = JSON.stringify(input.document), result = renderMotion(input, plan);
  assert.deepEqual(documentRGBA(frameAt(result.document, 0)), documentRGBA(input.document));
  assert.deepEqual(frameAt(result.document, 1).palette, input.document.palette);
  assert.deepEqual(documentRGBA(frameAt(result.document, 2)), documentRGBA(input.document));
  assert.ok(result.diagnostics.transitions.some(change => change.changed)); assert.equal(JSON.stringify(input.document), original);
  const sourceColors = new Set(input.document.palette);
  for (let i = 0; i < 4; i++) assert.ok(frameAt(result.document, i).palette.every(color => sourceColors.has(color)));
});

test("unsafe motion is rejected atomically: clipping, duplicate parts, source holes, fractional motion, palette and anchor changes", () => {
  const { input, plan } = motionFixture(), before = JSON.stringify(input.document);
  for (const corrupt of [p => p.frames[1].poses[0].dx = 16, p => p.parts.push(p.parts[0]), p => p.parts[0].runs.push({ x: 0, y: 0, length: 1 }),
    p => p.frames[1].poses[0].dx = 0.5, p => p.frames[1].edits.push({ x: 1, y: 1, color: 255 }), p => p.frames[0].edits.push({ x: 1, y: 1, color: 7 })]) {
    const bad = structuredClone(plan); corrupt(bad); assert.throws(() => renderMotion(input, bad)); assert.equal(JSON.stringify(input.document), before);
  }
});

test("motion respects selected pixels, detail protection, exact alpha and other layers", () => {
  const { input, plan } = motionFixture();
  const row = plan.parts[0].runs[0], at = row.y * 16 + row.x;
  const mask = Array(256).fill(false); mask[at] = true; assert.throws(() => renderMotion({ ...input, mask }, plan));
  input.document.layers[0].refinementProtection = Array(256).fill(true); assert.throws(() => renderMotion(input, plan)); delete input.document.layers[0].refinementProtection;
  activeLayer(input.document).alphaLocked = true; assert.throws(() => renderMotion(input, plan)); delete activeLayer(input.document).alphaLocked;
  input.document.layers.push({ id: "other", name: "KEEP", visible: false, locked: true, pixels: Array(256).fill(2) });
  const result = renderMotion(input, plan);
  for (let i = 0; i < 4; i++) assert.deepEqual(frameAt(result.document, i).layers[1], input.document.layers[1]);
});

test("all three API transports produce the same validated motion without live calls", async () => {
  const { input, plan } = motionFixture();
  for (const provider of ["api", "anthropic", "gemini"]) {
    let calls = 0;
    const fetchImpl = async (url, options) => {
      calls++; assert.match(url, /^https:\/\//); assert.equal(options.redirect, "error");
      const body = JSON.parse(options.body); assert.equal(body.model ?? "mock", "mock");
      const text = JSON.stringify(plan);
      return Response.json(provider === "api" ? { status: "completed", usage: { input_tokens: 20, output_tokens: 30 }, output: [{ type: "message", content: [{ type: "output_text", text }] }] }
        : provider === "anthropic" ? { stop_reason: "end_turn", usage: { input_tokens: 20, output_tokens: 30 }, content: [{ type: "text", text }] }
          : { usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 30 }, candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] });
    };
    const result = await requestMotion({ provider, key: "test-key", model: "mock", input, fetchImpl });
    assert.equal(calls, 1); assert.equal(result.document.animation.frames.length, 4); assert.equal(result.usage.input_tokens, 20);
  }
  const request = buildMotionRequest(input, "mock"), payload = JSON.parse(request.input[0].content[0].text);
  assert.deepEqual(payload.rows.flat(), input.document.pixels); assert.equal(payload.frame_count, 4); assert.equal(payload.palette.length, input.document.palette.length);
});

test("quality review is bounded, sums usage, retains a valid draft on failed repair and honors cancellation", async () => {
  const { input, plan } = motionFixture(); input.qualityReview = true;
  for (const unsafe of [false, true]) {
    let calls = 0;
    const result = await requestMotion({ provider: "api", key: "test-key", model: "mock", input, fetchImpl: async () => {
      const payload = calls++ ? { summary: "Reviewed", warnings: [], corrections: unsafe ? [{ frame: 0, edits: [] }] : [] } : plan;
      return Response.json({ status: "completed", usage: { input_tokens: 20, output_tokens: 30 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }] });
    } });
    assert.equal(calls, 2); assert.equal(result.usage.input_tokens, 40); assert.equal(Boolean(result.reviewIncomplete), unsafe);
  }
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(requestMotion({ provider: "api", key: "test-key", model: "mock", input, signal: controller.signal, fetchImpl: async () => {
    if (calls++) { controller.abort(); throw controller.signal.reason; }
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(plan) }] }] });
  } }));
});

test("both motion requests send only the active layer, including the quality contact sheet", async () => {
  const { input, plan } = motionFixture(); input.qualityReview = true;
  input.document.layers.unshift({ id: "background", name: "private context", visible: true, locked: true, pixels: Array(256).fill(5) });
  let calls = 0;
  await requestMotion({ provider: "api", key: "test", model: "mock", input, fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    for (const part of body.input[0].content.filter(part => part.type === "input_image")) {
      const image = PNG.sync.read(Buffer.from(part.image_url.split(",")[1], "base64"));
      assert.equal(image.data[3], 0, "Private opaque background must not appear in any transmitted image");
    }
    const payload = calls++ ? { summary: "Reviewed", warnings: [], corrections: [] } : plan;
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }] });
  } });
  assert.equal(calls, 2);
});

test("sprite ZIP and APNG preserve dimensions, timings, transparent holes and frame coordinates", () => {
  const { input, plan } = motionFixture(), result = renderMotion(input, plan), bundle = spriteBundle(result.document), files = new Map();
  const zip = bundle.bytes;
  for (let at = 0; zip.readUInt32LE(at) === 0x04034B50;) {
    const size = zip.readUInt32LE(at + 18), length = zip.readUInt16LE(at + 26), start = at + 30 + length;
    const data = zip.subarray(start, start + size), name = zip.toString("utf8", at + 30, start);
    assert.equal(crc32(data), zip.readUInt32LE(at + 14)); files.set(name, data); at = start + size;
  }
  const manifest = JSON.parse(files.get("spritesheet.json")); assert.equal(manifest.frames.length, 4);
  const sheet = PNG.sync.read(files.get("sheet-1.png")); assert.equal(sheet.width, 64); assert.equal(sheet.height, 16);
  for (let i = 0; i < 4; i++) {
    assert.equal(manifest.frames[i].duration, plan.frames[i].duration);
    const expected = documentRGBA(frameAt(result.document, i));
    for (let y = 0; y < 16; y++) assert.deepEqual(sheet.data.subarray((y * 64 + i * 16) * 4, (y * 64 + i * 16 + 16) * 4), Buffer.from(expected.subarray(y * 64, (y + 1) * 64)));
  }
  const apng = animatedPNG(result.document), durations = []; let count = 0;
  for (let at = 8; at < apng.length;) { const length = apng.readUInt32BE(at), type = apng.toString("ascii", at + 4, at + 8);
    if (type === "acTL") count = apng.readUInt32BE(at + 8);
    if (type === "fcTL") { durations.push(apng.readUInt16BE(at + 28)); assert.equal(apng[at + 33], 0); }
    assert.equal(crc32(apng.subarray(at + 4, at + 8 + length)), apng.readUInt32BE(at + 8 + length)); at += length + 12;
  }
  assert.equal(count, 4); assert.deepEqual(durations, plan.frames.map(frame => frame.duration));
  assert.equal(crc32(Buffer.from("123456789")), 0xCBF43926);
});

test("batch draft conversion fits exact cells, binary alpha and one shared or fixed palette", () => {
  const images = [0, 1].map(n => ({ width: 8, height: 8, data: Uint8Array.from(Array.from({ length: 64 }, (_, i) => [i * 3, n ? 200 : 180, 40, i % 7 ? 255 : 0]).flat()) }));
  const result = convertSpriteDrafts(images, { width: 4, height: 4, colors: 4 });
  assert.equal(result.palette.length <= 4, true); assert.deepEqual(frameAt(result, 1).palette, result.palette);
  assert.ok([...documentRGBA(result)].filter((_, i) => i % 4 === 3).every(v => v === 0 || v === 255));
  const fixed = ["#00000000", "#008000FF", "#FFFFFFFF"];
  const mapped = convertSpriteDrafts(images, { width: 4, height: 4, palette: fixed });
  assert.deepEqual(mapped.palette, fixed); assert.deepEqual(frameAt(mapped, 1).palette, fixed);
});
