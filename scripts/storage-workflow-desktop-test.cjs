if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile =
      await require("./test-runner.cjs").createProfile("storage-workflow-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const original = ensureLayers(createDocument(16, 16, "Recovery fixture"));
  original.pixels[17] = 7;
  await fs.writeFile(
    path.join(profile, "draft.json"),
    JSON.stringify(original),
  );
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  try {
    let page = await require("./first-editor.cjs")(app);
    console.log("Check: editor ready");
    page.setDefaultTimeout(10000);
    const canvas = page.locator("#overlay-canvas");
    await canvas.focus();
    await page.keyboard.press("Control+k");
    await page.locator("#command-query").fill("eraser");
    await page.keyboard.press("Enter");
    assert.ok(
      await page
        .locator('[data-tool="eraser"]')
        .evaluate((e) => e.classList.contains("active")),
    );
    await page.keyboard.press("Control+Shift+f");
    assert.equal(await page.locator(".tools-panel").isVisible(), false);
    await page.keyboard.press("Tab"); // Keyboard focus remains navigable.
    await page.keyboard.press("Control+Shift+f");
    assert.ok(await page.locator(".tools-panel").isVisible());
    await page.locator('[data-tool="select"]').click();
    const b = await canvas.boundingBox();
    await page.mouse.move(
      b.x + (b.width * 1.5) / 16,
      b.y + (b.height * 1.5) / 16,
    );
    await page.mouse.down();
    await page.mouse.move(
      b.x + (b.width * 3.5) / 16,
      b.y + (b.height * 3.5) / 16,
    );
    assert.match(await page.locator("#selection-summary").textContent(), /9/);
    await page.mouse.up();
    await canvas.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() =>
      document
        .querySelector("#save-status")
        .textContent.includes("임시 위치 저장됨"),
    );
    await page.waitForFunction(() =>
      document
        .querySelector(".work-tab-select")
        .title.includes("위치 확정 대기"),
    );
    const preview = await page
      .locator("#pixel-canvas")
      .evaluate((c) => c.toDataURL());
    await app.evaluate(() => {
      const io = process.getBuiltinModule("fs/promises");
      globalThis.storageRename = io.rename;
      globalThis.failPlacement = true;
      io.rename = async (from, to) => {
        if (String(to).endsWith("placement.json")) {
          await new Promise((r) => setTimeout(r, 350));
          if (globalThis.failPlacement)
            throw Object.assign(new Error("Simulated placement disk failure"), {
              code: "ENOSPC",
            });
        }
        return globalThis.storageRename(from, to);
      };
    });
    console.log("Check: request flush");
    const flush = await app.evaluate(
      ({ webContents, ipcMain }) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Flush acknowledgement timed out")),
            8000,
          );
          const editor = webContents
            .getAllWebContents()
            .find((c) => c.getURL() === "pixeltool://app/index.html");
          const channel =
            "workspace:flush-reply:" +
            process.getBuiltinModule("crypto").randomUUID();
          const start = Date.now();
          ipcMain.once(channel, (_e, ok) => {
            clearTimeout(timer);
            resolve({ ok, ms: Date.now() - start });
          });
          editor.send("workspace:flush-request", channel);
        }),
    );
    assert.equal(flush.ok, false, "flush rejects a delayed placement failure");
    assert.ok(flush.ms >= 350, "flush waits for the actual save");
    await page.locator("#autosave-retry").waitFor({ state: "visible" });
    assert.match(
      await page.locator("#save-status").getAttribute("title"),
      /Simulated placement disk failure/,
    );
    await app.evaluate(() => {
      globalThis.failPlacement = false;
    });
    await page.locator("#autosave-retry").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#save-status")
        .textContent.includes("임시 위치 저장됨"),
    );
    assert.equal(
      await page.locator("#pixel-canvas").evaluate((c) => c.toDataURL()),
      preview,
    );
    assert.ok(await page.locator("#autosave-retry").isHidden());
    await app.evaluate(() => {
      process.getBuiltinModule("fs/promises").rename = globalThis.storageRename;
      delete globalThis.storageRename;
    });
    console.log("Check: placement flush and retry verified");
    // A real crashed renderer restores persisted placement on the same document.
    await app.evaluate(({ dialog, webContents }) => {
      globalThis.storageDialog = dialog.showMessageBox;
      dialog.showMessageBox = async () => ({ response: 0 });
      webContents
        .getAllWebContents()
        .find((c) => c.getURL() === "pixeltool://app/index.html")
        .forcefullyCrashRenderer();
    });
    await new Promise((r) => setTimeout(r, 700));
    page = await require("./first-editor.cjs")(app);
    await page.locator("#placement-actions").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#pixel-canvas").evaluate((c) => c.toDataURL()),
      preview,
    );
    console.log("Check: renderer recovered");
    const recoveredId = (
      await page.evaluate(() => window.pixeltool.workspaceState())
    ).id;
    await app.evaluate(({ dialog, webContents }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
      webContents
        .getAllWebContents()
        .find((c) => c.getURL() === "pixeltool://app/index.html")
        .forcefullyCrashRenderer();
    });
    // Declining recovery leaves a usable blank tab, with the crashed work retained.
    await new Promise((r) => setTimeout(r, 500));
    page = await require("./first-editor.cjs")(app);
    const deferred = await page.evaluate(() =>
      window.pixeltool.workspaceState(),
    );
    assert.notEqual(deferred.id, recoveredId);
    assert.equal(deferred.tabs.find((t) => t.id === recoveredId).crashed, true);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 0 });
    });
    await page.evaluate(
      (id) => window.pixeltool.workspaceCommand({ action: "activate", id }),
      recoveredId,
    );
    page = await require("./first-editor.cjs")(app);
    assert.equal(
      (await page.evaluate(() => window.pixeltool.workspaceState())).id,
      recoveredId,
    );
    assert.equal(
      await page.locator("#pixel-canvas").evaluate((c) => c.toDataURL()),
      preview,
    );
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Escape");
    const closed = page.waitForEvent("close");
    await page.keyboard.press("Control+w");
    await page.locator("#confirm-skip").click();
    await closed;
    page = await require("./first-editor.cjs")(app);
    console.log("Check: document closed");
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Control+Shift+t");
    // Locate the reopened document explicitly; first-editor chooses the active view.
    for (let i = 0; i < 100; i++) {
      page = await require("./first-editor.cjs")(app);
      if ((await page.locator("#doc-name").inputValue()) === "Recovery fixture")
        break;
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.equal(
      await page.locator("#doc-name").inputValue(),
      "Recovery fixture",
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await page.locator("#command-search").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "command-search.png"),
    });
    await page.keyboard.press("Escape");
    await page.evaluate(async () => {
      const s = await window.pixeltool.getSettings();
      await window.pixeltool.savePreferences({
        ...s.preferences,
        language: "de",
        theme: "light",
      });
    });
    await page.waitForFunction(() => document.documentElement.lang === "de");
    await page.locator("#command-search").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "command-search-light-de.png"),
    });
    await page.keyboard.press("Escape");
    console.log(
      "PASS: command search, focus mode, live selection, delayed placement failure/await/retry, tab state, real renderer crash recovery, reopen closed work",
    );
  } catch (error) {
    console.error("Native check failed:", error);
    throw error;
  } finally {
    await app
      .evaluate(({ dialog }) => {
        if (globalThis.storageRename)
          process.getBuiltinModule("fs/promises").rename =
            globalThis.storageRename;
        if (globalThis.storageDialog)
          dialog.showMessageBox = globalThis.storageDialog;
      })
      .catch(() => {});
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
