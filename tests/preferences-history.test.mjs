import test from "node:test";
import assert from "node:assert/strict";
import { History, createDocument, ensureLayers, clone } from "../src/core.mjs";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
} from "../src/preferences.mjs";

test("preferences migrate old files and validate all persisted options without coercion", () => {
  assert.deepEqual(normalizePreferences(), DEFAULT_PREFERENCES);
  const migrated = normalizePreferences({
    historyLimit: -1,
    grid: false,
    zoomSpeed: "2",
    canvasSize: 32,
  });
  assert.equal(migrated.historyLimit, 100);
  assert.equal(migrated.grid, false);
  assert.equal(migrated.zoomSpeed, 1);
  assert.equal(migrated.canvasSize, 32);
  assert.equal(migrated.theme, "dark");
  assert.equal(migrated.showHints, false);
  assert.equal(normalizePreferences({ showHints: true }, true).showHints, true);
  assert.equal(normalizePreferences({ theme: "light" }, true).theme, "light");
  for (const bad of [
    null,
    [],
    { historyMemoryMB: 513 },
    { historyLimit: 0 },
    { grid: 1 },
    { theme: "invalid" },
    { showHints: "false" },
    { zoomSpeed: NaN },
  ])
    assert.throws(() => normalizePreferences(bad, true));
  assert.equal(
    normalizePreferences({ secret: "never expose" }, true).secret,
    undefined,
  );
});

test("history enforces the byte budget and keeps the nearest undo states", () => {
  const state = (n) => ({ n, text: "한글".repeat(20) });
  const bytes = History.size(state(0));
  const h = new History(100, bytes * 3);
  for (let i = 0; i < 8; i++) h.record(state(i), state(i + 1));
  assert.equal(h.past.length, 3);
  assert.equal(h.usedBytes, bytes * 3);
  let current = state(8);
  for (const n of [7, 6, 5]) {
    current = h.undo(current);
    assert.deepEqual(current, state(n));
    assert.ok(h.usedBytes <= h.memoryBytes);
  }
  assert.equal(h.undo(current), null);
  for (const n of [6, 7, 8]) {
    current = h.redo(current);
    assert.deepEqual(current, state(n));
  }
});

test("lowering history limits trims both stacks without skipping intermediate states", () => {
  const h = new History(20);
  for (let i = 0; i < 10; i++) h.record(i, i + 1);
  let current = 10;
  for (let i = 0; i < 4; i++) current = h.undo(current);
  h.configure({ limit: 4 });
  assert.equal(h.past.length + h.future.length, 4);
  assert.equal(h.undo(current), 5);
  assert.equal(h.redo(5), 6);
  assert.equal(h.redo(6), 7);
  assert.equal(h.redo(7), 8);
  assert.equal(h.redo(8), null);
  h.undo(8);
  assert.equal(h.record(7, 7), false);
  assert.equal(h.redo(7), 8);
  h.undo(8);
  assert.equal(h.record(7, 100), true);
  assert.equal(h.redo(100), null);
});

test("oversized states never bypass the cap and a new edit cannot jump across missing history", () => {
  const h = new History(10, 10);
  h.record(1, 2);
  h.record("a".repeat(100), 3);
  assert.equal(h.usedBytes, 0);
  assert.equal(h.undo(3), null);
  h.record(3, "b".repeat(100));
  assert.equal(h.undo("b".repeat(100)), 3);
  assert.equal(h.redo(3), null);
  assert.throws(() => h.configure({ memoryBytes: 0 }));
});

test("serialized history restores live layer accessors, selections and independent snapshots", () => {
  const doc = ensureLayers(createDocument(8, 8));
  const before = { document: doc, selection: Array(64).fill(false) };
  const after = clone(before);
  after.document.pixels[0] = 7;
  after.selection[0] = true;
  const h = new History();
  h.record(before, after);
  before.document.pixels[2] = 4;
  const restored = h.undo(after);
  assert.equal(restored.document.pixels[2], 0);
  const redone = h.redo(restored);
  assert.equal(redone.document.pixels[0], 7);
  assert.equal(redone.selection[0], true);
  redone.document.pixels[1] = 8;
  assert.equal(redone.document.layers[0].pixels[1], 8);
  h.clear();
  assert.equal(h.usedBytes, 0);
});
