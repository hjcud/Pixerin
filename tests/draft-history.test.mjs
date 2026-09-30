import test from "node:test";
import assert from "node:assert/strict";
import { createDraftHistory } from "../src/draft-history.mjs";

test("held-key updates retain the starting state as one undo step", () => {
  const h = createDraftHistory();
  h.reset({ width: 16 });
  h.record({ width: 17 });
  for (let width = 18; width <= 64; width++)
    h.record({ width }, { merge: true });
  assert.deepEqual(h.undo(), { width: 16 });
  assert.equal(h.canUndo, false);
  assert.deepEqual(h.redo(), { width: 64 });
  assert.equal(h.record({ width: 64 }), false);
  h.record({ width: 63 });
  h.record({ width: 62 }, { merge: true });
  assert.deepEqual(h.undo(), { width: 64 });
  assert.deepEqual(h.undo(), { width: 16 });
});

test("dialog history isolates drafts, preserves redo on no-op and discards only a changed branch", () => {
  const h = createDraftHistory(2),
    original = { crop: { x: 0 } };
  h.reset(original);
  original.crop.x = 99;
  h.record({ crop: { x: 1 } });
  h.record({ crop: { x: 2 } });
  const previous = h.undo();
  assert.equal(previous.crop.x, 1);
  previous.crop.x = 88;
  assert.equal(h.record({ crop: { x: 1 } }), false);
  assert.equal(h.canRedo, true);
  assert.equal(h.redo().crop.x, 2);
  assert.equal(h.undo().crop.x, 1);
  assert.equal(h.undo().crop.x, 0);
  assert.equal(h.canUndo, false);
  h.record({ crop: { x: 3 } });
  assert.equal(h.canRedo, false);
  h.record({ crop: { x: 4 } });
  h.record({ crop: { x: 5 } });
  assert.equal(h.undo().crop.x, 4);
  assert.equal(h.undo().crop.x, 3);
  assert.equal(h.undo(), undefined);
  h.reset({ crop: { x: 8 } });
  assert.equal(h.canRedo, false);
});
