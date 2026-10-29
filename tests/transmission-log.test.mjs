import test from "node:test";
import assert from "node:assert/strict";
import { TransmissionLog, LOG_LIMIT } from "../electron/transmission-log.mjs";
import { createDocument } from "../src/core.mjs";
const input = () => ({ document: createDocument(8, 8), mask: Array(64).fill(true), prompt: "private artwork", reference: { note: "private reference" } });

test("transmission history persists only bounded metadata, with accurate partial and terminal state", async () => {
  let disk = null;
  const log = new TransmissionLog({ read: async () => disk, write: async (text) => { disk = JSON.parse(text); }, now: () => 123456 });
  await log.load();
  const row = await log.start(input(), "gemini", "test-vision"); row.calls++;
  await log.finish(row, "completed", { input_tokens: 16, output_tokens: 20, reasoning_tokens: 5, cached_tokens: 4, secret: "do-not-save" });
  assert.equal(log.snapshot().entries[0].partial, false);
  assert.doesNotMatch(JSON.stringify(disk), /private|do-not-save|prompt|palette|pixels":\[/);
  const next = new TransmissionLog({ read: async () => disk, write: async () => {} }); await next.load();
  assert.equal(next.snapshot().entries[0].usage.output_tokens, 20);
  const canceled = await log.start(input(), "api", "test-vision");
  await log.finish(canceled, "canceled", null);
  assert.equal(log.snapshot().entries[0].partial, true); assert.equal(log.snapshot().entries[0].usage, null);
  await log.clear(); assert.deepEqual(disk.entries, []);
});

test("unfinished requests become interrupted on restart and corrupt history is preserved", async () => {
  const base = new TransmissionLog({ read: async () => null, write: async () => {} });
  await base.start(input(), "api", "test-vision");
  const next = new TransmissionLog({ read: async () => ({ version: 1, entries: base.snapshot().entries }), write: async () => {} });
  await next.load(); assert.equal(next.snapshot().entries[0].status, "interrupted"); assert.equal(next.snapshot().entries[0].partial, true);
  let writes = 0;
  const corrupt = new TransmissionLog({ read: async () => { throw Error("Corrupt"); }, write: async () => { writes++; } });
  await corrupt.load(); await corrupt.start(input(), "api", "test-vision");
  assert.equal(writes, 0); assert.equal(corrupt.snapshot().storageError, true);
  await corrupt.clear(); assert.equal(writes, 1);
});

test("history retention and snapshots never expose mutable references or unknown fields", async () => {
  const log = new TransmissionLog({ read: async () => null, write: async () => {} });
  for (let n = 0; n <= LOG_LIMIT; n++) await log.start(input(), "api", "test-vision");
  assert.equal(log.snapshot().entries.length, LOG_LIMIT);
  const copy = log.snapshot(); copy.entries[0].model = "changed";
  assert.equal(log.snapshot().entries[0].model, "test-vision");
});
