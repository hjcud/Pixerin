import test from "node:test";
import assert from "node:assert/strict";
import {
  ellipsePoints,
  polygonPoints,
  curvePoints,
  symmetryPoints,
  pointsMask,
} from "../src/raster-tools.mjs";
import { paintPoints } from "../src/editing.mjs";
import { createDocument } from "../src/core.mjs";

test("ellipses are symmetric, bounded, reversible and handle thin bounds", () => {
  for (const [w, h] of [
    [1, 1],
    [1, 8],
    [8, 1],
    [4, 6],
    [9, 9],
  ]) {
    const points = ellipsePoints([0, 0], [w - 1, h - 1], true),
      set = new Set(points.map((p) => p.join(",")));
    assert.deepEqual(points, ellipsePoints([w - 1, h - 1], [0, 0], true));
    for (const [x, y] of points) {
      assert.ok(x >= 0 && y >= 0 && x < w && y < h);
      assert.ok(set.has(`${w - 1 - x},${y}`));
      assert.ok(set.has(`${x},${h - 1 - y}`));
    }
    assert.ok(
      ellipsePoints([0, 0], [w - 1, h - 1]).every((p) => set.has(p.join(","))),
    );
  }
  assert.equal(
    ellipsePoints([0, 0], [8, 8]).some(([x, y]) => x === 4 && y === 4),
    false,
  );
  assert.deepEqual(ellipsePoints([2, 3], [2, 3]), [[2, 3]]);
});
test("polygon parity preserves a concave cutout and clips masks", () => {
  const vertices = [
    [1, 1],
    [7, 1],
    [7, 3],
    [3, 3],
    [3, 7],
    [1, 7],
  ];
  const filled = new Set(polygonPoints(vertices, true).map((p) => p.join(",")));
  assert.ok(filled.has("2,6"));
  assert.ok(filled.has("6,2"));
  assert.ok(!filled.has("6,6"));
  const outline = polygonPoints(vertices);
  assert.ok(outline.every((p) => filled.has(p.join(","))));
  assert.deepEqual(
    new Set(
      polygonPoints([...vertices].reverse(), true).map((p) => p.join(",")),
    ),
    filled,
  );
  assert.deepEqual(
    pointsMask(2, 2, [
      [-1, 0],
      [0, 0],
      [1, 1],
      [2, 1],
    ]),
    [true, false, false, true],
  );
  assert.deepEqual(polygonPoints([], true), []);
});
test("quadratic raster curves retain endpoints and have no gaps or antialiasing", () => {
  for (const [start, end, control] of [
    [
      [1, 1],
      [12, 1],
      [6, 12],
    ],
    [
      [4, 4],
      [4, 4],
      [4, 4],
    ],
    [
      [2, 12],
      [12, 2],
      [1, 1],
    ],
  ]) {
    const path = curvePoints(start, end, control);
    assert.deepEqual(path[0], start);
    assert.deepEqual(path.at(-1), end);
    for (let i = 1; i < path.length; i++)
      assert.ok(
        Math.max(...path[i].map((p, k) => Math.abs(p - path[i - 1][k]))) <= 1,
      );
    assert.ok(path.every((p) => p.every(Number.isInteger)));
  }
});
test("symmetry supports off-center pixel/between-pixel axes and legacy booleans", () => {
  assert.deepEqual(symmetryPoints(2, 3, 16, 16, true), [
    [2, 3],
    [13, 3],
  ]);
  assert.deepEqual(
    symmetryPoints(2, 3, 16, 16, {
      horizontal: true,
      vertical: true,
      axisX: 4.5,
      axisY: 5,
    }),
    [
      [2, 3],
      [2, 7],
      [7, 3],
      [7, 7],
    ],
  );
  assert.deepEqual(
    symmetryPoints(4, 5, 16, 16, {
      horizontal: true,
      vertical: true,
      axisX: 4,
      axisY: 5,
    }),
    [[4, 5]],
  );
});
test("mirrored painting still respects selection and alpha protection", () => {
  const doc = createDocument(),
    mask = Array(doc.pixels.length).fill(false);
  mask[2 * 16 + 2] = true;
  mask[2 * 16 + 7] = true;
  doc.pixels[2 * 16 + 2] = 7;
  paintPoints(doc, mask, [[2, 2]], 5, 1, true, {
    horizontal: true,
    vertical: true,
    axisX: 4.5,
    axisY: 4.5,
  });
  assert.equal(doc.pixels[2 * 16 + 2], 5);
  assert.equal(doc.pixels[2 * 16 + 7], 0);
  assert.equal(doc.pixels[7 * 16 + 2], 0);
  assert.equal(doc.pixels.filter(Boolean).length, 1);
});
