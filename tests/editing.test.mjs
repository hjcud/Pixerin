import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, clone, ensureLayers } from "../src/core.mjs";
import {
  paintPoints,
  brushOffsets,
  shapePoints,
  floodFill,
  moveSelection,
  copyPixels,
  pastePixels,
  placementPreview,
} from "../src/editing.mjs";

test("round pencil tips are centered, symmetric pixel disks at odd and even sizes", () => {
  assert.deepEqual(brushOffsets(1, "circle"), [[0, 0]]);
  assert.deepEqual(brushOffsets(2, "circle"), brushOffsets(2));
  const doc = createDocument(8, 8),
    none = doc.pixels.map(() => false);
  paintPoints(doc, none, [[3, 3]], 7, 3, false, false, false, "circle");
  assert.deepEqual(
    doc.pixels.flatMap((v, i) => (v ? [i] : [])),
    [19, 26, 27, 28, 35],
  );
  doc.pixels.fill(0);
  paintPoints(doc, none, [[3, 3]], 7, 4, false, false, false, "circle");
  assert.equal(doc.pixels.filter(Boolean).length, 12);
  assert.deepEqual(doc.pixels.slice(16, 24), [0, 0, 0, 7, 7, 0, 0, 0]);
  for (let size = 1; size <= 8; size++) {
    const offsets = brushOffsets(size, "circle"),
      cells = new Set(offsets.map(String));
    const shift = size % 2 ? 0 : 1;
    assert.equal(cells.size, offsets.length);
    assert.equal(
      Math.max(...offsets.map(([x]) => x)) -
        Math.min(...offsets.map(([x]) => x)) +
        1,
      size,
    );
    for (const [x, y] of offsets) {
      assert.ok(cells.has([shift - x, y].toString()));
      assert.ok(cells.has([x, shift - y].toString()));
      assert.ok(cells.has([y, x].toString()));
    }
    assert.equal(brushOffsets(size).length, size * size);
  }
});

test("round strokes remain connected and respect clipped, mirrored, wrapped and alpha-protected pixels", () => {
  const doc = createDocument(8, 8),
    none = doc.pixels.map(() => false);
  paintPoints(
    doc,
    none,
    shapePoints("line", [2, 3], [5, 3]),
    7,
    3,
    false,
    false,
    false,
    "circle",
  );
  assert.equal(doc.pixels.filter(Boolean).length, 14);
  assert.deepEqual(doc.pixels.slice(24, 32), [0, 7, 7, 7, 7, 7, 7, 0]);
  doc.pixels.fill(0);
  paintPoints(doc, none, [[0, 0]], 7, 3, false, false, false, "circle");
  assert.deepEqual(
    doc.pixels.flatMap((v, i) => (v ? [i] : [])),
    [0, 1, 8],
  );
  doc.pixels.fill(0);
  paintPoints(doc, none, [[0, 0]], 7, 3, false, false, true, "circle");
  assert.deepEqual(
    doc.pixels.flatMap((v, i) => (v ? [i] : [])),
    [0, 1, 7, 8, 56],
  );
  doc.palette.push("#50A88980");
  doc.pixels.fill(16);
  doc.pixels[8] = 0;
  const mask = doc.pixels.map((_, i) => [0, 7, 8, 56, 63].includes(i));
  const before = clone(doc);
  paintPoints(doc, mask, [[0, 0]], 11, 3, true, true, true, "circle");
  for (let i = 0; i < doc.pixels.length; i++) {
    const expected = [0, 7, 56, 63].includes(i)
      ? "#D7788780"
      : before.palette[before.pixels[i]];
    assert.equal(doc.palette[doc.pixels[i]], expected, `pixel ${i}`);
  }
});

test("brush and shapes clip at canvas and selection boundaries", () => {
  const doc = createDocument(8, 8),
    mask = doc.pixels.map((_, i) => i % 8 === 0);
  paintPoints(doc, mask, [[0, 0]], 7, 3);
  assert.deepEqual(
    doc.pixels.flatMap((v, i) => (v ? [i] : [])),
    [0, 8],
  );
  paintPoints(doc, mask, shapePoints("rectangle", [0, 0], [7, 7], true), 5);
  assert.equal(doc.pixels.filter((v) => v === 5).length, 8);
  assert.equal(shapePoints("rectangle", [3, 3], [1, 1]).length, 8);
  assert.deepEqual(shapePoints("line", [0, 0], [2, 2]), [
    [0, 0],
    [1, 1],
    [2, 2],
  ]);
});
test("fill is connected, respects mask holes, and recognizes equivalent palette colors", () => {
  const doc = createDocument(4, 4);
  doc.palette.push(doc.palette[0]);
  doc.pixels[1] = 16;
  const mask = doc.pixels.map((_, i) => i % 4 !== 2);
  floodFill(doc, mask, 0, 0, 7);
  assert.equal(doc.pixels.filter((v) => v === 7).length, 8);
  assert.equal(doc.pixels[3], 0);
  floodFill(doc, mask, 2, 0, 5);
  assert.equal(doc.pixels[2], 0);
});
test("overlapping selection moves read source pixels and clamp without losing edge pixels", () => {
  const doc = createDocument(4, 4);
  doc.pixels[0] = 7;
  doc.pixels[1] = 5;
  const mask = doc.pixels.map((_, i) => i === 0 || i === 1),
    before = clone(doc);
  const moved = moveSelection(doc, mask, 1, 0);
  assert.deepEqual(moved.document.pixels.slice(0, 4), [0, 7, 5, 0]);
  assert.deepEqual(doc, before);
  const edge = moveSelection(doc, mask, 99, -99);
  assert.deepEqual(edge.document.pixels.slice(0, 4), [0, 0, 7, 5]);
  assert.equal(edge.selection.filter(Boolean).length, 2);
});
test("selection moves skip alpha-zero pixels, retain partial alpha and preserve other layers", () => {
  const source = ensureLayers(createDocument(8, 2));
  source.palette.push("#ABCDEF00", "#12345680");
  source.pixels.splice(0, 8, 7, 0, 16, 17, 5, 5, 5, 5);
  source.layers.push({
    id: "background",
    name: "Background",
    visible: true,
    locked: false,
    pixels: Array(16).fill(9),
  });
  const mask = source.pixels.map((_, i) => i < 4),
    before = clone(source);
  for (const copy of [false, true]) {
    const result = moveSelection(source, mask, 4, 0, copy);
    assert.deepEqual(
      result.document.pixels.slice(0, 8),
      copy ? [7, 0, 16, 17, 7, 5, 5, 17] : [0, 0, 16, 0, 7, 5, 5, 17],
    );
    assert.deepEqual(
      result.selection.flatMap((v, i) => (v ? [i] : [])),
      [4, 5, 6, 7],
    );
    assert.deepEqual(result.document.palette, source.palette);
    assert.deepEqual(result.document.layers[1], source.layers[1]);
    assert.deepEqual(moveSelection(source, mask, 0, 0, copy).document, before);
  }
  assert.deepEqual(source, before);
});

test("transparent-only moves and overlapping duplicate moves do not erase destination pixels", () => {
  const source = createDocument(4, 2);
  source.pixels.splice(0, 4, 7, 0, 5, 9);
  const selected = source.pixels.map((_, i) => i === 0 || i === 1);
  const duplicate = moveSelection(source, selected, 1, 0, true);
  assert.deepEqual(duplicate.document.pixels.slice(0, 4), [7, 7, 5, 9]);
  const moved = moveSelection(source, selected, 1, 0);
  assert.deepEqual(moved.document.pixels.slice(0, 4), [0, 7, 5, 9]);
  const empty = source.pixels.map((_, i) => i === 1);
  assert.deepEqual(moveSelection(source, empty, 1, 0).document, source);
  assert.equal(moveSelection(source, empty, 1, 0).selection[2], true);
});

test("clipboard retains irregular holes and remaps exact colors across documents", () => {
  const source = createDocument(3, 3);
  source.pixels[0] = 7;
  source.pixels[4] = 5;
  const clip = copyPixels(source, source.pixels.map(Boolean));
  const target = createDocument(4, 4);
  target.palette = ["#00000000", "#FF0000FF"];
  target.pixels.fill(1);
  const result = pastePixels(target, clip, 3, 3);
  assert.equal(
    result.document.palette[result.document.pixels[10]],
    source.palette[7],
  );
  assert.equal(
    result.document.palette[result.document.pixels[15]],
    source.palette[5],
  );
  assert.equal(result.document.pixels[11], 1);
  assert.equal(result.selection.filter(Boolean).length, 2);
  assert.equal(target.palette.length, 2);
});
test("clipboard refuses oversized or palette-overflow paste atomically", () => {
  const target = createDocument(2, 2),
    before = clone(target);
  assert.throws(
    () =>
      pastePixels(
        target,
        copyPixels(createDocument(3, 3), Array(9).fill(false)),
      ),
    /캔버스가 작/,
  );
  assert.deepEqual(target, before);
  target.palette = Array.from(
    { length: 256 },
    (_, i) => "#" + i.toString(16).padStart(6, "0") + "FF",
  );
  target.palette[0] = "#00000000";
  const full = clone(target);
  assert.throws(
    () => pastePixels(target, { width: 1, height: 1, pixels: ["#ABCDEFFF"] }),
    /256색/,
  );
  assert.deepEqual(target, full);
});

test("transparent paste preserves destination colors without allocating invisible palette entries", () => {
  const source = createDocument(4, 2);
  source.pixels.fill(7);
  const before = clone(source);
  const result = pastePixels(source, {
    width: 4,
    height: 1,
    pixels: ["#12345600", null, "#12345680", source.palette[5]],
  });
  assert.deepEqual(result.document.pixels.slice(0, 4), [7, 7, 16, 5]);
  assert.equal(result.document.palette[16], "#12345680");
  assert.equal(result.document.palette.length, source.palette.length + 1);
  assert.deepEqual(result.selection.slice(0, 4), [true, false, true, true]);
  assert.deepEqual(source, before);
  while (source.palette.length < 256) source.palette.push("#112233FF");
  assert.deepEqual(
    pastePixels(source, { width: 1, height: 1, pixels: ["#FEDCBA00"] })
      .document,
    source,
  );
});

test("placement previews rebuild moves and pastes from the frozen source and clamp positions", () => {
  const source = createDocument(8, 2);
  source.pixels.splice(0, 8, 7, 0, 0, 5, 9, 11, 0, 0);
  const mask = source.pixels.map((_, i) => i < 2),
    before = clone(source);
  for (const clip of [null, copyPixels(source, mask)]) {
    const a = placementPreview(source, mask, { clip, x: 3 });
    const b = placementPreview(source, mask, { clip, x: 4 });
    assert.deepEqual(a.document.pixels.slice(3, 6), [7, 9, 11]);
    assert.deepEqual(b.document.pixels.slice(3, 6), [5, 7, 11]);
    assert.deepEqual(
      placementPreview(source, mask, { clip, x: 0 }).document,
      source,
    );
    const edge = placementPreview(source, mask, { clip, x: 999, y: -999 });
    assert.equal(edge.x, 6);
    assert.equal(edge.y, 0);
    assert.equal(placementPreview(source, mask, { clip, x: edge.x - 1 }).x, 5);
  }
  assert.deepEqual(source, before);
});
