import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import {
  createDocument,
  ensureLayers,
  clone,
  documentRGBA,
  applyProposal,
  validateDocument,
} from "../src/core.mjs";
import { aiRegion, maximumZoom } from "../src/document-region.mjs";
import { scaleDocument, prepareImport } from "../src/image-size.mjs";
import { buildRequest, parseResponse } from "../electron/ai.mjs";
import { fixedScope } from "../electron/fixed-patch.mjs";
import { encodePNG, decodePNG, importPNG } from "../electron/png.mjs";

test("256px documents round-trip through projects, PNG and clipboard-sized rendering", () => {
  const doc = ensureLayers(createDocument(256, 128));
  doc.pixels[255] = 7;
  doc.pixels[32767] = 5;
  assert.deepEqual(documentRGBA(decodePNG(encodePNG(doc))), documentRGBA(doc));
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  assert.equal(maximumZoom(doc), 16);
  assert.equal(maximumZoom(createDocument(16, 16)), 64);
  const tile = clone(doc);
  tile.tileMode = { material: "water", wrap: true };
  assert.throws(() => validateDocument(tile));
});
test("large AI requests crop rows and server-rendered images without changing immutable IDs", () => {
  const doc = ensureLayers(createDocument(256, 128));
  doc.pixels[0] = 11;
  doc.pixels[100 * 256 + 201] = 7;
  const mask = doc.pixels.map(
    (_, i) => i === 100 * 256 + 201 || i === 100 * 256 + 202,
  );
  const input = {
    document: doc,
    mask,
    prompt: "Edit",
    quality: { mode: "off", protect: false },
    image: "untrusted full image",
    activeImage: "untrusted image",
  };
  const scope = fixedScope(input),
    body = buildRequest(input, "mock"),
    content = body.input[0].content,
    payload = JSON.parse(content[0].text);
  assert.equal(payload.width, 64);
  assert.equal(payload.height, 64);
  assert.equal(payload.rows.flat().length, 4096);
  assert.ok(!payload.rows.flat().includes(11));
  assert.equal(payload.editable_segments[0].x + scope.region.x, 201);
  assert.equal(payload.editable_segments[0].y + scope.region.y, 100);
  assert.equal(payload.editable_segments[0].id, scope.segments[0].id);
  for (const item of content.filter((c) => c.type === "input_image")) {
    const png = PNG.sync.read(
      Buffer.from(item.image_url.split(",")[1], "base64"),
    );
    assert.equal(png.width, 64);
    assert.equal(png.height, 64);
  }
  const wire = {
    summary: "Edit",
    new_colors: [],
    segments: [{ id: 0, colors: [5, null] }],
  };
  const response = {
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(wire) }],
      },
    ],
  };
  const result = applyProposal(
    doc,
    mask,
    parseResponse(response, input).proposal,
  );
  assert.equal(result.changed, 1);
  assert.equal(result.document.pixels[100 * 256 + 201], 5);
  assert.equal(result.document.pixels[0], 11);
  assert.equal(doc.pixels[100 * 256 + 201], 7);
  wire.roles = [{ id: 0, roles: "b.", materials: "a.", faces: "a." }];
  response.output[0].content[0].text = JSON.stringify(wire);
  const annotated = parseResponse(response, {
    ...input,
    quality: { mode: "check", protect: false },
  });
  assert.equal(annotated.roles.length, doc.pixels.length);
  assert.equal(annotated.roles[100 * 256 + 201], "b");
  assert.equal(annotated.regions.materials[100 * 256 + 201], "a");
});
test("oversized or widely separated writable bounds are rejected before building an AI request", () => {
  const doc = createDocument(128, 128),
    mask = doc.pixels.map(() => true);
  assert.throws(
    () => buildRequest({ document: doc, mask, prompt: "Edit" }, "mock"),
    /64px/,
  );
  mask.fill(false);
  mask[0] = mask[64] = true;
  assert.throws(() => aiRegion(doc, mask));
  mask[64] = false;
  mask[63] = true;
  assert.deepEqual(aiRegion(doc, mask), {
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    cropped: true,
  });
  const small = createDocument(16, 16);
  assert.equal(aiRegion(small, Array(256).fill(true)).cropped, false);
});
test("nearest-neighbor scaling preserves RGBA, masks, selection and hidden-layer data", () => {
  const doc = ensureLayers(createDocument(2, 2));
  doc.palette.push("#12345678");
  doc.pixels = [16, 7, 0, 5];
  doc.layers[0].mask = [true, false, true, true];
  doc.layers[0].refinementProtection = [false, true, false, false];
  doc.layers.push({ ...clone(doc.layers[0]), id: "hidden", visible: false });
  const before = JSON.stringify(doc),
    result = scaleDocument(doc, [true, false, false, false], 4, 4);
  assert.deepEqual(
    result.document.layers[0].pixels,
    [16, 16, 7, 7, 16, 16, 7, 7, 0, 0, 5, 5, 0, 0, 5, 5],
  );
  assert.deepEqual(result.document.layers[0].mask, [
    true,
    true,
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
  assert.equal(result.selection.filter(Boolean).length, 4);
  assert.equal(
    result.document.layers[1].refinementProtection.filter(Boolean).length,
    4,
  );
  assert.equal(JSON.stringify(doc), before);
  assert.deepEqual(result.document.palette, doc.palette);
  const down = scaleDocument(result.document, result.selection, 2, 2);
  assert.deepEqual(down.document.layers, doc.layers);
  doc.layers[1].locked = true;
  assert.throws(() => scaleDocument(doc, Array(4).fill(false), 4, 4));
  doc.layers[1].locked = false;
  doc.layers[0].alphaLocked = true;
  assert.throws(() => scaleDocument(doc, Array(4).fill(false), 4, 4));
});
test("large PNG import is explicitly prepared, cropped and reduced only on request", () => {
  const data = Buffer.alloc(512 * 2 * 4);
  for (let i = 0; i < 1024; i++) {
    data[i * 4] = i % 256;
    data[i * 4 + 1] = Math.floor(i / 256);
    data[i * 4 + 2] = 40;
    data[i * 4 + 3] = i % 7 ? 255 : 0;
  }
  const png = PNG.sync.write({ width: 512, height: 2, data });
  assert.throws(() => decodePNG(png));
  const prepared = importPNG(png, "Generated");
  assert.ok(prepared.imageImport);
  const source = prepared.imageImport,
    before = JSON.stringify(source);
  assert.throws(() =>
    prepareImport(source, { x: 0, y: 0, width: 512, height: 2 }, 256, 2),
  );
  const reduced = prepareImport(
    source,
    { x: 0, y: 0, width: 512, height: 2 },
    256,
    2,
    true,
  );
  assert.ok(reduced.palette.length <= 256);
  assert.equal(reduced.width, 256);
  validateDocument(reduced);
  assert.deepEqual(
    reduced,
    prepareImport(source, { x: 0, y: 0, width: 512, height: 2 }, 256, 2, true),
  );
  const cropped = prepareImport(
    source,
    { x: 300, y: 0, width: 16, height: 1 },
    16,
    1,
  );
  assert.equal(documentRGBA(cropped)[0], data[300 * 4]);
  assert.equal(JSON.stringify(source), before);
  assert.throws(() =>
    prepareImport(source, { x: 510, y: 0, width: 8, height: 1 }, 8, 1),
  );
});
test("quality repair context cannot leak runs outside the bounded image window", () => {
  const doc = createDocument(128, 128),
    mask = doc.pixels.map(() => false);
  mask[80 * 128 + 80] = true;
  const input = {
    document: doc,
    mask,
    prompt: "Repair",
    qualityRepair: {
      issues: [
        {
          id: 0,
          feature: [
            { x: 0, y: 0, length: 128 },
            { x: 70, y: 80, length: 58 },
          ],
          neighbors: [],
        },
      ],
      protected: [{ x: 0, y: 0, length: 128 }],
    },
  };
  const payload = JSON.parse(
    buildRequest(input, "mock").input[0].content[0].text,
  );
  assert.deepEqual(payload.quality_repair.protected, []);
  for (const run of payload.quality_repair.issues[0].feature) {
    assert.ok(
      run.x >= 0 && run.y >= 0 && run.x + run.length <= 64 && run.y < 64,
    );
  }
});
