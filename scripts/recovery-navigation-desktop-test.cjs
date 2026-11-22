if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile(
      "recovery-navigation-",
    );
  const { createDocument } = await import("../src/core.mjs");
  const { RecoveryStore } = await import("../electron/recovery.mjs");
  const doc = createDocument(16, 16, "Navigation fixture");
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
  const id = require("node:crypto").randomUUID(),
    dir = path.join(profile, "documents", id),
    project = path.join(profile, "saved.pixeltool");
  const write = async (file, value) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, value);
  };
  await write(project, JSON.stringify(doc));
  const store = new RecoveryStore(path.join(dir, "recovery"), write);
  store.start(project);
  await store.record(doc, true);
  await write(path.join(dir, "draft.json"), JSON.stringify(doc));
  for (const file of [
    "draft.json",
    "recovery/session.json",
    `recovery/${store.id}.json`,
  ]) {
    const old = new Date(Date.now() - 45 * 86400000);
    await fs.utimes(path.join(dir, file), old, old);
  }
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  let page;
  try {
    page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(10000);
    await page.locator("#command-search").click();
    assert.equal(
      await page.locator('[data-command-id="apply"]').isDisabled(),
      true,
    );
    assert.equal(
      await page.locator('[data-command-id="undo"]').isDisabled(),
      true,
    );
    await page.locator("#command-query").fill("zoom");
    const enabled = page.locator("#command-results button:not(:disabled)");
    const last = await enabled.last().getAttribute("data-command-id");
    await page.keyboard.press("ArrowUp");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.commandId),
      last,
    );
    await page.keyboard.press("Escape");
    await page.locator('[data-tool="select"]').click();
    const canvas = page.locator("#overlay-canvas"),
      b = await canvas.boundingBox();
    await page.mouse.move(
      b.x + (b.width * 1.5) / 16,
      b.y + (b.height * 2.5) / 16,
    );
    await page.mouse.down();
    await page.mouse.move(
      b.x + (b.width * 4.5) / 16,
      b.y + (b.height * 6.5) / 16,
    );
    await page.mouse.up();
    assert.match(
      await page.locator("#selection-dimensions").textContent(),
      /4 × 5, X 1, Y 2/,
    );
    const before = await page
      .locator("#pixel-canvas")
      .evaluate((c) => c.toDataURL());
    await page.locator("#corner-preview > summary").click();
    await page.locator("#corner-scale-3").click();
    const nav = page.locator("#navigator"),
      n = await nav.boundingBox();
    const position = () =>
      page
        .locator(".canvas-surround")
        .evaluate((el) => [el.style.left, el.style.top]);
    const initial = await position();
    await page.mouse.move(n.x + n.width * 0.75, n.y + n.height * 0.25);
    await page.mouse.down();
    assert.notDeepEqual(await position(), initial);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(await position(), initial);
    await nav.focus();
    await page.keyboard.press("ArrowRight");
    assert.notDeepEqual(await position(), initial);
    assert.equal(
      await page.locator("#pixel-canvas").evaluate((c) => c.toDataURL()),
      before,
    );
    assert.match(
      await page.locator("#selection-dimensions").textContent(),
      /4 × 5/,
    );
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-storage").click();
    await page.locator("#storage-preview").click();
    await page.waitForFunction(
      () => !document.getElementById("storage-clean").disabled,
    );
    assert.equal(await page.locator("#storage-candidates li").count(), 1);
    await page.locator("#pref-recoveryRetentionDays").fill("60");
    assert.equal(await page.locator("#storage-clean").isDisabled(), true);
    await page.locator("#pref-recoveryRetentionDays").fill("30");
    await page.locator("#storage-preview").click();
    await page.waitForFunction(
      () => !document.getElementById("storage-clean").disabled,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "recovery-storage-settings.png"),
    });
    await page.locator("#storage-clean").click();
    await page.waitForFunction(() =>
      document
        .getElementById("storage-result")
        .textContent.includes("1개 정리"),
    );
    await assert.rejects(fs.stat(dir), { code: "ENOENT" });
    assert.deepEqual(JSON.parse(await fs.readFile(project)), doc);
    await page.locator("#settings-dialog .dialog-close").first().click();
    await page.evaluate(async () => {
      const s = await window.pixeltool.getSettings();
      await window.pixeltool.savePreferences({
        ...s.preferences,
        language: "de",
        theme: "light",
      });
    });
    await page.waitForFunction(() => document.documentElement.lang === "de");
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-storage").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "recovery-storage-light-de.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: disabled commands/reasons, ArrowUp, live selection dimensions, navigator drag/Escape/keys without pixel edits, storage preview/invalidation/cleanup, source preservation, German light UI",
    );
  } catch (error) {
    if (page)
      console.error(
        "Focus at failure:",
        await page
          .evaluate(() => ({
            focused: document.hasFocus(),
            active: document.activeElement?.id,
            visibility: document.visibilityState,
          }))
          .catch(() => null),
      );
    throw error;
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
