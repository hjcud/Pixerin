import { wirePatch } from "./wire-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  validateDocument,
  applyProposal,
  History,
  rectMask,
  linePoints,
  maskRuns,
  documentRGBA,
} from "../src/core.mjs";
import { encodePNG, decodePNG } from "../electron/png.mjs";
import { buildRequest, parseResponse, requestPatch } from "../electron/ai.mjs";
const patch = (runs, new_colors = []) => ({
  summary: "선택 영역 수정",
  new_colors,
  runs,
});

test("creates exact transparent canvases and rejects invalid dimensions before allocation", () => {
  for (const n of [8, 16, 32, 64, 128, 256]) {
    const d = createDocument(n, n);
    assert.equal(d.pixels.length, n * n);
    assert.ok(d.pixels.every((x) => x === 0));
  }
  for (const n of [0, -1, 4097, Infinity, 1.2, 1000000000])
    assert.throws(() => createDocument(n, 16));
});
test("patches are atomic and cannot write beyond the frozen selection", () => {
  const d = createDocument(8, 8),
    mask = Array(64).fill(false);
  mask[0] = true;
  const before = structuredClone(d);
  assert.throws(
    () => applyProposal(d, mask, patch([{ x: 0, y: 0, colors: [7, 7] }])),
    /선택 영역 밖/,
  );
  assert.deepEqual(d, before);
  const result = applyProposal(d, mask, patch([{ x: 0, y: 0, colors: [7] }]));
  assert.equal(result.changed, 1);
  assert.equal(result.document.pixels[0], 7);
  assert.deepEqual(result.document.pixels.slice(1), d.pixels.slice(1));
});
test("adding colors never changes an existing palette entry or unselected appearance", () => {
  const d = createDocument(8, 8);
  d.pixels.fill(7);
  const m = Array(64).fill(false);
  m[0] = true;
  const r = applyProposal(
    d,
    m,
    patch([{ x: 0, y: 0, colors: [16] }], ["#ff0000"]),
  );
  assert.deepEqual(r.document.palette.slice(0, 16), d.palette);
  assert.equal(r.document.palette[16], "#FF0000FF");
  assert.equal(r.changed, 1);
});
test("rejects malformed runs, duplicate coordinates, palette overflow and empty masks", () => {
  const d = createDocument(8, 8),
    m = Array(64).fill(true);
  for (const runs of [
    [{ x: 7, y: 0, colors: [1, 2] }],
    [{ x: 0, y: 8, colors: [1] }],
    [{ x: 0.5, y: 0, colors: [1] }],
    [{ x: 0, y: 0, colors: [999] }],
    [
      { x: 0, y: 0, colors: [1] },
      { x: 0, y: 0, colors: [2] },
    ],
  ])
    assert.throws(() => applyProposal(d, m, patch(runs)));
  assert.throws(() => applyProposal(d, Array(64).fill(false), patch([])));
  assert.throws(() =>
    applyProposal(d, m, patch([], Array(257).fill("#123456"))),
  );
});
test("same visible color is not counted as a change", () => {
  const d = createDocument(8, 8);
  d.pixels[0] = 1;
  const r = applyProposal(
    d,
    Array(64).fill(true),
    patch([{ x: 0, y: 0, colors: [16] }], [d.palette[1]]),
  );
  assert.equal(r.changed, 0);
});
test("rectangle add/subtract and mask runs represent the exact selected pixels", () => {
  const a = rectMask(8, 8, [1, 1], [3, 3]);
  assert.equal(a.filter(Boolean).length, 9);
  const b = rectMask(8, 8, [2, 2], [2, 2], a, "subtract");
  assert.equal(b.filter(Boolean).length, 8);
  assert.equal(b[18], false);
  const restored = Array(64).fill(false);
  for (const r of maskRuns(b, 8))
    for (let x = r.x; x < r.x + r.length; x++) restored[r.y * 8 + x] = true;
  assert.deepEqual(restored, b);
});
test("fast pointer movement draws a continuous stroke", () => {
  const points = linePoints(0, 0, 7, 4);
  assert.deepEqual(points[0], [0, 0]);
  assert.deepEqual(points.at(-1), [7, 4]);
  for (let i = 1; i < points.length; i++)
    assert.ok(
      Math.abs(points[i][0] - points[i - 1][0]) <= 1 &&
        Math.abs(points[i][1] - points[i - 1][1]) <= 1,
    );
});
test("undo and redo preserve pixels and palette as a transaction", () => {
  const h = new History(),
    a = createDocument(8, 8),
    b = structuredClone(a);
  b.pixels[0] = 7;
  b.palette.push("#123456FF");
  h.record(a, b);
  assert.deepEqual(h.undo(b), a);
  assert.deepEqual(h.redo(a), b);
  h.undo(b);
  h.record(a, { ...a, name: "changed" });
  assert.equal(h.redo(a), null);
});
test("PNG round trip preserves exact dimensions, alpha and RGBA without resampling", () => {
  const d = createDocument(8, 16);
  d.palette.push("#E2A3407F");
  d.pixels[0] = 16;
  d.pixels[1] = 7;
  d.pixels[127] = 5;
  const decoded = decodePNG(encodePNG(d), "roundtrip");
  assert.equal(decoded.width, 8);
  assert.equal(decoded.height, 16);
  assert.deepEqual(documentRGBA(decoded), documentRGBA(d));
});
test("projects round trip and reject corrupted pixel indexes", () => {
  const d = createDocument();
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))), d);
  d.pixels[0] = -1;
  assert.throws(() => validateDocument(d));
});
test("request sends frozen native grid and strict schema, no image-generation tool", () => {
  const d = createDocument(8, 8),
    mask = rectMask(8, 8, [1, 1], [2, 2]);
  const b = buildRequest(
    { document: d, mask, prompt: "명암 정리" },
    "gpt-6-astra",
  );
  assert.equal(b.model, "gpt-6-astra");
  assert.equal(b.store, false);
  assert.equal(b.text.format.strict, true);
  assert.equal(b.tools, undefined);
  const c = JSON.parse(b.input[0].content[0].text);
  assert.equal(c.rows.length, 8);
  assert.equal(
    c.editable_segments.reduce((n, r) => n + r.length, 0),
    4,
  );
});
test("refusals, incomplete responses and out-of-selection AI output cannot become previews", () => {
  const input = {
    document: createDocument(8, 8),
    mask: rectMask(8, 8, [0, 0], [0, 0]),
  };
  assert.throws(() => parseResponse({ status: "incomplete" }, input));
  assert.throws(() =>
    parseResponse(
      {
        status: "completed",
        output: [
          { type: "message", content: [{ type: "refusal", refusal: "no" }] },
        ],
      },
      input,
    ),
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
              segments: [{ id: 1, colors: [7] }],
            }),
          },
        ],
      },
    ],
  };
  assert.throws(() => parseResponse(response, input), /고정 구간/);
});
test("API transport parses a valid response without exposing credentials in output", async () => {
  const input = {
    document: createDocument(8, 8),
    mask: Array(64).fill(true),
    prompt: "그려줘",
  };
  let called = false;
  const result = await requestPatch({
    key: "fake-test-only",
    model: "gpt-6-astra",
    input,
    fetchImpl: async (url, options) => {
      called = true;
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(options.headers.Authorization, "Bearer fake-test-only");
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(
                    wirePatch(input, patch([{ x: 0, y: 0, colors: [7] }])),
                  ),
                },
              ],
            },
          ],
        }),
      };
    },
  });
  assert.ok(called);
  assert.equal(result.proposal.runs.length, 1);
  assert.ok(!JSON.stringify(result).includes("fake-test-only"));
});
test("API authentication errors are actionable and do not return server secrets", async () => {
  await assert.rejects(
    () =>
      requestPatch({
        key: "fake",
        model: "gpt-6-astra",
        input: {
          document: createDocument(8, 8),
          mask: Array(64).fill(true),
          prompt: "draw",
        },
        fetchImpl: async () => ({ ok: false, status: 401 }),
      }),
    /API 키가 유효하지/,
  );
});
