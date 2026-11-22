import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  clone,
  activeLayer,
  validateDocument,
} from "../src/core.mjs";
import {
  analyzeRefinement,
  refinePixels,
  silhouetteCandidates,
} from "../src/refinement.mjs";
import {
  defaultGuide,
  rasterizeGuide,
  guideConstraints,
} from "../src/geometry.mjs";
import { createAutotile, assertAutoIntegrity } from "../src/autotile.mjs";
const greens = [
  "#164D34FF",
  "#216847FF",
  "#338461FF",
  "#4CA777FF",
  "#77C795FF",
  "#A1DEB3FF",
];
function fixture(size = 12) {
  const doc = ensureLayers(createDocument(size, size));
  doc.palette = ["#00000000", "#111111FF", ...greens];
  doc.pixels.fill(0);
  for (let y = 2; y < size - 2; y++)
    for (let x = 2; x < size - 2; x++)
      doc.pixels[y * size + x] =
        x === 2 || y === 2 || x === size - 3 || y === size - 3 ? 1 : 2;
  return doc;
}
const all = (doc) => Array(doc.pixels.length).fill(false);
test("shading bounds hue/alpha families, reuses colors, is deterministic and selection-local", () => {
  const doc = fixture();
  for (let i = 0; i < doc.pixels.length; i++) doc.pixels[i] = 2 + (i % 6);
  doc.layers.push({
    id: "other",
    name: "Untouched",
    visible: true,
    locked: true,
    pixels: Array(doc.pixels.length).fill(1),
  });
  const before = clone(doc),
    selection = doc.pixels.map((_, i) => i < 72),
    ctx = analyzeRefinement(doc, selection, true),
    r = refinePixels(ctx, { mode: "shading", levels: 3 });
  assert.ok(r.changed > 0);
  assert.equal(r.colorsAfter, 3);
  assert.deepEqual(r.document.palette, doc.palette);
  assert.deepEqual(doc, before);
  assert.deepEqual(r.document.layers[1], doc.layers[1]);
  for (let i = 72; i < doc.pixels.length; i++)
    assert.equal(r.document.pixels[i], doc.pixels[i]);
  assert.deepEqual(refinePixels(ctx, { mode: "shading", levels: 3 }), r);
  assert.equal(
    refinePixels(analyzeRefinement(r.document, selection, true), {
      mode: "shading",
      levels: 3,
    }).changed,
    0,
  );
});
test("shading preserves partial alpha and never merges separate color families", () => {
  const doc = fixture();
  doc.palette.push(...greens.map((c) => c.slice(0, 7) + "80"), "#DE3020FF");
  doc.pixels = doc.pixels.map((_, i) =>
    i % 13 === 12 ? 14 : i % 13 < 6 ? 2 + (i % 13) : 8 + ((i % 13) - 6),
  );
  const r = refinePixels(analyzeRefinement(doc), {
    mode: "shading",
    levels: 2,
  });
  assert.ok(r.changed > 0);
  for (let i = 0; i < doc.pixels.length; i++) {
    assert.equal(
      r.document.palette[r.document.pixels[i]].slice(7),
      doc.palette[doc.pixels[i]].slice(7),
    );
    if (doc.pixels[i] === 14) assert.equal(r.document.pixels[i], 14);
  }
});
test("outline changes boundary-connected selected ink, retaining interior marks and alpha", () => {
  const doc = fixture();
  doc.pixels[4 * 12 + 4] = 1;
  const original = clone(doc),
    mask = doc.pixels.map((_, i) => i % 12 < 6);
  const r = refinePixels(analyzeRefinement(doc, mask, true), {
    mode: "outline",
    color: "#111111FF",
    width: 2,
    strength: 0.4,
  });
  assert.ok(r.changed > 0);
  assert.equal(r.document.pixels[4 * 12 + 4], 1);
  r.changedMask.forEach((changed, i) => {
    if (changed) {
      assert.ok(mask[i]);
      assert.equal(original.pixels[i], 1);
      assert.equal(r.document.palette[r.document.pixels[i]].slice(7), "FF");
    }
  });
  assert.deepEqual(doc, original);
  assert.equal(
    refinePixels(analyzeRefinement(doc), {
      mode: "outline",
      color: "#111111FF",
      width: 1,
      strength: 0,
    }).changed,
    0,
  );
  const existing = refinePixels(analyzeRefinement(doc), {
    mode: "outline",
    color: "#111111FF",
    width: 1,
    strength: 0.8,
    paletteOnly: true,
  });
  assert.deepEqual(existing.document.palette, doc.palette);
  doc.palette[1] = "#11111180";
  const partial = refinePixels(analyzeRefinement(doc, all(doc), true), {
    mode: "outline",
    color: "#11111180",
    width: 1,
    strength: 0.4,
  });
  assert.ok(partial.changed > 0);
  for (let i = 0; i < doc.pixels.length; i++)
    assert.equal(
      partial.document.palette[partial.document.pixels[i]].slice(7),
      doc.palette[doc.pixels[i]].slice(7),
    );
});
test("palette overflow is atomic, empty images are no-ops and invalid settings reject", () => {
  const doc = fixture();
  for (let i = 0; doc.palette.length < 256; i++) {
    const c = "#" + (0xa00000 + i).toString(16).toUpperCase() + "FF";
    if (!doc.palette.includes(c)) doc.palette.push(c);
  }
  const before = clone(doc);
  assert.throws(
    () =>
      refinePixels(analyzeRefinement(doc), {
        mode: "outline",
        color: "#111111FF",
        width: 1,
        strength: 0.4,
      }),
    /256/,
  );
  assert.deepEqual(doc, before);
  const empty = ensureLayers(createDocument(8, 8));
  assert.equal(
    refinePixels(analyzeRefinement(empty), {
      mode: "outline",
      width: 1,
      strength: 0.4,
    }).changed,
    0,
  );
  assert.throws(() =>
    refinePixels(analyzeRefinement(empty), { mode: "shading", levels: 1 }),
  );
  assert.throws(() => analyzeRefinement(empty, [true]));
  activeLayer(empty).locked = true;
  assert.throws(() => analyzeRefinement(empty));
  activeLayer(empty).locked = false;
  activeLayer(empty).visible = false;
  assert.throws(() => analyzeRefinement(empty));
});
test("silhouette candidates require explicit choice and respect complete selection and alpha protection", () => {
  const doc = fixture();
  doc.pixels[0] = 2;
  doc.pixels[5 * 12 + 5] = 0;
  const before = clone(doc),
    ctx = analyzeRefinement(doc);
  const candidates = silhouetteCandidates(ctx, 1),
    island = candidates.find((c) => c.kind === "island" && c.cells.includes(0)),
    hole = candidates.find((c) => c.kind === "hole");
  assert.ok(island);
  assert.ok(hole);
  assert.equal(
    refinePixels(ctx, { mode: "silhouette", selected: [] }).changed,
    0,
  );
  const r = refinePixels(ctx, {
    mode: "silhouette",
    selected: [island.id, hole.id],
  });
  assert.equal(r.changed, 2);
  assert.equal(r.document.pixels[0], 0);
  assert.notEqual(r.document.pixels[hole.cells[0]], 0);
  assert.deepEqual(doc, before);
  assert.throws(
    () =>
      refinePixels(analyzeRefinement(doc, all(doc), true), {
        mode: "silhouette",
        selected: [island.id],
      }),
    /보호/,
  );
  const selected = all(doc);
  selected[5 * 12 + 5] = true;
  assert.equal(
    silhouetteCandidates(analyzeRefinement(doc, selected)).find(
      (c) => c.id === island.id,
    ).allowed,
    false,
  );
  assert.throws(() =>
    refinePixels(ctx, { mode: "silhouette", selected: ["forged"] }),
  );
});
test("spur cleanup cannot erase the last pixel, and periodic neighbors join across edges", () => {
  const doc = fixture(8);
  doc.pixels.fill(0);
  doc.pixels[3 * 8 + 3] = 2;
  doc.pixels[3 * 8 + 4] = 2;
  let ctx = analyzeRefinement(doc);
  const candidates = silhouetteCandidates(ctx),
    r = refinePixels(ctx, {
      mode: "silhouette",
      selected: candidates.map((c) => c.id),
    });
  assert.equal(r.document.pixels.filter(Boolean).length, 1);
  assert.ok(r.skipped > 0);
  doc.pixels.fill(0);
  doc.pixels[0] = 2;
  doc.pixels[7] = 2;
  for (let y = 3; y < 6; y++)
    for (let x = 3; x < 6; x++) doc.pixels[y * 8 + x] = 2;
  doc.tileMode = { version: 1, material: "Test", wrap: true };
  ctx = analyzeRefinement(doc);
  assert.equal(
    silhouetteCandidates(ctx, 1).filter((c) => c.kind === "island").length,
    0,
  );
  assert.equal(
    silhouetteCandidates(ctx, 4).filter((c) => c.kind === "hole").length,
    0,
  );
});
test("geometry and autotile refinement preserve shared boundaries and file round trips", () => {
  const doc = fixture(16),
    raster = rasterizeGuide(16, 16, defaultGuide());
  doc.pixels = raster.pixels.map((c) => {
    let i = doc.palette.indexOf(c);
    if (i < 0) i = doc.palette.push(c) - 1;
    return i;
  });
  activeLayer(doc).geometryGuide = raster.guide;
  const rules = guideConstraints(doc);
  rules.editable.forEach((v, i) => {
    if (v) doc.pixels[i] = 2 + (i % 6);
  });
  const refined = refinePixels(analyzeRefinement(doc), {
    mode: "shading",
    levels: 2,
  });
  assert.ok(refined.changed);
  assert.ok(guideConstraints(refined.document));
  assert.deepEqual(
    validateDocument(JSON.parse(JSON.stringify(refined.document))),
    refined.document,
  );
  const auto = ensureLayers(
    createAutotile(
      16,
      "Green",
      "Brown",
      Array(256).fill(greens[2]),
      Array(256).fill("#A07040FF"),
    ),
  );
  const ctx = analyzeRefinement(auto);
  ctx.mask.forEach((v, i) => {
    if (v) {
      let color = auto.palette.indexOf(greens[i % 6]);
      if (color < 0) color = auto.palette.push(greens[i % 6]) - 1;
      auto.pixels[i] = color;
    }
  });
  const a = refinePixels(analyzeRefinement(auto), {
    mode: "shading",
    levels: 2,
  });
  assertAutoIntegrity(a.document);
  assert.ok(a.changed > 0);
});

test("detail protection excludes pixels from every refinement mode and rejects malformed masks", () => {
  const doc = fixture(),
    protection = Array(doc.pixels.length).fill(true),
    ctx = analyzeRefinement(doc, all(doc), false, protection);
  for (const mode of ["shading", "outline", "silhouette", "clusters"])
    assert.equal(refinePixels(ctx, { mode, levels: 2 }).changed, 0);
  assert.throws(() => analyzeRefinement(doc, all(doc), false, [true]), /보호/);
  doc.pixels[0] = 2;
  const protectedIsland = all(doc);
  protectedIsland[0] = true;
  const c = analyzeRefinement(doc, all(doc), false, protectedIsland),
    island = silhouetteCandidates(c).find((c) => c.id === "island:0");
  assert.equal(island.allowed, false);
  assert.match(island.reason, /디테일/);
  assert.throws(
    () => refinePixels(c, { mode: "silhouette", selected: [island.id] }),
    /보호/,
  );
  const colors = fixture();
  colors.pixels = colors.pixels.map((_, i) => 2 + (i % 6));
  const p = all(colors);
  p[0] = true;
  const result = refinePixels(
    analyzeRefinement(colors, all(colors), false, p),
    { mode: "shading", levels: 2 },
  );
  assert.ok(result.changed);
  assert.equal(result.document.pixels[0], colors.pixels[0]);
  const outlineDoc = fixture(),
    lock = all(outlineDoc);
  lock[2 * 12 + 4] = true;
  const outline = refinePixels(
    analyzeRefinement(outlineDoc, all(outlineDoc), true, lock),
    { mode: "outline", strength: 0.5 },
  );
  assert.ok(outline.changed);
  assert.equal(outline.document.pixels[28], outlineDoc.pixels[28]);
});
function clusterFixture() {
  const doc = fixture(8);
  doc.pixels.fill(2);
  doc.palette[2] = "#338461FF";
  doc.palette[3] = "#398967FF";
  doc.pixels[18] = 3;
  doc.pixels[36] = 3;
  doc.pixels[37] = 3;
  return doc;
}
test("color clusters merge only explicitly chosen regions using neighboring existing colors", () => {
  const doc = clusterFixture(),
    before = clone(doc),
    ctx = analyzeRefinement(doc, all(doc), true);
  const scan = refinePixels(ctx, { mode: "clusters" });
  assert.equal(scan.changed, 0);
  assert.equal(scan.candidates.length, 2);
  const r = refinePixels(ctx, {
    mode: "clusters",
    selected: scan.candidates.map((c) => c.id),
  });
  assert.equal(r.changed, 3);
  assert.ok(r.document.pixels.every((i) => i === 2));
  assert.deepEqual(r.document.palette, doc.palette);
  assert.deepEqual(doc, before);
  assert.deepEqual(
    refinePixels(ctx, {
      mode: "clusters",
      selected: scan.candidates.map((c) => c.id),
    }),
    r,
  );
  assert.equal(
    refinePixels(ctx, { mode: "clusters", clusterArea: 1 }).candidates.length,
    1,
  );
  assert.equal(
    refinePixels(ctx, { mode: "clusters", tolerance: 0 }).candidates.length,
    0,
  );
  assert.throws(() =>
    refinePixels(ctx, { mode: "clusters", selected: ["forged"] }),
  );
  assert.throws(() => refinePixels(ctx, { mode: "clusters", clusterArea: 9 }));
});
test("cluster analysis preserves whole components, hue, exact alpha and protected pixels", () => {
  const doc = clusterFixture(),
    mask = all(doc);
  mask[36] = true;
  let r = refinePixels(analyzeRefinement(doc, mask), { mode: "clusters" });
  assert.equal(r.candidates.find((c) => c.cells.includes(36)).allowed, false);
  const p = all(doc);
  p[37] = true;
  r = refinePixels(analyzeRefinement(doc, all(doc), true, p), {
    mode: "clusters",
  });
  const candidate = r.candidates.find((c) => c.cells.includes(36));
  assert.equal(candidate.allowed, false);
  assert.match(candidate.reason, /디테일/);
  assert.throws(
    () =>
      refinePixels(analyzeRefinement(doc, all(doc), true, p), {
        mode: "clusters",
        selected: [candidate.id],
      }),
    /보호/,
  );
  doc.palette[3] = "#39896780";
  assert.equal(
    refinePixels(analyzeRefinement(doc), { mode: "clusters", tolerance: 100 })
      .candidates.length,
    0,
  );
  doc.palette[2] = "#33846180";
  r = refinePixels(analyzeRefinement(doc), { mode: "clusters" });
  const applied = refinePixels(analyzeRefinement(doc), {
    mode: "clusters",
    selected: r.candidates.map((c) => c.id),
  });
  assert.equal(applied.changed, 3);
  assert.ok(
    applied.document.pixels.every((i) =>
      applied.document.palette[i].endsWith("80"),
    ),
  );
  doc.palette[3] = "#88332280";
  assert.equal(
    refinePixels(analyzeRefinement(doc), { mode: "clusters", tolerance: 100 })
      .candidates.length,
    0,
  );
});
test("cluster regions wrap across tile edges and avoid small-region replacement cycles", () => {
  const doc = clusterFixture();
  doc.pixels.fill(2);
  doc.pixels[0] = 3;
  doc.pixels[7] = 3;
  doc.tileMode = { version: 1, material: "Test", wrap: true };
  let r = refinePixels(analyzeRefinement(doc), {
    mode: "clusters",
    clusterArea: 1,
  });
  assert.equal(r.candidates.length, 0);
  r = refinePixels(analyzeRefinement(doc), {
    mode: "clusters",
    clusterArea: 2,
  });
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].cells.length, 2);
  doc.pixels = doc.pixels.map((_, i) =>
    (Math.floor(i / 8) + (i % 8)) % 2 ? 2 : 3,
  );
  assert.equal(
    refinePixels(analyzeRefinement(doc), { mode: "clusters" }).candidates
      .length,
    0,
  );
});
