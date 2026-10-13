import { buildRequest, parseResponse } from "./ai.mjs";
import { publicUsage } from "./progress.mjs";
import { t } from "../src/i18n.mjs";

// Provider grammar support varies. Relax transport-only bounds, while retaining
// the full fixed-segment, palette and protection validators after parsing.
export function transportSchema(value) {
  if (Array.isArray(value)) return value.map(transportSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"].includes(key))
    .map(([key, child]) => [key, transportSchema(child)]));
}
export function buildProviderRequest(provider, input, model) {
  if (!["anthropic", "gemini"].includes(provider)) throw new Error(t("지원하지 않는 AI 연결이에요."));
  if (input.advancedGeneration) throw new Error(t("이 서비스는 정밀 수정만 지원합니다. 전체 수정은 OpenAI API를 선택하세요."));
  return buildStructuredProviderRequest(provider, buildRequest(input, model), model);
}
export function buildStructuredProviderRequest(provider, request, model) {
  if (provider === "api") return { url: "https://api.openai.com/v1/responses", headers: {},
    body: { ...request, model, store: false, stream: false } };
  if (!["anthropic", "gemini"].includes(provider)) throw new Error(t("지원하지 않는 AI 연결이에요."));
  const schema = transportSchema(request.text.format.schema);
  const image = (url) => {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!match) throw new Error(t("미리보기 이미지 형식이 올바르지 않아요."));
    return match[1];
  };
  if (provider === "anthropic") return {
    url: "https://api.anthropic.com/v1/messages",
    headers: { "anthropic-version": "2023-06-01" },
    body: { model, max_tokens: 32768, system: request.instructions,
      messages: [{ role: "user", content: request.input[0].content.map((part) => part.type === "input_text"
        ? { type: "text", text: part.text }
        : { type: "image", source: { type: "base64", media_type: "image/png", data: image(part.image_url) } }) }],
      output_config: { format: { type: "json_schema", schema } },
    },
  };
  return { url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, headers: {},
    body: { systemInstruction: { parts: [{ text: request.instructions }] },
      contents: [{ role: "user", parts: request.input[0].content.map((part) => part.type === "input_text"
        ? { text: part.text } : { inlineData: { mimeType: "image/png", data: image(part.image_url) } }) }],
      generationConfig: { maxOutputTokens: 32768, responseMimeType: "application/json", responseJsonSchema: schema },
    },
  };
}
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
export function providerUsage(provider, result) {
  if (provider === "anthropic") {
    const usage = result?.usage;
    if (!usage) return null;
    const input = count(usage.input_tokens), cached = count(usage.cache_read_input_tokens), written = count(usage.cache_creation_input_tokens);
    return publicUsage({ input_tokens: input === undefined ? undefined : input + (cached ?? 0) + (written ?? 0),
      output_tokens: count(usage.output_tokens), cached_tokens: cached, cache_write_tokens: written });
  }
  const usage = result?.usageMetadata;
  if (!usage) return null;
  const output = count(usage.candidatesTokenCount), thoughts = count(usage.thoughtsTokenCount);
  return publicUsage({ input_tokens: count(usage.promptTokenCount),
    output_tokens: output === undefined ? undefined : output + (thoughts ?? 0),
    reasoning_tokens: thoughts, cached_tokens: count(usage.cachedContentTokenCount) });
}
async function boundedJSON(response, signal) {
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 4 * 1024 * 1024) throw new Error(t("AI 응답이 크기 제한을 초과했어요."));
      chunks.push(Buffer.from(part.value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error(t("AI 응답을 읽지 못했어요. 원본은 유지돼요.")); }
}
export async function requestStructured({ provider, key, model, request, signal, onProgress = () => {}, fetchImpl = fetch }) {
  if (!key) throw new Error(t("선택한 서비스의 API 키를 입력해 주세요."));
  const transport = buildStructuredProviderRequest(provider, request, model);
  signal?.throwIfAborted();
  const response = await fetchImpl(transport.url, { method: "POST", redirect: "error", signal,
    headers: { "Content-Type": "application/json", ...transport.headers,
      ...(provider === "api" ? { Authorization: `Bearer ${key}` } : provider === "anthropic" ? { "x-api-key": key } : { "x-goog-api-key": key }) },
    body: JSON.stringify(transport.body) });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(t("AI 요청에 실패했어요. 키, 모델 권한, 사용 한도를 확인해 주세요. HTTP {0}", response.status));
  }
  const result = await boundedJSON(response, signal);
  const usage = provider === "api" ? publicUsage({ ...result.usage,
    cached_tokens: result.usage?.input_tokens_details?.cached_tokens,
    reasoning_tokens: result.usage?.output_tokens_details?.reasoning_tokens }) : providerUsage(provider, result);
  onProgress({ type: "usage", usage });
  signal?.throwIfAborted();
  let text;
  if (provider === "api") {
    if (result.status !== "completed" || !Array.isArray(result.output) || result.output.some(item => item.type === "message" && item.content?.some(p => p.type !== "output_text")))
      throw new Error(t("AI 응답이 완료되지 않았어요. 선택 범위를 줄이거나 다시 요청해 주세요."));
    text = result.output.filter(item => item.type === "message").flatMap(item => item.content || []).map(p => p.text).join("");
  } else if (provider === "anthropic") {
    if (result.stop_reason !== "end_turn" || result.content?.some(p => p.type !== "text"))
      throw new Error(t("AI 응답이 완료되지 않았어요. 선택 범위를 줄이거나 다시 요청해 주세요."));
    text = result.content?.map(p => p.text).join("");
  } else {
    const candidate = result.candidates?.[0];
    if (result.candidates?.length !== 1 || candidate?.finishReason !== "STOP" || candidate.content?.parts?.some(p => !p.thought && typeof p.text !== "string"))
      throw new Error(t("AI 응답이 완료되지 않았어요. 선택 범위를 줄이거나 다시 요청해 주세요."));
    text = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text).join("");
  }
  if (typeof text !== "string" || !text.trim()) throw new Error(t("AI 응답을 읽지 못했어요. 원본은 유지돼요."));
  return { text, usage };
}
export async function requestProviderPatch({ provider, key, input, model, signal, onProgress = () => {}, fetchImpl = fetch }) {
  input = structuredClone(input);
  const request = buildProviderRequest(provider, input, model);
  if (!key) throw new Error(t("선택한 서비스의 API 키를 입력해 주세요."));
  signal?.throwIfAborted();
  onProgress({ type: "stage", stage: "waiting" });
  let response;
  try {
    response = await fetchImpl(request.url, { method: "POST", redirect: "error", signal,
      headers: { "Content-Type": "application/json", ...request.headers,
        ...(provider === "anthropic" ? { "x-api-key": key } : { "x-goog-api-key": key }) },
      body: JSON.stringify(request.body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(t("AI 서비스에 연결하지 못했어요. 인터넷 연결과 서비스 상태를 확인해 주세요."));
  }
  // Never surface provider error bodies: they can echo request content or keys.
  if (!response.ok) throw new Error(t("AI 요청에 실패했어요. 키, 모델 권한, 사용 한도를 확인해 주세요. HTTP {0}", response.status));
  const result = await boundedJSON(response, signal), usage = providerUsage(provider, result);
  onProgress({ type: "usage", usage });
  signal?.throwIfAborted();
  let text;
  if (provider === "anthropic") {
    if (result.stop_reason !== "end_turn" || result.content?.some((p) => p.type !== "text"))
      throw new Error(t("AI 응답이 완료되지 않았어요. 선택 범위를 줄이거나 다시 요청해 주세요."));
    text = result.content?.map((p) => p.text).join("");
  } else {
    const candidate = result.candidates?.[0];
    if (result.candidates?.length !== 1 || candidate?.finishReason !== "STOP" ||
        candidate.content?.parts?.some((p) => !p.thought && typeof p.text !== "string"))
      throw new Error(t("AI 응답이 완료되지 않았어요. 선택 범위를 줄이거나 다시 요청해 주세요."));
    text = candidate.content?.parts?.filter((p) => !p.thought).map((p) => p.text).join("");
  }
  onProgress({ type: "stage", stage: "validating" });
  return parseResponse({ status: "completed", usage,
    output: [{ type: "message", content: [{ type: "output_text", text: text ?? "" }] }] }, input);
}

export async function checkProviderModel({ provider, key, model, fetchImpl = fetch }) {
  if (!["api", "anthropic", "gemini"].includes(provider) || !/^[\w.-]{1,100}$/.test(model))
    throw new Error(t("모델 ID를 확인해 주세요."));
  if (!key || key.length < 10 || key.length > 1024 || /\s/.test(key)) throw new Error(t("API 키 형식을 확인해 주세요."));
  const hosts = { api: "https://api.openai.com/v1/models/", anthropic: "https://api.anthropic.com/v1/models/", gemini: "https://generativelanguage.googleapis.com/v1beta/models/" };
  let response;
  try {
    response = await fetchImpl(hosts[provider] + encodeURIComponent(model), { method: "GET", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: provider === "api" ? { Authorization: `Bearer ${key}` }
        : provider === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { "x-goog-api-key": key },
    });
  } catch { throw new Error(t("AI 서비스에 연결하지 못했어요. 인터넷 연결과 서비스 상태를 확인해 주세요.")); }
  if (!response.ok) throw new Error(t("AI 요청에 실패했어요. 키, 모델 권한, 사용 한도를 확인해 주세요. HTTP {0}", response.status));
  // Only metadata access is checked. No generation, prompts, tools or artwork.
  await response.body?.cancel().catch(() => {});
  return { provider, model, available: true };
}
