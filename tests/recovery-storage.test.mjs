import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { RecoveryStore } from "../electron/recovery.mjs";
import {
  scanRecoveryStorage,
  cleanRecoveryStorage,
  storagePolicy,
} from "../electron/recovery-storage.mjs";
import { createDocument } from "../src/core.mjs";

const policy = { days: 30, megabytes: 256 };
test("capacity pressure can select recent saved copies but stops after reaching the target", async (t) => {
  const f = await fixture(t),
    a = await f.document({ recent: true }),
    b = await f.document({ recent: true });
  for (const item of [a, b])
    await fs.appendFile(
      path.join(item.dir, "draft.json"),
      " ".repeat(9 * 1048576),
    );
  const plan = await scanRecoveryStorage(f.root, { days: 30, megabytes: 16 });
  assert.equal(plan.candidates.length, 1);
  assert.ok(plan.totalBytes - plan.candidateBytes <= 16 * 1048576);
});
async function fixture(t) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pixerin-storage-unit-"),
  );
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("pixerin-storage-unit-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  const write = async (file, value) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, value);
  };
  async function document({ unsaved = false, recent = false } = {}) {
    const id = randomUUID(),
      dir = path.join(root, "documents", id);
    const project = path.join(root, id + ".pixeltool"),
      doc = createDocument(8, 8, "Saved artwork");
    await write(project, JSON.stringify(doc));
    const store = new RecoveryStore(path.join(dir, "recovery"), write);
    store.start(project);
    await store.record(doc, !unsaved);
    await write(path.join(dir, "draft.json"), JSON.stringify(doc));
    if (!recent)
      for (const file of [
        "draft.json",
        "recovery/session.json",
        `recovery/${store.id}.json`,
      ]) {
        const old = new Date(Date.now() - 45 * 86400000);
        await fs.utimes(path.join(dir, file), old, old);
      }
    return { id, dir, project, doc, store };
  }
  return { root, document, write };
}
test("cleanup previews only old saved copies and never deletes their source artwork", async (t) => {
  const f = await fixture(t),
    saved = await f.document();
  const recent = await f.document({ recent: true }),
    unsaved = await f.document({ unsaved: true });
  const open = await f.document(),
    closed = await f.document();
  const protect = new Set([open.id, closed.id]);
  const plan = await scanRecoveryStorage(f.root, policy, protect);
  assert.deepEqual(
    plan.candidates.map((e) => e.id),
    [saved.id],
  );
  assert.ok(plan.totalBytes > plan.candidateBytes && plan.protectedBytes > 0);
  const result = await cleanRecoveryStorage(f.root, plan, protect);
  assert.equal(result.removed, 1);
  await assert.rejects(fs.stat(saved.dir), { code: "ENOENT" });
  assert.deepEqual(JSON.parse(await fs.readFile(saved.project)), saved.doc);
  for (const entry of [recent, unsaved, open, closed])
    assert.ok((await fs.stat(entry.dir)).isDirectory());
});
test("changed, newly opened and externally modified candidates survive confirmation", async (t) => {
  const f = await fixture(t),
    modified = await f.document(),
    opened = await f.document(),
    external = await f.document();
  const plan = await scanRecoveryStorage(f.root, policy);
  await f.write(path.join(modified.dir, "placement.json"), "{}");
  await f.write(
    external.project,
    JSON.stringify({ ...external.doc, name: "External edit" }),
  );
  const result = await cleanRecoveryStorage(f.root, plan, new Set([opened.id]));
  assert.deepEqual(result, { removed: 0, bytes: 0, skipped: 3 });
  for (const entry of [modified, opened, external])
    assert.ok((await fs.stat(entry.dir)).isDirectory());
});
test("unknown files, corrupt snapshots, missing projects and legacy data are protected", async (t) => {
  const f = await fixture(t),
    unknown = await f.document(),
    corrupt = await f.document(),
    missing = await f.document();
  await f.write(path.join(unknown.dir, "personal.png"), "personal artwork");
  await f.write(corrupt.store.file(corrupt.store.id), "bad JSON");
  await fs.unlink(missing.project);
  await f.write(path.join(f.root, "recovery", "legacy.json"), "legacy data");
  const plan = await scanRecoveryStorage(f.root, policy);
  assert.equal(plan.candidates.length, 0);
  await cleanRecoveryStorage(f.root, plan);
  assert.equal(
    await fs.readFile(path.join(f.root, "recovery", "legacy.json"), "utf8"),
    "legacy data",
  );
});
test("junctions and policy/path injection cannot authorize cleanup", async (t) => {
  const f = await fixture(t),
    saved = await f.document();
  const linked = randomUUID();
  await fs.symlink(
    saved.dir,
    path.join(f.root, "documents", linked),
    "junction",
  );
  const plan = await scanRecoveryStorage(f.root, policy, new Set([saved.id]));
  assert.equal(plan.candidates.length, 0);
  for (const invalid of [
    null,
    { days: 0, megabytes: 256 },
    { days: 30, megabytes: Infinity },
  ])
    assert.throws(() => storagePolicy(invalid));
  const result = await cleanRecoveryStorage(f.root, {
    ...plan,
    candidates: [{ id: "../../outside", fingerprint: "fake" }],
  });
  assert.equal(result.removed, 0);
});
