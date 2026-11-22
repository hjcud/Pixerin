import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, ensureLayers, clone } from "../src/core.mjs";
import { floodFill } from "../src/editing.mjs";
import {
  normalizeBrushSizes,
  translateMask,
} from "../src/editor-interaction.mjs";

function fixture() {
  const d = ensureLayers(createDocument(8, 8));
  const border = Array(64).fill(0);
  for (let y = 1; y <= 6; y++)
    for (let x = 1; x <= 6; x++)
      if (x === 1 || x === 6 || y === 1 || y === 6) border[y * 8 + x] = 1;
  d.layers.push({
    id: "lines",
    name: "Lines",
    visible: true,
    locked: true,
    pixels: border,
  });
  return d;
}
test("brush sizes validate each supported tool independently", () => {
  assert.deepEqual(
    normalizeBrushSizes({
      pencil: 2,
      eraser: 8,
      line: "4",
      "brush-select": 0,
      fill: 3,
    }),
    { pencil: 2, eraser: 8, line: 1, "brush-select": 1 },
  );
  assert.equal(normalizeBrushSizes(null).pencil, 1);
});
test("boundary translation preserves irregular masks and clamps without mutating input", () => {
  const mask = Array(64).fill(false);
  [9, 10, 18].forEach((i) => (mask[i] = true));
  const before = [...mask];
  const moved = translateMask(mask, 8, 8, 20, -20);
  assert.deepEqual(
    moved.flatMap((v, i) => (v ? [i] : [])),
    [6, 7, 15],
  );
  assert.deepEqual(mask, before);
  assert.deepEqual(
    translateMask(Array(64).fill(false), 8, 8, 5, 5),
    Array(64).fill(false),
  );
});
test("composite fill uses frozen visible boundaries and changes only the active layer", () => {
  const d = fixture(),
    before = clone(d),
    mask = Array(64).fill(false);
  floodFill(d, mask, 3, 3, 7, false, false, "visible");
  assert.equal(d.pixels.filter((v) => v === 7).length, 16);
  assert.deepEqual(d.layers[1], before.layers[1]);
  assert.equal(d.pixels[0], 0);
  const hidden = fixture();
  hidden.layers[1].visible = false;
  floodFill(hidden, mask, 3, 3, 7, false, false, "visible");
  assert.equal(hidden.pixels.filter((v) => v === 7).length, 64);
  const raw = fixture();
  floodFill(raw, mask, 3, 3, 7);
  assert.equal(raw.pixels.filter((v) => v === 7).length, 64);
});
test("composite fill respects selection and exact active-layer alpha", () => {
  const d = fixture(),
    mask = Array(64).fill(false);
  d.palette.push("#FFFFFF80");
  d.pixels[27] = 16;
  d.pixels[28] = 16;
  mask[27] = true;
  floodFill(d, mask, 3, 3, 7, true, false, "visible");
  assert.equal(d.palette[d.pixels[27]], "#50A88980");
  assert.equal(d.pixels[28], 16);
  assert.equal(d.pixels[19], 0);
});
test("composite boundaries may span differing raw colors; wrapped neighbors still connect", () => {
  const d = fixture();
  d.layers[1].pixels.fill(5);
  d.pixels[0] = 7;
  floodFill(d, Array(64).fill(false), 0, 0, 7, false, false, "visible");
  assert.equal(d.pixels.filter((v) => v === 7).length, 64);
  const w = ensureLayers(createDocument(4, 1));
  w.pixels = [0, 1, 1, 0];
  floodFill(w, Array(4).fill(false), 0, 0, 7, false, true, "visible");
  assert.deepEqual(w.pixels, [7, 1, 1, 7]);
});
