if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("resize-interaction-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(16, 16, "Resize interaction"));
  doc.pixels[0] = 7;
  doc.pixels[119] = 8;
  doc.layers[0].mask = Array(256).fill(true);
  doc.layers[0].mask[0] = false;
  doc.layers[0].refinementProtection = Array(256).fill(false);
  doc.layers[0].refinementProtection[0] = true;
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
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
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () =>
        document.querySelector("#doc-name").value === "Resize interaction" &&
        document.querySelector("#palette button"),
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    const open = async () => {
      await page.locator("#file-more > summary").click();
      await page.locator("#resize-open").click();
    };
    const draft = () => page.evaluate(() => window.pixeltool.loadDraft());
    const close = () =>
      page.locator("#resize-dialog [data-close-document-dialog]").click();
    const shape = async () => ({
      dialog: await page.locator("#resize-dialog").boundingBox(),
      stage: await page.locator("#resize-stage").boundingBox(),
      apply: await page.locator("#resize-apply").boundingBox(),
    });
    const original = (await draft()).layers;
    await open();
    const layout = await shape();
    for (const [w, h] of [
      [64, 1],
      [1, 64],
      [32, 16],
      [1, 1],
      ["", 16],
      [16, 16],
    ]) {
      await page.locator("#resize-width").fill(String(w));
      await page.locator("#resize-height").fill(String(h));
      assert.deepEqual(
        await shape(),
        layout,
        "dimensions, crop warnings and invalid inputs must not move dialog, preview or footer",
      );
    }
    assert.ok(
      layout.apply.y + layout.apply.height <= 740,
      "apply visible at minimum window size",
    );
    const drag = async (edge, x, y, cancel = false) => {
      const handle = page.locator(`[data-resize-edge="${edge}"]`),
        r = await handle.boundingBox();
      const scale = Number(
        await page.locator("#resize-frame").getAttribute("data-scale"),
      );
      const before = await page.locator("#resize-frame").boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        r.x + r.width / 2 + x * scale,
        r.y + r.height / 2 + y * scale,
        { steps: 4 },
      );
      const during = await page.locator("#resize-frame").boundingBox();
      if (edge === "w")
        assert.ok(
          Math.abs(before.x + before.width - during.x - during.width) < 1,
          "right edge stays fixed",
        );
      if (edge === "e")
        assert.ok(Math.abs(before.x - during.x) < 1, "left edge stays fixed");
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
      assert.deepEqual(await shape(), layout);
    };
    await drag("w", -4, 0);
    assert.equal(await page.locator("#resize-width").inputValue(), "20");
    await drag("e", 2, 0);
    assert.equal(await page.locator("#resize-width").inputValue(), "22");
    await drag("n", 0, -2);
    assert.equal(await page.locator("#resize-height").inputValue(), "18");
    await drag("se", 3, 2, true);
    assert.equal(await page.locator("#resize-width").inputValue(), "22");
    assert.equal(await page.locator("#resize-height").inputValue(), "18");
    assert.equal(await page.locator("#resize-dialog").isVisible(), true);
    assert.deepEqual(
      (await draft()).layers,
      original,
      "preview does not modify autosave",
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "resize-drag-dark.png"),
    });
    await page.locator("#resize-apply").click();
    const grown = await draft();
    assert.equal(grown.width, 22);
    assert.equal(grown.height, 18);
    assert.equal(grown.layers[0].pixels[48], 7);
    assert.equal(grown.layers[0].mask[48], false);
    assert.equal(grown.layers[0].refinementProtection[48], true);
    await page.locator("#undo-btn").click();
    assert.deepEqual((await draft()).layers, original);
    await open();
    await page.locator('[data-resize-edge="e"]').focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#resize-width").inputValue(), "17");
    await page.keyboard.press("Shift+ArrowRight");
    assert.equal(await page.locator("#resize-width").inputValue(), "27");
    await close();
    assert.deepEqual((await draft()).layers, original);
    await open();
    await drag("w", 2, 0);
    assert.equal(await page.locator("#resize-apply").isDisabled(), true);
    await page.locator("#resize-allow-crop").check();
    assert.equal(await page.locator("#resize-apply").isDisabled(), false);
    await page.locator('[data-resize-edge="e"]').focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.locator("#resize-allow-crop").isChecked(),
      false,
      "further changes reset crop consent",
    );
    await close();
    assert.deepEqual((await draft()).layers, original);
    await page.evaluate(async () => {
      const s = await window.pixeltool.getSettings();
      await window.pixeltool.savePreferences({
        ...s.preferences,
        theme: "light",
        language: "de",
      });
    });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.lang === "de");
    await open();
    await page.locator("#resize-width").fill("1");
    await page.locator("#resize-height").fill("64");
    assert.doesNotMatch(
      await page.locator("#resize-dialog").innerText(),
      /[가-힣]/,
    );
    const german = await shape();
    assert.ok(german.apply.y + german.apply.height <= 740);
    await page.screenshot({
      path: path.join(root, "artifacts", "resize-fixed-light-de.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: fixed dialog/stage/footer, eight-edge geometry, chained opposite-edge drags, Escape, keyboard sizing, mask/protection preservation, atomic apply/undo/cancel, crop consent and narrow localized layouts",
    );
  } catch (e) {
    await (
      await require("./first-editor.cjs")(app)
    ).screenshot({
      path: path.join(root, "artifacts", "resize-interaction-failure.png"),
    });
    throw e;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
