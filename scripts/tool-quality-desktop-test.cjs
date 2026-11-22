if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("tool-quality-"),
    file = path.join(profile, "draft.json");
  const { createDocument, ensureLayers, validateDocument } =
    await import("../src/core.mjs");
  const initial = ensureLayers(createDocument(16, 16));
  initial.pixels[3 * 16 + 4] = 14;
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
    return validateDocument(
      JSON.parse(
        await fs.readFile(
          await require("./draft-file.cjs")(page, profile),
          "utf8",
        ),
      ),
    );
  };
  const canvasBytes = (id) =>
    page
      .locator(id)
      .evaluate((c) => [
        ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
      ]);
  try {
    await start();
    await page.locator("#brush-details > summary").click();
    await page.locator("#pixel-perfect").check();
    const b = await page.locator("#overlay-canvas").boundingBox(),
      pt = (x, y) => [
        b.x + ((x + 0.5) * b.width) / 16,
        b.y + ((y + 0.5) * b.height) / 16,
      ];
    await page.mouse.move(...pt(3, 3));
    await page.mouse.down();
    await page.mouse.move(...pt(4, 3));
    await page.mouse.move(...pt(4, 4));
    await page.mouse.up();
    const painted = await draft();
    assert.equal(painted.pixels[3 * 16 + 4], 14);
    assert.equal(painted.pixels[3 * 16 + 3], 7);
    assert.equal(painted.pixels[4 * 16 + 4], 7);
    await page.locator("#undo-btn").click();
    assert.deepEqual((await draft()).pixels, initial.pixels);
    await page.locator("#redo-btn").click();
    assert.deepEqual((await draft()).pixels, painted.pixels);
    await page.mouse.move(...pt(6, 6));
    await page.mouse.down();
    await page.mouse.move(...pt(7, 6));
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual((await draft()).pixels, painted.pixels);
    await app.close();
    app = null;
    await start();
    assert.ok(await page.locator("#pixel-perfect").isChecked());
    await page.locator("#geometry-open").click();
    await page.locator("#geometry-kind").selectOption("box");
    const original = await canvasBytes("#geometry-canvas");
    await page.locator("#geometry-lighting > summary").click();
    await page.locator("#geometry-light-enabled").check();
    assert.notDeepEqual(await canvasBytes("#geometry-canvas"), original);
    const lit = await canvasBytes("#geometry-canvas"),
      pad = await page.locator("#geometry-light-pad").boundingBox();
    await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2);
    await page.mouse.down();
    await page.mouse.move(pad.x + pad.width * 0.85, pad.y + pad.height * 0.7);
    await page.mouse.up();
    assert.notDeepEqual(await canvasBytes("#geometry-canvas"), lit);
    await page.locator("#geometry-undo").click();
    assert.deepEqual(await canvasBytes("#geometry-canvas"), lit);
    await page.locator("#geometry-redo").click();
    const lightBeforeCancel = await canvasBytes("#geometry-canvas");
    await page.mouse.move(pad.x + pad.width * 0.1, pad.y + pad.height * 0.4);
    await page.mouse.down();
    await page.keyboard.press("Control+z");
    await page.mouse.up();
    assert.deepEqual(await canvasBytes("#geometry-canvas"), lightBeforeCancel);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "tool-quality-lighting.png"),
    });
    const layout = await page
        .locator(".geometry-settings-scroll")
        .boundingBox(),
      footer = await page.locator(".geometry-footer").boundingBox();
    assert.ok(
      layout.y + layout.height <= footer.y + 1,
      JSON.stringify({ layout, footer }),
    );
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await page.screenshot({
      path: path.join(root, "artifacts", "tool-quality-lighting-light.png"),
    });
    assert.deepEqual(await canvasBytes("#geometry-canvas"), lightBeforeCancel);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    await page.locator("#geometry-create").click();
    const guide = (await draft()).layers.at(-1).geometryGuide;
    assert.ok(guide.lighting);
    await app.close();
    app = null;
    await start();
    assert.deepEqual(
      (await draft()).layers.at(-1).geometryGuide.lighting,
      guide.lighting,
    );
    // Plain repeating tile diagnostic never changes the image bytes.
    await page.locator("#new-btn").click();
    await page.locator("#tile-open").click();
    await page.locator("#tile-create").click();
    page = await require("./next-editor.cjs")(app, page);
    const tile = await draft();
    await page.locator("#tile-check").click();
    const pixels = await canvasBytes("#tile-large-preview");
    await page.locator("#tile-diagnostics").check();
    assert.ok(await page.locator("#tile-diagnostic-summary").isVisible());
    assert.deepEqual(await canvasBytes("#tile-large-preview"), pixels);
    assert.deepEqual(await draft(), tile);
    await page.screenshot({
      path: path.join(root, "artifacts", "tool-quality-tile-diagnostics.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "Pixel-perfect strokes, undo/redo/cancel/restart, directional light drag/history/file round trip and view-only tile diagnostic passed.",
    );
  } finally {
    await app?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
