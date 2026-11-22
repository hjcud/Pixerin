// Every native check owns an isolated run outside the repository/OneDrive.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const base = path.join(os.tmpdir(), "pixerin-desktop-tests");
const markerName = "pixerin-test-run.json";
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== "ESRCH";
  }
};
function inspect(directory, parent = base) {
  const resolved = path.resolve(directory),
    expected = path.resolve(parent);
  if (
    path.dirname(resolved) !== expected ||
    !path.basename(resolved).startsWith("run-")
  )
    throw new Error("Not a managed test run");
  if (
    fs.lstatSync(resolved).isSymbolicLink() ||
    fs.realpathSync(resolved) !==
      path.join(fs.realpathSync(expected), path.basename(resolved))
  )
    throw new Error("Refusing redirected test directory");
  const metadata = JSON.parse(
    fs.readFileSync(path.join(resolved, markerName), "utf8"),
  );
  if (metadata.kind !== "pixerin-native-test" || metadata.version !== 1)
    throw new Error("Missing test ownership marker");
  return metadata;
}
function treeBytes(directory) {
  let bytes = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error("Refusing linked test contents");
    bytes += entry.isDirectory() ? treeBytes(file) : fs.statSync(file).size;
  }
  return bytes;
}
function removeRun(directory, parent = base) {
  const metadata = inspect(directory, parent);
  if (metadata.status === "running" && alive(metadata.pid)) return false;
  if ((metadata.electronPids || []).some(alive)) return false;
  // Validate the complete tree before recursive deletion; never follow junctions.
  treeBytes(directory);
  fs.rmSync(path.resolve(directory), {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 150,
  });
  return true;
}
function prune(parent = base, count = 3, maxBytes = 512 * 1024 * 1024) {
  if (!fs.existsSync(parent)) return;
  const runs = [];
  for (const name of fs.readdirSync(parent)) {
    const directory = path.join(parent, name);
    try {
      const m = inspect(directory, parent);
      if (
        (m.status === "running" && alive(m.pid)) ||
        (m.electronPids || []).some(alive)
      )
        continue;
      runs.push({
        directory,
        time: m.finished || 0,
        size: treeBytes(directory),
      });
    } catch {
      /* Unowned or redirected paths are never cleanup candidates. */
    }
  }
  runs.sort((a, b) => b.time - a.time);
  let kept = 0,
    bytes = 0;
  for (const run of runs) {
    if (kept < count && bytes + run.size <= maxBytes) {
      kept++;
      bytes += run.size;
    } else {
      try {
        removeRun(run.directory, parent);
      } catch (e) {
        console.warn("Test cleanup:", e.message);
      }
    }
  }
}
async function createProfile(prefix = "profile-") {
  const directory = process.env.PIXERIN_TEST_RUN;
  if (!directory)
    throw new Error("Run this native check through its test bootstrap");
  const metadata = inspect(directory);
  if (
    metadata.token !== process.env.PIXERIN_TEST_TOKEN ||
    metadata.status !== "running"
  )
    throw new Error("Invalid test run ownership");
  return fs.promises.mkdtemp(path.join(directory, path.basename(prefix)));
}
function bootstrap(file) {
  if (process.env.PIXERIN_TEST_RUN) {
    const metadata = inspect(process.env.PIXERIN_TEST_RUN);
    if (
      metadata.token !== process.env.PIXERIN_TEST_TOKEN ||
      metadata.script !== path.resolve(file)
    )
      throw new Error("Invalid native test child");
    return false;
  }
  run(file).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
  return true;
}
async function run(file) {
  console.log(
    "Interactive desktop check: test windows may take focus. Avoid typing or using the mouse until this check finishes. For input-free checks, run pnpm test:background.",
  );
  fs.mkdirSync(base, { recursive: true });
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  prune();
  const directory = fs.mkdtempSync(path.join(base, "run-"));
  const metadata = {
    kind: "pixerin-native-test",
    version: 1,
    token: randomUUID(),
    script: path.resolve(file),
    pid: process.pid,
    status: "running",
    started: Date.now(),
  };
  const save = () =>
    fs.writeFileSync(
      path.join(directory, markerName),
      JSON.stringify(metadata, null, 2),
    );
  save();
  const child = spawn(process.execPath, [file, ...process.argv.slice(2)], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      PIXERIN_TEST_RUN: directory,
      PIXERIN_TEST_TOKEN: metadata.token,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = fs.createWriteStream(path.join(directory, "test.log"));
  let logBytes = 0;
  for (const [stream, output] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ])
    stream.on("data", (chunk) => {
      output.write(chunk);
      const remaining = 1024 * 1024 - logBytes;
      if (remaining > 0) {
        log.write(chunk.subarray(0, remaining));
        logBytes += Math.min(remaining, chunk.length);
      }
    });
  let timedOut = false;
  const timeout = Number(process.env.PIXERIN_TEST_TIMEOUT_MS) || 180000;
  const timer = setTimeout(() => {
    timedOut = true;
    console.error("Native test timed out; stopping its process tree.");
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
      });
    else child.kill("SIGKILL");
  }, timeout);
  const code = await new Promise((resolve) => {
    child.on("error", (error) => {
      console.error(error);
      resolve(1);
    });
    child.on("close", (code) => resolve(timedOut ? 1 : (code ?? 1)));
  });
  clearTimeout(timer);
  await new Promise((resolve) => log.end(resolve));
  metadata.status = code === 0 ? "passed" : "failed";
  metadata.electronPids = inspect(directory).electronPids || [];
  metadata.finished = Date.now();
  save();
  // Keep a small latest log per check even when its full profile is removed.
  fs.copyFileSync(
    path.join(directory, "test.log"),
    path.join(root, "artifacts", path.basename(file, ".cjs") + ".log"),
  );
  if (code === 0) {
    try {
      removeRun(directory);
    } catch (e) {
      console.warn("Test cleanup:", e.message);
    }
  } else console.error("Failure evidence:", directory);
  prune();
  return code;
}
module.exports = { bootstrap, createProfile, inspect, removeRun, prune };
