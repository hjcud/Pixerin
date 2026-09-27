import { fixedSegments } from "../electron/fixed-patch.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { validateTileMode, repeatRGBA } from "../src/tiles.mjs";
import {
  createDocument,
  ensureLayers,
  validateDocument,
  clone,
  applyProposal,
  documentRGBA,
  maskRuns,
} from "../src/core.mjs";
import { paintPoints, floodFill } from "../src/editing.mjs";
import { buildRequest } from "../electron/ai.mjs";
import { encodePNG } from "../electron/png.mjs";
import { defaultGuide } from "../src/geometry.mjs";
const tile = (w = 8, h = w) => {
  const d = ensureLayers(createDocument(w, h));
  d.tileMode = { material: "잔디", wrap: true };
  return d;
};

test("tile settings round trip on v1, layered projects and clones; invalid modes fail", () => {
  const doc = tile();
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  assert.deepEqual(clone(doc), doc);
  const old = createDocument(8, 8);
  old.tileMode = doc.tileMode;
  assert.deepEqual(ensureLayers(old).tileMode, doc.tileMode);
  for (const mode of [
    null,
    false,
    {},
    { material: "", wrap: true },
    { material: "x".repeat(121), wrap: true },
    { material: "잔디", wrap: "true" },
  ])
    assert.throws(() => validateTileMode(mode));
  doc.layers[0].geometryGuide = defaultGuide();
  assert.throws(() => validateDocument(doc), /입체 가이드/);
});
test("wrapped brush crosses every edge and corner without drawing a line across the tile", () => {
  const doc = tile(),
    mask = doc.pixels.map(() => false);
  paintPoints(
    doc,
    mask,
    [
      [7, 7],
      [8, 7],
      [9, 7],
    ],
    7,
  );
  assert.deepEqual(
    doc.pixels.map((c, i) => (c ? i : -1)).filter((i) => i >= 0),
    [56, 57, 63],
  );
  doc.pixels.fill(0);
  paintPoints(doc, mask, [[0, 0]], 7, 3);
  assert.equal(doc.pixels.filter(Boolean).length, 9);
  for (const x of [7, 0, 1])
    for (const y of [7, 0, 1]) assert.equal(doc.pixels[y * 8 + x], 7);
  doc.pixels.fill(0);
  doc.tileMode.wrap = false;
  paintPoints(doc, mask, [[0, 0]], 7, 3);
  assert.equal(doc.pixels.filter(Boolean).length, 4);
});
test("wrapped brushes honor selection, alpha and mirrored footprints after mapping", () => {
  const doc = tile(),
    mask = doc.pixels.map((_, i) => i === 7);
  doc.palette.push("#12345680");
  doc.pixels[7] = 16;
  paintPoints(doc, mask, [[-1, 0]], 7, 3, true, true);
  assert.equal(doc.palette[doc.pixels[7]], "#50A88980");
  assert.ok(doc.pixels.every((c, i) => i === 7 || c === 0));
});
test("flood fill connects through periodic edges but cannot cross selection or unrelated colors", () => {
  const doc = tile();
  doc.pixels.fill(1);
  doc.pixels[0] = doc.pixels[7] = doc.pixels[56] = doc.pixels[63] = 7;
  const mask = doc.pixels.map(() => false);
  const clipped = clone(doc);
  clipped.tileMode.wrap = false;
  floodFill(clipped, mask, 0, 0, 14);
  assert.equal(clipped.pixels.filter((c) => c === 14).length, 1);
  floodFill(doc, mask, 0, 0, 14);
  assert.equal(doc.pixels.filter((c) => c === 14).length, 4);
  const selected = tile();
  selected.pixels.fill(7);
  floodFill(
    selected,
    mask.map((_, i) => i === 0),
    0,
    0,
    14,
  );
  assert.equal(selected.pixels.filter((c) => c === 14).length, 1);
});
test("3x3 repetition preserves every RGBA byte including rectangular tiles and partial alpha", () => {
  for (const [w, h] of [
    [8, 8],
    [16, 32],
    [32, 16],
    [64, 64],
  ]) {
    const doc = tile(w, h);
    doc.palette.push("#12345680");
    doc.pixels = doc.pixels.map((_, i) => i % 17);
    const native = documentRGBA(doc),
      r = repeatRGBA(native, w, h);
    assert.equal(r.width, w * 3);
    assert.equal(r.height, h * 3);
    for (let y = 0; y < r.height; y++)
      for (let x = 0; x < r.width; x++)
        assert.deepEqual(
          r.data.slice((y * r.width + x) * 4, (y * r.width + x + 1) * 4),
          native.slice(
            ((y % h) * w + (x % w)) * 4,
            ((y % h) * w + (x % w) + 1) * 4,
          ),
        );
  }
});
test("tile AI receives server-built repeated visible composite and original editable coordinates", () => {
  const doc = tile();
  doc.pixels.fill(7);
  doc.layers.push({
    id: "hidden",
    name: "secret",
    visible: false,
    locked: false,
    pixels: doc.pixels.map(() => 14),
  });
  const mask = doc.pixels.map((_, i) => i % 8 === 0 || i % 8 === 7),
    request = buildRequest(
      { document: doc, mask, prompt: "경계 연결" },
      "gpt-6-astra",
    );
  const content = request.input[0].content,
    data = JSON.parse(content[0].text);
  assert.equal(data.tile_mode.material, "잔디");
  assert.match(data.tile_mode.editing_rule, /boundary strips/);
  assert.deepEqual(data.editable_segments, fixedSegments(mask, 8));
  assert.equal(data.width, 8);
  assert.equal(data.rows.length, 8);
  const image = content.find((c) => c.type === "input_image"),
    png = PNG.sync.read(Buffer.from(image.image_url.split(",")[1], "base64"));
  assert.equal(png.width, 24);
  assert.equal(png.height, 24);
  assert.deepEqual([...png.data.slice(0, 4)], [80, 168, 137, 255]);
  const proposal = {
    summary: "경계",
    new_colors: [],
    runs: [{ x: 7, y: 0, colors: [14] }],
  };
  assert.equal(applyProposal(doc, mask, proposal).document.pixels[7], 14);
  proposal.runs[0].x = 8;
  assert.throws(() => applyProposal(doc, mask, proposal));
  proposal.runs[0].x = 4;
  assert.throws(() => applyProposal(doc, mask, proposal));
});
test("PNG export stays a single native tile even when repeat preview and wrapped drawing are enabled", () => {
  const doc = tile(16);
  doc.pixels.fill(7);
  const png = PNG.sync.read(encodePNG(doc));
  assert.equal(png.width, 16);
  assert.equal(png.height, 16);
  assert.deepEqual([...png.data], [...documentRGBA(doc)]);
});
