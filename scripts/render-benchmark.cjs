if (require("./test-runner.cjs").bootstrap(__filename)) return;
// Generated profiles only. Reports handler timing, not display frame rate or AI quality.
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path");
(async () => {
  const root = path.resolve(__dirname, ".."),
    results = [];
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  for (const [size, layers] of [
    [16, 1],
    [64, 32],
    [256, 1],
    [256, 32],
  ]) {
    const doc = ensureLayers(
      createDocument(size, size, `Benchmark ${size}/${layers}`),
    );
    for (let n = 1; n < layers; n++)
      doc.layers.push({
        id: "l" + n,
        name: "Layer " + n,
        visible: true,
        locked: false,
        pixels: Array.from({ length: size * size }, (_, i) =>
          i % 13 === n % 13 ? 7 : 0,
        ),
      });
    const profile =
      await require("./test-runner.cjs").createProfile("render-benchmark-");
    await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
    const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
    try {
      const page = await require("./first-editor.cjs")(app);
      await page.waitForFunction(
        (name) =>
          document.querySelector("#doc-name").value === name &&
          document.querySelector("#save-status").textContent.includes("저장됨"),
        doc.name,
      );
      const r = await page.locator("#overlay-canvas").boundingBox();
      await page.mouse.move(r.x + r.width / 4, r.y + r.height / 4);
      await page.mouse.down();
      const samples = await page.evaluate((size) => {
        const c = document.querySelector("#overlay-canvas"),
          r = c.getBoundingClientRect(),
          samples = [];
        for (let i = 0; i < 20; i++) {
          const start = performance.now();
          c.dispatchEvent(
            new PointerEvent("pointermove", {
              pointerId: 1,
              pointerType: "mouse",
              buttons: 1,
              bubbles: true,
              clientX: r.x + (((i % 12) + 0.5) * r.width) / size,
              clientY: r.y + (5.5 * r.height) / size,
            }),
          );
          samples.push(performance.now() - start);
        }
        return samples.slice(4).sort((a, b) => a - b);
      }, size);
      await page.mouse.up();
      results.push({
        size,
        layers,
        medianMs: samples[Math.floor(samples.length / 2)],
        p95Ms: samples[Math.floor(samples.length * 0.95)],
      });
    } finally {
      await app.close();
    }
  }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
