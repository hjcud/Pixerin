import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  clone,
  documentRGBA,
  validateDocument,
} from "../src/core.mjs";
import { transformSelection, selectionToLayer } from "../src/advanced.mjs";

test("rotation skips transparent destination writes while retaining selection shape and exact partial alpha", () => {
  const d = ensureLayers(createDocument(4, 4));
  d.palette.push("#12345680");
  d.pixels[0] = 16;
  d.pixels[4] = 8;
  const before = clone(d),
    mask = Array(16).fill(false);
  mask[0] = mask[1] = true;
  const r = transformSelection(d, mask, "rotate-cw");
  assert.equal(r.document.pixels[4], 8);
  assert.equal(r.document.palette[r.document.pixels[0]], "#12345680");
  assert.deepEqual(
    r.selection.flatMap((v, i) => (v ? [i] : [])),
    [0, 4],
  );
  assert.deepEqual(d, before);
  // Irregular horizontal flips must also preserve background under transparent cells.
  d.pixels[0] = 0;
  d.pixels[2] = 7;
  d.pixels[3] = 8;
  const holes = Array(16).fill(false);
  holes[0] = holes[2] = holes[7] = true;
  assert.equal(transformSelection(d, holes, "flip-x").document.pixels[3], 8);
});
test("selection layer cut preserves composite, coordinates, other layers and moves detail protection", () => {
  const d = ensureLayers(createDocument(4, 4));
  d.palette.push("#12345680");
  d.pixels[0] = 16;
  d.pixels[1] = 7;
  d.layers[0].refinementProtection = Array(16).fill(false);
  d.layers[0].refinementProtection[0] = true;
  const mask = Array(16).fill(false);
  mask[0] = mask[4] = true;
  const before = clone(d),
    r = selectionToLayer(d, mask, { cut: true, id: "split" });
  assert.deepEqual(documentRGBA(r), documentRGBA(d));
  assert.deepEqual(d, before);
  assert.equal(r.layers[0].pixels[0], 0);
  assert.equal(r.layers[0].pixels[1], 7);
  assert.equal(r.layers[1].pixels[0], 16);
  assert.equal(r.layers[1].pixels[1], 0);
  assert.equal(r.layers[1].refinementProtection[0], true);
  assert.equal(r.layers[0].refinementProtection[0], false);
  assert.equal(r.activeLayerId, "split");
  assert.doesNotThrow(() => validateDocument(r));
});
test("selection copy permits a locked source but cut enforces layer/alpha/guide protections and limits", () => {
  const d = ensureLayers(createDocument(4, 4)),
    mask = Array(16).fill(false);
  mask[0] = true;
  d.pixels[0] = 7;
  d.layers[0].locked = true;
  const r = selectionToLayer(d, mask, { id: "copy" });
  assert.deepEqual(r.layers[0], d.layers[0]);
  assert.equal(r.layers[1].pixels[0], 7);
  assert.throws(() => selectionToLayer(d, mask, { cut: true }));
  d.layers[0].locked = false;
  d.layers[0].alphaLocked = true;
  assert.throws(() => selectionToLayer(d, mask, { cut: true }));
  assert.equal(selectionToLayer(d, mask).layers[1].alphaLocked, true);
  d.layers[0].alphaLocked = false;
  d.layers[0].geometryGuide = {};
  assert.throws(() => selectionToLayer(d, mask, { cut: true }));
  delete d.layers[0].geometryGuide;
  assert.throws(() => selectionToLayer(d, Array(16).fill(false)));
  while (d.layers.length < 32)
    d.layers.push({ ...clone(d.layers[0]), id: `l${d.layers.length}` });
  const before = clone(d);
  assert.throws(() => selectionToLayer(d, mask));
  assert.deepEqual(d, before);
});
