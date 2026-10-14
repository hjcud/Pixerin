import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, applyProposal, clone } from "../src/core.mjs";
import {
  fixedScope,
  fixedSegments,
  decodePatch,
  patchSchema,
} from "../electron/fixed-patch.mjs";
import { buildRequest, parseResponse, requestPatch } from "../electron/ai.mjs";
import { ProgressReporter } from "../electron/progress.mjs";
const input = (w = 10, h = 2) => {
  const document = createDocument(w, h);
  return { document, mask: document.pixels.map(() => true), prompt: "Edit" };
};
const wire = (segments = [], new_colors = []) => ({
  summary: "Edit",
  new_colors,
  segments,
});
const response = (p) => ({
  status: "completed",
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(p) }],
    },
  ],
});

test("small patches omit compact grammar overhead until the measured segment threshold", () => {
  assert.equal(patchSchema(47).properties.segments.items.properties.colors.anyOf,undefined);
  assert.equal(patchSchema(48).properties.segments.items.properties.colors.anyOf.length,3);
  assert.match(buildRequest(input(8,8),"mock").instructions,/fixed-segments-v1/);
  assert.match(buildRequest(input(32,32),"mock").instructions,/fixed-segments-v2/);
});

test("fixed segments partition irregular selections exactly, including short tails and 64px rows", () => {
  for (const width of [1, 8, 16, 32, 64]) {
    const mask = Array.from({ length: width * 4 }, (_, i) => i % 7 !== 2),
      table = fixedSegments(mask, width),
      recovered = mask.map(() => false);
    table.forEach((s, id) => {
      assert.equal(s.id, id);
      assert.ok(s.length > 0 && s.length <= 8);
      assert.ok(s.x + s.length <= width);
      for (let x = s.x; x < s.x + s.length; x++) {
        const i = s.y * width + x;
        assert.equal(recovered[i], false);
        recovered[i] = true;
      }
    });
    assert.deepEqual(recovered, mask);
  }
});
test("null preserves pixels, zero erases, omitted segments and reordered IDs do not shift colors", () => {
  const i = input();
  i.document.pixels.fill(7);
  const before = clone(i.document);
  const p = wire([
    { id: 1, colors: [null, 0] },
    { id: 0, colors: [8, null, 9, 9, null, null, null, 10] },
  ]);
  const canonical = parseResponse(response(p), i).proposal;
  assert.deepEqual(canonical.runs, [
    { x: 9, y: 0, colors: [0] },
    { x: 0, y: 0, colors: [8] },
    { x: 2, y: 0, colors: [9, 9] },
    { x: 7, y: 0, colors: [10] },
  ]);
  const result = applyProposal(i.document, i.mask, canonical);
  assert.equal(result.changed, 5);
  assert.deepEqual(result.document.pixels.slice(10), before.pixels.slice(10));
  assert.deepEqual(i.document, before);
  assert.equal(
    applyProposal(
      i.document,
      i.mask,
      parseResponse(response(wire()), i).proposal,
    ).changed,
    0,
  );
});

test("compressed fills and sparse edits decode identically to dense v1 patches", () => {
  const i = input(), table = fixedScope(i).segments;
  const dense = wire([{ id: 0, colors: Array(8).fill(7) }, { id: 1, colors: [null, 0] }]);
  const compact = wire([{ id: 0, colors: 7 }, { id: 1, colors: { set: [1, 0] } }]);
  assert.deepEqual(decodePatch(compact, table), decodePatch(dense, table));
  assert.ok(JSON.stringify(compact).length < JSON.stringify(dense).length);
  // Irregular masks and tail segments remain server-owned after decompression.
  const selected = { ...input(6, 1), mask: [true, false, true, true, false, true] };
  const result = parseResponse(response(wire([
    { id: 1, colors: { set: [1, 7] } }, { id: 2, colors: 8 },
  ])), selected);
  assert.deepEqual(result.proposal.runs, [{ x: 3, y: 0, colors: [7] }, { x: 5, y: 0, colors: [8] }]);
  assert.throws(() => parseResponse(response(wire([{ id: 0, colors: 255 }])), selected));
  assert.throws(() => parseResponse(response(wire([{ id: 0, colors: 16 }], ["#123456FF"])), { ...selected, paletteOnly: true }));
});

test("compressed spans reject malformed pairs, duplicate positions and scope escapes atomically", () => {
  const i = input(), table = fixedScope(i).segments, original = clone(i.document);
  for (const colors of [null, -1, 256, 1.5, { set: [] }, { set: [0] }, { set: [0, 7, 1] },
    { set: [-1, 7] }, { set: [2, 7] }, { set: [0, 7, 0, 8] }, { set: [1, 7, 0, 8] },
    { set: [0, 256] }, { set: [0, null] }, { set: [0, "7"] }, { set: [false, 7] },
    { set: [0, 7], x: 0 }, { set: [0, 7], length: 1 }]) {
    assert.throws(() => decodePatch(wire([{ id: 1, colors }]), table));
  }
  assert.throws(() => decodePatch(wire([{ id: 0, colors: 7 }, { id: 0, colors: { set: [1, 8] } }]), table));
  assert.deepEqual(i.document, original);
});

test("compressed streaming previews wait for complete values and keep exact alpha", () => {
  const i = input(8, 1);
  i.document.palette.push("#50A88980"); i.document.pixels.fill(16); i.alphaLock = true;
  for (const colors of [8, { set: [3, 8] }]) {
    const text = JSON.stringify(wire([{ id: 0, colors }])), frames = [];
    const reporter = new ProgressReporter(i, (e) => frames.push(e));
    for (const char of text) {
      reporter.update({ type: "text", delta: char }); reporter.flush();
      if (frames.at(-1).preview)
        assert.ok(frames.at(-1).preview.document.pixels.every((index) => frames.at(-1).preview.document.palette[index].endsWith("80")));
    }
    assert.deepEqual(frames.at(-1).preview.document,
      applyProposal(i.document, i.mask, parseResponse(response(wire([{ id: 0, colors }])), i).proposal, { alphaLock: true }).document);
    reporter.stop();
  }
});
test("invalid IDs, duplicates, lengths, colors, extra coordinates and legacy wire never produce a proposal", () => {
  const i = input(),
    table = fixedScope(i).segments,
    before = clone(i.document);
  for (const bad of [
    wire([{ id: -1, colors: [7] }]),
    wire([{ id: table.length, colors: [7] }]),
    wire([{ id: 0.5, colors: [7] }]),
    wire([{ id: 1, colors: [7] }]),
    wire([{ id: 1, colors: [7, null, null] }]),
    wire([
      { id: 1, colors: [7, null] },
      { id: 1, colors: [8, null] },
    ]),
    ...["7", true, -1, 256, 1.5].map((c) =>
      wire([{ id: 1, colors: [c, null] }]),
    ),
    wire([{ id: 1, x: 0, colors: [7, null] }]),
    { ...wire(), runs: [] },
    { summary: "legacy", new_colors: [], runs: [{ x: 0, y: 0, colors: [7] }] },
  ]) {
    assert.throws(() => decodePatch(bad, table), /고정 구간/);
    assert.throws(() => parseResponse(response(bad), i));
  }
  assert.deepEqual(i.document, before);
});
test("alpha lock removes transparent pixels from mapping and preserves partial alpha", () => {
  const i = input(4, 1);
  i.document.palette.push("#50A88980");
  i.document.pixels[2] = 16;
  i.alphaLock = true;
  assert.deepEqual(fixedScope(i).segments, [{ id: 0, x: 2, y: 0, length: 1 }]);
  const result = applyProposal(
    i.document,
    i.mask,
    parseResponse(response(wire([{ id: 0, colors: [11] }])), i).proposal,
    { alphaLock: true },
  );
  assert.equal(result.document.palette[result.document.pixels[2]], "#D7788780");
  assert.deepEqual(
    result.document.pixels.filter((_, n) => n !== 2),
    [0, 0, 0],
  );
});
test("palette rules still validate after decoding, including unavailable indices and new colors", () => {
  const i = input(1, 1),
    p = wire([{ id: 0, colors: [16] }], ["#123456FF"]);
  assert.equal(
    applyProposal(i.document, i.mask, parseResponse(response(p), i).proposal)
      .document.palette[16],
    "#123456FF",
  );
  assert.throws(
    () => parseResponse(response(p), { ...i, paletteOnly: true }),
    /팔레트/,
  );
  assert.throws(() =>
    parseResponse(response(wire([{ id: 0, colors: [255] }])), i),
  );
});
test("streaming uses an immutable per-request map and clears invalid completed segments", () => {
  const i = input(4, 1);
  i.mask = [false, true, false, true];
  const frozen = clone(i),
    frames = [];
  const reporter = new ProgressReporter(i, (e) => frames.push(e));
  i.mask.fill(true);
  i.document.pixels.fill(9);
  const p = wire([{ id: 1, colors: [7] }]);
  reporter.update({ type: "textDone", text: JSON.stringify(p) });
  reporter.flush();
  const canonical = parseResponse(response(p), frozen).proposal;
  assert.deepEqual(
    frames.at(-1).preview.document,
    applyProposal(frozen.document, frozen.mask, canonical).document,
  );
  reporter.update({
    type: "textDone",
    text: JSON.stringify(wire([{ id: 1, colors: [7, 8] }])),
  });
  reporter.flush();
  assert.equal(frames.at(-1).preview, null);
  reporter.stop();
});
test("stream waits for the palette and complete segments at every chunk boundary", () => {
  const i = input(3, 1),
    p = wire([{ id: 0, colors: [16, null, 7] }], ["#123456FF"]),
    text = JSON.stringify(p),
    frames = [];
  const reporter = new ProgressReporter(i, (e) => frames.push(e));
  for (const c of text) {
    reporter.update({ type: "text", delta: c });
    reporter.flush();
    if (frames.at(-1).preview)
      assert.deepEqual(frames.at(-1).preview.document.pixels, [16, 0, 7]);
  }
  assert.equal(frames.at(-1).preview.changed, 2);
  reporter.stop();
});
test("API freezes the map before awaiting transport and does not retry invalid output", async () => {
  const i = input(4, 1);
  i.mask = [false, true, false, false];
  let calls = 0;
  const result = await requestPatch({
    input: i,
    model: "mock",
    key: "mock",
    fetchImpl: async () => {
      calls++;
      i.mask = [true, false, false, false];
      return {
        ok: true,
        json: async () => response(wire([{ id: 0, colors: [7] }])),
      };
    },
  });
  assert.deepEqual(result.proposal.runs, [{ x: 1, y: 0, colors: [7] }]);
  assert.equal(calls, 1);
  await assert.rejects(() =>
    requestPatch({
      input: i,
      model: "mock",
      key: "mock",
      fetchImpl: async () => {
        calls++;
        return {
          ok: true,
          json: async () => response(wire([{ id: 99, colors: [7] }])),
        };
      },
    }),
  );
  assert.equal(calls, 2);
});
test("request keeps full reference grid but exposes only fixed segment output keys with bounded schema size", () => {
  const i = input(64, 64);
  i.mask = i.mask.map((_, n) => n % 2 === 0);
  const b = buildRequest(i, "mock"),
    data = JSON.parse(b.input[0].content[0].text),
    schema = b.text.format.schema;
  assert.equal(data.rows.length, 64);
  assert.equal(data.rows[0].length, 64);
  assert.equal(data.editable_segments.length, 2048);
  assert.equal(data.editable_runs, undefined);
  assert.deepEqual(Object.keys(schema.properties.segments.items.properties), [
    "id",
    "colors",
  ]);
  assert.equal(schema.properties.segments.items.properties.id.maximum, 2047);
  assert.ok(JSON.stringify(schema).length < 1000);
  assert.deepEqual(schema, patchSchema(data.editable_segments.length));
});
