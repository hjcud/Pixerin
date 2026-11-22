// Rebuild display assets and verify the public, path-free comparison fixtures.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

const out = import.meta.dirname;
const root = path.resolve(out, "../..");
const study = process.argv.includes("--from-study") ? path.join(root, "artifacts/cross-subject-20261117") : null;
const retained = JSON.parse(await fs.readFile(path.join(out, "provenance.json")));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const ledger = { generatedOn: "2026-11-17", preparedOn: "2026-11-22", model: "unknown (built-in host image tool)",
  comparison: "Same generated source before and after local skill conversion; not a same-GPT controlled trial",
  selection: "First recorded replicate of sword and explorer, chosen to cover object and character; the original study retained two replicates of four subjects",
  imageRequestsPerCase: 1, externalReferences: 0, additionalImageRequestsForConversion: 0,
  reportedTokens: null, billedCost: null, hostReasoningTokens: null, cases: [] };
for (const [name, id] of [["sword", "sword-1"], ["explorer", "explorer-1"]]) {
  const retainedCase = retained.cases.find(entry => entry.id === id);
  const original = await fs.readFile(study ? path.join(study, id, "original.png") : path.join(out, name + "-source.png"));
  const native = await fs.readFile(path.join(out, name + "-native.png"));
  const sourceImage = PNG.sync.read(original), targetImage = PNG.sync.read(native);
  if (study) {
    const previous = PNG.sync.read(await fs.readFile(path.join(study, id, "automatic.png")));
    assert.deepEqual(targetImage.data, previous.data, "Current skill conversion differs from the retained automatic draft");
  }
  assert.equal(hash(original), retainedCase.source.sha256);
  assert.equal(hash(native), retainedCase.native.sha256);
  assert.equal(targetImage.width, 32); assert.equal(targetImage.height, 32);
  const colors = new Set(); let partialAlpha = 0;
  for (let i = 0; i < targetImage.data.length; i += 4) {
    colors.add(targetImage.data.subarray(i, i + 4).toString("hex"));
    if (![0, 255].includes(targetImage.data[i + 3])) partialAlpha++;
  }
  assert.ok(colors.size <= 16); assert.equal(partialAlpha, 0);
  const sourceColors = new Set(); let sourcePartialAlpha = 0;
  for (let i = 0; i < sourceImage.data.length; i += 4) {
    sourceColors.add(sourceImage.data.subarray(i, i + 4).toString("hex"));
    if (![0, 255].includes(sourceImage.data[i + 3])) sourcePartialAlpha++;
  }
  assert.equal(sourceColors.size, retainedCase.source.rgbaColors);
  assert.equal(sourcePartialAlpha, retainedCase.source.partialAlphaPixels);
  if (study) await fs.writeFile(path.join(out, name + "-source.png"), original);
  for (const [kind, source] of [["source", sourceImage], ["native", targetImage]]) {
    const display = new PNG({ width: 256, height: 256 });
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const src = (Math.floor(y * source.height / 256) * source.width + Math.floor(x * source.width / 256)) * 4;
      source.data.copy(display.data, (y * 256 + x) * 4, src, src + 4);
    }
    await fs.writeFile(path.join(out, name + "-" + kind + "-display.png"), PNG.sync.write(display));
  }
  ledger.cases.push({ id, prompt: retainedCase.prompt,
    source: { file: name + "-source.png", sha256: hash(original), width: sourceImage.width, height: sourceImage.height,
      rgbaColors: sourceColors.size, partialAlphaPixels: sourcePartialAlpha },
    native: { file: name + "-native.png", sha256: hash(native), width: 32, height: 32, rgbaColors: colors.size, partialAlphaPixels: partialAlpha },
    project: { file: name + ".pixeltool", sha256: hash(await fs.readFile(path.join(out, name + ".pixeltool"))) },
    conversion: { method: "features", fit: "frame", totalColorBudget: 16, alphaThreshold: 128, dithering: false,
      manualPixelChanges: 0, acceptedReviewChanges: 0, storedFormatVersion: 2 } });
}
await fs.writeFile(path.join(out, "provenance.json"), JSON.stringify(ledger, null, 2) + "\n");
console.log("Verified 2 original/native hashes, source RGBA/alpha counts, 32x32 dimensions, <=16 RGBA colors and binary alpha" + (study ? ", plus retained-study native pixel parity." : "."));
