// Run desktop checks sequentially: native windows and focus are shared resources.
// Never retry away failures; keep every result and its full isolated-test log.
const fs = require("node:fs"),
  path = require("node:path"),
  cp = require("node:child_process");
const root = path.resolve(__dirname, "..");
const reports = path.join(root, "artifacts", "desktop-reports");
fs.mkdirSync(reports, { recursive: true });
// Keep report evidence referenced by review documents. Temporary native test
// profiles are managed separately by test-runner.cjs.
const runDirectory = fs.mkdtempSync(path.join(reports, "run-"));
const marker = {
  kind: "pixerin-native-test",
  version: 1,
  pid: process.pid,
  status: "running",
};
fs.writeFileSync(
  path.join(runDirectory, "pixerin-test-run.json"),
  JSON.stringify(marker),
);
console.log("Results:", path.relative(root, runDirectory));
const commands = [
  ...new Set(
    Object.entries(require("../package.json").scripts)
      .filter(
        ([key, value]) =>
          key.startsWith("test:") &&
          /^node scripts\/.*desktop-test\.cjs$/.test(value) &&
          key !== "test:prompt-hints",
      )
      .map(([, value]) => value.slice(5)),
  ),
];
const timeoutArg = process.argv.find((arg) => arg.startsWith("--timeout="));
const timeout = timeoutArg ? Number(timeoutArg.split("=")[1]) : 180000;
if (!Number.isInteger(timeout) || timeout < 10000)
  throw new Error("Invalid test timeout");
// A focused follow-up keeps its own result directory and never erases the
// original full inventory run. Names are matched against the known inventory.
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const selected = onlyArg ? onlyArg.slice(7).split(",").filter(Boolean) : null;
const runCommands = selected ? commands.filter(command => selected.includes(path.basename(command, ".cjs"))) : commands;
if(selected && (new Set(selected).size !== selected.length || runCommands.length !== selected.length))
  throw new Error("Unknown or duplicate desktop check selection");
marker.selection = runCommands.map(command=>path.basename(command,".cjs"));
fs.writeFileSync(path.join(runDirectory,"pixerin-test-run.json"),JSON.stringify(marker));
const results = [];
for (const command of runCommands) {
  const name = path.basename(command, ".cjs"),
    start = Date.now();
  const result = cp.spawnSync(process.execPath, [command], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PIXERIN_TEST_TIMEOUT_MS: String(timeout) },
    windowsHide: true,
  });
  fs.writeFileSync(
    path.join(runDirectory, `${name}.log`),
    (result.stdout || "") +
      (result.stderr || "") +
      (result.error ? String(result.error) : ""),
  );
  results.push({
    name,
    log: path.relative(root, path.join(runDirectory, `${name}.log`)),
    exitCode: result.status,
    ms: Date.now() - start,
    error: result.error?.message,
  });
  fs.writeFileSync(
    path.join(runDirectory, "results.json"),
    JSON.stringify(results, null, 2),
  );
  fs.writeFileSync(
    path.join(root, "artifacts", "program-review-results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(
    `${result.status === 0 ? "PASS" : "FAIL"} ${name} (${Math.round((Date.now() - start) / 1000)}s)`,
  );
}
process.exitCode = results.some((result) => result.exitCode !== 0) ? 1 : 0;
Object.assign(marker, {
  status: process.exitCode ? "failed" : "passed",
  finished: Date.now(),
});
fs.writeFileSync(
  path.join(runDirectory, "pixerin-test-run.json"),
  JSON.stringify(marker),
);
