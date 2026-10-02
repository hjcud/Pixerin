import test from "node:test";
import assert from "node:assert/strict";
import { atomicWrite } from "../electron/atomic-write.cjs";

function fixture(failures, code = "EBUSY") {
  const files = new Map([["project.pixeltool", "original"]]);
  let renames = 0;
  const waits = [];
  return {
    files,
    waits,
    count: () => renames,
    options: {
      wait: async (ms) => waits.push(ms),
      io: {
        mkdir: async () => {},
        writeFile: async (p, text) => files.set(p, text),
        rename: async (from, to) => {
          renames++;
          if (renames <= failures)
            throw Object.assign(new Error("Sharing violation"), { code });
          files.set(to, files.get(from));
          files.delete(from);
        },
        rm: async (p) => files.delete(p),
      },
    },
  };
}
test("atomic save retries bounded sharing errors without removing the destination", async () => {
  const f = fixture(2);
  const wait = f.options.wait;
  f.options.wait = async (ms) => {
    assert.equal(f.files.get("project.pixeltool"), "original");
    await wait(ms);
  };
  await atomicWrite("project.pixeltool", "updated", f.options);
  assert.deepEqual(f.waits, [100, 200]);
  assert.equal(f.count(), 3);
  assert.deepEqual([...f.files], [["project.pixeltool", "updated"]]);
});
test("persistent locks preserve the original, remove only their own temp and return the error", async () => {
  const f = fixture(Infinity, "EPERM");
  await assert.rejects(atomicWrite("project.pixeltool", "updated", f.options), {
    code: "EPERM",
  });
  assert.equal(f.count(), 4);
  assert.deepEqual(f.waits, [100, 200, 400]);
  assert.deepEqual([...f.files], [["project.pixeltool", "original"]]);
});
test("non-transient disk errors fail immediately and do not destroy saved artwork", async () => {
  const f = fixture(Infinity, "ENOSPC");
  await assert.rejects(atomicWrite("project.pixeltool", "updated", f.options), {
    code: "ENOSPC",
  });
  assert.equal(f.count(), 1);
  assert.deepEqual(f.waits, []);
  assert.deepEqual([...f.files], [["project.pixeltool", "original"]]);
});
