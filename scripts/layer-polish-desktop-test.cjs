if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, "..");
  const profile = await require("./test-runner.cjs").createProfile("layer-polish-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(8, 8, "Layer polish"));
  doc.layers = ["a", "b", "c"].map((id, i) => ({
    id,
    name: id,
    visible: true,
    locked: false,
    pixels: Array.from({ length: 64 }, (_, p) => (p === 9 + i * 2 ? 7 + i : 0)),
  }));
  doc.activeLayerId = "a";
  doc.layers[0].mask = Array(64).fill(true);
  doc.layers[0].mask[9] = false;
  doc.layers[0].maskLinked = true;
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
        document.querySelector("#doc-name").value === "Layer polish" &&
        document.querySelector("#palette button"),
    );
    const draft = () => page.evaluate(() => window.pixeltool.loadDraft());
    const choose = (id, modifiers = []) =>
      page
        .locator(`[data-layer-id="${id}"] .layer-select`)
        .click({ modifiers });
    const undo = () => page.locator("#undo-btn").click();
    const image = (id) =>
      page
        .locator("#" + id)
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const close = (id) =>
      page.locator(`#${id} [data-close-layer-dialog]`).click();
    await choose("b", ["Control"]);
    await page.locator("#layer-up").click();
    assert.deepEqual(
      (await draft()).layers.map((l) => l.id),
      ["c", "a", "b"],
    );
    assert.match(
      await page.locator("#layer-selection-count").textContent(),
      /^2/,
    );
    await undo();
    assert.deepEqual(
      (await draft()).layers.map((l) => l.id),
      ["a", "b", "c"],
    );
    assert.equal(await page.locator("#layer-down").isDisabled(), true);
    await page.locator("#folder-add").click();
    let d = await draft(),
      fid = d.folders[0].id;
    const folder = () => page.locator(`[data-folder-id="${fid}"]`);
    await folder().locator(".folder-visible").click();
    assert.equal((await draft()).folders[0].visible, false);
    assert.equal(await page.locator("#folder-dialog").isVisible(), false);
    await undo();
    await folder().locator(".folder-lock").click();
    assert.equal((await draft()).folders[0].locked, true);
    assert.equal(await page.locator("#layer-mask-open").isDisabled(), true);
    assert.ok(await page.locator("#layer-add").isDisabled());
    assert.match(await page.locator("#layer-add").getAttribute("title"),/폴더가 잠겨/);
    assert.doesNotMatch(await page.locator("#layer-add").getAttribute("title"),/32/);
    await undo();
    assert.equal(await page.locator("#layer-add").getAttribute("data-disabled-reason"),null);
    await folder().locator("[aria-expanded]").click();
    await folder().locator(".folder-visible").click();
    assert.equal((await draft()).folders[0].visible, false);
    await undo();
    await undo();
    await choose("a");
    await page.locator('[data-layer-id="a"] .layer-lock').click();
    assert.ok(await page.locator("#layer-add").isDisabled());
    assert.match(await page.locator("#layer-add").getAttribute("title"),/현재 레이어가 잠겨/);
    assert.doesNotMatch(await page.locator("#layer-add").getAttribute("title"),/32/);
    await undo();
    const beforeMask = (await draft()).layers;
    await page.locator("#layer-mask-open").click();
    const paint = async (i) => {
      const r = await page.locator("#layer-mask-canvas").boundingBox();
      await page.mouse.click(
        r.x + (((i % 8) + 0.5) * r.width) / 8,
        r.y + ((Math.floor(i / 8) + 0.5) * r.height) / 8,
      );
    };
    const maskBit = async (i) => (await image("layer-mask-canvas"))[i * 4];
    await paint(10);
    assert.equal(await maskBit(10), 0);
    await page.locator("#layer-mask-canvas").focus();
    await page.keyboard.press("Control+z");
    assert.equal(await maskBit(10), 255);
    await page.keyboard.press("Control+Shift+z");
    assert.equal(await maskBit(10), 0);
    await page.keyboard.press("Control+z");
    // An unchanged stroke preserves redo; a new edit starts a new branch.
    await paint(9);
    assert.equal(await page.locator("#layer-mask-redo").isDisabled(), false);
    await page.keyboard.press("Control+y");
    assert.equal(await maskBit(10), 0);
    await page.keyboard.press("Control+z");
    await paint(11);
    assert.equal(await page.locator("#layer-mask-redo").isDisabled(), true);
    const masked = await image("layer-mask-preview");
    const compare = page.locator("#layer-mask-compare");
    const r = await compare.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    assert.notDeepEqual(await image("layer-mask-preview"), masked);
    await page.mouse.move(10, 10);
    await page.mouse.up();
    assert.deepEqual(await image("layer-mask-preview"), masked);
    await compare.focus();
    await page.keyboard.down("Space");
    assert.equal(await compare.getAttribute("aria-pressed"), "true");
    await page.keyboard.up("Space");
    assert.deepEqual(await image("layer-mask-preview"), masked);
    assert.deepEqual((await draft()).layers, beforeMask);
    await close("layer-mask-dialog");
    assert.deepEqual((await draft()).layers, beforeMask);

    await choose("b", ["Control"]);
    await page.locator("#layer-more").selectOption("align");
    await page.locator("#layer-align-direction").selectOption("right");
    assert.deepEqual((await draft()).layers, beforeMask);
    await page.locator("#layer-align-apply").click();
    d = await draft();
    assert.equal(d.layers.find((l) => l.id === "a").pixels[15], 7);
    assert.equal(d.layers.find((l) => l.id === "b").pixels[15], 8);
    assert.equal(d.layers.find((l) => l.id === "a").mask[15], false);
    await undo();
    assert.deepEqual((await draft()).layers, beforeMask);
    await page.locator("#layer-more").selectOption("align");
    await page.locator("#layer-align-reference").selectOption("active");
    await close("layer-align-dialog");
    assert.deepEqual((await draft()).layers, beforeMask);
    await page.locator('[data-layer-id="a"] .layer-lock').click();
    await page.locator("#layer-more").selectOption("align");
    assert.equal(await page.locator("#layer-align-apply").isDisabled(), true);
    assert.match(
      await page.locator("#layer-align-status").textContent(),
      /잠금/,
    );
    await close("layer-align-dialog");
    await undo();

    // Register both slots through the real shortcut editor; local mask history
    // follows the user's bindings rather than a second hardcoded key map.
    await page.locator("#settings-btn").click();
    await page.locator('[data-settings-tab="editor"]').click();
    await page.locator("#shortcut-open").click();
    const slot = (id, n) =>
      page.locator(`[data-command="${id}"] [data-slot="${n}"]`);
    for (const [id, key] of [
      ["layer-mask-open", "Alt+q"],
      ["layer-align-open", "Alt+r"],
      ["layer-clip-add", "Alt+c"],
      ["layer-mask-selection", "Alt+m"],
      ["layer-selection-mask", "Alt+n"],
      ["layer-mask-link", "Alt+l"],
      ["layer-mask-toggle", "Alt+t"],
      ["undo", "Alt+z"],
      ["redo", "Alt+y"],
    ]) {
      await slot(id, 0).click();
      await page.keyboard.press(key);
    }
    await slot("layer-mask-open", 1).click();
    await page.keyboard.press("Control+Alt+q");
    await page.locator("#shortcut-save").click();
    await page.locator("#settings-dialog .dialog-close").first().click();
    await choose("a");
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Alt+q");
    assert.equal(await page.locator("#layer-mask-dialog").isVisible(), true);
    await paint(10);
    await page.locator("#layer-mask-canvas").focus();
    await page.keyboard.press("Alt+z");
    assert.equal(await maskBit(10), 255);
    await page.keyboard.press("Alt+y");
    assert.equal(await maskBit(10), 0);
    await close("layer-mask-dialog");
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Control+Alt+q");
    assert.equal(await page.locator("#layer-mask-dialog").isVisible(), true);
    await close("layer-mask-dialog");
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Alt+l");
    assert.equal(
      (await draft()).layers.find((l) => l.id === "a").maskLinked,
      false,
    );
    await undo();
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Alt+t");
    assert.equal(
      (await draft()).layers.find((l) => l.id === "a").maskEnabled,
      false,
    );
    await undo();
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Alt+c");
    assert.equal((await draft()).layers.length, 4);
    await undo();
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Alt+m");
    await page.keyboard.press("Alt+n");
    assert.equal(await page.locator("#layer-mask-dialog").isVisible(), true);
    await close("layer-mask-dialog");

    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await page.evaluate(async () => {
      const s = await window.pixeltool.getSettings();
      await window.pixeltool.savePreferences({
        ...s.preferences,
        language: "de",
        theme: "light",
      });
    });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.lang === "de");
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Alt+r");
    assert.equal(await page.locator("#layer-align-dialog").isVisible(), true);
    assert.doesNotMatch(
      await page.locator("#layer-align-dialog").innerText(),
      /[가-힣]/,
    );
    const bounds = await page.locator("#layer-align-dialog").boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 1100 &&
        bounds.y + bounds.height <= 740,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-alignment-light-de.png"),
    });
    await close("layer-align-dialog");
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Alt+q");
    assert.doesNotMatch(
      await page.locator("#layer-mask-dialog").innerText(),
      /[가-힣]/,
    );
    const applyBounds = await page.locator("#layer-mask-apply").boundingBox();
    assert.ok(
      applyBounds.y + applyBounds.height <= 740,
      "mask apply stays visible without scrolling",
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-mask-polish-light-de.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: batch ordering, folder quick controls, local mask undo/redo and compare, atomic alignment preview/apply/cancel, configurable shortcuts and localized narrow layouts",
    );
  } catch (e) {
    await (
      await require("./first-editor.cjs")(app)
    ).screenshot({
      path: path.join(root, "artifacts", "layer-polish-failure.png"),
    });
    throw e;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
