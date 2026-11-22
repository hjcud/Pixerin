if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("workspace-profile-");
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  try {
    const page = await require("./first-editor.cjs")(app),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () => document.body.dataset.showHints === "false",
    );
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const before = await pixels();
    assert.equal(await page.locator("#selection-toolbar").isVisible(), false);
    assert.equal(await page.locator("#shade-strip").isVisible(), false);
    assert.equal(await page.locator(".tool kbd").first().isVisible(), false);
    assert.match(
      await page.locator('[data-tool="pencil"]').getAttribute("title"),
      /B/,
    );
    await page.locator("#shade-options > summary").click();
    assert.ok(await page.locator("#shade-strip").isVisible());
    await page.locator("#shade-options > summary").click();
    const canvasBounds = await page.locator("#overlay-canvas").boundingBox();
    await page.locator('[data-tool="select"]').click();
    assert.ok(await page.locator("#selection-toolbar").isVisible());
    assert.deepEqual(
      await page.locator("#overlay-canvas").boundingBox(),
      canvasBounds,
    );
    await page.locator("#select-all").click();
    assert.match(await page.locator("#selection-summary").textContent(), /256/);
    await page.locator("#edit-tools-toggle").click();
    assert.equal(await page.locator("#selection-toolbar").isVisible(), false);
    await page.locator("#edit-tools-toggle").click();
    await page.locator("#clear-selection").click();
    await page.locator('[data-tool="pencil"]').click();
    assert.equal(await page.locator("#selection-toolbar").isVisible(), false);
    await page
      .locator("#prompt")
      .fill("Keep this request while switching panels");
    await page.locator("#inspector-preview").click();
    assert.equal(await page.locator("#prompt").isVisible(), false);
    assert.ok(await page.locator("#large-preview").isVisible());
    await page.locator("#inspector-preview").press("ArrowLeft");
    assert.ok(await page.locator("#prompt").isVisible());
    assert.equal(
      await page.locator("#prompt").inputValue(),
      "Keep this request while switching panels",
    );
    await page.locator("#inspector-preview").click();
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("/");
    assert.ok(
      await page
        .locator("#prompt")
        .evaluate((el) => el === document.activeElement),
    );
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-showHints").check();
    await page.locator("#settings-dialog .dialog-close").first().click();
    assert.equal(await page.locator(".tool kbd").first().isVisible(), false);
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-showHints").check();
    await page.locator('#settings-form button[type="submit"]').click();
    await page.waitForFunction(
      () => document.body.dataset.showHints === "true",
    );
    assert.ok(await page.locator(".tool kbd").first().isVisible());
    assert.deepEqual(await pixels(), before);
    await page.reload();
    await page.waitForFunction(
      () => document.body.dataset.showHints === "true",
    );
    assert.equal(
      (await page.evaluate(() => window.pixeltool.getSettings())).preferences
        .showHints,
      true,
    );
    assert.deepEqual(await pixels(), before);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: contextual selection controls, collapsible shades, keyboard-accessible inspector tabs, preserved prompt/pixels, hints save/cancel/reload and tooltips.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
