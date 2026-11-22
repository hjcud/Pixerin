if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("view-convenience-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(16, 16));
  doc.layers[0].alphaLocked = false;
  doc.pixels[0] = 7;
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
  await require("./test-ai-disclosure.cjs")(profile);
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
  let app = await launch();
  try {
    let page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    const read = (id) =>
      page
        .locator("#" + id)
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const original = await read("pixel-canvas");
    await page.locator('[data-tool="select"]').click();
    await page.locator("#select-all").click();
    const selection = await page.locator("#selection-summary").textContent();
    await page.locator("#corner-preview > summary").click();
    await page.locator("#corner-scale-3").click();
    assert.equal(
      await page
        .locator("#corner-preview-canvas")
        .evaluate((c) => c.clientWidth),
      48,
    );
    assert.deepEqual(await read("corner-preview-canvas"), original);
    const zoom = await page.locator("#zoom-label").textContent();
    const overlayBefore = await read("overlay-canvas");
    await page.locator("#grid-peek").focus();
    await page.keyboard.down("Space");
    assert.equal(
      await page.locator("#grid-peek").getAttribute("aria-pressed"),
      "true",
    );
    assert.notDeepEqual(await read("overlay-canvas"), overlayBefore);
    await page.keyboard.up("Space");
    // Theme color transitions can alter selection RGB between frames; grid
    // opacity and geometry must restore exactly while the artwork stays fixed.
    const alpha = (values) => values.filter((_, i) => i % 4 === 3);
    assert.deepEqual(alpha(await read("overlay-canvas")), alpha(overlayBefore));
    assert.deepEqual(await read("pixel-canvas"), original);
    await page.locator("#corner-preview").hover();
    await page.mouse.wheel(0, 100);
    assert.equal(await page.locator("#zoom-label").textContent(), zoom);
    assert.equal(
      await page.locator("#selection-summary").textContent(),
      selection,
    );
    await page.locator("#corner-scale-1").click();
    assert.equal(
      await page
        .locator("#corner-preview-canvas")
        .evaluate((c) => c.clientWidth),
      16,
    );
    await page.locator("#corner-scale-3").click();
    await page.locator(".layer-lock").click();
    assert.match(
      await page.locator("#refine-open").getAttribute("data-disabled-reason"),
      /레이어.*잠겨/,
    );
    await page.locator(".layer-lock").click();
    assert.equal(
      await page.locator("#refine-open").getAttribute("data-disabled-reason"),
      null,
    );
    await page.locator("#alpha-lock-btn").click();
    assert.match(
      await page.locator('[data-tool="eraser"]').getAttribute("title"),
      /투명 잠금/,
    );
    await page.locator("#alpha-lock-btn").click();
    await page.locator("#refine-open").click();
    await page.locator("#refine-levels").fill("5");
    await page.locator("#refine-tab-outline").click();
    await page.locator("#refine-strength").fill("75");
    await page.locator("#refine-palette").selectOption("existing");
    await page.locator("#refine-cancel").click();
    await page.locator("#refine-open").click();
    assert.equal(await page.locator("#refine-levels").inputValue(), "5");
    await page.locator("#refine-tab-outline").click();
    assert.equal(await page.locator("#refine-strength").inputValue(), "75");
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "0px",
    );
    await page.locator("#refine-cancel").click();
    await app.evaluate(
      (_, file) => {
        const { CodexClient } = process.mainModule.require(file);
        CodexClient.prototype.status = async () => ({
          available: true,
          connected: true,
          authType: "chatgpt",
          plan: "pro",
        });
        CodexClient.prototype.requestPatch = async () =>
          new Promise((resolve) => {
            globalThis.__finishView = () =>
              resolve({
                proposal: {
                  summary: "비교 확인",
                  new_colors: [],
                  runs: [{ x: 1, y: 0, colors: [7] }],
                },
              });
          });
      },
      path.join(root, "tests", "fixtures", "legacy-codex.mjs"),
    );
    await page.locator("#prompt").fill("한 픽셀 추가");
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() => document.body.classList.contains("busy"));
    assert.match(
      await page.locator("#refine-open").getAttribute("title"),
      /AI 요청 중/,
    );
    await app.evaluate(() => globalThis.__finishView());
    await page.locator("#proposal-card").waitFor({ state: "visible" });
    assert.match(
      await page.locator("#refine-open").getAttribute("title"),
      /검토 중/,
    );
    const proposed = await read("pixel-canvas");
    assert.notDeepEqual(proposed, original);
    assert.deepEqual(await read("corner-preview-canvas"), proposed);
    const hold = page.locator("#compare-hold"),
      b = await hold.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    assert.deepEqual(await read("pixel-canvas"), original);
    assert.deepEqual(await read("corner-preview-canvas"), original);
    await page.mouse.move(b.x - 10, b.y - 10);
    await page.mouse.up();
    assert.deepEqual(await read("pixel-canvas"), proposed);
    await page.locator("#compare-btn").click();
    await hold.focus();
    await page.keyboard.down("Space");
    await page.keyboard.up("Space");
    assert.deepEqual(await read("pixel-canvas"), original);
    await page.locator("#compare-btn").click();
    await hold.focus();
    await page.keyboard.down("Enter");
    assert.deepEqual(await read("pixel-canvas"), original);
    await page.keyboard.up("Enter");
    assert.ok(await page.locator("#proposal-card").isVisible());
    assert.deepEqual(await read("pixel-canvas"), proposed);
    await hold.focus();
    await page.keyboard.down("Space");
    await page.locator("#diff-btn").focus();
    await page.keyboard.up("Space");
    assert.deepEqual(await read("pixel-canvas"), proposed);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "view-convenience.png"),
    });
    await page.locator("#discard-btn").click();
    assert.deepEqual(await read("pixel-canvas"), original);
    assert.deepEqual(errors, []);
    await app.close();
    app = await launch();
    page = await require("./first-editor.cjs")(app);
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    assert.equal(
      await page.locator("#corner-preview").evaluate((e) => e.open),
      true,
    );
    assert.equal(
      await page
        .locator("#corner-preview-canvas")
        .evaluate((c) => c.clientWidth),
      48,
    );
    await page.locator("#refine-open").click();
    assert.equal(await page.locator("#refine-levels").inputValue(), "5");
    await page.locator("#refine-tab-outline").click();
    assert.equal(await page.locator("#refine-strength").inputValue(), "75");
    assert.equal(
      await page.locator("#refine-palette").inputValue(),
      "existing",
    );
    await page.locator("#refine-reset").click();
    assert.equal(await page.locator("#refine-strength").inputValue(), "40");
    assert.equal(await page.locator("#refine-palette").inputValue(), "new");
    await page.locator("#refine-cancel").click();
    await page.locator("#refine-open").click();
    assert.equal(await page.locator("#refine-levels").inputValue(), "3");
    await page.locator("#refine-cancel").click();
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(profile, "draft.json"), "utf8"))
        .layers,
      JSON.parse(JSON.stringify(doc)).layers,
    );
    console.log(
      "PASS: exact 1x/3x preview and selection/zoom isolation, state-specific disabled reasons, mouse/key/focus-safe momentary comparison, latched comparison preservation, refinement and preview restart persistence, reset and unchanged artwork.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
