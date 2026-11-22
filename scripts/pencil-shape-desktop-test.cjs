if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("pencil-shape-");
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
  let app = await launch(),
    page;
  try {
    page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("#overlay-canvas");
    await require("./editor-ready.cjs")(page);
    await page.locator("#brush-details > summary").click();
    const button = (shape) => page.locator(`[data-pencil-shape="${shape}"]`);
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const colored = async () =>
      (await pixels()).flatMap((v, i) =>
        i % 4 === 3 && v ? [(i - 3) / 4] : [],
      );
    const pos = async (x, y) => {
      const b = await page.locator("#overlay-canvas").boundingBox();
      return {
        x: b.x + ((x + 0.5) * b.width) / 16,
        y: b.y + ((y + 0.5) * b.height) / 16,
      };
    };
    const click = async (x, y, mouseButton = "left") => {
      const p = await pos(x, y);
      await page.mouse.click(p.x, p.y, { button: mouseButton });
    };
    const undo = () => page.locator("#undo-btn").click();
    assert.equal(await button("square").getAttribute("aria-pressed"), "true");
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("]");
    await page.keyboard.press("]");
    await button("circle").click();
    assert.equal(await button("circle").getAttribute("aria-pressed"), "true");
    await click(5, 5);
    const round = await pixels();
    assert.deepEqual(await colored(), [69, 84, 85, 86, 101]);
    assert.ok(await button("square").isEnabled());
    await undo();
    assert.deepEqual(await colored(), []);
    await page.locator("#redo-btn").click();
    assert.deepEqual(await pixels(), round);
    await undo();
    await button("square").click();
    await click(5, 5);
    assert.deepEqual(await colored(), [68, 69, 70, 84, 85, 86, 100, 101, 102]);
    await undo();
    await button("circle").click();
    await page.locator("#palette button").nth(11).click({ button: "right" });
    await click(5, 5, "right");
    assert.deepEqual(
      (await pixels()).slice(85 * 4, 85 * 4 + 4),
      [215, 120, 135, 255],
    );
    assert.deepEqual(await colored(), [69, 84, 85, 86, 101]);
    await undo();
    const start = await pos(3, 5),
      end = await pos(7, 5);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    assert.ok(await button("square").isDisabled());
    await page.mouse.move(end.x, end.y, { steps: 4 });
    await page.mouse.up();
    assert.equal((await colored()).length, 17);
    await undo();
    assert.deepEqual(await colored(), []);
    await page.locator('[data-tool="eraser"]').click();
    assert.ok(await page.locator("#pencil-shape-options").isHidden());
    await page.locator('[data-tool="pencil"]').click();
    assert.equal(await button("circle").getAttribute("aria-pressed"), "true");
    await click(5, 5);
    await page.waitForFunction(async () => {
      const draft = await window.pixeltool.loadDraft();
      const pixels = draft?.layers?.[0]?.pixels;
      return pixels?.[85] === 7 && pixels.filter(Boolean).length === 5;
    });
    await page.reload();
    await page.waitForSelector("#overlay-canvas");
    await page.locator("#brush-details > summary").click();
    assert.equal(await button("circle").getAttribute("aria-pressed"), "true");
    assert.deepEqual(await pixels(), round);
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("]");
    await page.keyboard.press("]");
    const p = await pos(9, 9);
    await page.mouse.move(p.x, p.y);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    const hover = await pos(9, 9);
    await page.mouse.move(hover.x, hover.y);
    await page.screenshot({
      path: path.join(root, "artifacts", "pencil-shape-dark.png"),
    });
    await page.locator("#pencil-shape-options").scrollIntoViewIfNeeded();
    const bounds = await page.locator("#pencil-shape-options").boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 1100 &&
        bounds.y + bounds.height <= 740,
    );
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-theme").selectOption("light");
    await page.locator('#settings-form button[type="submit"]').click();
    await page.screenshot({
      path: path.join(root, "artifacts", "pencil-shape-light.png"),
    });
    assert.deepEqual(errors, []);
    await app.close();
    app = await launch();
    page = await require("./first-editor.cjs")(app);
    await page.waitForSelector("#overlay-canvas");
    await require("./editor-ready.cjs")(page);
    assert.equal(await button("circle").getAttribute("aria-pressed"), "true");
    console.log(
      "PASS: round/square footprints, both colors, atomic stroke undo/redo, locked stroke control, tool scope, persistent shape, small dark/light UI",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
