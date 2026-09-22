if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("layer-features-");
  const { createDocument, ensureLayers, documentRGBA } =
    await import("../src/core.mjs");
  const { fixedScope } = await import("../electron/fixed-patch.mjs");
  const doc = ensureLayers(createDocument(8, 8, "Layer features"));
  doc.pixels[9] = doc.pixels[10] = 7;
  doc.layers.push(
    {
      id: "shade",
      name: "Shade",
      visible: true,
      locked: false,
      pixels: Array(64).fill(8),
    },
    {
      id: "spare",
      name: "Spare",
      visible: true,
      locked: false,
      pixels: Array(64).fill(0),
    },
  );
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
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    page.setDefaultTimeout(12000);
    const ready = () =>
      page.waitForFunction(
        () =>
          document.querySelector("#doc-name").value === "Layer features" &&
          document.querySelector("#save-status").textContent.includes("저장됨"),
      );
    await ready();
    const draft = () => page.evaluate(() => window.pixeltool.loadDraft());
    const select = async (id) => {
      await page.locator(`[data-layer-id="${id}"] .layer-select`).click();
      await page.waitForFunction(
        (id) =>
          document
            .querySelector(`[data-layer-id="${id}"]`)
            .classList.contains("active"),
        id,
      );
    };
    const undo = () => page.locator("#undo-btn").click();
    await page.locator("#folder-add").click();
    let d = await draft(),
      fid = d.folders[0].id;
    assert.deepEqual(
      d.layers.map((l) => l.id),
      ["layer-1", "shade", "spare"],
    );
    await select("shade");
    await page.locator("#layer-folder").selectOption(fid);
    await page.locator("#layer-clip").click();
    d = await draft();
    assert.equal(d.layers.find((l) => l.id === "shade").clipped, true);
    const rgba = documentRGBA(d);
    assert.equal(rgba[3], 0);
    assert.equal(rgba[9 * 4 + 3], 255);
    assert.match(
      await page.locator("#layer-clip").getAttribute("title"),
      /레이어/,
    );
    await page
      .locator(`[data-folder-id="${fid}"] > button[aria-expanded]`)
      .click();
    assert.equal(
      await page.locator('[data-layer-id="shade"]').isVisible(),
      false,
    );
    await page
      .locator(`[data-folder-id="${fid}"] > button[aria-expanded]`)
      .click();
    const openFolder = () =>
      page.locator(`[data-folder-id="${fid}"] .folder-select`).click();
    await openFolder();
    await page.locator("#folder-visible").uncheck();
    await page.locator("#folder-apply").click();
    assert.ok(documentRGBA(await draft()).every((v) => v === 0));
    await undo();
    await openFolder();
    await page.locator("#folder-locked").check();
    await page.locator("#folder-apply").click();
    assert.equal(await page.locator("#generate-btn").isDisabled(), true);
    assert.equal(await page.locator("#layer-mask-open").isDisabled(), true);
    const locked = await draft();
    const canvasBounds = await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.click(
      canvasBounds.x + canvasBounds.width * 0.2,
      canvasBounds.y + canvasBounds.height * 0.2,
    );
    assert.deepEqual(
      (await draft()).layers,
      locked.layers,
      "folder lock prevents manual paint",
    );
    assert.throws(() =>
      fixedScope({
        document: locked,
        mask: Array(64).fill(true),
        alphaLock: false,
      }),
    );
    await undo();
    // Mask preview and cancellation do not mutate confirmed artwork or autosave.
    await page.locator("#layer-mask-open").click();
    const maskPoint = async (x, y) => {
      const r = await page.locator("#layer-mask-canvas").boundingBox();
      return [
        r.x + ((x + 0.5) * r.width) / 8,
        r.y + ((y + 0.5) * r.height) / 8,
      ];
    };
    await page.mouse.click(...(await maskPoint(1, 1)));
    assert.equal(
      (await draft()).layers.find((l) => l.id === "shade").mask,
      undefined,
    );
    await page.locator("#layer-mask-dialog [data-close-layer-dialog]").click();
    await page.locator("#layer-mask-open").click();
    await page.mouse.click(...(await maskPoint(1, 1)));
    await page.locator("#layer-mask-undo").click();
    await page.mouse.click(...(await maskPoint(1, 1)));
    await page.locator("#layer-mask-apply").click();
    d = await draft();
    const shade = d.layers.find((l) => l.id === "shade");
    assert.equal(shade.mask[9], false);
    assert.equal(shade.pixels[9], 8);
    assert.deepEqual([...documentRGBA(d).slice(36, 40)], [80, 168, 137, 255]);
    const scope = fixedScope({ document: d, mask: Array(64).fill(true) });
    assert.equal(scope.mask[9], false);
    assert.equal(scope.mask[10], true);
    await page.locator("#layer-more").selectOption("mask-toggle");
    assert.equal(
      (await draft()).layers.find((l) => l.id === "shade").maskEnabled,
      false,
    );
    await undo();
    await page.locator("#layer-more").selectOption("mask-remove");
    assert.equal(
      (await draft()).layers.find((l) => l.id === "shade").mask,
      undefined,
    );
    await undo();
    // Folder deletion is explicit, and undo restores every contained mask.
    await openFolder();
    await page.locator("#folder-dialog details > summary").click();
    assert.equal(await page.locator("#folder-delete").isDisabled(), true);
    await page.locator("#folder-delete-confirm").check();
    await page.locator("#folder-delete").click();
    assert.deepEqual(
      (await draft()).layers.map((l) => l.id),
      ["spare"],
    );
    await undo();
    await openFolder();
    await page.locator("#folder-ungroup").click();
    assert.equal((await draft()).folders.length, 0);
    await undo();
    await openFolder();
    await page.locator("#folder-duplicate").click();
    d = await draft();
    assert.equal(d.folders.length, 2);
    assert.equal(d.layers.length, 5);
    assert.equal(d.layers.filter((l) => l.mask).length, 2);
    await undo();
    // Drag the layer to an ungrouped sibling; undo restores its clipping and mask.
    await page
      .locator('[data-layer-id="shade"]')
      .dragTo(page.locator('[data-layer-id="spare"]'));
    assert.equal(
      (await draft()).layers.find((l) => l.id === "shade").folderId,
      undefined,
    );
    await undo();
    await select("shade");
    await openFolder();
    await page.locator("#folder-name").fill("F <{0}>");
    await page.locator("#folder-apply").click();
    d = await draft();
    await page.reload();
    await ready();
    assert.deepEqual((await draft()).layers, d.layers);
    assert.equal((await draft()).folders[0].name, "F <{0}>");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await select("shade");
    await page.locator('[data-layer-id="shade"] .layer-mask-thumb').click();
    const bounds = await page.locator("#layer-mask-dialog").boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 740);
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-mask-dark.png"),
    });
    await page.locator("#layer-mask-dialog [data-close-layer-dialog]").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-folders-dark.png"),
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
    await page.waitForSelector(".layer-mask-thumb");
    await page.locator('[data-layer-id="shade"] .layer-mask-thumb').click();
    assert.doesNotMatch(
      await page.locator("#layer-mask-dialog").innerText(),
      /[가-힣]/,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-mask-light-de.png"),
    });
    await page.locator("#layer-mask-dialog [data-close-layer-dialog]").click();
    await openFolder();
    assert.doesNotMatch(
      await page.locator("#folder-dialog").innerText(),
      /[가-힣]/,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-folder-light-de.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: folder order/collapse/visibility/lock/duplicate/drag, clipping, binary mask preview/cancel/undo/toggle/remove, AI scope, restart and small localized layouts",
    );
  } catch (e) {
    const page = await require("./first-editor.cjs")(app);
    await page.screenshot({
      path: path.join(root, "artifacts", "layer-features-failure.png"),
    });
    throw e;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
