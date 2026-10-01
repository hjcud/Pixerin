import test from "node:test";
import assert from "node:assert/strict";
import {
  navigatorPan,
  navigatorBounds,
  commandNavigationIndex,
} from "../src/editor-interaction.mjs";
test("command navigation enters at the correct end and handles empty results", () => {
  assert.equal(commandNavigationIndex(-1, 5, -1), 4);
  assert.equal(commandNavigationIndex(-1, 5, 1), 0);
  assert.equal(commandNavigationIndex(0, 5, -1), 4);
  assert.equal(commandNavigationIndex(4, 5, 1), 0);
  assert.equal(commandNavigationIndex(-1, 0, 1), -1);
});
test("navigator pans to a pixel center and clips off-canvas viewport bounds", () => {
  const pan = navigatorPan(32, 16, 20, 24, 8);
  assert.deepEqual(pan, { x: -160, y: 0 });
  assert.deepEqual(navigatorBounds(32, 16, 20, 320, 160, pan.x, pan.y), {
    x: 16,
    y: 4,
    width: 16,
    height: 8,
  });
  assert.deepEqual(navigatorBounds(16, 16, 1, 800, 600, 0, 0), {
    x: 0,
    y: 0,
    width: 16,
    height: 16,
  });
  assert.equal(navigatorBounds(16, 16, 20, 100, 100, 10000, 0).width, 0);
  assert.deepEqual(navigatorPan(16, 16, 10, -5, 90), { x: 80, y: -80 });
});
