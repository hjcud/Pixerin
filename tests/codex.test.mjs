import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import os from "node:os";
import path from "node:path";
import {
  CodexClient,
  CODEX_ARGS,
  codexEnvironment,
} from "./fixtures/legacy-codex.mjs";
import { createDocument } from "../src/core.mjs";
import { PNG } from "pngjs";

class FakeProcess extends EventEmitter {
  constructor(handler) {
    super();
    this.killed = false;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.messages = [];
    this.stdin = new Writable({
      write: (data, _encoding, done) => {
        const message = JSON.parse(data.toString());
        this.messages.push(message);
        queueMicrotask(() => handler(message, this));
        done();
      },
    });
    this.stdin.on("finish", () => queueMicrotask(() => this.emit("exit", 0)));
  }
  emitMessage(message) {
    this.stdout.write(JSON.stringify(message) + "\n");
  }
  respond(request, result) {
    this.emitMessage({ id: request.id, result });
  }
  kill() {
    this.killed = true;
    this.emit("exit", 0);
  }
}
const input = () => ({
  document: createDocument(8, 8),
  mask: Array(64).fill(true),
  prompt: "하트를 그려줘",
});
function setup(options = {}) {
  let child, spawnOptions;
  const client = new CodexClient({
    executable: "C:\\Codex\\codex.exe",
    cwd: path.join(os.tmpdir(), "pixeltool-protocol-tests"),
    rpcTimeout: options.rpcTimeout || 1000,
    env: {
      PATH: "",
      OPENAI_API_KEY: "test-should-be-stripped",
      CODEX_API_KEY: "test-should-be-stripped",
      ELECTRON_RUN_AS_NODE: "1",
    },
    spawnImpl: (exe, args, opts) => {
      spawnOptions = { exe, args, opts };
      child = new FakeProcess((request, p) => {
        if (request.method === "initialize") p.respond(request, {});
        else if (request.method === "modelProvider/capabilities/read") p.respond(request, { imageGeneration: options.imageGeneration === true });
        else if (request.method === "model/list")
          p.respond(
            request,
            options.models
              ? options.models(request.params)
              : { data: [], nextCursor: null },
          );
        else if (request.method === "account/read")
          p.respond(request, {
            account:
              options.account === null
                ? null
                : { type: options.account || "chatgpt", planType: "pro" },
          });
        else if (request.method === "thread/start")
          p.respond(request, {
            thread: { id: "thread-1" },
            modelProvider: options.provider || "openai",
          });
        else if (request.method === "turn/start") {
          if (options.onTurn) {
            options.onTurn(request, p);
            return;
          }
          // Real app-server can emit a final notification before turn/start resolves.
          const result = options.patch || {
            summary: "하이라이트 수정",
            new_colors: [],
            segments: [
              { id: 0, colors: [7, null, null, null, null, null, null, null] },
            ],
          };
          for (const notification of options.notifications || [])
            p.emitMessage(notification);
          p.emitMessage({
            method: "item/completed",
            params: {
              threadId: "thread-1",
              turnId: "turn-1",
              item: {
                id: "message-1",
                type: "agentMessage",
                phase: "final_answer",
                text: JSON.stringify(result),
              },
            },
          });
          p.emitMessage({
            method: "thread/tokenUsage/updated",
            params: {
              threadId: "thread-1",
              turnId: "turn-1",
              tokenUsage: { last: { inputTokens: 10, outputTokens: 20 } },
            },
          });
          p.emitMessage({
            method: "turn/completed",
            params: {
              threadId: "thread-1",
              turn: { id: "turn-1", status: "completed", items: [] },
            },
          });
          p.respond(request, { turn: { id: "turn-1" } });
        } else if (request.method === "account/login/start")
          p.respond(request, {
            loginId: "login-1",
            authUrl:
              options.authUrl ||
              "https://auth.openai.com/oauth/authorize?test=1",
          });
        else if (request.id != null && request.method) p.respond(request, {});
      });
      return child;
    },
  });
  return { client, child: () => child, spawn: () => spawnOptions };
}
test("Codex image generation uses a per-thread opt-in and host image results", async () => {
  const result = PNG.sync.write({ width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4, 255) }).toString("base64");
  const s = setup({ imageGeneration: true, onTurn: (request, p) => {
    assert.equal(request.params.outputSchema, undefined);
    p.emitMessage({ method: "item/completed", params: { threadId: "thread-1", turnId: "turn-1", item: { type: "imageGeneration", id: "image-1", status: "completed", result, failure: null } } });
    p.emitMessage({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed", items: [] } } });
    p.respond(request, { turn: { id: "turn-1" } });
  } });
  try {
    const response = await s.client.requestPatch({ input: { ...input(), advancedGeneration: true }, model: "gpt-6-astra" });
    assert.ok(response.advancedGeneration); assert.equal(response.proposal.runs.length, 64);
    const started = s.child().messages.find((m) => m.method === "thread/start");
    assert.equal(started.params.config.features.image_generation, true);
    assert.equal(started.params.sandbox, "read-only");
    assert.ok(s.spawn().args.includes("features.image_generation=false"));
    assert.equal(s.child().messages.filter((m) => m.method === "turn/start").length, 1);
  } finally { await s.client.stop(); }
});

test("unsupported Codex image capability fails before inference with no fallback", async () => {
  const s = setup();
  try {
    await assert.rejects(s.client.requestPatch({ input: { ...input(), advancedGeneration: true }, model: "gpt-6-astra" }), /지원하지/);
    assert.ok(!s.child().messages.some((m) => m.method === "turn/start"));
    await assert.rejects(s.client.readGeneratedImage(path.join(os.tmpdir(), "arbitrary-secret.txt")));
  } finally { await s.client.stop(); }
});

test("Codex accepts compressed fixed spans without a second request", async () => {
  const s = setup({ patch: { summary: "Compact", new_colors: [], segments: [
    { id: 0, colors: 7 }, { id: 1, colors: { set: [3, 8] } },
  ] } });
  try {
    const result = await s.client.requestPatch({ input: input(), model: "gpt-6-astra" });
    assert.deepEqual(result.proposal.runs, [{ x: 0, y: 0, colors: Array(8).fill(7) }, { x: 3, y: 1, colors: [8] }]);
    assert.equal(s.child().messages.filter((m) => m.method === "turn/start").length, 1);
  } finally { await s.client.stop(); }
});

test("Codex detects ChatGPT login without returning credentials", async () => {
  const s = setup();
  try {
    const status = await s.client.status();
    assert.equal(status.connected, true);
    assert.equal(status.plan, "pro");
    assert.equal(status.authType, "chatgpt");
    assert.ok(!JSON.stringify(status).includes("test-should"));
    const spawn = s.spawn();
    assert.equal(spawn.opts.shell, false);
    assert.equal(spawn.opts.windowsHide, true);
    assert.equal(spawn.opts.env.OPENAI_API_KEY, undefined);
    assert.equal(spawn.opts.env.CODEX_API_KEY, undefined);
  } finally {
    await s.client.stop();
  }
});
test("Codex API-key and signed-out accounts cannot trigger inference or fallback", async () => {
  for (const account of ["apiKey", null]) {
    const s = setup({ account });
    try {
      await assert.rejects(
        () => s.client.requestPatch({ input: input(), model: "gpt-6-astra" }),
        /ChatGPT 로그인/,
      );
      assert.ok(!s.child().messages.some((m) => m.method === "thread/start"));
    } finally {
      await s.client.stop();
    }
  }
});
test("Codex uses ephemeral read-only turns and validates early completed JSON output", async () => {
  const s = setup();
  try {
    const result = await s.client.requestPatch({
      input: input(),
      model: "gpt-6-astra",
    });
    assert.equal(result.proposal.runs[0].colors[0], 7);
    assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 20 });
    const start = s.child().messages.find((m) => m.method === "thread/start");
    assert.equal(start.params.ephemeral, true);
    assert.equal(start.params.sandbox, "read-only");
    assert.equal(start.params.modelProvider, "openai");
    const turn = s.child().messages.find((m) => m.method === "turn/start");
    assert.ok(turn.params.outputSchema);
    assert.deepEqual(
      Object.keys(
        turn.params.outputSchema.properties.segments.items.properties,
      ),
      ["id", "colors"],
    );
    assert.equal(turn.params.outputSchema.properties.runs, undefined);
    assert.equal(turn.params.model, "gpt-6-astra");
    assert.ok(
      s.child().messages.some((m) => m.method === "thread/unsubscribe"),
    );
  } finally {
    await s.client.stop();
  }
});
test("Codex cannot turn out-of-selection output into a patch", async () => {
  const s = setup({
      patch: {
        summary: "invalid",
        new_colors: [],
        segments: [{ id: 1, colors: [7] }],
      },
    }),
    i = input();
  i.mask.fill(false);
  i.mask[0] = true;
  try {
    await assert.rejects(
      () => s.client.requestPatch({ input: i, model: "gpt-6-astra" }),
      /고정 구간/,
    );
  } finally {
    await s.client.stop();
  }
});
test("Codex refuses a non-OpenAI provider before turn/start", async () => {
  const s = setup({ provider: "custom" });
  try {
    await assert.rejects(
      () => s.client.requestPatch({ input: input(), model: "gpt-6-astra" }),
      /자동 전환하지/,
    );
    assert.ok(!s.child().messages.some((m) => m.method === "turn/start"));
  } finally {
    await s.client.stop();
  }
});
test("cancel during the turn/start handshake sends an interrupt as soon as the ID is known", async () => {
  const controller = new AbortController();
  let issued;
  const turnIssued = new Promise((resolve) => (issued = resolve));
  const s = setup({
    onTurn: (req, p) => {
      issued();
      setTimeout(() => p.respond(req, { turn: { id: "turn-1" } }), 20);
    },
  });
  try {
    const pending = s.client.requestPatch({
      input: input(),
      model: "gpt-6-astra",
      signal: controller.signal,
    });
    await turnIssued;
    controller.abort();
    await assert.rejects(() => pending, { name: "AbortError" });
    assert.ok(s.child().messages.some((m) => m.method === "turn/interrupt"));
  } finally {
    await s.client.stop();
  }
});
test("Codex login accepts only official HTTPS addresses and cancellation keeps other sessions intact", async () => {
  const s = setup();
  try {
    assert.match(await s.client.login(), /^https:\/\/auth.openai.com\//);
    await s.client.cancelLogin();
    assert.ok(
      s.child().messages.some((m) => m.method === "account/login/cancel"),
    );
    assert.ok(!s.child().messages.some((m) => m.method === "account/logout"));
  } finally {
    await s.client.stop();
  }
  const invalid = setup({ authUrl: "https://example.com/capture" });
  try {
    await assert.rejects(() => invalid.client.login(), /로그인 주소/);
  } finally {
    await invalid.client.stop();
  }
});
test("process-local overrides disable tools and remove API key fallback without mutating parent environment", () => {
  const env = {
    OPENAI_API_KEY: "fake",
    CODEX_API_KEY: "fake",
    Path: "C:\\bin",
  };
  const filtered = codexEnvironment(env);
  assert.equal(env.OPENAI_API_KEY, "fake");
  assert.equal(filtered.OPENAI_API_KEY, undefined);
  assert.equal(filtered.Path, env.Path);
  for (const flag of [
    "features.shell_tool=false",
    "features.image_generation=false",
    "features.multi_agent=false",
    "mcp_servers={}",
  ])
    assert.ok(CODEX_ARGS.includes(flag));
});

test("model catalog paginates, filters unsupported models, and keeps requested model defaults", async () => {
  const s = setup({
    models: ({ cursor }) =>
      cursor
        ? {
            data: [
              {
                model: "custom-vision",
                displayName: "Custom Vision",
                inputModalities: ["image", "text"],
                defaultReasoningEffort: "low",
              },
            ],
            nextCursor: null,
          }
        : {
            data: [
              { model: "hidden", hidden: true },
              { model: "text-only", inputModalities: ["text"] },
              {
                model: "gpt-6-astra",
                displayName: "GPT-6 Astra",
                inputModalities: ["image"],
              },
            ],
            nextCursor: "next",
          },
  });
  try {
    const models = await s.client.listModels();
    assert.deepEqual(
      models.map((m) => m.id),
      ["gpt-6-astra", "custom-vision"],
    );
    await s.client.requestPatch({ input: input(), model: "custom-vision" });
    const turn = s.child().messages.find((m) => m.method === "turn/start");
    assert.equal(turn.params.model, "custom-vision");
    assert.equal(turn.params.effort, "low");
  } finally {
    await s.client.stop();
  }
});

test("Codex progress only forwards matching agent output and reported usage, never reasoning text", async () => {
  const params = {
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "m",
    delta: '{"summary":',
  };
  const s = setup({
    notifications: [
      {
        method: "item/agentMessage/delta",
        params: { ...params, threadId: "other" },
      },
      {
        method: "item/reasoning/textDelta",
        params: { ...params, delta: "private reasoning" },
      },
      {
        method: "item/started",
        params: {
          ...params,
          item: { type: "agentMessage", id: "comment", phase: "commentary" },
        },
      },
      {
        method: "item/agentMessage/delta",
        params: { ...params, itemId: "comment", delta: "commentary" },
      },
      { method: "item/agentMessage/delta", params },
    ],
  });
  const events = [];
  try {
    await s.client.requestPatch({
      input: input(),
      model: "gpt-6-astra",
      onProgress: (e) => events.push(e),
    });
    assert.equal(events.filter((e) => e.type === "text").length, 1);
    assert.equal(events.find((e) => e.type === "text").delta, params.delta);
    assert.ok(!JSON.stringify(events).includes("private reasoning"));
    assert.deepEqual(events.find((e) => e.type === "usage").usage, {
      input_tokens: 10,
      output_tokens: 20,
    });
  } finally {
    await s.client.stop();
  }
});
