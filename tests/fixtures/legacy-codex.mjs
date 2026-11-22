// Historical transport fixture only; not loaded or packaged by Pixel Mat.
import { t } from "../../src/i18n.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { buildRequest, parseResponse } from "../../electron/ai.mjs";
import { advancedInput, buildImageRequest, imageProposal, MAX_GENERATED_BYTES } from "../../electron/image-generation.mjs";

export async function findCodex(explicit = "", env = process.env) {
  const isExecutable = async (value) => {
    try {
      return (
        path.isAbsolute(value) &&
        value.toLowerCase().endsWith(".exe") &&
        (await fs.stat(value)).isFile()
      );
    } catch {
      return false;
    }
  };
  if (explicit) {
    if (await isExecutable(explicit)) return path.resolve(explicit);
    throw new Error(
      t(
        "지정한 Codex 실행 파일을 찾을 수 없어요. 설정에서 다시 선택해 주세요.",
      ),
    );
  }
  const candidates = (env.PATH || env.Path || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((folder) => path.join(folder.replace(/^"|"$/g, ""), "codex.exe"));
  if (env.LOCALAPPDATA) {
    const base = path.join(env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
    try {
      const entries = await fs.readdir(base, { withFileTypes: true });
      const versions = await Promise.all(
        entries
          .filter((e) => e.isDirectory())
          .map(async (e) => ({
            file: path.join(base, e.name, "codex.exe"),
            time: (await fs.stat(path.join(base, e.name))).mtimeMs,
          })),
      );
      candidates.push(
        ...versions.sort((a, b) => b.time - a.time).map((v) => v.file),
      );
    } catch {
      /* A separately installed CLI may still be on PATH. */
    }
    candidates.push(
      path.join(
        env.LOCALAPPDATA,
        "Programs",
        "Codex",
        "resources",
        "codex.exe",
      ),
    );
  }
  for (const candidate of [...new Set(candidates)])
    if (await isExecutable(candidate)) return path.resolve(candidate);
  throw new Error(
    t(
      "Codex CLI를 찾을 수 없어요. Codex를 설치하거나 설정에서 codex.exe를 선택해 주세요.",
    ),
  );
}

// These are process-local overrides. Never rewrite the user's Codex configuration
// or read/copy auth.json. Codex itself owns ChatGPT credentials and refreshes.
export const CODEX_ARGS = [
  "app-server",
  "--listen",
  "stdio://",
  "-c",
  'model_provider="openai"',
  "-c",
  'web_search="disabled"',
  "-c",
  "mcp_servers={}",
  ...[
    "shell_tool",
    "unified_exec",
    "apps",
    "plugins",
    "remote_plugin",
    "hooks",
    "multi_agent",
    "multi_agent_v2",
    "image_generation",
    "browser_use",
    "computer_use",
    "memories",
    "goals",
    "sleep_tool",
    "workspace_dependencies",
    "skill_search",
    "tool_suggest",
  ].flatMap((name) => ["-c", `features.${name}=false`]),
  "-c",
  "features.skip_host_skill_discovery=true",
  "-c",
  "tools.view_image=false",
];
export function codexEnvironment(source = process.env) {
  const env = { ...source };
  for (const name of Object.keys(env))
    if (
      [
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "OPENAI_BASE_URL",
        "ELECTRON_RUN_AS_NODE",
      ].includes(name.toUpperCase())
    )
      delete env[name];
  return env;
}
const abortError = () =>
  Object.assign(new Error(t("Codex 요청을 취소했어요.")), {
    name: "AbortError",
  });
function publicError(message = "") {
  const text = String(message);
  if (/usage_limit|rate.limit|quota|credits|usage limit/i.test(text))
    return t(
      "Codex 사용 한도에 도달했어요. Codex의 사용량과 다음 초기화 시간을 확인해 주세요.",
    );
  if (
    /model.*(not found|not supported|not available|does not exist)|unsupported.*model/i.test(
      text,
    )
  )
    return t(
      "현재 Codex 계정에서 이 모델을 사용할 수 없어요. 설정에서 모델 ID를 확인해 주세요.",
    );
  if (/unauthor|auth|login|token.*expired|401/i.test(text))
    return t(
      "Codex 로그인이 만료되었어요. 설정에서 ChatGPT로 다시 로그인해 주세요.",
    );
  return t(
    "Codex 요청을 완료하지 못했어요. 연결 상태와 모델 설정을 확인하고 다시 요청해 주세요.",
  );
}

export class CodexClient extends EventEmitter {
  constructor({
    executable,
    cwd,
    spawnImpl = spawn,
    env = process.env,
    rpcTimeout = 30000,
  }) {
    super();
    this.executable = executable;
    this.cwd = cwd;
    this.spawnImpl = spawnImpl;
    this.env = codexEnvironment(env);
    this.rpcTimeout = rpcTimeout;
    this.pending = new Map();
    this.nextId = 1;
    this.process = null;
    this.starting = null;
    this.active = null;
    this.loginId = null;
    this.loginError = null;
  }
  async start() {
    if (this.starting) return this.starting;
    this.starting = this.startProcess();
    try {
      await this.starting;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  async startProcess() {
    await fs.mkdir(this.cwd, { recursive: true });
    const child = this.spawnImpl(this.executable, CODEX_ARGS, {
      cwd: this.cwd,
      env: this.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stderr.resume();
    child.stdin.on("error", () =>
      this.fail(new Error(t("Codex 연결이 끊어졌어요. 다시 연결해 주세요."))),
    );
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > (this.active?.imageMode ? 16 : 8) * 1024 * 1024) {
        this.fail(new Error(t("Codex 응답이 너무 커요.")));
        child.kill();
        return;
      }
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try {
          this.onMessage(JSON.parse(line));
        } catch {
          this.fail(
            new Error(
              t("Codex 응답을 읽지 못했어요. 연결을 다시 확인해 주세요."),
            ),
          );
          child.kill();
        }
      }
    });
    child.on("error", () =>
      this.fail(
        new Error(
          t("Codex를 실행하지 못했어요. 실행 파일 경로를 확인해 주세요."),
        ),
      ),
    );
    child.on("exit", () => {
      if (this.process === child) {
        this.process = null;
        this.starting = null;
        this.loginId = null;
        this.fail(
          new Error(t("Codex 연결이 종료되었어요. 다시 요청하면 재연결해요.")),
        );
      }
    });
    await this.rpc("initialize", {
      clientInfo: { name: "pixeltool", title: "PixelTool", version: "0.21.0" },
      capabilities: { experimentalApi: false },
    });
    this.send({ method: "initialized", params: {} });
  }
  send(message) {
    if (!this.process || this.process.killed || this.process.stdin.destroyed)
      throw new Error(t("Codex가 연결되어 있지 않아요."));
    this.process.stdin.write(JSON.stringify(message) + "\n");
  }
  rpc(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            t("Codex 연결 확인 시간이 초과됐어요. 다시 연결해 주세요."),
          ),
        );
      }, this.rpcTimeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  onMessage(message) {
    if (message.id != null && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error)
        pending.reject(new Error(publicError(message.error.message)));
      else pending.resolve(message.result);
      return;
    }
    if (message.id != null && message.method) {
      // PixelTool accepts a structured pixel patch, never privileged tool actions.
      this.send({
        id: message.id,
        error: {
          code: -32601,
          message:
            "PixelTool does not execute agent tools or approve external actions.",
        },
      });
      return;
    }
    const { method, params = {} } = message;
    if (
      method === "account/login/completed" &&
      params.loginId === this.loginId
    ) {
      this.loginId = null;
      this.loginError = params.success
        ? null
        : t("로그인이 완료되지 않았어요. 다시 시도해 주세요.");
    }
    if (method === "account/updated" || method === "account/login/completed")
      this.emit("accountChanged");
    const active = this.active;
    if (!active || params.threadId !== active.threadId) return;
    if (params.turnId && active.turnId && params.turnId !== active.turnId)
      return;
    if (method === "turn/started" && !active.turnId)
      active.turnId = params.turn.id;
    if (active.imageMode && method === "item/completed" && params.item?.type === "imageGeneration") {
      active.images.set(params.item.id, params.item);
      if (active.images.size > 1) {
        if (active.turnId) this.rpc("turn/interrupt", { threadId: active.threadId, turnId: active.turnId }).catch(() => {});
        active.reject(new Error(t("고급 이미지 생성에 실패했어요. 연결·모델 권한·사용 한도를 확인해 주세요.")));
      }
    }
    if (method === "item/started" && params.item?.type === "agentMessage")
      active.phases.set(params.item.id, params.item.phase);
    if (
      method === "item/agentMessage/delta" &&
      !active.imageMode &&
      active.phases.get(params.itemId) !== "commentary" &&
      typeof params.delta === "string"
    )
      active.onProgress({
        type: "text",
        itemId: params.itemId,
        delta: params.delta,
      });
    if (method === "item/completed" && params.item?.type === "agentMessage") {
      active.messages.set(params.item.id, params.item);
      if (!active.imageMode && params.item.phase !== "commentary")
        active.onProgress({
          type: "textDone",
          itemId: params.item.id,
          text: params.item.text,
        });
    }
    if (method === "thread/tokenUsage/updated") {
      const usage = params.tokenUsage?.last;
      if (usage) {
        active.usage = {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          ...(Number.isSafeInteger(usage.reasoningOutputTokens)
            ? { reasoning_tokens: usage.reasoningOutputTokens }
            : {}),
          ...(Number.isSafeInteger(usage.cachedInputTokens)
            ? { cached_tokens: usage.cachedInputTokens }
            : {}),
        };
        active.onProgress({ type: "usage", usage: active.usage });
      }
    }
    if (method === "turn/completed") {
      const turn = params.turn;
      if (active.turnId && turn.id !== active.turnId) return;
      if (turn.status === "interrupted") {
        active.reject(abortError());
        return;
      }
      if (turn.status !== "completed") {
        active.reject(new Error(publicError(turn.error?.message)));
        return;
      }
      for (const item of turn.items || [])
        if (item.type === "agentMessage") active.messages.set(item.id, item);
        else if (active.imageMode && item.type === "imageGeneration") active.images.set(item.id, item);
      const messages = [...active.messages.values()],
        final = messages.filter((item) => item.phase === "final_answer");
      const text = (
        final.length ? final : messages.filter((item) => !item.phase)
      )
        .map((item) => item.text)
        .join("\n");
      active.resolve({ text, usage: active.usage, images: [...(active.images?.values() || [])] });
    }
  }
  fail(error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.active?.reject(error);
  }
  async status() {
    await this.start();
    const result = await this.rpc("account/read", { refreshToken: false });
    const account = result?.account;
    return {
      available: true,
      connected: account?.type === "chatgpt",
      authType: account?.type || null,
      plan: account?.type === "chatgpt" ? account.planType || null : null,
      executable: this.executable,
      loginPending: Boolean(this.loginId),
      error: this.loginError,
    };
  }
  async listModels() {
    await this.start();
    const models = new Map(),
      cursors = new Set();
    let cursor = null;
    do {
      const page = await this.rpc("model/list", {
        cursor,
        limit: 100,
        includeHidden: false,
      });
      for (const model of page.data || []) {
        if (
          model.hidden ||
          (model.inputModalities && !model.inputModalities.includes("image"))
        )
          continue;
        if (
          typeof model.model !== "string" ||
          !/^[a-zA-Z0-9._-]{1,100}$/.test(model.model)
        )
          continue;
        models.set(model.model, {
          id: model.model,
          name: String(model.displayName || model.model).slice(0, 100),
          description: String(model.description || "").slice(0, 500),
          effort: model.defaultReasoningEffort || null,
        });
      }
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor))
        throw new Error(
          t("모델 목록을 끝까지 읽지 못했어요. 다시 시도해 주세요."),
        );
      if (cursor) cursors.add(cursor);
    } while (cursor && cursors.size < 20);
    this.models = [...models.values()];
    return this.models;
  }
  async login() {
    await this.start();
    if (this.active) throw new Error(t("먼저 진행 중인 요청을 취소해 주세요."));
    if (this.loginId) await this.cancelLogin();
    this.loginError = null;
    const result = await this.rpc("account/login/start", { type: "chatgpt" });
    this.loginId = result.loginId;
    const url = new URL(result.authUrl);
    if (
      url.protocol !== "https:" ||
      !["auth.openai.com", "chatgpt.com", "auth0.openai.com"].includes(
        url.hostname,
      )
    ) {
      await this.cancelLogin();
      throw new Error(t("Codex가 올바른 로그인 주소를 반환하지 않았어요."));
    }
    return url.href;
  }
  async cancelLogin() {
    if (this.loginId) {
      const id = this.loginId;
      this.loginId = null;
      await this.rpc("account/login/cancel", { loginId: id });
    }
  }
  async requestPatch({ input, model, signal, onProgress = () => {} }) {
    onProgress({ type: "stage", stage: "connecting" });
    const imageMode = input.advancedGeneration === true;
    const snapshot = imageMode ? advancedInput(input) : structuredClone(input),
      request = imageMode ? buildImageRequest(snapshot, model) : buildRequest(snapshot, model);
    if (signal?.aborted) throw abortError();
    const status = await this.status();
    if (signal?.aborted) throw abortError();
    if (!status.connected)
      throw new Error(
        t(
          "Codex에서 ChatGPT 로그인이 필요해요. API 키 로그인으로는 Pro 사용량을 쓸 수 없어요.",
        ),
      );
    if (this.active) throw new Error(t("Codex 요청이 이미 진행 중이에요."));
    if (imageMode) {
      let capabilities;
      try { capabilities = await this.rpc("modelProvider/capabilities/read"); } catch { /* Older hosts fail closed. */ }
      if (!capabilities?.imageGeneration)
        throw new Error(t("현재 Codex 연결은 이미지 생성을 지원하지 않아요. Codex를 업데이트하거나 기본 편집을 사용해 주세요. API로 자동 전환하지 않아요."));
      if (signal?.aborted) throw abortError();
    }
    const started = await this.rpc("thread/start", {
      model,
      modelProvider: "openai",
      cwd: this.cwd,
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "read-only",
      ...(imageMode ? { config: { features: { image_generation: true } } } : {}),
      baseInstructions:
        request.instructions +
        (imageMode ? "\nUse only the image-generation tool once. Return the generated PNG, never a JSON patch." : "\nAll the information is supplied in the message. Do not use tools, open files, browse, execute code, or delegate. Return only the requested JSON pixel patch."),
      serviceName: "pixeltool",
    });
    const threadId = started.thread.id;
    // Enforce the chosen billing/provider path before starting any inference.
    if (started.modelProvider !== "openai") {
      this.rpc("thread/unsubscribe", { threadId }).catch(() => {});
      throw new Error(
        t(
          "ChatGPT Codex 연결을 사용할 수 없어요. API로 자동 전환하지 않았어요.",
        ),
      );
    }
    let active;
    const completed = new Promise((resolve, reject) => {
      active = {
        imageMode,
        images: new Map(),
        threadId,
        turnId: null,
        messages: new Map(),
        phases: new Map(),
        onProgress,
        usage: null,
        resolve,
        reject,
      };
    });
    completed.catch(() => {});
    this.active = active;
    onProgress({ type: "stage", stage: "waiting" });
    const interrupt = () => {
      if (active.turnId)
        this.rpc("turn/interrupt", { threadId, turnId: active.turnId }).catch(
          () => {},
        );
      active.reject(abortError());
    };
    signal?.addEventListener("abort", interrupt, { once: true });
    try {
      if (signal?.aborted) throw abortError();
      const content = request.input[0].content.map((item) =>
        item.type === "input_text"
          ? { type: "text", text: item.text, text_elements: [] }
          : { type: "image", url: item.image_url, detail: "high" },
      );
      const turn = await this.rpc("turn/start", {
        threadId,
        input: content,
        model,
        ...(this.models?.find((entry) => entry.id === model)?.effort
          ? { effort: this.models.find((entry) => entry.id === model).effort }
          : model === "gpt-6-astra"
            ? { effort: "medium" }
            : {}),
        ...(imageMode ? {} : { outputSchema: request.text.format.schema }),
      });
      active.turnId = turn.turn.id;
      if (signal?.aborted) {
        interrupt();
        throw abortError();
      }
      const result = await completed;
      if (signal?.aborted) throw abortError();
      onProgress({ type: "stage", stage: "validating" });
      if (imageMode) {
        if (result.images.length !== 1 || result.images[0].status !== "completed" || result.images[0].failure)
          throw new Error(t("고급 이미지 생성에 실패했어요. 연결·모델 권한·사용 한도를 확인해 주세요."));
        const item = result.images[0];
        let png = item.result;
        if (!png && item.savedPath) png = await this.readGeneratedImage(item.savedPath);
        if (signal?.aborted) throw abortError();
        return imageProposal(snapshot, png, result.usage);
      }
      return parseResponse(
        {
          status: "completed",
          usage: result.usage,
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: result.text }],
            },
          ],
        },
        snapshot,
      );
    } finally {
      signal?.removeEventListener("abort", interrupt);
      if (this.active === active) this.active = null;
      this.rpc("thread/unsubscribe", { threadId }).catch(() => {});
    }
  }
  async readGeneratedImage(filename) {
    // Accept only a host-reported PNG inside known generated-output roots.
    // Never read arbitrary paths, credentials, or session logs to recover images.
    const rejected = () => new Error(t("생성 이미지가 없거나 PNG 형식·크기 제한을 벗어났어요."));
    if (!path.isAbsolute(filename) || path.extname(filename).toLowerCase() !== ".png") throw rejected();
    const actual = await fs.realpath(filename);
    const roots = [this.cwd, path.join(this.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "generated_images")];
    let allowed = false;
    for (const root of roots) {
      const resolved = await fs.realpath(root).catch(() => null);
      if (!resolved) continue;
      const relative = path.relative(resolved, actual);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) allowed = true;
    }
    if (!allowed) throw rejected();
    const file = await fs.open(actual, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_GENERATED_BYTES) throw rejected();
      const bytes = Buffer.alloc(MAX_GENERATED_BYTES + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > MAX_GENERATED_BYTES) throw rejected();
      return bytes.subarray(0, bytesRead).toString("base64");
    } finally { await file.close(); }
  }
  async stop() {
    const child = this.process;
    this.process = null;
    this.starting = null;
    this.loginId = null;
    this.fail(new Error(t("Codex 연결이 종료됐어요.")));
    if (!child) return;
    // Closing stdin requests a graceful shutdown of our own app-server only.
    child.stdin.end();
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, 1500);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
