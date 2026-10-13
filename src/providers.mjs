// Public connection metadata only. Credentials and endpoints stay in main.
export const PROVIDERS = Object.freeze({
  // Historical transmission records retain this identifier; it is not connectable.
  codex: { name: "Codex", company: "OpenAI" },
  api: { name: "OpenAI API", company: "OpenAI" },
  anthropic: { name: "Claude API", company: "Anthropic" },
  gemini: { name: "Gemini API", company: "Google" },
});
export const isProvider = (id) => Object.hasOwn(PROVIDERS, id);
export const isAPIProvider = (id) => isProvider(id) && id !== "codex";
export const supportsImageGeneration = (id) => id === "api";
