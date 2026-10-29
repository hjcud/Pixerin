import { wirePatch } from "./wire-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  partialPatch,
  ProgressReporter,
  publicUsage,
} from "../electron/progress.mjs";
import { createDocument, clone } from "../src/core.mjs";
import { readResponseStream, requestPatch } from "../electron/ai.mjs";
const prefix = '{"summary":"색 변경","new_colors":[],"segments":[';
test("partial JSON exposes only complete segments and never guesses a partial palette index", () => {
  assert.equal(partialPatch(prefix + '{"id":0,"colors":[1').segments.length, 0);
  const result = partialPatch(prefix + '{"id":0,"colors":[15]}, {"id":1');
  assert.deepEqual(result.segments, [{ id: 0, colors: [15] }]);
  assert.equal(
    partialPatch('{"summary":"\\\"segments\\\":[{}]","new_colors":["#FF'),
    null,
  );
  assert.equal(
    partialPatch('{"summary":"ok","new_colors":[],"segments":[],"segments":['),
    null,
  );
});
test("partial parser tolerates chunk boundaries and key order without interpreting text as structure", () => {
  const p = {
      summary: 'Quote " and brace } with \\ newline\n한글',
      new_colors: ["#AAFFFF80"],
      segments: [{ id: 1, colors: [16] }],
    },
    text = JSON.stringify(p);
  for (let n = 1; n < text.length; n++) {
    const partial = partialPatch(text.slice(0, n));
    if (partial?.segments.length)
      assert.deepEqual(partial.segments, p.segments);
  }
  assert.deepEqual(
    partialPatch(
      JSON.stringify({
        segments: p.segments,
        new_colors: p.new_colors,
        summary: p.summary,
      }),
    ),
    p,
  );
});
test("stream previews enforce selection and alpha lock, stop clears pending notifications", () => {
  const doc = createDocument(4, 4);
  doc.palette.push("#50A88980");
  doc.pixels[0] = 16;
  const before = clone(doc),
    events = [];
  const reporter = new ProgressReporter(
    { document: doc, mask: doc.pixels.map((_, i) => i === 0), alphaLock: true },
    (e) => events.push(e),
    9999,
  );
  reporter.update({
    type: "text",
    itemId: "one",
    delta: prefix + '{"id":0,"colors":[11]},',
  });
  reporter.flush();
  assert.equal(
    events.at(-1).preview.document.palette[
      events.at(-1).preview.document.pixels[0]
    ],
    "#D7788780",
  );
  reporter.update({
    type: "text",
    itemId: "one",
    delta: '{"id":1,"colors":[11]}',
  });
  reporter.flush();
  assert.equal(events.at(-1).preview, null);
  const count = events.length;
  reporter.stop();
  reporter.update({ type: "usage", usage: { input_tokens: 44 } });
  reporter.flush();
  assert.equal(events.length, count);
  assert.deepEqual(doc, before);
});
test("usage preserves missing values and rejects estimates or invalid counters", () => {
  assert.equal(publicUsage(null), null);
  assert.deepEqual(
    publicUsage({
      input_tokens: 0,
      output_tokens: null,
      reasoning_tokens: 4,
      secret: "ignored",
    }),
    { input_tokens: 0, reasoning_tokens: 4 },
  );
  assert.equal(publicUsage({ input_tokens: -1, output_tokens: NaN }), null);
});
function stream(text, chunk = 1) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += chunk)
        c.enqueue(bytes.slice(i, i + chunk));
      c.close();
    },
  });
}
test("SSE handles split UTF-8 and CRLF, emits deltas and requires authoritative completion", async () => {
  const events = [],
    final = {
      status: "completed",
      output: [],
      usage: { input_tokens: 42, output_tokens: 9 },
    };
  const sse =
    ": heartbeat\r\n\r\ndata: " +
    JSON.stringify({
      type: "response.output_text.delta",
      item_id: "m",
      delta: "한글",
    }) +
    "\r\n\r\ndata: " +
    JSON.stringify({ type: "response.completed", response: final }) +
    "\r\n\r\n";
  assert.deepEqual(
    await readResponseStream(stream(sse), (e) => events.push(e)),
    final,
  );
  assert.equal(events[0].delta, "한글");
  await assert.rejects(
    () =>
      readResponseStream(
        stream('data: {"type":"response.output_text.delta","delta":"{}"}\n\n'),
      ),
    /완료되기 전에/,
  );
});
test("SSE cancellation cannot turn partial content into a completed response", async () => {
  const controller = new AbortController();
  const body = new ReadableStream({
    start(c) {
      c.enqueue(
        new TextEncoder().encode(
          'data: {"type":"response.output_text.delta","delta":"{"}\n\n',
        ),
      );
    },
  });
  await assert.rejects(
    () => readResponseStream(body, () => controller.abort(), controller.signal),
    { name: "AbortError" },
  );
});
test("API requests streaming and returns validated final patch and detailed token usage", async () => {
  const doc = createDocument(4, 4),
    patch = {
      summary: "색 변경",
      new_colors: [],
      runs: [{ x: 0, y: 0, colors: [7] }],
    };
  const final = {
    status: "completed",
    usage: {
      input_tokens: 10,
      output_tokens: 12,
      output_tokens_details: { reasoning_tokens: 4 },
    },
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(
              wirePatch(
                { document: doc, mask: doc.pixels.map(() => true) },
                patch,
              ),
            ),
          },
        ],
      },
    ],
  };
  const result = await requestPatch({
    key: "test-key",
    model: "gpt-6-astra",
    input: {
      document: doc,
      mask: doc.pixels.map(() => true),
      prompt: "색 변경",
    },
    onProgress: () => {},
    fetchImpl: async (_, options) => {
      assert.equal(JSON.parse(options.body).stream, true);
      return {
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: stream(
          "data: " +
            JSON.stringify({ type: "response.completed", response: final }) +
            "\n\n",
          7,
        ),
      };
    },
  });
  assert.deepEqual(result.proposal, patch);
  assert.deepEqual(result.usage, {
    input_tokens: 10,
    output_tokens: 12,
    reasoning_tokens: 4,
  });
});
