const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");

// Inspection only. Codex owns credential access; Pixel Mat never reads its
// configuration/authentication files, starts a login, or runs an inference turn.
const publicState = (state, version = "", auth = "unknown") => ({ state, version, auth, inference: false });
function runCommand(file, args, options) {
  return new Promise((resolve) => {
    execFile(file, args, { ...options, windowsHide: true, shell: false, timeout: 5000, maxBuffer: 16384 },
      (error, stdout = "", stderr = "") => resolve({ code: error ? error.code : 0, text: stdout + "\n" + stderr }));
  });
}
function inspectionEnvironment(source) {
  const env = { ...source };
  // Prevent inherited provider keys or routing overrides from becoming an
  // accidental alternative connection. Keep Codex's own environment untouched.
  for (const key of Object.keys(env))
    if (["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL", "ELECTRON_RUN_AS_NODE"].includes(key.toUpperCase())) delete env[key];
  return env;
}
function codexCandidates(env, platform, arch) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const folders = (env.PATH || env.Path || "").split(platform === "win32" ? ";" : ":")
    .map(folder => folder.replace(/^"|"$/g, "")).filter(folder => paths.isAbsolute(folder));
  const candidates = folders.map(folder => paths.join(folder, platform === "win32" ? "codex.exe" : "codex"));
  if (platform === "win32" && ["x64", "arm64"].includes(arch)) {
    // The official npm launcher resolves an optional native platform package,
    // then falls back to its vendor folder. Discover those native binaries
    // directly; never execute a .cmd/.ps1 shim or load a package's JavaScript.
    // https://github.com/openai/codex/blob/main/codex-cli/bin/codex.js
    const target = `${arch === "x64" ? "x86_64" : "aarch64"}-pc-windows-msvc`;
    for (const folder of folders) {
      const modules = paths.join(folder, "node_modules"), pkg = paths.join(modules, "@openai", "codex");
      for (const vendor of [
        paths.join(modules, "@openai", `codex-win32-${arch}`, "vendor"),
        paths.join(pkg, "node_modules", "@openai", `codex-win32-${arch}`, "vendor"),
        paths.join(pkg, "vendor"),
      ]) {
        candidates.push(paths.join(vendor, target, "bin", "codex.exe"));
        candidates.push(paths.join(vendor, target, "codex", "codex.exe"));
      }
    }
  }
  return [...new Set(candidates)];
}
function createCodexInspection({ env = process.env, platform = process.platform, arch = process.arch, io = fs, run = runCommand } = {}) {
  let controller, generation = 0;
  return {
    reset() {
      generation++;
      controller?.abort(); controller = undefined;
      return publicState("idle");
    },
    async inspect() {
      controller?.abort();
      const token = ++generation, abort = new AbortController(); controller = abort;
      let executable;
      for (const candidate of codexCandidates(env, platform, arch)) {
        if (abort.signal.aborted) return publicState("idle");
        try { if ((await io.stat(candidate)).isFile()) { executable = candidate; break; } } catch {}
      }
      if (token !== generation) return publicState("idle");
      if (!executable) return publicState("missing");
      const options = { env: inspectionEnvironment(env), signal: abort.signal };
      const version = await run(executable, ["--version"], options);
      if (token !== generation) return publicState("idle");
      const match = /^codex(?:-cli)?\s+(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/m.exec(version.text);
      if (version.code !== 0 || !match) return publicState("unavailable");
      const result = await run(executable, ["login", "status"], options);
      if (token !== generation) return publicState("idle");
      const auth = result.code === 0 && /logged in using chatgpt/i.test(result.text) ? "chatgpt"
        : result.code === 0 && /logged in using (?:an? )?api key/i.test(result.text) ? "apiKey"
        : /not logged in/i.test(result.text) ? "signedOut" : "unknown";
      // Raw output may contain account information. Return only these allowlisted
      // fields and never log, persist or forward child-process output or paths.
      return publicState("available", match[1], auth);
    },
  };
}
module.exports = { createCodexInspection, inspectionEnvironment, codexCandidates };
