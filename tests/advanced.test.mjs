import { wirePatch } from "./wire-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  validateDocument,
  clone,
  documentRGBA,
  applyProposal,
} from "../src/core.mjs";
import { mergeDown, transformSelection } from "../src/advanced.mjs";
import { paintPoints, moveSelection } from "../src/editing.mjs";
import { buildRequest, parseResponse } from "../electron/ai.mjs";
import { ProgressReporter } from "../electron/progress.mjs";

function fixture() {
  const doc = ensureLayers(createDocument(4, 4));
  doc.pixels[0] = 7;
  doc.layers.push({
    id: "top",
    name: "Top",
    visible: true,
    locked: false,
    pixels: Array(16).fill(0),
  });
  doc.activeLayerId = "top";
  doc.pixels[1] = 11;
  return doc;
}
test("merge keeps exact composite and unaffected layers; locked or palette-overflow merges are atomic", () => {
  const doc = fixture(),
    before = JSON.stringify(doc),
    merged = mergeDown(doc);
  assert.equal(merged.layers.length, 1);
  assert.deepEqual(documentRGBA(merged), documentRGBA(doc));
  assert.equal(JSON.stringify(doc), before);
  doc.layers[0].locked = true;
  assert.throws(() => mergeDown(doc), /잠금/);
  doc.layers[0].locked = false;
  doc.palette.push("#FF000080");
  doc.pixels[0] = 16;
  while (doc.palette.length < 256) doc.palette.push("#010203FF");
  const full = JSON.stringify(doc);
  assert.throws(() => mergeDown(doc), /256/);
  assert.equal(JSON.stringify(doc), full);
});
test("selection transforms map irregular selected pixels and retain holes and other layers", () => {
  const doc = fixture();
  doc.pixels[0] = 8;
  doc.pixels[4] = 9;
  doc.pixels[5] = 13;
  const mask = Array(16).fill(false);
  mask[0] = mask[1] = mask[4] = true;
  const flipped = transformSelection(doc, mask, "flip-x");
  assert.equal(flipped.document.pixels[0], 11);
  assert.equal(flipped.document.pixels[1], 8);
  assert.equal(flipped.document.pixels[5], 9);
  assert.deepEqual(flipped.document.layers[0], doc.layers[0]);
  const rotated = transformSelection(doc, mask, "rotate-cw");
  assert.equal(rotated.document.pixels[0], 9);
  assert.equal(rotated.document.pixels[1], 8);
  assert.equal(rotated.document.pixels[5], 11);
  assert.equal(rotated.selection.filter(Boolean).length, 3);
  const single = transformSelection(doc, mask, "flip-y");
  assert.equal(single.document.pixels[1], 0);
  assert.equal(single.document.pixels[5], 11);
  const narrow = ensureLayers(createDocument(2, 4)),
    all = Array(8).fill(true);
  assert.throws(() => transformSelection(narrow, all, "rotate-cw"), /커요/);
});
test("duplicate move reads original pixels without clearing them", () => {
  const doc = fixture(),
    mask = Array(16).fill(false);
  mask[1] = true;
  const next = moveSelection(doc, mask, 1, 1, true);
  assert.equal(next.document.pixels[1], 11);
  assert.equal(next.document.pixels[6], 11);
  assert.equal(next.selection[6], true);
});
test("symmetry mirrors the whole brush footprint and enforces mask and alpha on both sides", () => {
  const doc = ensureLayers(createDocument(8, 2)),
    none = Array(16).fill(false);
  paintPoints(doc, none, [[1, 0]], 7, 2, false, true);
  assert.deepEqual(doc.pixels.slice(0, 8), [0, 7, 7, 0, 0, 7, 7, 0]);
  const mask = Array(16).fill(false);
  mask[1] = true;
  paintPoints(doc, mask, [[1, 0]], 11, 1, false, true);
  assert.equal(doc.pixels[1], 11);
  assert.equal(doc.pixels[6], 7);
  paintPoints(doc, none, [[0, 0]], 8, 1, true, true);
  assert.equal(doc.pixels[0], 0);
  assert.equal(doc.pixels[7], 0);
});
test("palette-only rejects new colors in final and streaming patches, including implicit alpha colors", () => {
  const doc = fixture(),
    input = {
      document: doc,
      mask: Array(16).fill(true),
      paletteOnly: true,
      prompt: "Edit",
    };
  const patch = {
    summary: "Edit",
    new_colors: ["#123456FF"],
    runs: [{ x: 0, y: 0, colors: [16] }],
  };
  assert.throws(
    () => applyProposal(doc, input.mask, patch, { paletteOnly: true }),
    /팔레트/,
  );
  assert.equal(
    JSON.parse(buildRequest(input, "gpt-6-astra").input[0].content[0].text)
      .palette_only,
    true,
  );
  assert.throws(
    () =>
      parseResponse(
        {
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(wirePatch(input, patch)),
                },
              ],
            },
          ],
        },
        input,
      ),
    /팔레트/,
  );
  const frames = [],
    reporter = new ProgressReporter(input, (e) => frames.push(e));
  reporter.update({
    type: "textDone",
    text: JSON.stringify(wirePatch(input, patch)),
  });
  reporter.flush();
  reporter.stop();
  assert.equal(frames[0].preview, null);
  doc.palette.push("#50A88980");
  doc.pixels[0] = 16;
  assert.throws(
    () =>
      applyProposal(
        doc,
        input.mask,
        {
          summary: "Edit",
          new_colors: [],
          runs: [{ x: 0, y: 0, colors: [11] }],
        },
        { alphaLock: true, paletteOnly: true },
      ),
    /팔레트/,
  );
  const result = applyProposal(
    doc,
    input.mask,
    { summary: "Edit", new_colors: [], runs: [{ x: 1, y: 0, colors: [8] }] },
    { paletteOnly: true },
  );
  assert.equal(result.document.palette.length, doc.palette.length);
  assert.equal(result.document.pixels[1], 8);
});
test("named shade ramps round trip through JSON and validation with exact RGBA", () => {
  const doc = fixture();
  doc.shadeRamps = [
    {
      id: "ramp",
      name: "따뜻한 빛",
      colors: ["#97516AFF", "#50A88980", "#F5D99AFF"],
    },
  ];
  assert.deepEqual(
    validateDocument(JSON.parse(JSON.stringify(doc))).shadeRamps,
    doc.shadeRamps,
  );
  const invalid = clone(doc);
  invalid.shadeRamps[0].colors[0] = "red";
  assert.throws(() => validateDocument(invalid));
  invalid.shadeRamps = [doc.shadeRamps[0], doc.shadeRamps[0]];
  assert.throws(() => validateDocument(invalid));
});
