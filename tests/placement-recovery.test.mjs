import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, ensureLayers, clone } from "../src/core.mjs";
import {
  createPlacementRecord,
  restorePlacementRecord,
  placementSourceKey,
} from "../electron/placement-recovery.mjs";
const fixture = () => {
  const doc = ensureLayers(createDocument(8, 2));
  doc.pixels[0] = 7;
  doc.pixels[3] = 11;
  return {
    doc,
    state: {
      mask: doc.pixels.map((_, i) => i < 2),
      clip: null,
      copy: false,
      x: 2,
      y: 0,
    },
  };
};
test("placement recovery stores only placement data and requires the same canonical source", () => {
  const { doc, state } = fixture(),
    before = clone(doc),
    record = createPlacementRecord(doc, state);
  assert.deepEqual(
    Object.keys(record).sort(),
    ["version", "sourceKey", "mask", "clip", "copy", "x", "y"].sort(),
  );
  assert.deepEqual(
    restorePlacementRecord(doc, JSON.parse(JSON.stringify(record))),
    state,
  );
  assert.equal(placementSourceKey(clone(doc)), record.sourceKey);
  for (const change of [
    (d) => (d.pixels[0] = 9),
    (d) => (d.name = "Other"),
    (d) => (d.layers[0].locked = true),
  ]) {
    const changed = clone(doc);
    change(changed);
    assert.throws(() => restorePlacementRecord(changed, record));
  }
  assert.deepEqual(doc, before);
});
test("recovery rejects invalid masks, coordinates, colors, versions and locked layers atomically", () => {
  const { doc, state } = fixture(),
    before = clone(doc);
  for (const invalid of [
    { ...state, mask: [true] },
    { ...state, mask: state.mask.map(Number) },
    { ...state, x: 999 },
    { ...state, y: 0.5 },
    { ...state, copy: 1 },
    { ...state, clip: { width: 1, height: 1, pixels: ["red"] } },
    { ...state, clip: { width: 9, height: 1, pixels: Array(9).fill(null) } },
  ])
    assert.throws(() => createPlacementRecord(doc, invalid));
  const record = createPlacementRecord(doc, state);
  assert.throws(() => restorePlacementRecord(doc, { ...record, version: 2 }));
  const locked = clone(doc);
  locked.layers[0].locked = true;
  assert.throws(() => createPlacementRecord(locked, state));
  assert.deepEqual(doc, before);
});
test("clipboard recovery retains transparent holes, partial alpha and duplicate mode", () => {
  const { doc, state } = fixture();
  const paste = {
    ...state,
    copy: true,
    clip: { width: 3, height: 1, pixels: ["#ABCDEF00", null, "#12345680"] },
  };
  assert.deepEqual(
    restorePlacementRecord(doc, createPlacementRecord(doc, paste)),
    paste,
  );
});
