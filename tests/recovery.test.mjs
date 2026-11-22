import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RecoveryStore } from "../electron/recovery.mjs";
import { createDocument, ensureLayers, clone } from "../src/core.mjs";

async function fixture(t, limit = 20) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pixerin-recovery-test-"),
  );
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("pixerin-recovery-test-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  const write = async (file, text) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  };
  return { root, write, store: new RecoveryStore(root, write, limit) };
}
test("recovery preserves independent latest and saved layer snapshots across sessions", async (t) => {
  const { root, write, store } = await fixture(t);
  const doc = ensureLayers(createDocument(8, 8, "Layered artwork"));
  doc.layers[0].refinementProtection = doc.pixels.map((_, i) => i === 3);
  const target = path.join(root, "drawing.pixeltool");
  store.start(target);
  await store.record(doc, true);
  const edited = clone(doc);
  edited.pixels[5] = 7;
  await store.record(edited);
  assert.deepEqual(await store.snapshot(store.id, "saved"), doc);
  assert.deepEqual(await store.snapshot(store.id, "latest"), edited);
  const resumed = new RecoveryStore(root, write);
  assert.equal(await resumed.resume(edited), true);
  assert.equal(resumed.projectPath, target);
  assert.deepEqual(resumed.savedDocument, doc);
  const legacy = new RecoveryStore(root, write);
  assert.equal(await legacy.resume(doc), false);
  assert.equal(legacy.projectPath, null);
});
test("new work retains other projects; bounded pruning never touches project files", async (t) => {
  const { root, store } = await fixture(t, 2);
  const project = path.join(root, "original.pixeltool");
  await fs.writeFile(project, "keep");
  const doc = createDocument();
  store.start(project, doc);
  await store.record(doc);
  store.start();
  await store.record(doc);
  store.start();
  await store.record(doc);
  assert.equal((await store.list()).length, 2);
  assert.equal(await fs.readFile(project, "utf8"), "keep");
  assert.ok((await store.list()).some((e) => e.id === store.id));
});
test("invalid recovery files are isolated and untrusted paths or versions are rejected", async (t) => {
  const { root, store } = await fixture(t);
  await store.record(createDocument());
  await fs.writeFile(path.join(root, "a".repeat(32) + ".json"), "{}");
  assert.equal((await store.list()).length, 1);
  await assert.rejects(store.snapshot("../session", "latest"));
  await assert.rejects(store.snapshot(store.id, "unknown"));
  await assert.rejects(store.snapshot(store.id, "saved"));
});
