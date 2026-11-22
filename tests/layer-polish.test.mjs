import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  clone,
  validateDocument,
} from "../src/core.mjs";
import {
  orderedLayers,
  canOrderLayers,
  alignLayers,
} from "../src/layer-actions.mjs";
import { clippingBase } from "../src/layer-structure.mjs";
import { COMMANDS, normalizeBindings, commandFor } from "../src/shortcuts.mjs";

const fixture = () => {
  const doc = ensureLayers(createDocument(8, 8));
  doc.layers = ["a", "b", "c", "d"].map((id, i) => ({
    id,
    name: id,
    visible: true,
    locked: false,
    pixels: Array.from({ length: 64 }, (_, p) => (p === 9 + 2 * i ? 7 + i : 0)),
  }));
  doc.activeLayerId = "a";
  return doc;
};
test("ordering moves noncontiguous selections together without reversing their order", () => {
  const d = fixture();
  const original = JSON.stringify(d);
  assert.deepEqual(
    orderedLayers(d, ["a", "c"], 1).map((l) => l.id),
    ["b", "a", "d", "c"],
  );
  assert.deepEqual(
    orderedLayers(d, ["b", "c"], -1).map((l) => l.id),
    ["b", "c", "a", "d"],
  );
  assert.equal(canOrderLayers(d, ["c", "d"], 1), false);
  assert.equal(JSON.stringify(d), original);
});
test("ordering preserves clipping bases, folder boundaries and inherited locks", () => {
  const d = fixture();
  d.layers[1].clipped = true;
  const next = clone(d);
  next.layers = orderedLayers(next, ["b"], 1);
  assert.deepEqual(
    next.layers.map((l) => l.id),
    ["c", "a", "b", "d"],
  );
  assert.equal(
    clippingBase(
      next,
      next.layers.find((l) => l.id === "b"),
    ).id,
    "a",
  );
  validateDocument(next);
  d.folders = [
    { id: "f", name: "F", visible: true, locked: false, collapsed: false },
  ];
  d.layers[2].folderId = d.layers[3].folderId = "f";
  assert.equal(canOrderLayers(d, ["a"], 1), false);
  assert.equal(canOrderLayers(d, ["c"], 1), true);
  d.folders[0].locked = true;
  assert.equal(canOrderLayers(d, ["c"], 1), false);
  d.layers[0].locked = true;
  assert.equal(canOrderLayers(d, ["b"], 1), false);
  const orphan = fixture();
  orphan.layers[0].clipped = true;
  assert.equal(canOrderLayers(orphan, ["a"], 1), false);
  assert.deepEqual(orderedLayers(orphan, ["a"], 1), orphan.layers);
});
test("alignment preserves linked masks, exact colors and object protection without mutating its input", () => {
  const d = fixture(),
    l = d.layers[0];
  l.mask = Array(64).fill(true);
  l.mask[9] = false;
  l.maskLinked = true;
  l.refinementProtection = Array(64).fill(false);
  l.refinementProtection[9] = true;
  l.protectionMode = "pixels";
  d.palette[7] = "#12345680";
  const original = JSON.stringify(d);
  const aligned = alignLayers(d, ["a", "b"], "right");
  assert.equal(aligned.layers[0].pixels[15], 7);
  assert.equal(aligned.layers[0].mask[15], false);
  assert.equal(aligned.layers[0].mask[9], true);
  assert.equal(aligned.layers[0].refinementProtection[15], true);
  assert.equal(aligned.layers[1].pixels[15], 8);
  assert.deepEqual(aligned.layers[2], d.layers[2]);
  assert.deepEqual(aligned.palette, d.palette);
  assert.equal(JSON.stringify(d), original);
  validateDocument(aligned);
});
test("active reference remains fixed and odd center offsets use deterministic integer placement", () => {
  const d = fixture();
  const aligned = alignLayers(d, ["a", "b", "c"], "left", "active");
  assert.deepEqual(aligned.layers[0], d.layers[0]);
  assert.equal(aligned.layers[1].pixels[9], 8);
  assert.equal(aligned.layers[2].pixels[9], 9);
  for (const [mode, index] of [
    ["left", 8],
    ["center-x", 11],
    ["right", 15],
    ["top", 1],
    ["center-y", 25],
    ["bottom", 57],
  ]) {
    const n = alignLayers(d, ["a"], mode);
    assert.equal(n.layers[0].pixels[index], 7, mode);
  }
});
test("alignment respects irregular selections and rejects protected targets atomically", () => {
  const d = fixture(),
    selection = Array(64).fill(false);
  selection[9] = selection[11] = selection[15] = true;
  const next = alignLayers(d, ["a", "b"], "right", "canvas", selection);
  assert.equal(next.layers[0].pixels[15], 7);
  assert.equal(next.layers[2].pixels[13], 9);
  assert.throws(
    () => alignLayers(d, ["a", "b"], "center-x", "canvas", selection),
    /선택 영역/,
  );
  for (const key of ["locked", "alphaLocked", "geometryGuide"]) {
    const bad = clone(d);
    bad.layers[1][key] = true;
    const before = JSON.stringify(bad);
    assert.throws(() => alignLayers(bad, ["a", "b"], "right"));
    assert.equal(JSON.stringify(bad), before);
  }
  const outside = clone(d);
  outside.layers[0].pixels[8] = 7;
  outside.layers[1].pixels.fill(0);
  outside.layers[1].pixels[15] = 8;
  outside.activeLayerId = "b";
  assert.throws(
    () => alignLayers(outside, ["a", "b"], "left", "active"),
    /캔버스 밖/,
  );
});
test("new layer commands support two configurable bindings without default conflicts", () => {
  for (const id of [
    "layer-up",
    "layer-down",
    "folder-add",
    "layer-clip-add",
    "layer-mask-open",
    "layer-mask-toggle",
    "layer-mask-link",
    "layer-selection-mask",
    "layer-mask-selection",
    "layer-align-open",
  ]) {
    assert.ok(COMMANDS.some((c) => c.id === id));
    const bindings = normalizeBindings({ [id]: ["Alt+q", "Ctrl+Alt+q"] });
    assert.equal(bindings[id].length, 2);
    assert.equal(
      commandFor({ key: "q", code: "KeyQ", altKey: true }, bindings),
      id,
    );
  }
});
