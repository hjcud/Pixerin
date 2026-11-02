if (require("./test-runner.cjs").bootstrap(__filename)) return;
// Native input, generated artwork and isolated state only. No model requests.
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("editor-comparison-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(16, 16, "Selection study"));
  for (let y = 4; y < 7; y++)
    for (let x = 4; x < 7; x++) doc.pixels[y * 16 + x] = 7;
  const top = Array(256).fill(0);
  top[4 * 16 + 7] = top[12 * 16 + 12] = 7;
  doc.layers.push({
    id: "top",
    name: "Reference",
    visible: true,
    locked: true,
    pixels: top,
  });
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
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(8000);
    const c = page.locator("#overlay-canvas");
    const tool = async (id) => {
      await page.locator(`[data-tool="${id}"]`).click();
      await c.focus();
    };
    const at = async (x, y) => {
      const r = await c.boundingBox();
      return [
        r.x + ((x + 0.5) * r.width) / 16,
        r.y + ((y + 0.5) * r.height) / 16,
      ];
    };
    const click = async (x, y) => page.mouse.click(...(await at(x, y)));
    const count = async () =>
      Number(
        (await page.locator("#selection-summary").textContent()).match(
          /\d+/,
        )?.[0] || 0,
      );
    const modify = async (action) => {
      await page.locator("#selection-more > summary").click();
      await page.locator("#selection-actions").selectOption(action);
      await c.press("Escape");
    };
    await tool("wand");
    await click(4, 4);
    assert.equal(await count(), 9);
    await modify("grow");
    assert.equal(await count(), 25);
    await modify("shrink");
    assert.equal(await count(), 9);
    await modify("border");
    assert.equal(await count(), 8);
    await c.press("Control+z");
    assert.equal(await count(), 9);
    await page.locator(".layer-lock").last().click();
    await modify("grow");
    assert.equal(
      await count(),
      25,
      "selection can change on a locked paint layer",
    );
    await page.locator(".layer-lock").last().click();
    await c.press("Control+d");
    await page.locator("#wand-source").selectOption("visible");
    await click(4, 4);
    assert.equal(await count(), 10);
    await page.locator("#wand-contiguous").uncheck();
    assert.equal(await page.locator("#wand-diagonal").isDisabled(), true);
    await click(4, 4);
    assert.equal(await count(), 11);
    await page.screenshot({
      path: path.join(root, "artifacts", "editor-comparison-selection.png"),
    });

    // Tiny selections must not silently turn into the app's unrestricted mask.
    await page.locator("#wand-contiguous").check();
    await click(12, 12);
    assert.equal(await count(), 1);
    await modify("shrink");
    assert.equal(await count(), 1);
    await page.locator("#zoom-label").click();
    await page.locator("#zoom-value").fill("800");
    await page.locator("#zoom-value").press("Enter");
    assert.equal(await page.locator("#zoom-label").textContent(), "800%");
    await page.locator("#zoom-label").click();
    await page.locator("#zoom-value").fill("");
    await page.locator("#zoom-apply").click();
    assert.equal(await page.locator("#zoom-label").textContent(), "800%");
    assert.equal(await page.locator("#zoom-menu").getAttribute("open"), "");
    await page.locator("#zoom-value").press("Escape");
    await c.focus();
    await c.press("1");
    assert.equal(await page.locator("#zoom-label").textContent(), "100%");
    await page.locator("#fit-btn").click();
    await page.locator("#zoom-label").click();
    await page.locator("#zoom-selection").click();
    const r = await c.boundingBox(),
      v = await page.locator("#viewport").boundingBox();
    const p = await at(12, 12);
    assert.ok(
      Math.abs(p[0] - v.x - v.width / 2) <= 1 &&
        Math.abs(p[1] - v.y - v.height / 2) <= 1,
      "fit centers selected pixel",
    );
    await page.locator("#view-mirror").click();
    await page.locator("#zoom-label").click();
    await page.locator("#zoom-selection").click();
    const mirrored = await at(3, 12);
    assert.ok(
      Math.abs(mirrored[0] - v.x - v.width / 2) <= 1,
      "fit uses mirrored display coordinates",
    );
    await page.locator("#view-mirror").click();
    await page.locator("#fit-btn").click();
    await c.press("Control+d");
    await page.locator("#zoom-label").click();
    assert.equal(await page.locator("#zoom-selection").isDisabled(), true);
    await page.screenshot({
      path: path.join(root, "artifacts", "editor-comparison-zoom.png"),
    });
    await page.locator("#zoom-value").press("Escape");

    const raster = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    await tool("pencil");
    const before = await raster();
    await page.mouse.move(...(await at(2, 2)));
    await page.mouse.down();
    await page.mouse.move(...(await at(9, 2)), { steps: 7 });
    assert.notDeepEqual(
      await raster(),
      before,
      "raster updates before releasing the stroke",
    );
    await c.press("Escape");
    await page.mouse.up();
    assert.deepEqual(
      await raster(),
      before,
      "cancel restores the full composite",
    );
    await click(2, 2);
    const painted = await raster();
    assert.notDeepEqual(painted, before);
    await c.press("Control+z");
    assert.deepEqual(await raster(), before);
    await c.press("Control+Shift+z");
    assert.deepEqual(await raster(), painted);
    // Use the same setting helper as the real shortcut dialog.
    await page.evaluate(async () => {
      const { writeUISetting } = await import("./src/ui-settings.mjs");
      writeUISetting("shortcuts.v1", { undo: ["Alt+z"] });
    });
    await page.reload();
    await require("./editor-ready.cjs")(page);
    await tool("pencil");
    await click(3, 2);
    assert.match(
      await page.locator("#undo-btn").getAttribute("title"),
      /Alt\+Z/,
    );
    assert.doesNotMatch(
      await page.locator("#undo-btn").getAttribute("title"),
      /Ctrl\+Z/,
    );
    await tool("wand");
    assert.equal(
      await page.locator("#wand-source").inputValue(),
      "visible",
      "source preference survives restart",
    );
    await tool("pencil");
    await app.evaluate(() => {
      const io = process.getBuiltinModule("fs/promises");
      globalThis.reviewIO = io;
      globalThis.reviewRename = io.rename;
      globalThis.reviewSaveFailure = "ENOSPC";
      io.rename = async (from, to) => {
        if (String(to).endsWith("draft.json") && globalThis.reviewSaveFailure)
          throw Object.assign(new Error("Simulated disk failure"), {
            code: globalThis.reviewSaveFailure,
          });
        return globalThis.reviewRename(from, to);
      };
    });
    await click(8, 8);
    await page.locator("#autosave-retry").waitFor({ state: "visible" });
    assert.match(
      await page.locator("#save-status").getAttribute("title"),
      /Simulated disk failure/,
    );
    const unsaved = await raster();
    await app.evaluate(() => {
      globalThis.reviewSaveFailure = null;
    });
    await page.locator("#autosave-retry").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#save-status")
        .textContent.includes("복구본 저장됨"),
    );
    assert.deepEqual(await raster(), unsaved, "retry never changes artwork");
    assert.equal(await page.locator("#autosave-retry").isHidden(), true);
    assert.equal(await page.locator("#save-status").getAttribute("title"), "");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await tool("wand");
    for (const language of ["en", "de"]) {
      await page.evaluate(async (language) => {
        const s = await window.pixeltool.getSettings();
        await window.pixeltool.savePreferences({
          ...s.preferences,
          language,
          theme: "light",
        });
      }, language);
      await page.waitForFunction(
        (language) => document.documentElement.lang === language,
        language,
      );
      await page.locator("#zoom-label").click();
      const menu = await page.locator(".zoom-menu-panel").boundingBox();
      assert.ok(
        menu.x >= 0 &&
          menu.y >= 0 &&
          menu.x + menu.width <= 1100 &&
          menu.y + menu.height <= 740,
        "localized zoom menu stays within the small window",
      );
      assert.doesNotMatch(
        await page.locator("#zoom-selection").textContent(),
        /[가-힣]/,
      );
      await page.screenshot({
        path: path.join(
          root,
          "artifacts",
          `editor-comparison-light-${language}.png`,
        ),
      });
      await page.locator("#zoom-value").press("Escape");
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: selection morphology/history/locks, composite and global selection, empty-scope protection, zoom input/validation/fit/mirror, synchronous stroke preview/cancel/undo, custom shortcut hints and preference persistence",
    );
  } finally {
    await app
      .evaluate(() => {
        if (globalThis.reviewRename)
          globalThis.reviewIO.rename = globalThis.reviewRename;
      })
      .catch(() => {});
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
