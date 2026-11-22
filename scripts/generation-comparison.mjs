// Offline diagnostic: synthetic artwork only; no network, models or user profile.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { fixedSegments, decodePatch } from "../electron/fixed-patch.mjs";
import { sampleDraft, reduceDraftColors } from "../electron/pixel-conversion.mjs";

const out = path.resolve(import.meta.dirname, "../artifacts/generation-comparison");
await fs.mkdir(out, { recursive: true });
const image = { width: 64, height: 64, data: Buffer.alloc(64 * 64 * 4) };
for (let y = 8; y < 56; y++) for (let x = 8; x < 56; x++) {
  const eye = ((x >= 24 && x < 27) || (x >= 40 && x < 43)) && y >= 24 && y < 28;
  image.data.set(eye ? [20, 20, 20, 255] : [50, 190, 80, 255], (y * 64 + x) * 4);
}
const nearest = sampleDraft(image, 8, 8, 128, "nearest");
const features = sampleDraft(image, 8, 8, 128, "features");
const panels = [image, { width: 8, height: 8, data: Buffer.from(nearest) }, { width: 8, height: 8, data: Buffer.from(features) }];
for (const [i, name] of ["source", "nearest", "features"].entries())
  await fs.writeFile(path.join(out, name + ".png"), PNG.sync.write(panels[i]));
const sheet = { width: 640, height: 224, data: Buffer.alloc(640 * 224 * 4, 255) };
panels.forEach((panel, n) => {
  for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
    const src = (Math.floor(y * panel.height / 192) * panel.width + Math.floor(x * panel.width / 192)) * 4;
    const dst = ((y + 16) * sheet.width + x + 16 + n * 208) * 4;
    const bg = (Math.floor(x / 12) + Math.floor(y / 12)) % 2 ? 210 : 235;
    sheet.data.set(panel.data[src + 3] ? panel.data.subarray(src, src + 4) : [bg, bg, bg, 255], dst);
  }
});
await fs.writeFile(path.join(out, "comparison.png"), PNG.sync.write(sheet));

const table = fixedSegments(Array(4096).fill(true), 64);
const report = { note: "Serialized JSON characters, not tokens, billing or a visual quality score.", responses: [] };
for (const kind of ["uniform", "sparse", "varied"]) {
  const dense = { summary: "Edit", new_colors: [], segments: table.map(({ id }) => ({ id,
    colors: kind === "uniform" ? Array(8).fill(7) : kind === "sparse" ? [null, null, null, 7, null, null, null, null] : [1, 2, 3, 4, 5, 6, 7, 8],
  })) };
  const compact = { ...dense, segments: dense.segments.map(({ id, colors }) => ({ id,
    colors: kind === "uniform" ? 7 : kind === "sparse" ? { set: [3, 7] } : colors,
  })) };
  assert.deepEqual(decodePatch(compact, table), decodePatch(dense, table));
  const before = JSON.stringify(dense).length, after = JSON.stringify(compact).length;
  report.responses.push({ kind, denseCharacters: before, compactCharacters: after, reductionPercent: +(100 * (1 - after / before)).toFixed(1) });
}
report.features = { sourceEyeMarks: 2,
  nearestEyePixels: [...nearest].filter((v, i) => i % 4 === 0 && v === 20).length,
  featureEyePixels: [...features].filter((v, i) => i % 4 === 0 && v === 20).length };
const large = { width: 2048, height: 2048, data: Buffer.alloc(2048 * 2048 * 4) };
for (let i = 0; i < large.data.length; i += 4)
  large.data.set([(i / 4) % 256, Math.floor(i / 8192) % 256, Math.floor(i / 64) % 256, 255], i);
const start = performance.now();
const sampled = sampleDraft(large, 64, 64, 128, "features");
reduceDraftColors(sampled, 32, Array(4096).fill(true));
report.maxSizeConversionMs = +(performance.now() - start).toFixed(1);
await fs.writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
console.log("Generated comparison: " + path.join(out, "comparison.png"));
