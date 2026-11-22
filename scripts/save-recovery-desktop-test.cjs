if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("save-recovery-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(16, 16, "Saved project"));
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
  const file = path.join(profile, "first.pixeltool"),
    second = path.join(profile, "second.pixeltool");
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
    await app.evaluate(({ dialog }, file) => {
      globalThis.saveDialogs = 0;
      globalThis.nextSave = file;
      globalThis.externalWarnings = 0;
      dialog.showSaveDialog = async () => {
        globalThis.saveDialogs++;
        return globalThis.nextSave
          ? { canceled: false, filePath: globalThis.nextSave }
          : { canceled: true };
      };
      dialog.showMessageBox = async () => {
        globalThis.externalWarnings++;
        return { response: 0 };
      };
    }, file);
  };
  const saved = () =>
    page.waitForFunction(() => !document.querySelector(".workspace").inert);
  const draw = async () => {
    const b = await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.click(b.x + b.width * 0.4, b.y + b.height * 0.4);
    await page.waitForFunction(() =>
      document
        .querySelector("#save-status")
        .textContent.includes("복구본 저장됨"),
    );
  };
  try {
    await start();
    await page.keyboard.press("Control+s");
    await saved();
    assert.equal(await app.evaluate(() => globalThis.saveDialogs), 1);
    await draw();
    await page.keyboard.press("Control+s");
    await saved();
    assert.equal(await app.evaluate(() => globalThis.saveDialogs), 1);
    assert.ok(
      JSON.parse(await fs.readFile(file, "utf8")).layers[0].pixels.some(
        (v) => v !== 0,
      ),
    );
    await app.evaluate(() => {
      globalThis.nextSave = null;
    });
    await page.keyboard.press("Control+Shift+s");
    await saved();
    assert.equal(await app.evaluate(() => globalThis.saveDialogs), 2);
    await page.keyboard.press("Control+s");
    await saved();
    assert.equal(await app.evaluate(() => globalThis.saveDialogs), 2);
    await app.evaluate((_, file) => {
      globalThis.nextSave = file;
    }, second);
    await page.locator("#file-more summary").click();
    await page.locator("#save-as-btn").click();
    await saved();
    assert.equal(
      await fs.readFile(second, "utf8"),
      await fs.readFile(file, "utf8"),
    );
    // Keep an unsaved edit, then verify startup recovery retains its file destination.
    await page.locator("#doc-name").fill("Recovered edit");
    await page.locator("#doc-name").blur();
    await page.waitForFunction(() =>
      document
        .querySelector("#save-status")
        .textContent.includes("복구본 저장됨"),
    );
    await app.close();
    app = null;
    await start();
    assert.equal(
      await page.locator("#doc-name").inputValue(),
      "Recovered edit",
    );
    const entries = await page.evaluate(() => window.pixeltool.listRecovery());
    const entry = entries.find((e) => e.name === "Recovered edit");
    assert.ok(entry.hasSaved);
    await page.keyboard.press("Control+s");
    await saved();
    assert.equal(await app.evaluate(() => globalThis.saveDialogs), 0);
    assert.equal(
      JSON.parse(await fs.readFile(second, "utf8")).name,
      "Recovered edit",
    );
    // Select a historical file save from the recovery UI; open it as a new work item.
    await page.locator("#file-more summary").click();
    await page.locator("#recovery-open").click();
    await page
      .locator(".recovery-entry")
      .filter({ has: page.locator("strong", { hasText: "Saved project" }) })
      .first()
      .locator('[data-version="saved"]')
      .click();
    page = await require("./next-editor.cjs")(app, page);
    await page.waitForFunction(
      () => document.querySelector("#doc-name").value === "Saved project",
    );
    await page.keyboard.press("Control+s");
    await saved();
    assert.equal(await app.evaluate(() => globalThis.saveDialogs), 1);
    // Externally changed files cannot be silently overwritten by plain Save.
    await fs.writeFile(
      file,
      JSON.stringify({ ...doc, name: "External change" }),
    );
    await app.evaluate(
      (_, file) => {
        globalThis.nextSave = file;
      },
      path.join(profile, "safe-copy.pixeltool"),
    );
    await page.keyboard.press("Control+s");
    await saved();
    assert.equal(await app.evaluate(() => globalThis.externalWarnings), 1);
    assert.equal(
      JSON.parse(await fs.readFile(file, "utf8")).name,
      "External change",
    );
    // Repeating modes preserve a user prompt on conversion and edge selection.
    await page.locator("#prompt").fill("My original request");
    await page.locator("#new-btn").click();
    await page.locator("#tile-open").click();
    await page.locator("#tile-use-current").click();
    assert.equal(
      await page.locator("#prompt").inputValue(),
      "My original request",
    );
    await page.locator("#tile-edges-quick").click();
    assert.equal(
      await page.locator("#prompt").inputValue(),
      "My original request",
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    const labels = await page
      .locator(".tool > span:nth-child(2)")
      .evaluateAll((es) =>
        es.map((e) => ({
          height: e.getBoundingClientRect().height,
          line: parseFloat(getComputedStyle(e).lineHeight),
          clipped: e.scrollWidth > e.clientWidth,
        })),
      );
    assert.ok(labels.every((e) => e.height <= e.line + 1 && !e.clipped));
    await page.locator("#file-more summary").click();
    await page.locator("#recovery-open").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "save-recovery-small-dark.png"),
    });
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    console.log(
      "Save, Save As, cancel, recovery/restart, external changes, prompt preservation and narrow tool layout passed.",
    );
  } finally {
    await app?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
