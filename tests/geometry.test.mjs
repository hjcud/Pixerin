import { wirePatch } from "./wire-fixture.mjs";
import { fixedSegments } from "../electron/fixed-patch.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultGuide,
  GUIDE_PRESETS,
  GUIDE_KINDS,
  rasterizeGuide,
  guideConstraints,
  validateGuide,
  projectGuide,
  freezeGuideScale,
  fitGuide,
} from "../src/geometry.mjs";
import {
  createDocument,
  ensureLayers,
  activeLayer,
  validateDocument,
  applyProposal,
  clone,
  maskRuns,
} from "../src/core.mjs";
import { buildRequest } from "../electron/ai.mjs";
import { ProgressReporter } from "../electron/progress.mjs";

function fixture(size = 16, guide = defaultGuide()) {
  const doc = ensureLayers(createDocument(size, size)),
    raster = rasterizeGuide(size, size, guide);
  activeLayer(doc).geometryGuide = raster.guide;
  doc.pixels = raster.pixels.map((c) => {
    let i = doc.palette.indexOf(c);
    if (i < 0) i = doc.palette.push(c) - 1;
    return i;
  });
  return doc;
}
const patch = (doc, i, color = 14) => ({
  summary: "문양",
  new_colors: [],
  runs: [{ x: i % doc.width, y: Math.floor(i / doc.width), colors: [color] }],
});

test("native projection stays connected, bounded and flat colored across sizes, poses and angles", () => {
  for (const size of [8, 16, 32, 64])
    for (const kind of Object.keys(GUIDE_KINDS))
      for (const preset of Object.values(GUIDE_PRESETS))
        for (const yaw of [-75, 0, 75]) {
          const guide = { ...defaultGuide(kind), ...preset, yaw },
            r = rasterizeGuide(size, size, guide);
          assert.equal(r.pixels.length, size * size);
          assert.deepEqual(r, rasterizeGuide(size, size, guide));
          assert.ok(r.faceIds.some(Boolean));
          assert.ok(
            r.pixels.every(
              (c) => c === "#00000000" || r.faces.some((f) => f.color === c),
            ),
          );
          const seed = r.faceIds.findIndex(Boolean),
            seen = new Set([seed]),
            queue = [seed];
          for (const i of queue)
            for (const [dx, dy] of [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ]) {
              const x = (i % size) + dx,
                y = Math.floor(i / size) + dy,
                j = y * size + x;
              if (
                x >= 0 &&
                x < size &&
                y >= 0 &&
                y < size &&
                r.faceIds[j] &&
                !seen.has(j)
              ) {
                seen.add(j);
                queue.push(j);
              }
            }
          assert.equal(seen.size, r.faceIds.filter(Boolean).length);
          assert.ok(
            r.faceIds.every(
              (id, i) =>
                !id ||
                (i % size > 0 &&
                  i % size < size - 1 &&
                  i >= size &&
                  i < size * (size - 1)),
            ),
          );
        }
});
test("pose changes projection independently of in-plane rotation; front and overhead expose cover", () => {
  const guide = defaultGuide();
  assert.notDeepEqual(
    rasterizeGuide(32, 32, guide).faceIds,
    rasterizeGuide(32, 32, { ...guide, pose: "upright" }).faceIds,
  );
  assert.notDeepEqual(
    rasterizeGuide(32, 32, guide).faceIds,
    rasterizeGuide(32, 32, { ...guide, roll: 0 }).faceIds,
  );
  for (const preset of [GUIDE_PRESETS.front, GUIDE_PRESETS.overhead]) {
    const r = rasterizeGuide(16, 16, { ...guide, ...preset });
    assert.deepEqual([...new Set(r.faceIds)].sort(), [0, 1]);
  }
  const r = rasterizeGuide(16, 16, guide);
  assert.ok(r.faces.filter((f) => f.count).length >= 2);
  assert.ok(
    r.faceIds.filter((id, i) => id === 1 && !r.protectedMask[i]).length > 10,
  );
});
test("guide settings are validated and persist through JSON and cloned documents", () => {
  const doc = fixture();
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  assert.deepEqual(clone(doc), doc);
  for (const bad of [
    null,
    false,
    {},
    { ...defaultGuide(), yaw: Infinity },
    { ...defaultGuide(), color: "red" },
    { ...defaultGuide(), decoration: "outside" },
  ])
    assert.throws(() => validateGuide(bad));
  const bad = clone(doc);
  activeLayer(bad).geometryGuide = null;
  assert.throws(() => validateDocument(bad));
  assert.throws(() => rasterizeGuide(4, 16, defaultGuide()));
});

test("legacy guides keep their exact raster while independent height and reverse views round trip", () => {
  const legacy = defaultGuide();
  assert.equal(Object.hasOwn(validateGuide(legacy), "height"), false);
  assert.deepEqual(
    rasterizeGuide(32, 32, legacy).pixels,
    rasterizeGuide(32, 32, { ...legacy, height: 1 }).pixels,
  );
  assert.notDeepEqual(
    rasterizeGuide(32, 32, legacy).pixels,
    rasterizeGuide(32, 32, { ...legacy, height: 1.5 }).pixels,
  );
  for (const height of [0, 0.39, 1.61, Infinity, NaN, null, "1"])
    assert.throws(() => validateGuide({ ...legacy, height }));
  for (const yaw of [-180, -120, 120, 180])
    for (const elevation of [-90, -30, 30, 90]) {
      const guide = {
        ...legacy,
        yaw,
        elevation,
        height: 1.3,
        decoration: "all",
      };
      const doc = fixture(32, guide),
        r = guideConstraints(doc);
      assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
      assert.ok(r.faceIds.some(Boolean));
      assert.ok(
        r.faceIds.every(
          (id, i) => !id || (i % 32 > 0 && i % 32 < 31 && i >= 32 && i < 992),
        ),
      );
      const index = r.editable.findIndex(Boolean);
      assert.ok(index >= 0);
      assert.ok(
        guideConstraints(
          applyProposal(doc, r.editable, patch(doc, index)).document,
        ),
      );
      const edge = r.faceIds.findIndex((id, i) => id && r.protectedMask[i]);
      assert.throws(() =>
        applyProposal(
          doc,
          doc.pixels.map(() => true),
          patch(doc, edge),
        ),
      );
    }
});
test("local enforcement allows face interior, rejects boundaries and preserves opaque alpha atomically", () => {
  const doc = fixture(),
    geometry = guideConstraints(doc),
    mask = doc.pixels.map(() => true),
    i = geometry.editable.findIndex(Boolean),
    before = clone(doc);
  const next = applyProposal(doc, mask, patch(doc, i)).document;
  assert.equal(next.pixels[i], 14);
  assert.ok(guideConstraints(next));
  assert.deepEqual(doc, before);
  for (const j of [
    0,
    geometry.faceIds.findIndex((id, k) => id && geometry.protectedMask[k]),
    geometry.faceIds.findIndex((id) => id > 1),
  ])
    assert.throws(() => applyProposal(doc, mask, patch(doc, j)), /입체 가이드/);
  const noSelection = mask.map(() => false);
  assert.throws(() => applyProposal(doc, noSelection, patch(doc, i)));
  const translucent = patch(doc, i, doc.palette.length);
  translucent.new_colors = ["#FF000080"];
  const recolored = applyProposal(doc, mask, translucent).document;
  assert.equal(recolored.palette[recolored.pixels[i]], "#FF0000FF");
  assert.throws(() =>
    applyProposal(doc, mask, translucent, { paletteOnly: true }),
  );
});
test("all-face mode exposes side interiors; altered silhouette requires explicit guide detach", () => {
  const doc = fixture(32, { ...defaultGuide("box"), decoration: "all" }),
    r = guideConstraints(doc),
    i = r.editable.findIndex((v, k) => v && r.faceIds[k] > 1);
  assert.ok(i >= 0);
  assert.ok(
    guideConstraints(applyProposal(doc, r.editable, patch(doc, i)).document),
  );
  activeLayer(doc).geometryGuide.decoration = "front";
  assert.throws(() =>
    applyProposal(
      doc,
      doc.pixels.map(() => true),
      patch(doc, i),
    ),
  );
  doc.pixels[0] = 7;
  assert.throws(() => guideConstraints(doc), /外|외곽/);
  delete activeLayer(doc).geometryGuide;
  assert.equal(guideConstraints(doc), null);
});
test("new polyhedra persist face geometry and enforce selection, boundaries and palette during AI edits", () => {
  for (const kind of ["prism", "pyramid", "diamond"]) {
    const doc = fixture(32, {
        ...defaultGuide(kind),
        ...GUIDE_PRESETS.isometric,
      }),
      r = guideConstraints(doc),
      before = clone(doc);
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
    assert.equal(r.guide.decoration, "all");
    const i = r.editable.findIndex(Boolean);
    assert.ok(i >= 0);
    const next = applyProposal(doc, r.editable, patch(doc, i)).document;
    assert.ok(guideConstraints(next));
    const edge = r.faceIds.findIndex((id, j) => id && r.protectedMask[j]);
    assert.throws(() =>
      applyProposal(
        doc,
        doc.pixels.map(() => true),
        patch(doc, edge),
      ),
    );
    assert.throws(() =>
      applyProposal(
        doc,
        doc.pixels.map(() => false),
        patch(doc, i),
      ),
    );
    const request = buildRequest(
      { document: doc, mask: r.editable, prompt: "Decorate face interiors" },
      "mock-model",
    );
    const data = JSON.parse(request.input[0].content[0].text);
    assert.equal(data.geometry_guide.primitive, kind);
    assert.deepEqual(
      data.editable_segments,
      fixedSegments(r.editable, doc.width),
    );
    assert.deepEqual(doc, before);
  }
});
test("AI request carries projected faces and intersects selection with local face mask", () => {
  const doc = fixture(),
    r = guideConstraints(doc),
    i = r.editable.findIndex(Boolean),
    mask = doc.pixels.map((_, k) => k === 0 || k === i);
  const request = buildRequest(
      { document: doc, mask, prompt: "마법서" },
      "gpt-6-astra",
    ),
    data = JSON.parse(request.input[0].content[0].text);
  assert.deepEqual(
    data.editable_segments,
    fixedSegments(
      mask.map((v, k) => v && r.editable[k]),
      doc.width,
    ),
  );
  assert.equal(data.alpha_locked, true);
  assert.equal(data.geometry_guide.primitive, "book");
  assert.ok(
    data.geometry_guide.faces.every(
      (f) => f.polygon.length === 4 && f.pixel_runs.length,
    ),
  );
  assert.throws(
    () =>
      buildRequest(
        { document: doc, mask: mask.map((_, k) => k === 0), prompt: "꾸며줘" },
        "gpt-6-astra",
      ),
    /내부/,
  );
});
test("streaming previews enforce geometry constraints after IPC serialization", () => {
  const doc = fixture(),
    r = guideConstraints(doc),
    events = [],
    reporter = new ProgressReporter(
      { document: doc, mask: doc.pixels.map(() => true) },
      (e) => events.push(e),
    );
  reporter.update({
    type: "textDone",
    text: JSON.stringify({
      summary: "invalid",
      new_colors: [],
      segments: [{ id: 9999, colors: [7] }],
    }),
  });
  reporter.flush();
  assert.equal(events.at(-1).preview, null);
  reporter.update({
    type: "textDone",
    text: JSON.stringify(
      wirePatch(
        { document: doc, mask: doc.pixels.map(() => true) },
        patch(doc, r.editable.findIndex(Boolean)),
      ),
    ),
  });
  reporter.flush();
  assert.equal(events.at(-1).preview.changed, 1);
  assert.ok(guideConstraints(events.at(-1).preview.document));
  reporter.stop();
});

test("fixed scale keeps world size through rotation; placement and explicit fit persist without migrating legacy guides", () => {
  const legacy = defaultGuide(),
    locked = freezeGuideScale(32, 32, legacy);
  assert.deepEqual(
    rasterizeGuide(32, 32, legacy).pixels,
    rasterizeGuide(32, 32, locked).pixels,
  );
  const scale = projectGuide(32, 32, locked).scale;
  for (const yaw of [-160, -75, 0, 90, 170]) {
    assert.equal(projectGuide(32, 32, { ...locked, yaw }).scale, scale);
  }
  const moved = { ...locked, offsetX: 3, offsetY: -2 },
    before = rasterizeGuide(32, 32, locked),
    after = rasterizeGuide(32, 32, moved);
  for (let y = 2; y < 32; y++)
    for (let x = 0; x < 29; x++)
      assert.equal(
        after.pixels[(y - 2) * 32 + x + 3],
        before.pixels[y * 32 + x],
      );
  const doc = fixture(32, moved);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  assert.ok(guideConstraints(doc));
  const fit = fitGuide(32, 32, { ...moved, fill: 2, yaw: 80 });
  assert.equal(fit.offsetX, 0);
  assert.equal(fit.offsetY, 0);
  assert.ok(
    projectGuide(32, 32, fit)
      .faces.flatMap((f) => f.polygon)
      .every(([x, y]) => x >= 1 && x <= 31 && y >= 1 && y <= 31),
  );
  for (const [key, value] of [
    ["zoom", 0],
    ["zoom", 9],
    ["zoom", NaN],
    ["offsetX", 65],
    ["offsetY", Infinity],
    ["offsetY", "2"],
  ])
    assert.throws(() => validateGuide({ ...legacy, [key]: value }));
  assert.equal(Object.hasOwn(validateGuide(legacy), "zoom"), false);
});
