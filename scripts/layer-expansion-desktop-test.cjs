if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("layer-expansion-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const d = ensureLayers(createDocument(8, 8, "Layer expansion"));
  d.pixels[9] = d.pixels[10] = 7;
  d.layers[0].mask = d.pixels.map((_, i) => i !== 9);
  d.layers.push(
    {
      id: "top",
      name: "Top",
      visible: true,
      locked: false,
      pixels: d.pixels.map((_, i) => ([10, 17].includes(i) ? 8 : 0)),
    },
    {
      id: "spare",
      name: "Spare",
      visible: true,
      locked: false,
      pixels: Array(64).fill(0),
    },
  );
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(d));
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
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    const ready = () =>
      page.waitForFunction(
        () =>
          document.querySelector("#doc-name").value === "Layer expansion" &&
          document.querySelector("#palette button"),
      );
    await ready();
    const draft = () => page.evaluate(() => window.pixeltool.loadDraft());
    const choose = async (id, modifiers = []) => {
      await page
        .locator(`[data-layer-id="${id}"] .layer-select`)
        .click({ modifiers });
    };
    const point = async (x, y) => {
      const r = await page.locator("#overlay-canvas").boundingBox();
      return [
        r.x + ((x + 0.5) * r.width) / 8,
        r.y + ((y + 0.5) * r.height) / 8,
      ];
    };
    const drag = async (x, y, a, b) => {
      await page.mouse.move(...(await point(x, y)));
      await page.mouse.down();
      await page.mouse.move(...(await point(a, b)), { steps: 3 });
      await page.mouse.up();
    };
    const undo = () => page.locator("#undo-btn").click();
    await page.locator('[data-layer-id="layer-1"] .layer-mask-link').click();
    assert.equal((await draft()).layers[0].maskLinked, true);
    await choose("top", ["Control"]);
    assert.match(
      await page.locator("#layer-selection-count").textContent(),
      /^2/,
    );
    await page.locator('[data-tool="move"]').click();
    await drag(1, 1, 2, 2);
    await page.locator("#placement-apply").click();
    let saved = await draft();
    assert.equal(saved.layers[0].pixels[18], 7);
    assert.equal(saved.layers[0].mask[18], false);
    assert.equal(saved.layers[1].pixels[26], 8);
    await undo();
    assert.equal((await draft()).layers[0].pixels[9], 7);
    assert.match(
      await page.locator("#layer-selection-count").textContent(),
      /^2/,
    );
    // Unconfirmed multi-layer motion also restores its exact targets after restart.
    await drag(1, 1, 2, 2);
    await page.waitForFunction(
      () =>
        document.querySelector("#save-status").textContent.includes("仮") ||
        document
          .querySelector("#save-status")
          .textContent.includes("임시 위치 저장됨"),
    );
    await page.reload();
    await ready();
    await page.locator("#placement-apply").waitFor({ state: "visible" });
    await page.locator("#placement-apply").click();
    saved = await draft();
    assert.equal(saved.layers[0].mask[18], false);
    assert.equal(saved.layers[1].pixels[26], 8);
    // Return the confirmed pixels using one move; history is intentionally session-local.
    await drag(2, 2, 1, 1);
    await page.locator("#placement-apply").click();
    await page.locator("#layer-duplicate").click();
    assert.equal((await draft()).layers.length, 5);
    await undo();
    assert.match(
      await page.locator("#layer-selection-count").textContent(),
      /^2/,
    );
    await page.locator("#folder-add").click();
    saved = await draft();
    assert.equal(saved.folders.length, 1);
    assert.equal(saved.layers.filter((l) => l.folderId).length, 2);
    await undo();
    // A locked member cancels the entire gesture, including the otherwise editable layer.
    await page.locator('[data-layer-id="layer-1"] .layer-lock').click();
    const locked = await draft();
    await drag(1, 1, 2, 2);
    assert.deepEqual((await draft()).layers, locked.layers);
    await undo();
    await choose("top");
    await page.locator('[data-tool="select"]').click();
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Control+d");
    await drag(2, 1, 2, 1);
    await page.locator("#layer-more").selectOption("selection-mask");
    assert.equal(await page.locator("#layer-mask-linked").isChecked(), true);
    await page.locator("#layer-mask-apply").click();
    saved = await draft();
    const top = saved.layers.find((l) => l.id === "top");
    assert.equal(top.mask.filter(Boolean).length, 1);
    assert.equal(top.mask[10], true);
    assert.equal(top.maskLinked, true);
    await page.locator("#layer-more").selectOption("mask-selection");
    await page
      .locator('[data-layer-id="top"] .layer-select')
      .click({ button: "right" });
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-context-actions.png"),
    });
    await page
      .locator("#layer-context-menu button")
      .filter({ hasText: "클리핑 레이어 추가" })
      .click();
    saved = await draft();
    assert.equal(
      saved.layers.find((l) => l.id === saved.activeLayerId).clipped,
      true,
    );
    assert.ok(
      saved.layers
        .find((l) => l.id === saved.activeLayerId)
        .pixels.every((c) => c === 0),
    );
    await undo();
    // Picking lists only visible candidates at the clicked pixel.
    await page.locator('[data-tool="pencil"]').click();
    await page.keyboard.down("Control");
    await page.keyboard.down("Alt");
    await page.mouse.click(...(await point(2, 1)));
    await page.keyboard.up("Alt");
    await page.keyboard.up("Control");
    assert.equal(await page.locator("#layer-context-menu button").count(), 2);
    await page
      .locator("#layer-context-menu button")
      .filter({ hasText: "Top" })
      .click();
    assert.equal((await draft()).activeLayerId, "top");
    // The original Ctrl+thumbnail gesture still selects painted cells.
    await page
      .locator('[data-layer-id="top"] .layer-thumbnail')
      .click({ modifiers: ["Control"] });
    await page.locator("#layer-more").selectOption("selection-mask");
    await page.locator("#layer-mask-apply").click();
    assert.equal(
      (await draft()).layers.find((l) => l.id === "top").mask.filter(Boolean)
        .length,
      2,
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await choose("layer-1", ["Control"]);
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-multi-selection.png"),
    });
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
    await page
      .locator('[data-layer-id="top"] .layer-select')
      .click({ button: "right" });
    assert.doesNotMatch(
      await page.locator("#layer-context-menu").innerText(),
      /[가-힣]/,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-context-light-de.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: linked masks, multi-select movement/duplicate/group/undo and restart recovery, locked batch rollback, selection-mask round trip, context actions, quick clipping, visible pixel picking and localized UI",
    );
  } catch (e) {
    const page = await require("./first-editor.cjs")(app);
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-expansion-failure.png"),
    });
    throw e;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
