import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, ensureLayers, clone } from "../src/core.mjs";
import {
  modifySelection,
  connectedSelection,
} from "../src/connected-selection.mjs";

test("selection morphology handles canvas edges, holes and disjoint islands without changing the input", () => {
  const mask = Array(49).fill(false);
  for (let y = 1; y <= 5; y++)
    for (let x = 1; x <= 5; x++) mask[y * 7 + x] = true;
  const before = [...mask];
  assert.equal(modifySelection(mask, 7, 7, "grow").filter(Boolean).length, 49);
  assert.equal(modifySelection(mask, 7, 7, "shrink").filter(Boolean).length, 9);
  assert.equal(
    modifySelection(mask, 7, 7, "border").filter(Boolean).length,
    16,
  );
  assert.deepEqual(mask, before);
  const edge = Array(9).fill(true);
  assert.deepEqual(modifySelection(edge, 3, 3, "shrink"), [
    false,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    false,
  ]);
  const islands = Array(25).fill(false);
  islands[0] = islands[24] = true;
  assert.equal(
    modifySelection(islands, 5, 5, "grow").filter(Boolean).length,
    8,
  );
  assert.ok(!modifySelection(islands, 5, 5, "shrink").some(Boolean));
  mask[24] = false;
  assert.ok(!modifySelection(mask, 7, 7, "shrink").some(Boolean));
  assert.equal(
    modifySelection(mask, 7, 7, "border").filter(Boolean).length,
    24,
  );
});

test("visible selection samples the composite including masks and hidden layers, without modifying the active layer", () => {
  const doc = ensureLayers(createDocument(4, 4));
  doc.layers.push({
    id: "top",
    name: "Top",
    visible: true,
    locked: false,
    pixels: [7, 7, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7],
  });
  const before = clone(doc);
  assert.equal(connectedSelection(doc, 0, 0).filter(Boolean).length, 16);
  assert.equal(
    connectedSelection(doc, 0, 0, { source: "visible" }).filter(Boolean).length,
    3,
  );
  assert.equal(
    connectedSelection(doc, 0, 0, {
      source: "visible",
      contiguous: false,
    }).filter(Boolean).length,
    4,
  );
  assert.deepEqual(doc, before);
  doc.layers[1].mask = Array(16).fill(true);
  doc.layers[1].mask[1] = false;
  assert.equal(
    connectedSelection(doc, 0, 0, { source: "visible" }).filter(Boolean).length,
    2,
  );
  doc.layers[1].visible = false;
  assert.equal(
    connectedSelection(doc, 0, 0, { source: "visible" }).filter(Boolean).length,
    16,
  );
});

test("global color selection respects exact alpha, opaque mode and diagonal/wrapped connectivity", () => {
  const doc = ensureLayers(createDocument(3, 3));
  doc.palette.push("#50A88980");
  const half = doc.palette.length - 1;
  doc.pixels[0] = doc.pixels[8] = 7;
  doc.pixels[4] = half;
  assert.equal(
    connectedSelection(doc, 0, 0, { contiguous: false }).filter(Boolean).length,
    2,
  );
  assert.equal(
    connectedSelection(doc, 0, 0, { contiguous: false, mode: "opaque" }).filter(
      Boolean,
    ).length,
    3,
  );
  assert.equal(
    connectedSelection(doc, 0, 0, { diagonal: true, mode: "opaque" }).filter(
      Boolean,
    ).length,
    3,
  );
  assert.equal(
    connectedSelection(doc, 0, 0, { wrap: true, diagonal: true }).filter(
      Boolean,
    ).length,
    2,
  );
});
