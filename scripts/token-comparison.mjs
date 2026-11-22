// Optional offline diagnostic. Pass an installed js-tiktoken module path.
// No API keys, network/model calls, artwork or persistent dependencies required.
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { createDocument } from "../src/core.mjs";
import { buildRequest } from "../electron/ai.mjs";
import { fixedScope, usesCompactPatch } from "../electron/fixed-patch.mjs";
const require = createRequire(import.meta.url);
const tokenizer = require(process.argv[2] || "js-tiktoken").getEncoding("o200k_base");
const count = (text) => tokenizer.encode(text).length;
const report = { encoding: "o200k_base", note: "Reference text-token comparison only. Not actual provider billing, model-specific counts, image or reasoning tokens. Includes changed instructions and schema.", cases: [] };
for (const size of [8, 32, 64]) for (const kind of ["uniform", "sparse", "varied"]) {
  const input = { document: createDocument(size, size), mask: Array(size * size).fill(true), prompt: "A green gem" };
  const request = buildRequest(input, "mock"), schema = structuredClone(request.text.format.schema);
  schema.properties.segments.items.properties.colors = schema.properties.segments.items.properties.colors.anyOf?.[0] || schema.properties.segments.items.properties.colors;
  const oldInstructions = request.instructions.replace("fixed-segments-v2", "fixed-segments-v1")
    .replace(/Use the shortest applicable colors encoding:[\s\S]*?Use dense arrays for varied full-span edits\./,
      "Each returned colors array MUST have exactly the referenced segment's length, ordered left-to-right at its fixed position. Use null to keep a pixel unchanged (null is NOT transparent; color index 0 is transparent). Omit segments with no changes; never repeat an ID. For example a segment of length 3 can return {\"id\":0,\"colors\":[null,7,null]} to change only its middle pixel.");
  const payloadTokens = count(request.input[0].content[0].text);
  const beforeInput = count(oldInstructions) + count(JSON.stringify(schema)) + payloadTokens;
  const afterInput = count(request.instructions) + count(JSON.stringify(request.text.format.schema)) + payloadTokens;
  const segments = fixedScope(input).segments;
  const dense = { summary: "Edit", new_colors: [], segments: segments.map(({ id, length }) => ({ id,
    colors: Array.from({ length }, (_, n) => kind === "uniform" ? 7 : kind === "sparse" ? n === 3 ? 7 : null : n + 1),
  })) };
  const compressed = usesCompactPatch(segments.length);
  const compact = !compressed ? dense : { ...dense, segments: dense.segments.map(({ id, colors }) => ({ id,
    colors: kind === "uniform" ? 7 : kind === "sparse" ? { set: [3, 7] } : colors,
  })) };
  const beforeOutput = count(JSON.stringify(dense)), afterOutput = count(JSON.stringify(compact));
  report.cases.push({ size, kind, compressed, denseInputTokens: beforeInput, compactInputTokens: afterInput,
    denseOutputTokens: beforeOutput, compactOutputTokens: afterOutput,
    totalTextTokenChange: afterInput + afterOutput - beforeInput - beforeOutput });
}
await fs.mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
await fs.writeFile(new URL("../artifacts/token-comparison.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
