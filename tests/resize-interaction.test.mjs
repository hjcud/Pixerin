import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, ensureLayers, clone } from "../src/core.mjs";
import { dragCanvasBounds, resizeCanvas } from "../src/document-operations.mjs";

test("edge gestures keep opposite edges fixed, chain offsets and clamp at canvas limits", () => {
  const s = { width: 16, height: 16, dx: 0, dy: 0 };
  const left = dragCanvasBounds(s, "w", -4, 8);
  assert.deepEqual(left, { width: 20, height: 16, dx: 4, dy: 0 });
  const right = dragCanvasBounds(left, "e", 3, 0);
  assert.deepEqual(right, { width: 23, height: 16, dx: 4, dy: 0 });
  assert.deepEqual(dragCanvasBounds(right, "nw", 2, -3), {
    width: 21,
    height: 19,
    dx: 2,
    dy: 3,
  });
  assert.deepEqual(dragCanvasBounds(s, "nw", 100, 100), {
    width: 1,
    height: 1,
    dx: -15,
    dy: -15,
  });
  assert.deepEqual(dragCanvasBounds(s, "se", 10000, 10000), {
    width: 2880,
    height: 2880,
    dx: 0,
    dy: 0,
  });
  for (const edge of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
    const g = dragCanvasBounds(s, edge, 2, 3);
    assert.equal(
      g.width,
      edge.includes("e") ? 18 : edge.includes("w") ? 14 : 16,
    );
    assert.equal(
      g.height,
      edge.includes("s") ? 19 : edge.includes("n") ? 13 : 16,
    );
  }
});
test("explicit margins preserve layers, masks, selection and protection from a frozen original", () => {
  const doc = ensureLayers(createDocument(4, 4));
  doc.pixels[0] = 7;
  const l = doc.layers[0];
  l.mask = Array(16).fill(true);
  l.mask[0] = false;
  l.refinementProtection = Array(16).fill(false);
  l.refinementProtection[0] = true;
  doc.layers.push({ ...clone(l), id: "hidden", visible: false, locked: true });
  const selection = Array(16).fill(false);
  selection[0] = true;
  const original = JSON.stringify(doc);
  const grown = resizeCanvas(doc, selection, 8, 6, "center", {
    offset: { x: 3, y: 1 },
  });
  for (const layer of grown.document.layers) {
    assert.equal(layer.pixels[11], 7);
    assert.equal(layer.mask[11], false);
    assert.equal(layer.refinementProtection[11], true);
  }
  assert.equal(grown.selection[11], true);
  const cut = resizeCanvas(doc, selection, 3, 4, "center", {
    offset: { x: -1, y: 0 },
  });
  assert.equal(cut.croppedPixels, 2);
  assert.equal(cut.croppedProtection, 2);
  assert.equal(JSON.stringify(doc), original);
  assert.throws(() =>
    resizeCanvas(doc, selection, 4, 4, "center", { offset: { x: 0.5, y: 0 } }),
  );
  l.geometryGuide = {};
  assert.throws(
    () =>
      resizeCanvas(doc, selection, 4, 4, "center", { offset: { x: 1, y: 0 } }),
    /입체 가이드/,
  );
});
