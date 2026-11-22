import test from "node:test";
import assert from "node:assert/strict";
import { appendPixelPerfect, paintPoints } from "../src/editing.mjs";
import {
  defaultGuide,
  validateGuide,
  rasterizeGuide,
  projectGuide,
} from "../src/geometry.mjs";
import { tileSeamCandidates } from "../src/tiles.mjs";
import {
  createDocument,
  ensureLayers,
  clone,
  documentRGBA,
  validateDocument,
} from "../src/core.mjs";

test("pixel-perfect removes only cardinal L middles; revisits and straight segments survive", () => {
  assert.deepEqual(
    appendPixelPerfect(
      [],
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    ),
    [
      [0, 0],
      [1, 1],
    ],
  );
  assert.deepEqual(
    appendPixelPerfect(
      [],
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    ),
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
  );
  assert.deepEqual(
    appendPixelPerfect(
      [],
      [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
    ),
    [
      [0, 0],
      [1, 0],
      [0, 0],
    ],
  );
  assert.deepEqual(
    appendPixelPerfect(
      [],
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [2, 2],
      ],
    ),
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
  );
});
test("pixel-perfect redraw retains prior artwork, selection, alpha and mirrored/wrapped scope", () => {
  const doc = ensureLayers(createDocument(8, 8));
  doc.pixels.fill(7);
  doc.pixels[0] = 0;
  doc.pixels[1] = 14;
  const before = clone(doc),
    mask = doc.pixels.map((_, i) => [0, 1, 9].includes(i));
  paintPoints(
    doc,
    mask,
    appendPixelPerfect(
      [],
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    ),
    8,
    1,
    true,
    true,
    true,
  );
  assert.equal(doc.pixels[0], 0);
  assert.equal(doc.pixels[1], 14);
  assert.equal(doc.pixels[9], 8);
  for (let i = 0; i < 64; i++)
    if (!mask[i]) assert.equal(doc.pixels[i], before.pixels[i]);
});
test("directional lighting keeps native coverage/protection and round-trips as optional metadata", () => {
  for (const kind of ["book", "box", "prism", "pyramid", "diamond"]) {
    const base = defaultGuide(kind),
      old = rasterizeGuide(32, 32, base);
    assert.equal(validateGuide(base).lighting, undefined);
    const guide = {
      ...base,
      lighting: { azimuth: 135, elevation: 45, ambient: 0.3, steps: 4 },
    };
    const next = rasterizeGuide(32, 32, guide);
    assert.deepEqual(next.faceIds, old.faceIds);
    assert.deepEqual(next.protectedMask, old.protectedMask);
    assert.notDeepEqual(next.pixels, old.pixels);
    const doc = ensureLayers(createDocument(32, 32));
    doc.palette = [...new Set(["#00000000", ...next.pixels])];
    doc.pixels = next.pixels.map((p) => doc.palette.indexOf(p));
    doc.layers[0].geometryGuide = guide;
    assert.deepEqual(
      validateDocument(JSON.parse(JSON.stringify(doc))).layers[0].geometryGuide
        .lighting,
      guide.lighting,
    );
  }
});
test("Lambert light follows the screen and quantizes brightness without changing faces", () => {
  const guide = {
    ...defaultGuide("box"),
    pose: "upright",
    yaw: 0,
    elevation: 0,
    roll: 0,
    lighting: { azimuth: 0, elevation: 90, ambient: 0, steps: 3 },
  };
  assert.equal(projectGuide(16, 16, guide).faces[0].color, guide.color + "FF");
  guide.lighting.elevation = 0;
  assert.equal(projectGuide(16, 16, guide).faces[0].color, "#000000FF");
  for (const lighting of [
    { ...guide.lighting, steps: 2.5 },
    { ...guide.lighting, ambient: NaN },
    null,
  ])
    assert.throws(() => validateGuide({ ...guide, lighting }));
});
test("tile diagnostic flags excessive seam contrast, ignores invisible RGB and leaves bytes unchanged", () => {
  const doc = ensureLayers(createDocument(8, 8));
  doc.pixels.fill(7);
  assert.deepEqual(tileSeamCandidates(documentRGBA(doc), 8, 8), {
    horizontal: [],
    vertical: [],
  });
  // Two flat halves have one intentional internal edge; their wrap seam is a candidate.
  doc.palette[7] = "#000000FF";
  doc.palette[8] = "#FFFFFFFF";
  for (let y = 0; y < 8; y++)
    for (let x = 4; x < 8; x++) doc.pixels[y * 8 + x] = 8;
  const rgba = documentRGBA(doc),
    before = [...rgba];
  assert.deepEqual(tileSeamCandidates(rgba, 8, 8), {
    horizontal: [0, 1, 2, 3, 4, 5, 6, 7],
    vertical: [],
  });
  assert.deepEqual([...rgba], before);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 0;
  assert.deepEqual(tileSeamCandidates(rgba, 8, 8), {
    horizontal: [],
    vertical: [],
  });
});
