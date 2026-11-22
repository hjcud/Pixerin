import test from "node:test";
import assert from "node:assert/strict";
import { guideOrientation, rotateGuide } from "../src/geometry-rotation.mjs";
import { defaultGuide, validateGuide } from "../src/geometry.mjs";
const close = (a, b) =>
  a.forEach((n, i) => assert.ok(Math.abs(n - b[i]) < 1e-8, `${n} != ${b[i]}`));
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
test("arcball moves the grabbed surface point in the drag direction regardless of initial tilt", () => {
  for (const angles of [
    { yaw: 0, elevation: 0, roll: 0 },
    { yaw: 123, elevation: 65, roll: 85 },
    { yaw: 15, elevation: 90, roll: -105 },
  ]) {
    const guide = { ...defaultGuide(), ...angles };
    const before = guideOrientation(guide),
      point = before[2];
    const after = guideOrientation(rotateGuide(guide, [0, 0], [0.3, -0.4]));
    close(
      after.map((row) => dot(row, point)),
      [0.3, -0.4, Math.sqrt(0.75)],
    );
  }
});
test("arcball round trips, preserves dimensions and remains orthonormal at poles and opposite points", () => {
  const guide = {
    ...defaultGuide(),
    yaw: 132,
    elevation: -90,
    roll: 63,
    height: 1.2,
  };
  for (const [a, b] of [
    [
      [0, 0],
      [0, 0],
    ],
    [
      [0.2, 0.3],
      [-0.4, 0.8],
    ],
    [
      [-1, 0],
      [1, 0],
    ],
    [
      [3, 4],
      [-4, -3],
    ],
  ]) {
    const moved = rotateGuide(guide, a, b);
    validateGuide(moved);
    for (const key of ["height", "aspect", "thickness", "fill", "pose"])
      assert.equal(moved[key], guide[key]);
    const m = guideOrientation(moved);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        assert.ok(Math.abs(dot(m[i], m[j]) - (i === j ? 1 : 0)) < 1e-8);
    const restored = guideOrientation(rotateGuide(moved, b, a));
    guideOrientation(guide).forEach((row, i) => close(restored[i], row));
  }
});
