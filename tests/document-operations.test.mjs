import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  activeLayer,
  clone,
  documentRGBA,
  validateDocument,
} from "../src/core.mjs";
import { replaceColor } from "../src/colors.mjs";
import {
  resizeCanvas,
  compactPalette,
  validateOperation,
} from "../src/document-operations.mjs";
import { moveSelection } from "../src/editing.mjs";
import { transformSelection, mergeDown } from "../src/advanced.mjs";
import {
  defaultGuide,
  rasterizeGuide,
  guideConstraints,
} from "../src/geometry.mjs";
import { buildRequest } from "../electron/ai.mjs";
import { PNG } from "pngjs";
const fresh = (size = 4) => ensureLayers(createDocument(size, size));
test("all-layer replacement independently respects exact alpha and full layer locks", () => {
  const d = fresh();
  d.pixels[0] = 7;
  d.layers.push({
    id: "alpha",
    name: "Alpha",
    visible: false,
    locked: false,
    alphaLocked: true,
    pixels: [7, ...Array(15).fill(0)],
  });
  d.palette.push("#50A88980");
  d.layers[1].pixels[0] = 16;
  const a = replaceColor(
    d,
    d.palette[16],
    "#123456FF",
    "all",
    [],
    false,
  ).document;
  assert.equal(a.palette[a.layers[1].pixels[0]], "#12345680");
  const b = replaceColor(d, d.palette[16], "#12345600", "all", [], false);
  assert.equal(b.changed, 0);
  assert.equal(b.skipped, 1);
  d.activeLayerId = "alpha";
  assert.equal(
    replaceColor(d, d.palette[7], "#12345600", "all", [], true).document
      .layers[0].pixels[0],
    0,
  );
  d.layers[0].locked = true;
  assert.equal(
    replaceColor(d, d.palette[7], "#12345600", "all", [], false).changed,
    0,
  );
});
test("object-following protection moves/copies/flips while legacy marks and mask-only movement remain fixed", () => {
  const d = fresh();
  d.pixels[0] = 7;
  d.pixels[2] = 8;
  const l = activeLayer(d);
  l.refinementProtection = Array(16).fill(false);
  l.refinementProtection[0] = true;
  const mask = d.pixels.map((_, i) => i < 2);
  assert.equal(
    activeLayer(moveSelection(d, mask, 1, 0).document).refinementProtection[0],
    true,
  );
  l.protectionMode = "pixels";
  for (const output of [
    moveSelection(d, mask, 1, 0).document,
    transformSelection(d, mask, "flip-x").document,
  ]) {
    assert.equal(activeLayer(output).refinementProtection[0], false);
    assert.equal(activeLayer(output).refinementProtection[1], true);
    assert.equal(output.pixels[2], 8);
  }
  const copied = moveSelection(d, mask, 1, 0, true).document;
  assert.equal(activeLayer(copied).refinementProtection[0], true);
  assert.equal(activeLayer(copied).refinementProtection[1], true);
  assert.equal(
    validateDocument(JSON.parse(JSON.stringify(d))).layers[0].protectionMode,
    "pixels",
  );
});
test("guided transforms/merge require explicit detachment; operation validation rejects mismatched guide pixels atomically", () => {
  const d = fresh(16),
    r = rasterizeGuide(16, 16, defaultGuide());
  activeLayer(d).geometryGuide = r.guide;
  d.pixels = r.pixels.map((c) => {
    let i = d.palette.indexOf(c);
    return i < 0 ? d.palette.push(c) - 1 : i;
  });
  assert.throws(() => transformSelection(d, Array(256).fill(true), "flip-x"));
  assert.throws(() => moveSelection(d, Array(256).fill(true), 1, 0));
  const invalid = clone(d);
  invalid.pixels[0] = 7;
  assert.throws(() => validateOperation(d, invalid));
  assert.equal(d.pixels[0], 0);
  // Existing invalid documents still support non-pixel recovery state and detachment.
  assert.ok(validateOperation(invalid, clone(invalid)));
  const detached = clone(invalid);
  delete activeLayer(detached).geometryGuide;
  assert.ok(validateOperation(invalid, detached));
  d.layers.push({
    id: "top",
    name: "Top",
    visible: true,
    locked: false,
    pixels: Array(256).fill(0),
  });
  d.activeLayerId = "top";
  assert.throws(() => mergeDown(d));
});
test("merging mixed protection modes conservatively keeps legacy marks fixed", () => {
  const d = fresh();
  d.pixels[0] = 7;
  activeLayer(d).refinementProtection = d.pixels.map((_, i) => i === 0);
  d.layers.push({
    id: "top",
    name: "Top",
    visible: true,
    locked: false,
    protectionMode: "pixels",
    refinementProtection: d.pixels.map((_, i) => i === 1),
    pixels: d.pixels.map((_, i) => (i === 1 ? 8 : 0)),
  });
  d.activeLayerId = "top";
  const merged = mergeDown(d);
  assert.equal(activeLayer(merged).protectionMode, "canvas");
  assert.deepEqual(activeLayer(merged).refinementProtection.slice(0, 2), [
    true,
    true,
  ]);
  d.layers[0].protectionMode = "pixels";
  assert.equal(activeLayer(mergeDown(d)).protectionMode, "pixels");
});
test("canvas resize preserves all layers, alpha, selection and protection with deterministic anchors and crop counts", () => {
  const d = fresh();
  d.pixels[0] = 7;
  activeLayer(d).refinementProtection = d.pixels.map((_, i) => i === 0);
  d.layers.push({
    id: "hidden",
    name: "Hidden",
    visible: false,
    locked: true,
    alphaLocked: true,
    pixels: [8, ...Array(15).fill(0)],
  });
  const grow = resizeCanvas(
    d,
    d.pixels.map((_, i) => i === 0),
    6,
    6,
    "center",
  );
  assert.equal(grow.document.pixels[7], 7);
  assert.equal(grow.document.layers[1].pixels[7], 8);
  assert.equal(grow.selection[7], true);
  assert.equal(activeLayer(grow.document).refinementProtection[7], true);
  const cut = resizeCanvas(d, Array(16).fill(false), 2, 2, "se");
  assert.equal(cut.croppedPixels, 2);
  assert.equal(cut.croppedProtection, 1);
  assert.equal(d.width, 4);
  assert.throws(() => resizeCanvas(d, [], 4, 4));
});
test("palette cleanup preserves RGBA of hidden/locked layers and prepared ramps/slots with a complete index map", () => {
  const d = fresh();
  d.pixels[0] = 7;
  d.palette.push(d.palette[7]);
  d.layers.push({
    id: "hidden",
    name: "Hidden",
    visible: false,
    locked: true,
    pixels: [16, ...Array(15).fill(0)],
  });
  d.shadeRamps = [{ id: "r", name: "Ramp", colors: d.palette.slice(10, 13) }];
  const before = JSON.stringify(d),
    p = compactPalette(d, { keepIndices: [15] });
  assert.equal(p.removed, 11);
  assert.equal(p.document.palette[p.indices[7]], d.palette[7]);
  assert.deepEqual(documentRGBA(d), documentRGBA(p.document));
  assert.equal(p.document.layers[1].pixels[0], p.indices[7]);
  assert.ok(p.document.palette.includes(d.palette[15]));
  for (const c of d.shadeRamps[0].colors)
    assert.ok(p.document.palette.includes(c));
  assert.equal(JSON.stringify(d), before);
});
test("optional project context round-trips only accepted crop/prompt and is excluded from AI context unless attached", () => {
  const d = fresh(),
    image =
      "data:image/png;base64," +
      PNG.sync
        .write({ width: 1, height: 1, data: Buffer.from([1, 2, 3, 255]) })
        .toString("base64");
  d.editorContext = {
    prompt: "PRIVATE SAVED PROMPT",
    reference: { image, purposes: ["shape"], note: "SAVED ONLY" },
    path: "secret",
    originalImage: "secret",
  };
  const checked = validateDocument(d);
  assert.deepEqual(Object.keys(checked.editorContext).sort(), [
    "prompt",
    "reference",
  ]);
  const request = buildRequest(
    {
      document: checked,
      mask: Array(16).fill(true),
      prompt: "Paint",
      image,
      activeImage: image,
    },
    "test",
  );
  assert.ok(!JSON.stringify(request).includes("PRIVATE SAVED PROMPT"));
  assert.ok(!JSON.stringify(request).includes("SAVED ONLY"));
  assert.throws(() =>
    validateDocument({ ...d, editorContext: { prompt: "x".repeat(4001) } }),
  );
  assert.throws(() =>
    validateDocument({
      ...d,
      editorContext: {
        prompt: "",
        reference: {
          ...d.editorContext.reference,
          image: "data:image/png;base64,AAAA",
        },
      },
    }),
  );
});
