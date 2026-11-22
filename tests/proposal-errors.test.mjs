import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  validateDocument,
  clone,
  applyProposal,
} from "../src/core.mjs";
import { defaultGuide, rasterizeGuide } from "../src/geometry.mjs";
import { createAutotile, autoConstraints } from "../src/autotile.mjs";

const patch = (doc, index, color = doc.pixels[index]) => ({
  summary: "A redundant write is still outside the contract",
  new_colors: [],
  runs: [
    { x: index % doc.width, y: Math.floor(index / doc.width), colors: [color] },
  ],
});
function rejected(doc, mask, proposal, options, reason, index) {
  const before = clone(doc);
  assert.throws(
    () => applyProposal(doc, mask, proposal, options),
    (error) => {
      assert.match(error.message, reason);
      assert.match(
        error.message,
        new RegExp(
          `X ${index % doc.width}, Y ${Math.floor(index / doc.width)}`,
        ),
      );
      assert.match(error.message, /전체 변경안/);
      assert.match(error.message, /원본은 그대로/);
      return true;
    },
  );
  assert.deepEqual(doc, before);
}
test("selection errors identify the first forbidden pixel and never apply an earlier valid run", () => {
  const doc = ensureLayers(createDocument(8, 8));
  doc.pixels.fill(7);
  const mask = doc.pixels.map((_, i) => i === 0);
  const proposal = patch(doc, 9);
  proposal.runs.unshift({ x: 0, y: 0, colors: [14] });
  rejected(doc, mask, proposal, {}, /선택 영역 밖/, 9);
});
test("alpha protection explains a transparent pixel even when the submitted mask already excludes it", () => {
  const doc = ensureLayers(createDocument(8, 8));
  doc.pixels[0] = 7;
  for (const mask of [
    doc.pixels.map((_, i) => i === 0),
    doc.pixels.map(() => true),
  ])
    rejected(doc, mask, patch(doc, 1), { alphaLock: true }, /투명 잠금/, 1);
});
test("3D protection is diagnosed before the prefiltered selection mask", () => {
  const doc = ensureLayers(createDocument(16, 16)),
    raster = rasterizeGuide(16, 16, defaultGuide());
  doc.layers[0].geometryGuide = raster.guide;
  doc.pixels = raster.pixels.map((color) => {
    let i = doc.palette.indexOf(color);
    if (i < 0) i = doc.palette.push(color) - 1;
    return i;
  });
  const edge = raster.faceIds.findIndex(
    (id, i) => id && raster.protectedMask[i],
  );
  rejected(
    doc,
    doc.pixels.map(
      (_, i) => !raster.protectedMask[i] && raster.faceIds[i] === 1,
    ),
    patch(doc, edge),
    { alphaLock: true },
    /입체 가이드의 보호 영역/,
    edge,
  );
});
test("autotile protection is diagnosed before the prefiltered selection mask", () => {
  const doc = validateDocument(
    createAutotile(
      16,
      "Grass",
      "Dirt",
      Array(256).fill("#507D3BFF"),
      Array(256).fill("#906446FF"),
    ),
  );
  const rules = autoConstraints(doc),
    edge = rules.editable.findIndex((v) => !v);
  rejected(
    doc,
    rules.editable,
    patch(doc, edge),
    { alphaLock: true },
    /오토타일의 공유 경계/,
    edge,
  );
});
test("malformed runs are distinguished from coordinates beyond the canvas", () => {
  const doc = createDocument(8, 8),
    mask = doc.pixels.map(() => true),
    base = { summary: "invalid", new_colors: [] };
  assert.throws(
    () =>
      applyProposal(doc, mask, {
        ...base,
        runs: [{ x: "0", y: 0, colors: [7] }],
      }),
    /목록 형식/,
  );
  assert.throws(
    () =>
      applyProposal(doc, mask, {
        ...base,
        runs: [{ x: 7, y: 0, colors: [7, 7] }],
      }),
    /캔버스 크기를 벗어나/,
  );
});
