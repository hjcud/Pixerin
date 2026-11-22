import test from "node:test";
import assert from "node:assert/strict";
import { adjustReferenceCrop } from "../src/reference.mjs";
test("crop handles keep opposite edges fixed and clamp inside the source image", () => {
  const c = { x: 10, y: 8, width: 20, height: 16 };
  assert.deepEqual(adjustReferenceCrop(c, "nw", 3, -4, 64, 48), {
    x: 13,
    y: 4,
    width: 17,
    height: 20,
  });
  assert.deepEqual(adjustReferenceCrop(c, "se", 100, 100, 64, 48), {
    x: 10,
    y: 8,
    width: 54,
    height: 40,
  });
  assert.deepEqual(adjustReferenceCrop(c, "nw", 100, 100, 64, 48), {
    x: 29,
    y: 23,
    width: 1,
    height: 1,
  });
  assert.deepEqual(adjustReferenceCrop(c, "move", 100, -100, 64, 48), {
    x: 44,
    y: 0,
    width: 20,
    height: 16,
  });
  for (const edge of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
    const result = adjustReferenceCrop(c, edge, 2, 3, 64, 48);
    assert.equal(
      result.width,
      edge.includes("e") ? 22 : edge.includes("w") ? 18 : 20,
    );
    assert.equal(
      result.height,
      edge.includes("s") ? 19 : edge.includes("n") ? 13 : 16,
    );
  }
  assert.deepEqual(c, { x: 10, y: 8, width: 20, height: 16 });
});
