import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { motionFixture } from "../tests/motion-fixture.mjs";
import { renderMotion } from "../src/sprite-motion.mjs";
import { frameAt } from "../src/animation.mjs";
import { spriteBundle, animatedPNG } from "../electron/sprite-export.mjs";

const directory = path.resolve(import.meta.dirname, "..", "artifacts", "sprite-animation");
await fs.mkdir(directory, { recursive: true });
const rows = [];
for (const size of [16, 32, 64]) for (const count of [4, 8, 16, 24]) {
  const fixture = motionFixture(size, count), times = [];
  let rendered;
  for (let repeat = 0; repeat < 5; repeat++) {
    const start = performance.now(); rendered = renderMotion(fixture.input, fixture.plan); times.push(performance.now() - start);
  }
  const dense = Array.from({ length: count }, (_, i) => frameAt(rendered.document, i).pixels);
  const rle = dense.map(pixels => {
    const runs = []; let color = pixels[0], length = 0;
    for (const value of pixels) { if (value === color) length++; else { runs.push([color, length]); color = value; length = 1; } }
    runs.push([color, length]); return runs;
  });
  rows.push({ size, frames: count, repeats: times.length, medianCompileMs: times.sort((a, b) => a - b)[Math.floor(times.length / 2)],
    motionPlanCharacters: JSON.stringify(fixture.plan).length, denseFrameCharacters: JSON.stringify(dense).length,
    rleFrameCharacters: JSON.stringify(rle).length,
    paletteUnchanged: dense.every((_, i) => JSON.stringify(frameAt(rendered.document, i).palette) === JSON.stringify(fixture.document.palette)),
    diagnostics: rendered.diagnostics });
}
const demonstration = motionFixture(32, 8), result = renderMotion(demonstration.input, demonstration.plan);
await fs.writeFile(path.join(directory, "frog-idle.pixeltool"), JSON.stringify(result.document));
await fs.writeFile(path.join(directory, "frog-idle-motion.json"), JSON.stringify(demonstration.plan, null, 2));
await fs.writeFile(path.join(directory, "frog-idle.zip"), spriteBundle(result.document).bytes);
await fs.writeFile(path.join(directory, "frog-idle.apng"), animatedPNG(result.document));
await fs.writeFile(path.join(directory, "benchmark.json"), JSON.stringify({
  note: "Synthetic manually authored fixture and deterministic local renderer only. Character counts are not token counts. No live AI generation or aesthetic quality score.", rows,
}, null, 2));
console.log(JSON.stringify({ cases: rows.length, renders: rows.reduce((n, row) => n + row.repeats, 0), directory, maxMedianMs: Math.max(...rows.map(row => row.medianCompileMs)) }));
