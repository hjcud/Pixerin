import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  clone,
  paintedMask,
  editableMask,
  applyProposal,
  documentRGBA,
} from "../src/core.mjs";
import { paintPoints, floodFill } from "../src/editing.mjs";
import { buildRequest, parseResponse } from "../electron/ai.mjs";
function fixture() {
  const doc = createDocument(4, 4);
  doc.palette.push("#50A88980");
  doc.pixels[0] = 16;
  doc.pixels[1] = 7;
  doc.pixels[4] = 7;
  return doc;
}
test("alpha mask intersects selection; empty painted scope never falls back to full canvas", () => {
  const doc = fixture(),
    none = doc.pixels.map(() => false);
  assert.equal(paintedMask(doc).filter(Boolean).length, 3);
  assert.equal(editableMask(doc, none, true).filter(Boolean).length, 3);
  assert.equal(
    editableMask(
      doc,
      none.map((_, i) => i === 1),
      true,
    ).filter(Boolean).length,
    1,
  );
  assert.equal(
    editableMask(
      doc,
      none.map((_, i) => i === 15),
      true,
    ).filter(Boolean).length,
    0,
  );
  assert.equal(
    editableMask(createDocument(4, 4), none, true).filter(Boolean).length,
    0,
  );
});
test("locked brush recolors only painted pixels and preserves partial alpha; erasure is ignored", () => {
  const doc = fixture(),
    none = doc.pixels.map(() => false);
  paintPoints(
    doc,
    none,
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    11,
    1,
    true,
  );
  assert.equal(doc.palette[doc.pixels[0]], "#D7788780");
  assert.equal(doc.palette[doc.pixels[1]], "#D77887FF");
  assert.equal(doc.pixels[2], 0);
  const before = clone(doc);
  paintPoints(
    doc,
    none,
    [
      [0, 0],
      [1, 0],
    ],
    0,
    1,
    true,
  );
  assert.deepEqual(doc, before);
  floodFill(doc, none, 3, 3, 11, true);
  assert.deepEqual(doc, before);
});
test("locked fill preserves alpha and selection, including disconnected regions", () => {
  const doc = fixture(),
    mask = doc.pixels.map((_, i) => i === 0 || i === 1);
  floodFill(doc, mask, 0, 0, 11, true);
  assert.equal(doc.palette[doc.pixels[0]], "#D7788780");
  assert.equal(doc.pixels[1], 7);
  assert.equal(doc.pixels[4], 7);
});
test("AI alpha lock rejects background writes even with a broad caller mask and keeps exact alpha", () => {
  const doc = fixture(),
    before = clone(doc),
    mask = doc.pixels.map(() => true);
  const patch = {
    summary: "recolor",
    new_colors: [],
    runs: [{ x: 0, y: 0, colors: [11, 11] }],
  };
  const result = applyProposal(doc, mask, patch, { alphaLock: true });
  assert.equal(result.changed, 2);
  assert.equal(result.document.palette[result.document.pixels[0]], "#D7788780");
  assert.deepEqual(
    Array.from(documentRGBA(result.document)).filter((_, i) => i % 4 === 3),
    Array.from(documentRGBA(doc)).filter((_, i) => i % 4 === 3),
  );
  assert.throws(
    () =>
      applyProposal(
        doc,
        mask,
        { ...patch, runs: [{ x: 2, y: 0, colors: [11] }] },
        { alphaLock: true },
      ),
    /투명 잠금/,
  );
  assert.deepEqual(doc, before);
});
test("request transmits only painted editable runs and rejects empty scope before inference", () => {
  const doc = fixture(),
    input = {
      document: doc,
      mask: doc.pixels.map(() => true),
      prompt: "recolor",
      alphaLock: true,
    };
  const request = buildRequest(input, "gpt-6-astra"),
    context = JSON.parse(request.input[0].content[0].text);
  assert.equal(context.alpha_locked, true);
  assert.equal(
    context.editable_segments.reduce((sum, r) => sum + r.length, 0),
    3,
  );
  assert.equal(input.mask.filter(Boolean).length, 16);
  assert.throws(
    () =>
      buildRequest(
        { ...input, mask: input.mask.map((_, i) => i === 15) },
        "gpt-6-astra",
      ),
    /색상 픽셀이 없/,
  );
  const response = {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              summary: "invalid",
              new_colors: [],
              segments: [{ id: 999, colors: [11] }],
            }),
          },
        ],
      },
    ],
  };
  assert.throws(() => parseResponse(response, input), /고정 구간/);
});
test("alpha-preserving palette overflow rejects AI proposal atomically", () => {
  const doc = fixture();
  while (doc.palette.length < 256) doc.palette.push("#000001FF");
  const before = clone(doc);
  assert.throws(
    () =>
      applyProposal(
        doc,
        doc.pixels.map(() => true),
        {
          summary: "change",
          new_colors: [],
          runs: [{ x: 0, y: 0, colors: [11] }],
        },
        { alphaLock: true },
      ),
    /256색/,
  );
  assert.deepEqual(doc, before);
});
