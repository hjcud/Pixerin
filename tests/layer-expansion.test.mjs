import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  activeLayer,
  clone,
  validateDocument,
} from "../src/core.mjs";
import { moveSelection, placementPreview } from "../src/editing.mjs";
import { transformSelection } from "../src/advanced.mjs";
import {
  duplicateLayers,
  groupLayers,
  addClippingLayer,
} from "../src/layer-actions.mjs";
import { layersAtPixel } from "../src/layer-structure.mjs";
import {
  createPlacementRecord,
  restorePlacementRecord,
} from "../electron/placement-recovery.mjs";
const fixture = () => {
  const d = ensureLayers(createDocument(4, 4));
  d.pixels[0] = 7;
  d.pixels[1] = 8;
  activeLayer(d).mask = [false, ...Array(15).fill(true)];
  return d;
};
test("linked masks travel with painted pixels across move, copy and transforms while legacy masks stay fixed", () => {
  const d = fixture(),
    mask = d.pixels.map((_, i) => i < 2);
  assert.equal(
    activeLayer(moveSelection(d, mask, 1, 0).document).mask[0],
    false,
  );
  activeLayer(d).maskLinked = true;
  for (const operation of [
    () => moveSelection(d, mask, 1, 0),
    () => transformSelection(d, mask, "flip-x"),
  ]) {
    const next = operation().document;
    assert.equal(activeLayer(next).mask[0], true);
    assert.equal(activeLayer(next).mask[1], false);
  }
  const copied = moveSelection(d, mask, 2, 0, true).document;
  assert.equal(activeLayer(copied).mask[0], false);
  assert.equal(activeLayer(copied).mask[2], false);
  assert.equal(activeLayer(d).mask[0], false);
  assert.equal(activeLayer(validateDocument(d)).maskLinked, true);
  const invalid = clone(d);
  activeLayer(invalid).maskLinked = "yes";
  assert.throws(() => validateDocument(invalid));
});
test("multi-layer placement uses one fixed displacement, preserves masks and rejects any locked member atomically", () => {
  const d = fixture();
  activeLayer(d).maskLinked = true;
  d.layers.push({
    id: "top",
    name: "Top",
    visible: true,
    locked: false,
    pixels: [0, 0, 8, ...Array(13).fill(0)],
  });
  const ids = d.layers.map((l) => l.id),
    mask = d.pixels.map((_, i) => i < 3),
    before = JSON.stringify(d);
  const moved = placementPreview(d, mask, { x: 1, y: 1, layerIds: ids });
  assert.equal(moved.document.layers[0].pixels[5], 7);
  assert.equal(moved.document.layers[1].pixels[7], 8);
  assert.equal(moved.document.layers[0].mask[5], false);
  assert.equal(JSON.stringify(d), before);
  d.layers[1].locked = true;
  assert.throws(() => placementPreview(d, mask, { x: 1, y: 1, layerIds: ids }));
  assert.equal(d.layers[0].pixels[0], 7);
});
test("recovery retains the multi-layer target list and validates membership and locks", () => {
  const d = fixture();
  d.layers.push({
    id: "top",
    name: "Top",
    visible: true,
    locked: false,
    pixels: Array(16).fill(0),
  });
  const raw = {
    mask: d.pixels.map((_, i) => i < 2),
    copy: false,
    x: 1,
    y: 0,
    layerIds: ["layer-1", "top"],
  };
  const record = createPlacementRecord(d, raw);
  assert.deepEqual(restorePlacementRecord(d, record).layerIds, raw.layerIds);
  assert.throws(() =>
    createPlacementRecord(d, { ...raw, layerIds: ["layer-1", "missing"] }),
  );
  assert.throws(() =>
    createPlacementRecord(d, { ...raw, layerIds: ["layer-1", "layer-1"] }),
  );
});
test("batch grouping and duplication preserve order and independent mask ownership", () => {
  const d = fixture();
  d.layers.push({
    id: "top",
    name: "Top",
    visible: true,
    locked: false,
    pixels: Array(16).fill(0),
  });
  d.folders = [
    { id: "f", name: "F", locked: false, visible: true, collapsed: false },
  ];
  groupLayers(d, ["layer-1", "top"], "f");
  const copies = duplicateLayers(d, ["layer-1", "top"]);
  assert.equal(copies.length, 2);
  assert.ok(d.layers.every((l) => l.folderId === "f"));
  d.layers.find((l) => l.id === copies[0]).mask[0] = true;
  assert.equal(d.layers.find((l) => l.id === "layer-1").mask[0], false);
  assert.doesNotThrow(() => validateDocument(d));
});
test("quick clipping creates an empty layer above the stack and pixel picking excludes hidden masks", () => {
  const d = fixture();
  const id = addClippingLayer(d);
  assert.equal(activeLayer(d).id, id);
  assert.equal(activeLayer(d).clipped, true);
  assert.ok(d.pixels.every((c) => c === 0));
  d.pixels[1] = 8;
  assert.deepEqual(
    layersAtPixel(d, 1).map((l) => l.id),
    [id, "layer-1"],
  );
  d.pixels[0] = 8;
  assert.equal(layersAtPixel(d, 0).length, 0);
});
