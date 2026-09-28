import test from "node:test";
import assert from "node:assert/strict";
import {
  appendPalette,
  capturePalette,
  validatePalette,
} from "../src/palette-library.mjs";
import {
  createDocument,
  documentRGBA,
  validateDocument,
} from "../src/core.mjs";
test("palette append preserves pixel indices, alpha, layers and existing colors", () => {
  const doc = createDocument();
  doc.pixels[0] = 7;
  doc.pixels[1] = 5;
  const before = JSON.stringify(doc),
    rgba = documentRGBA(doc);
  const palette = capturePalette(doc, "Test");
  palette.colors.push("#12345678");
  palette.shadeRamps = [
    { name: "Shade", colors: ["#12345678", "#445566FF", "#FFFFFF00"] },
  ];
  const next = appendPalette(doc, palette);
  assert.equal(JSON.stringify(doc), before);
  assert.deepEqual(next.pixels, doc.pixels);
  assert.deepEqual(documentRGBA(next), rgba);
  assert.equal(next.palette.length, doc.palette.length + 1);
  assert.equal(next.shadeRamps.length, 1);
  assert.deepEqual(appendPalette(next, palette), next);
  validateDocument(next);
});
test("library files normalize duplicates and reject malformed input", () => {
  const raw = {
    format: "pixerin-palette",
    version: 1,
    name: " Test ",
    colors: ["#abcdef", "#ABCDEFFF"],
  };
  assert.deepEqual(validatePalette(raw).colors, ["#ABCDEFFF"]);
  assert.equal(validatePalette(raw).name, "Test");
  for (const bad of [
    null,
    {},
    { ...raw, version: 2 },
    { ...raw, name: "" },
    { ...raw, colors: [] },
    { ...raw, colors: ["javascript:bad"] },
    { ...raw, shadeRamps: [{ name: "x", colors: ["#FFFFFF"] }] },
  ])
    assert.throws(() => validatePalette(bad));
});
test("capacity failures are atomic and shade ramp IDs remain unique", () => {
  const doc = createDocument();
  while (doc.palette.length < 256)
    doc.palette.push(
      "#" + doc.palette.length.toString(16).padStart(6, "0") + "FF",
    );
  const before = JSON.stringify(doc);
  assert.throws(() =>
    appendPalette(doc, {
      format: "pixerin-palette",
      version: 1,
      name: "Test",
      colors: ["#ABCDEF88"],
    }),
  );
  assert.equal(JSON.stringify(doc), before);
  const small = createDocument();
  small.shadeRamps = [
    {
      id: "library-1",
      name: "one",
      colors: ["#000000FF", "#888888FF", "#FFFFFFFF"],
    },
  ];
  const palette = capturePalette(small, "Test");
  palette.shadeRamps[0].name = "two";
  const next = appendPalette(small, palette);
  assert.equal(new Set(next.shadeRamps.map((r) => r.id)).size, 2);
  small.shadeRamps = Array.from({ length: 16 }, (_, i) => ({
    id: String(i),
    name: String(i),
    colors: ["#000000FF", "#888888FF", "#FFFFFFFF"],
  }));
  assert.throws(() => appendPalette(small, palette));
  assert.equal(small.shadeRamps.length, 16);
});
