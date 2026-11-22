import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const { removeRun, prune } = createRequire(import.meta.url)(
  "../scripts/test-runner.cjs",
);
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "pixerin-cleanup-test-"));
  const run = (name, extra = {}) => {
    const p = path.join(base, "run-" + name);
    fs.mkdirSync(p);
    fs.writeFileSync(
      path.join(p, "pixerin-test-run.json"),
      JSON.stringify({
        kind: "pixerin-native-test",
        version: 1,
        status: "failed",
        finished: 1,
        ...extra,
      }),
    );
    fs.writeFileSync(path.join(p, "fixture.bin"), Buffer.alloc(1024));
    return p;
  };
  return {
    base,
    run,
    close: () => {
      assert.equal(path.dirname(path.resolve(base)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(base).startsWith("pixerin-cleanup-test-"));
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}
test("test cleanup rejects unrelated paths and preserves active processes", () => {
  const f = fixture();
  try {
    const active = f.run("active", { status: "running", pid: process.pid });
    const electron = f.run("electron", { electronPids: [process.pid] });
    assert.equal(removeRun(active, f.base), false);
    assert.equal(removeRun(electron, f.base), false);
    assert.throws(() => removeRun(f.base, f.base));
    const unknown = path.join(f.base, "personal-work");
    fs.mkdirSync(unknown);
    assert.throws(() => removeRun(unknown, f.base));
    prune(f.base, 0, 0);
    assert.ok(
      fs.existsSync(active) &&
        fs.existsSync(electron) &&
        fs.existsSync(unknown),
    );
  } finally {
    f.close();
  }
});
test("retention keeps newest bounded failure evidence and rejects linked trees", () => {
  const f = fixture();
  try {
    const older = f.run("older"),
      newer = f.run("newer", { finished: 2 });
    prune(f.base, 1, 4096);
    assert.equal(fs.existsSync(older), false);
    assert.ok(fs.existsSync(newer));
    const linked = f.run("linked");
    fs.symlinkSync(newer, path.join(linked, "outside"), "junction");
    assert.throws(() => removeRun(linked, f.base), /linked/);
    fs.unlinkSync(path.join(linked, "outside"));
    assert.equal(removeRun(linked, f.base), true);
    prune(f.base, 3, 1);
    assert.equal(fs.existsSync(newer), false);
  } finally {
    f.close();
  }
});
