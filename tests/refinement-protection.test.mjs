import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  activeLayer,
  validateDocument,
  clone,
  History,
} from "../src/core.mjs";
import { analyzeRefinement } from "../src/refinement.mjs";
import { mergeDown } from "../src/advanced.mjs";
test("saved refinement protection is layer-scoped, optional, validated and retained by history and merges", () => {
  const doc = ensureLayers(createDocument(8, 8));
  doc.pixels.fill(7);
  const original = clone(doc),
    protection = Array(64).fill(false);
  protection[9] = true;
  activeLayer(doc).refinementProtection = protection;
  const checked = validateDocument(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(checked, doc);
  assert.equal(analyzeRefinement(checked).mask[9], false);
  assert.equal(analyzeRefinement(checked).mask[10], true);
  assert.equal(
    analyzeRefinement(
      checked,
      Array(64).fill(false),
      false,
      Array(64).fill(false),
    ).mask[9],
    true,
  );
  const history = new History();
  history.record(original, checked);
  const undone = history.undo(checked);
  assert.equal(activeLayer(undone).refinementProtection, undefined);
  assert.deepEqual(history.redo(undone), checked);
  for (const invalid of [[], Array(64).fill(0), null, Array(63).fill(false)]) {
    const bad = clone(doc);
    activeLayer(bad).refinementProtection = invalid;
    assert.throws(() => validateDocument(bad), /보호/);
  }
  checked.layers.push({
    ...clone(activeLayer(checked)),
    id: "copy",
    pixels: Array(64).fill(0),
    refinementProtection: Array(64).fill(false),
  });
  checked.activeLayerId = "copy";
  activeLayer(checked).refinementProtection[10] = true;
  assert.equal(analyzeRefinement(checked).mask[9], true);
  const merged = mergeDown(checked);
  assert.equal(activeLayer(merged).refinementProtection[9], true);
  assert.equal(activeLayer(merged).refinementProtection[10], true);
  assert.deepEqual(checked.layers[0].refinementProtection, protection);
});
