import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  clone,
  validateDocument,
  documentRGBA,
  editableMask,
  applyProposal,
  activeLayer,
} from "../src/core.mjs";
import {
  layerFlags,
  layerCoverageMap,
  moveLayerToFolder,
  moveFolder,
} from "../src/layer-structure.mjs";
import { mergeDown } from "../src/advanced.mjs";
import { resizeCanvas } from "../src/document-operations.mjs";
import { fixedScope } from "../electron/fixed-patch.mjs";
import { replaceColor } from "../src/colors.mjs";
const fixture = () => {
  const d = ensureLayers(createDocument(4, 4));
  d.pixels[0] = 7;
  d.pixels[1] = 7;
  d.layers.push({
    id: "shade",
    name: "Shade",
    visible: true,
    locked: false,
    pixels: Array(16).fill(8),
    clipped: true,
  });
  d.activeLayerId = "shade";
  return d;
};
test("clipping uses base alpha and its binary mask, preserving raw hidden artwork", () => {
  const d = fixture();
  d.palette[7] = "#50A88980";
  const before = JSON.stringify(d);
  assert.equal(layerCoverageMap(d)[0], 128 / 255);
  assert.equal(
    documentRGBA(d)[3],
    128,
    "clipped paint must not increase base alpha",
  );
  assert.equal(documentRGBA(d)[11], 0);
  d.layers[0].mask = [false, ...Array(15).fill(true)];
  assert.equal(documentRGBA(d)[3], 0);
  d.layers[0].maskEnabled = false;
  assert.ok(documentRGBA(d)[3] > 0);
  assert.equal(d.layers[1].pixels[2], 8);
  assert.equal(JSON.parse(before).layers[1].pixels[2], 8);
});
test("folder visibility and inherited locks reach composition, color changes and both AI boundaries", () => {
  const d = fixture();
  d.folders = [
    { id: "f", name: "Folder", visible: true, locked: true, collapsed: false },
  ];
  for (const l of d.layers) l.folderId = "f";
  assert.equal(layerFlags(d).locked, true);
  assert.ok(editableMask(d, Array(16).fill(true)).every((v) => !v));
  assert.throws(() => fixedScope({ document: d, mask: Array(16).fill(true) }));
  assert.throws(() =>
    applyProposal(d, Array(16).fill(true), {
      summary: "x",
      new_colors: [],
      runs: [{ x: 0, y: 0, colors: [7] }],
    }),
  );
  assert.equal(
    replaceColor(d, d.palette[8], "#000000FF", "all", []).changed,
    0,
  );
  d.folders[0].locked = false;
  const scope = fixedScope({ document: d, mask: Array(16).fill(true) });
  assert.deepEqual(scope.mask, [true, true, ...Array(14).fill(false)]);
  assert.throws(() =>
    applyProposal(d, Array(16).fill(true), {
      summary: "x",
      new_colors: [],
      runs: [{ x: 2, y: 0, colors: [7] }],
    }),
  );
  d.folders[0].visible = false;
  assert.ok(documentRGBA(d).every((v) => v === 0));
});
test("folder and mask metadata round trip with strict IDs, contiguous membership and boolean cells", () => {
  const d = fixture();
  d.folders = [
    { id: "f", name: "F", visible: true, locked: false, collapsed: true },
  ];
  d.layers[0].folderId = "f";
  d.layers[0].mask = Array(16).fill(true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(validateDocument(d))),
    JSON.parse(JSON.stringify(d)),
  );
  const bad = clone(d);
  bad.layers[0].mask[0] = 1;
  assert.throws(() => validateDocument(bad));
  bad.layers[0].mask = Array(16).fill(true);
  bad.layers[0].folderId = "missing";
  assert.throws(() => validateDocument(bad));
  const legacy = ensureLayers(createDocument(4, 4));
  assert.equal(validateDocument(legacy).folders, undefined);
  const split = clone(d);
  split.layers.push({ ...clone(split.layers[0]), id: "another" });
  assert.throws(() => validateDocument(split));
});
test("folder moves preserve contiguous blocks and forbid edits through locked folders", () => {
  const d = fixture();
  delete d.layers[1].clipped;
  d.folders = [
    { id: "f", name: "F", visible: true, locked: false, collapsed: false },
  ];
  d.layers[0].folderId = "f";
  moveLayerToFolder(d, "shade", "f");
  assert.equal(d.layers[1].folderId, "f");
  d.layers.push({
    id: "outside",
    name: "Outside",
    visible: true,
    locked: false,
    pixels: Array(16).fill(0),
  });
  moveFolder(d, "f", "outside");
  assert.doesNotThrow(() => validateDocument(d));
  moveLayerToFolder(d, "shade", undefined);
  assert.equal(activeLayer(d).folderId, undefined);
  d.folders[0].locked = true;
  assert.throws(() => moveLayerToFolder(d, "layer-1", undefined));
});
test("merging a clipped overlay bakes masks once and keeps the exact composite", () => {
  const d = fixture();
  d.layers[0].mask = [false, ...Array(15).fill(true)];
  const before = documentRGBA(d),
    merged = mergeDown(d);
  assert.deepEqual(documentRGBA(merged), before);
  assert.equal(activeLayer(merged).mask, undefined);
  assert.equal(activeLayer(merged).pixels[0], 0);
});
test("canvas resizing translates masks without changing original input", () => {
  const d = fixture();
  activeLayer(d).mask = [false, ...Array(15).fill(true)];
  const resized = resizeCanvas(d, Array(16).fill(false), 6, 6);
  assert.equal(activeLayer(resized.document).mask[7], false);
  assert.equal(activeLayer(resized.document).mask[0], true);
  assert.equal(activeLayer(d).mask.length, 16);
});
