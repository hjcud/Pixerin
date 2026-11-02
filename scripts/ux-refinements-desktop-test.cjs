if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("ux-refinements-"),
    file = path.join(profile, "draft.json");
  const { createDocument, ensureLayers, activeLayer, validateDocument } =
    await import("../src/core.mjs");
  const { createAutotile, renderAutotile } =
    await import("../src/autotile.mjs");
  const initial = ensureLayers(createDocument(16, 16));
  initial.pixels.fill(7);
  await fs.writeFile(file, JSON.stringify(initial));
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const errors = [];
  const start = async () => {
    app = await _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
    page = await require("./first-editor.cjs")(app);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    await page.waitForFunction(() =>
      document
        .querySelector("#save-status")
        .textContent.includes("복구본 저장됨"),
    );
  };
  const draft = async () => {
    await page.waitForFunction(() =>
      document
        .querySelector("#save-status")
        .textContent.includes("복구본 저장됨"),
    );
    return validateDocument(JSON.parse(await fs.readFile(file, "utf8")));
  };
  try {
    await start();
    await page.locator("#refine-open").click();
    await page.locator("#refine-protection > summary").click();
    await page.locator("#refine-protect-paint").click();
    const b = await page.locator("#refine-before-overlay").boundingBox();
    await page.mouse.click(
      b.x + (b.width * 5.5) / 16,
      b.y + (b.height * 5.5) / 16,
    );
    assert.equal(
      await page.locator("#refine-apply").textContent(),
      "보호 영역 저장",
    );
    await page.locator("#refine-apply").click();
    let saved = await draft();
    assert.equal(activeLayer(saved).refinementProtection[85], true);
    assert.deepEqual(saved.pixels, initial.pixels);
    await page.locator("#undo-btn").click();
    assert.equal(activeLayer(await draft()).refinementProtection, undefined);
    await page.locator("#redo-btn").click();
    assert.equal(activeLayer(await draft()).refinementProtection[85], true);
    await page.locator("#layer-duplicate").click();
    const duplicate = await draft();
    assert.equal(duplicate.layers.length, 2);
    assert.equal(activeLayer(duplicate).refinementProtection[85], true);
    await page.locator("#refine-open").click();
    await page.locator("#refine-protection > summary").click();
    await page.locator("#refine-protect-clear").click();
    await page.locator("#refine-apply").click();
    assert.equal((await draft()).layers[0].refinementProtection[85], true);
    await page.locator("#undo-btn").click();
    await page.locator("#undo-btn").click();
    await app.close();
    app = null;
    await start();
    await page.locator("#refine-open").click();
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "1px",
    );
    await page.locator("#refine-protection > summary").click();
    await page.locator("#refine-protect-clear").click();
    await page.locator("#refine-cancel").click();
    assert.equal(activeLayer(await draft()).refinementProtection[85], true);
    await page.locator("#refine-open").click();
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "1px",
    );
    await page.locator("#refine-protection > summary").click();
    await page.locator("#refine-protect-clear").click();
    await page.locator("#refine-apply").click();
    assert.equal(activeLayer(await draft()).refinementProtection, undefined);
    await app.close();
    app = null;
    const auto = createAutotile(
      16,
      "Grass",
      "Soil",
      Array(256).fill("#508A42FF"),
      Array(256).fill("#926443FF"),
    );
    await fs.writeFile(file, JSON.stringify(auto));
    await start();
    const prompt = "Keep this hand-written description";
    await page.locator("#prompt").fill(prompt);
    for (const role of ["horizontal", "inner", "full"]) {
      await page.locator(`[data-source="${role}"]`).click();
      assert.equal(await page.locator("#prompt").inputValue(), prompt);
    }
    await page.locator("#auto-pin-preview").click();
    assert.ok(await page.locator("#auto-live-preview").isVisible());
    await page.locator("#palette button").nth(2).click();
    const c = await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.click(
      c.x + (c.width * 2.5) / 16,
      c.y + (c.height * 2.5) / 16,
    );
    assert.ok((await page.locator("#auto-live-highlights i").count()) > 0);
    const painted = await draft(),
      expected = renderAutotile(painted, "map");
    const actual = await page
      .locator("#auto-live-map")
      .evaluate((c) =>
        Array.from(
          c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ),
      );
    assert.deepEqual(actual, Array.from(expected.data));
    const before = JSON.stringify(painted);
    await page.keyboard.press("m");
    await page.mouse.move(c.x + c.width * 0.2, c.y + c.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width * 0.4, c.y + c.height * 0.4);
    await page.mouse.up();
    const scope = await page.locator("#scope-badge").textContent();
    await page.locator("#auto-live-map").click();
    assert.equal(await page.locator("#scope-badge").textContent(), scope);
    await page.locator("#auto-live-map").hover();
    const zoom = await page.locator("#zoom-label").textContent();
    await page.mouse.wheel(0, 120);
    assert.equal(await page.locator("#zoom-label").textContent(), zoom);
    assert.equal(JSON.stringify(await draft()), before);
    await page.screenshot({
      path: path.join(root, "artifacts", "ux-refinements-tiles.png"),
    });
    await page.locator("#auto-live-open").click();
    assert.ok(await page.locator("#auto-workbench").isVisible());
    await page.locator("#auto-workbench .dialog-close").click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-theme").selectOption("light");
    await page.locator('#settings-form button[type="submit"]').click();
    const panel = await page.locator("#auto-live-preview").boundingBox();
    const selectionBar = await page.locator("#selection-popover").boundingBox();
    assert.ok(panel.y + panel.height <= selectionBar.y);
    assert.ok(
      panel.x >= 0 &&
        panel.y >= 0 &&
        panel.x + panel.width <= 1100 &&
        panel.y + panel.height <= 740,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "ux-refinements-small-light.png"),
    });
    await app.close();
    app = null;
    await start();
    assert.ok(await page.locator("#auto-live-preview").isVisible());
    await page.locator("#auto-live-close").click();
    assert.ok(await page.locator("#auto-live-preview").isHidden());
    assert.deepEqual(errors, []);
    console.log(
      "PASS: protection-only save/undo/redo/restart/cancel/clear, unchanged artwork, prompt preservation, live assembled map, changed-cell highlights, view-only controls and remembered pin.",
    );
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
