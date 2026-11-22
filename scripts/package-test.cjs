if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron: electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, "..");
  const profile = await require("./test-runner.cjs").createProfile("packaged-profile-");
  const executablePath = path.join(
    process.env.PIXEL_MAT_BUILD_ROOT || path.join(root, "dist"),
    "PixelTool-win32-x64",
    "PixelTool.exe",
  );
  const { peResources, icoFrames } = await import("./resource-formats.mjs");
  const dist = path.dirname(executablePath);
  assert.deepEqual(await fs.readFile(path.join(dist, 'LICENSE.pixel-mat')), await fs.readFile(path.join(root, 'LICENSE')));
  assert.match(await fs.readFile(path.join(dist, 'LICENSE_SCOPE.md'), 'utf8'), /\]\(LICENSE\.pixel-mat\)/);
  assert.equal(JSON.parse(await fs.readFile(path.join(dist, 'resources', 'app', 'package.json'))).version, require('../package.json').version);
  assert.equal(JSON.parse(await fs.readFile(path.join(dist, 'resources', 'app', 'package.json'))).license, 'MIT');
  assert.match(await fs.readFile(path.join(dist, 'README.md'), 'utf8'), /\]\(LICENSE\.pixel-mat\)/);
  for (const filename of ['ko-source.mjs', 'en.mjs', 'ja.mjs', 'zh-CN.mjs', 'es.mjs', 'fr.mjs', 'de.mjs', 'provenance.json'])
    assert.deepEqual(await fs.readFile(path.join(dist, 'resources', 'app', 'src', 'translations', filename)), await fs.readFile(path.join(root, 'src', 'translations', filename)), 'Packaged translation matches reviewed source: ' + filename);
  assert.equal(await fs.access(path.join(dist,"resources","app","electron","codex.mjs")).then(()=>true,()=>false),false,
    "Retired Codex runtime must not remain in an updated folder build");
  assert.equal(
    await fs.access(path.join(dist, "resources", "default_app.asar")).then(
      () => true,
      () => false,
    ),
    false,
  );
  const executableBytes = await fs.readFile(executablePath);
  const packedResources = peResources(executableBytes);
  const originalResources = peResources(await fs.readFile(require("electron")));
  for (const resource of originalResources.filter((r) => r.type === 3))
    assert.equal(
      executableBytes.includes(resource.data),
      false,
      "Default icon payload removed",
    );
  const frames = icoFrames(
    await fs.readFile(path.join(root, "src", "brand", "pixerin.ico")),
  );
  const icons = packedResources.filter((r) => r.type === 3);
  assert.equal(icons.length, frames.length);
  for (let i = 0; i < frames.length; i++) {
    assert.deepEqual(
      icons.find((r) => r.name === i + 1 && r.language === 1033)?.data,
      frames[i],
    );
  }
  const groups = packedResources.filter((r) => r.type === 14);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].data.readUInt16LE(4), frames.length);
  for (let i = 0; i < frames.length; i++) {
    assert.equal(groups[0].data.readUInt16LE(6 + i * 14 + 12), i + 1);
    assert.equal(groups[0].data.readUInt32LE(6 + i * 14 + 8), frames[i].length);
  }
  assert.deepEqual(
    packedResources.filter((r) => r.type !== 3 && r.type !== 14),
    originalResources.filter((r) => r.type !== 3 && r.type !== 14),
  );
  for (const notice of ["LICENSE", "LICENSES.chromium.html"]) {
    assert.deepEqual(
      await fs.readFile(path.join(dist, notice)),
      await fs.readFile(path.join(path.dirname(require("electron")), notice)),
    );
  }
  const packedPngjs = path.join(
    dist,
    "resources",
    "app",
    "node_modules",
    "pngjs",
  );
  assert.deepEqual(
    await fs.readFile(path.join(packedPngjs, "LICENSE")),
    await fs.readFile(
      path.join(path.dirname(require.resolve("pngjs/package.json")), "LICENSE"),
    ),
  );
  assert.deepEqual(await fs.readdir(path.dirname(packedPngjs)), ["pngjs"]);
  console.log(
    "PASS: welcome assets excluded; executable contains only Pixel Mat icon frames; other PE resources and license notices preserved",
  );
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ executablePath, args: [], env });
  try {
    let page = await require("./first-editor.cjs")(app);
    await page.waitForSelector("#overlay-canvas");
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    const translationAssets = await app.evaluate(async ({ net }) => {
      const statuses = {};
      for (const file of ['ko-source.mjs', 'en.mjs', 'ja.mjs', 'zh-CN.mjs', 'es.mjs', 'fr.mjs', 'de.mjs', 'provenance.json'])
        statuses[file] = (await net.fetch('pixeltool://app/src/translations/' + file)).status;
      statuses.environment = (await net.fetch('pixeltool://app/.env')).status;
      return statuses;
    });
    for (const [file, status] of Object.entries(translationAssets))
      assert.equal(status, file === 'provenance.json' || file === 'environment' ? 404 : 200, 'Restricted translation asset route: ' + file);
    const fixed = await app.evaluate(({ app }) => {
      const path = process.mainModule.require("node:path");
      const { buildRequest, parseResponse } = process.mainModule.require(
        path.join(app.getAppPath(), "electron", "ai.mjs"),
      );
      const { createDocument } = process.mainModule.require(
        path.join(app.getAppPath(), "src", "core.mjs"),
      );
      const input = {
        document: createDocument(3, 1),
        mask: [false, true, false],
        prompt: "Mock edit",
      };
      const request = buildRequest(input, "mock");
      const result = parseResponse(
        {
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    summary: "Mock edit",
                    new_colors: [],
                    segments: [{ id: 0, colors: [7] }],
                  }),
                },
              ],
            },
          ],
        },
        input,
      );
      return {
        segments: JSON.parse(request.input[0].content[0].text)
          .editable_segments,
        proposal: result.proposal,
      };
    });
    assert.deepEqual(fixed.segments, [{ id: 0, x: 1, y: 0, length: 1 }]);
    assert.deepEqual(fixed.proposal.runs, [{ x: 1, y: 0, colors: [7] }]);
    console.log(
      "PASS: packaged fixed-coordinate request and mock response use the local segment map",
    );
    const localTool = await page.evaluate(async () => {
      const { runScript } = await import("/src/script-tools.mjs");
      return runScript("api.setPixel(0,0,1);", {
        width: 1,
        height: 1,
        pixels: [0],
        palette: ["#00000000", "#FFFFFFFF"],
        mask: [true],
        primary: 1,
        secondary: 0,
      });
    });
    assert.deepEqual(localTool.runs, [{ x: 0, y: 0, colors: [1] }]);
    console.log(
      "PASS: packaged local script worker loads through the restricted asset protocol",
    );
    await page.locator("#panel-layout-menu > summary").click();
    await page.locator('[data-show-panel="animation"]').click();
    await page.locator("#animation-add").click();
    await page.waitForFunction(() => document.querySelectorAll(".animation-frame").length === 2);
    assert.equal(await page.locator("#animation-grid canvas").count(), 0);
    assert.equal(await page.locator('#animation-play [data-icon="play"]').count(), 1);
    await page.locator("#motion-open").click(); await page.locator("#motion-prompt").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#motion-open").evaluate(el => el === document.activeElement), true);
    await page.locator("#undo-btn").click();
    await page.waitForFunction(() => document.querySelectorAll(".animation-frame").length === 1);
    console.log("PASS: packaged compact timeline loads icons, duplicates/undoes frames and opens/closes the AI popover");
    await page.locator("#new-btn").click();
    await page.locator("#new-width").fill("12");
    await page.locator("#new-height").fill("24");
    await page.locator("#new-name").fill("Restore check");
    await page.locator('#new-form button[type="submit"]').click();
    page = await require("./next-editor.cjs")(app,page);
    await page.waitForFunction(
      () =>
        document.getElementById("dimension-badge").textContent === "12 × 24",
    );
    const box = await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.click(box.x + box.width / 24, box.y + box.height / 48);
    await page.waitForFunction(
      () =>
        document.getElementById("save-status").textContent ===
        "복구본 저장됨",
    );
    const before = JSON.parse(
      await fs.readFile(await require("./draft-file.cjs")(page,profile), "utf8"),
    );
    assert.equal(before.version, 2);
    assert.notEqual(
      before.layers.find((layer) => layer.id === before.activeLayerId)
        .pixels[0],
      0,
    );
    const previewEvent = app.waitForEvent("window");
    await page.locator("#inspector-preview").click();
    await page.locator("#preview-open").click();
    await page.locator("#inspector-ai").click();
    const preview = await previewEvent;
    await preview.waitForFunction(() =>
      document.getElementById("status").textContent.includes("12 × 24"),
    );
    assert.equal(
      await preview.locator("#preview-4").evaluate((c) => c.style.width),
      "48px",
    );
    await app.close();
    app = await electron.launch({ executablePath, args: [], env });
    page = await require("./first-editor.cjs")(app);
    await page.waitForFunction(
      () => document.getElementById("doc-name").value === "Restore check",
    );
    const after = JSON.parse(
      await fs.readFile(await require("./draft-file.cjs")(page,profile), "utf8"),
    );
    assert.deepEqual(after, before);
    await require("./editor-ready.cjs")(page);
    assert.equal((await page.evaluate(()=>window.pixeltool.getSettings())).provider,"none");
    await page.locator("#settings-btn").click();
    await page.locator("#settings-dialog").waitFor({state:"visible"});
    assert.equal(await page.locator("#provider-input").inputValue(), "none");
    assert.equal(
      await page.locator("#model-input").inputValue(),
      "gpt-6-astra",
    );
    console.log(
      "PASS: packaged Windows executable starts; custom sizes and autosave survive restart; settings load",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
