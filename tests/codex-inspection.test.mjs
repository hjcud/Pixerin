import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { createCodexInspection, inspectionEnvironment, codexCandidates } = createRequire(import.meta.url)("../electron/codex-inspection.cjs");
const fixture = (responses = []) => {
  const calls = [], paths = [];
  const inspector = createCodexInspection({ platform: "win32", env: { PATH: "relative;C:\\Codex", OPENAI_API_KEY: "private", CODEX_HOME: "C:\\Profile" },
    io: { stat: async file => { paths.push(file); return { isFile: () => true }; } },
    run: async (file, args, options) => { calls.push({ file, args, options }); return responses.shift(); },
  });
  return { inspector, calls, paths };
};
test("inspection uses only version and login status and returns allowlisted metadata", async () => {
  const { inspector, calls, paths } = fixture([
    { code: 0, text: "codex-cli 0.140.0" },
    { code: 0, text: "Logged in using ChatGPT\nprivate@example.com secret-token" },
  ]);
  assert.deepEqual(await inspector.inspect(), { state: "available", version: "0.140.0", auth: "chatgpt", inference: false });
  assert.deepEqual(paths, ["C:\\Codex\\codex.exe"]);
  assert.deepEqual(calls.map(call => call.args), [["--version"], ["login", "status"]]);
  assert.equal(calls[0].options.env.OPENAI_API_KEY, undefined);
  assert.equal(calls[0].options.env.CODEX_HOME, "C:\\Profile");
  assert.equal(calls[0].options.signal.aborted, false);
  assert.deepEqual(inspector.reset(), { state: "idle", version: "", auth: "unknown", inference: false });
  assert.equal(calls[0].options.signal.aborted, true);
});
test("missing, invalid and unknown CLI states cannot authorize inference", async () => {
  const missing = createCodexInspection({ env: { PATH: "relative" }, platform: "win32", run: () => assert.fail("must not execute") });
  assert.equal((await missing.inspect()).state, "missing");
  for (const response of [{ code: "ETIMEDOUT", text: "secret" }, { code: 0, text: "unrelated executable" }]) {
    const { inspector, calls } = fixture([response]);
    assert.equal((await inspector.inspect()).state, "unavailable");
    assert.equal(calls.length, 1);
  }
  for (const [response, expected] of [
    [{ code: 0, text: "Logged in using an API key: sk-private" }, "apiKey"],
    [{ code: 1, text: "Not logged in" }, "signedOut"],
    [{ code: 1, text: "account error: secret" }, "unknown"],
  ]) {
    const { inspector } = fixture([{ code: 0, text: "codex 1.2.3-beta.1" }, response]);
    assert.deepEqual(await inspector.inspect(), { state: "available", version: "1.2.3-beta.1", auth: expected, inference: false });
  }
});
test("ending inspection aborts a pending subprocess and ignores its late result", async () => {
  let finish;
  const inspector = createCodexInspection({ platform: "win32", env: { PATH: "C:\\Codex" },
    io: { stat: async () => ({ isFile: () => true }) }, run: async (_file, _args, { signal }) => {
      return new Promise(resolve => { finish = () => { assert.equal(signal.aborted, true); resolve({ code: 0, text: "codex-cli 1.2.3" }); }; });
    } });
  const pending = inspector.inspect();
  await new Promise(resolve => setImmediate(resolve));
  inspector.reset(); finish();
  assert.equal((await pending).state, "idle");
});
test("environment excludes inherited provider keys and leaves caller unchanged", () => {
  const env = { openai_api_key: "secret", CODEX_API_KEY: "secret", OPENAI_BASE_URL: "https://invalid", ELECTRON_RUN_AS_NODE: "1", CODEX_HOME: "home", OTHER: "keep" };
  assert.deepEqual(inspectionEnvironment(env), { CODEX_HOME: "home", OTHER: "keep" });
  assert.equal(env.openai_api_key, "secret");
});
test("Windows npm discovery executes the official native platform binary without a shim or package code", async () => {
  const binary = "C:\\npm\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe";
  const calls = [];
  const inspector = createCodexInspection({ platform: "win32", arch: "x64", env: { PATH: "C:\\npm" },
    io: { stat: async file => { if (file !== binary) throw new Error("ENOENT"); return { isFile: () => true }; } },
    run: async (file, args) => { calls.push({ file, args }); return { code: 0, text: args[0] === "--version" ? "codex-cli 1.2.3" : "Logged in using ChatGPT" }; },
  });
  assert.equal((await inspector.inspect()).state, "available");
  assert.ok(calls.every(call => call.file === binary));
  assert.ok(codexCandidates({ PATH: "C:\\npm" }, "win32", "arm64").some(file => file.includes("codex-win32-arm64") && file.endsWith("\\bin\\codex.exe")));
  assert.deepEqual(codexCandidates({ PATH: "relative;C:\\npm" }, "win32", "unsupported"), ["C:\\npm\\codex.exe"]);
});
