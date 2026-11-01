if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("placement-state-");
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
  const errors = [];
  const ready = async () => {
    page =
      (await require("./mock-pixel-clipboard.cjs")(app),
      await require("./first-editor.cjs")(app));
    page.setDefaultTimeout(5000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
  };
  const key = (k) => page.keyboard.press(k);
  const focus = () => page.locator("#overlay-canvas").focus();
  const pixels = () =>
    page
      .locator("#pixel-canvas")
      .evaluate((c) => [
        ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
      ]);
  const point = async (x, y) => {
    const b = await page.locator("#overlay-canvas").boundingBox();
    return [
      b.x + ((x + 0.5) * b.width) / 16,
      b.y + ((y + 0.5) * b.height) / 16,
    ];
  };
  const pending = () => page.locator("#placement-actions").isVisible();
  const start = async () => {
    await focus();
    await key("ArrowRight");
    assert.ok(await pending());
  };
  const saved = () =>
    page.waitForFunction(() =>
      document
        .getElementById("save-status")
        .textContent.includes("임시 위치 저장됨"),
    );
  const stored = async () => {
    await page.waitForFunction(
      () =>
        document.getElementById("save-status").textContent ===
        "복구본 저장됨",
    );
    return JSON.parse(
      await fs.readFile(path.join(profile, "draft.json"), "utf8"),
    );
  };
  const shortcuts = async () => {
    await page.locator("#settings-btn").click();
    await page.locator('[data-settings-tab="editor"]').click();
    await page.locator("#shortcut-open").click();
  };
  const saveShortcuts = async () => {
    await page.locator("#shortcut-save").click();
    await page.locator("#settings-dialog .dialog-close").first().click();
  };
  try {
    await ready();
    await page.locator("#palette button").nth(7).click();
    await page.mouse.click(...(await point(1, 1)));
    await page.locator("#palette button").nth(8).click();
    await page.mouse.click(...(await point(2, 1)));
    await page.locator('[data-tool="select"]').click();
    await page.mouse.move(...(await point(1, 1)));
    await page.mouse.down();
    await page.mouse.move(...(await point(3, 1)));
    await page.mouse.up();
    const original = await pixels();
    await page.locator("#selection-more > summary").click();
    await page.locator("#transform-action").selectOption("duplicate");
    await start();
    assert.equal(
      await page.locator("#selection-more").evaluate((e) => e.open),
      false,
    );
    await key("Escape");
    assert.equal(await pending(), false);
    assert.deepEqual(await pixels(), original);

    await start();
    await page.locator(".layer-visibility").first().click();
    assert.equal(
      await page
        .locator(".layer-visibility")
        .first()
        .getAttribute("aria-pressed"),
      "false",
    );
    await focus();
    await key("Control+z");
    await key("Control+z");
    assert.deepEqual(await pixels(), original);
    await start();
    await page.locator(".layer-lock").first().click();
    assert.equal((await stored()).layers[0].locked, true);
    await focus();
    await key("Control+z");
    await key("Control+z");
    assert.deepEqual(await pixels(), original);

    await start();
    const placed = await pixels();
    await page.locator("#refine-open").click();
    await page.locator("#refine-tab-outline").click();
    await page.locator("#refine-cancel").click();
    assert.ok(await pending());
    assert.deepEqual(await pixels(), placed);
    await page.locator("#refine-open").click();
    await page.locator("#refine-tab-silhouette").click();
    await page.locator("#refine-max-area").selectOption("2");
    await page.locator("#refine-select-candidates").click();
    assert.ok(await page.locator("#refine-apply").isEnabled());
    const refined = await pixels();
    await page.locator("#refine-apply").click();
    assert.equal(await pending(), false);
    assert.deepEqual(await pixels(), refined);
    await focus();
    await key("Control+z");
    assert.deepEqual(
      await pixels(),
      original,
      "placement and refinement must undo together",
    );

    await shortcuts();
    await page.locator('[data-command="apply"] [data-slot="0"]').click();
    await key("Control+Alt+Enter");
    await saveShortcuts();
    await start();
    await key("Enter");
    assert.equal(await pending(), false);
    await key("Control+z");
    await shortcuts();
    await page
      .locator('[data-command="placement-confirm"] [data-slot="0"]')
      .click();
    await key("Control+Alt+p");
    await saveShortcuts();
    await start();
    assert.equal(
      await page.locator("#placement-apply kbd").textContent(),
      "Ctrl+Alt+P",
    );
    await key("Enter");
    assert.ok(await pending());
    await key("Control+Alt+p");
    assert.equal(await pending(), false);
    await key("Control+z");
    await shortcuts();
    await page
      .locator('[data-command="placement-confirm"] .shortcut-command-reset')
      .click();
    await saveShortcuts();

    await focus();
    await key("Control+c");
    await page.mouse.move(...(await point(5, 1)));
    await key("Control+v");
    await key("ArrowRight");
    await saved();
    const preview = await pixels(),
      originalDraft = await fs.readFile(
        path.join(profile, "draft.json"),
        "utf8",
      ),
      recovery = await fs.readFile(
        path.join(profile, "placement.json"),
        "utf8",
      );
    assert.ok(JSON.parse(recovery).clip);
    assert.equal(JSON.parse(recovery).document, undefined);
    await app.close();
    app = await launch();
    await ready();
    await page.waitForSelector("#placement-actions:not([hidden])");
    await saved();
    assert.deepEqual(await pixels(), preview);
    assert.equal(
      await fs.readFile(path.join(profile, "draft.json"), "utf8"),
      originalDraft,
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "placement-restored.png"),
    });
    await focus();
    await key("Escape");
    assert.deepEqual(await pixels(), original);
    await app.close();
    await assert.rejects(fs.access(path.join(profile, "placement.json")));
    const changed = JSON.parse(originalDraft);
    changed.name = "Changed source";
    await fs.writeFile(
      path.join(profile, "draft.json"),
      JSON.stringify(changed),
    );
    await fs.writeFile(path.join(profile, "placement.json"), recovery);
    app = await launch();
    await ready();
    await page.waitForFunction(
      () => document.getElementById("doc-name").value === "Changed source",
    );
    assert.equal(await pending(), false);
    assert.deepEqual(await pixels(), original);
    await assert.rejects(fs.access(path.join(profile, "placement.json")));
    assert.deepEqual(errors, []);
    console.log(
      "PASS: first Escape cancels duplicate placement; layer toggles apply once; refinement cancel preserves placement and combined apply undoes atomically; contextual shortcuts and hints; paste recovery/restart/cancel/stale-source rejection",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
