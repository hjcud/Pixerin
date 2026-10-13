import test from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../src/core.mjs";
import { buildProviderRequest, requestProviderPatch, providerUsage, checkProviderModel } from "../electron/providers.mjs";

const input = () => ({ document: createDocument(8, 8), mask: Array(64).fill(true), prompt: "Green gem" });
const patch = { summary: "Edit", new_colors: [], segments: [{ id: 0, colors: { set: [3, 7] } }] };
const response = (provider, p = patch) => provider === "anthropic"
  ? { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(p) }], usage: { input_tokens: 10, cache_read_input_tokens: 4, cache_creation_input_tokens: 2, output_tokens: 20 } }
  : { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(p) }] } }], usageMetadata: { promptTokenCount: 16, candidatesTokenCount: 15, thoughtsTokenCount: 5, cachedContentTokenCount: 4 } };

test("official provider requests preserve constrained pixel contracts without tools or URL images", () => {
  for (const provider of ["anthropic", "gemini"]) {
    const source = input(); source.document = createDocument(32, 32); source.mask = Array(1024).fill(true);
    const request = buildProviderRequest(provider, source, "test-vision");
    assert.match(request.url, /^https:\/\/(api.anthropic.com|generativelanguage.googleapis.com)\//);
    assert.equal(request.body.tools, undefined);
    const schema = provider === "anthropic" ? request.body.output_config.format.schema : request.body.generationConfig.responseJsonSchema;
    assert.ok(schema.properties.segments.items.properties.colors.anyOf);
    assert.doesNotMatch(JSON.stringify(schema), /"(maxItems|minItems|minimum|maximum|maxLength|minLength)"/);
    assert.throws(() => buildProviderRequest(provider, { ...input(), advancedGeneration: true }, "test-vision"));
    assert.throws(() => buildProviderRequest(provider, input(), "../not-a-model"));
  }
});

test("provider usage normalizes cache and reasoning without double counting", () => {
  assert.deepEqual(providerUsage("anthropic", response("anthropic")), { input_tokens: 16, output_tokens: 20, cached_tokens: 4, cache_write_tokens: 2 });
  assert.deepEqual(providerUsage("gemini", response("gemini")), { input_tokens: 16, output_tokens: 20, reasoning_tokens: 5, cached_tokens: 4 });
  assert.equal(providerUsage("gemini", {}), null);
});

test("both providers make one authenticated call and validate the original frozen selection", async () => {
  for (const provider of ["anthropic", "gemini"]) {
    const source = input(), events = []; let calls = 0;
    const result = await requestProviderPatch({ provider, key: "fixture-secret-key", model: "test-vision", input: source, onProgress: (e) => events.push(e),
      fetchImpl: async (url, options) => {
        calls++; source.mask.fill(false);
        assert.equal(options.redirect, "error"); assert.ok(!url.includes("fixture-secret-key"));
        assert.equal(options.headers[provider === "anthropic" ? "x-api-key" : "x-goog-api-key"], "fixture-secret-key");
        return Response.json(response(provider));
      },
    });
    assert.equal(calls, 1); assert.deepEqual(result.proposal.runs, [{ x: 3, y: 0, colors: [7] }]);
    assert.equal(result.usage.input_tokens, 16); assert.ok(events.some((e) => e.type === "usage"));
  }
});

test("invalid, refused, truncated, redirected and canceled provider responses never retry or escape scope", async () => {
  for (const provider of ["anthropic", "gemini"]) {
    const source = input(); source.mask.fill(false); source.mask[0] = true;
    for (const body of [response(provider, { ...patch, segments: [{ id: 0, colors: { set: [1, 7] } }] }),
      provider === "anthropic" ? { ...response(provider), stop_reason: "max_tokens" } : { ...response(provider), candidates: [] }]) {
      let calls = 0;
      await assert.rejects(requestProviderPatch({ provider, key: "fixture-secret-key", model: "test-vision", input: source, fetchImpl: async () => { calls++; return Response.json(body); } }));
      assert.equal(calls, 1);
    }
    await assert.rejects(requestProviderPatch({ provider, key: "fixture-secret-key", model: "test-vision", input: input(),
      fetchImpl: async () => new Response("fixture-secret-key echoed", { status: 403 }) }), (e) => !e.message.includes("fixture-secret-key"));
    const controller = new AbortController(); controller.abort();
    await assert.rejects(requestProviderPatch({ provider, key: "fixture-secret-key", model: "test-vision", input: input(), signal: controller.signal,
      fetchImpl: () => { throw Error("Must not send"); } }), { name: "AbortError" });
  }
});

test("model access checks are fixed-host metadata GETs without artwork or generation", async () => {
  for (const provider of ["api", "anthropic", "gemini"]) {
    let calls = 0;
    await checkProviderModel({ provider, key: "fixture-secret-key", model: "test-vision", fetchImpl: async (url, options) => {
      calls++; assert.equal(options.method, "GET"); assert.equal(options.body, undefined); assert.equal(options.redirect, "error");
      assert.ok(!url.includes("fixture-secret-key")); return Response.json({ id: "test-vision" });
    } });
    assert.equal(calls, 1);
  }
  await assert.rejects(checkProviderModel({ provider: "codex", key: "fixture-secret-key", model: "test-vision" }));
});
