if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("habits-test-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(16, 16));
  doc.pixels[34] = 7;
  doc.palette.push("#12345680");
  doc.layers.push({
    id: "upper",
    name: "Upper",
    visible: true,
    locked: false,
    pixels: Array(256).fill(0),
  });
  doc.layers[1].pixels[51] = 16;
  doc.activeLayerId = "upper";
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      preferences: { interactionProfile: "aseprite", rightButton: "secondary" },
    }),
  );
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  try {
    await require("./mock-pixel-clipboard.cjs")(app);
    await app.evaluate((_, root) => {
      globalThis.__png = process.mainModule.require(
        root + "/node_modules/pngjs",
      ).PNG;
    }, root);
    const page = await require("./first-editor.cjs")(app),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(10000);
    await page.waitForSelector('[data-layer-id="upper"]');
    await require("./editor-ready.cjs")(page);
    const pos = async (x, y) => {
      const r = await page.locator("#overlay-canvas").boundingBox();
      return {
        x: r.x + ((x + 0.5) * r.width) / 16,
        y: r.y + ((y + 0.5) * r.height) / 16,
      };
    };
    const click = async (x, y, options = {}) => {
      const p = await pos(x, y);
      await page.mouse.click(p.x, p.y, options);
    };
    const drag = async (x, y, a, b, options = {}) => {
      const p = await pos(x, y),
        q = await pos(a, b);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down(options);
      await page.mouse.move(q.x, q.y, { steps: 5 });
      await page.mouse.up(options);
    };
    const selection = () => page.locator("#selection-summary").textContent();
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) =>
          Array.from(
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        );
    const focus = () => page.locator("#overlay-canvas").focus();
    const original = await pixels();
    await page.locator('[data-tool="picker"]').click();
    await click(2, 2);
    assert.match(
      await page.locator("#primary-color").getAttribute("title"),
      /#50A889FF/,
    );
    await page.locator('[data-tool="picker"]').click();
    await page.locator("#picker-source").selectOption("layer");
    await page.waitForFunction(
      async () =>
        (await window.pixeltool.getSettings()).preferences.pickerSource ===
        "layer",
    );
    await click(2, 2);
    assert.match(
      await page.locator("#primary-color").getAttribute("title"),
      /투명/,
    );
    await page.locator('[data-tool="select"]').click();
    await drag(1, 1, 5, 5);
    assert.match(await selection(), /25/);
    await page.locator('[data-layer-id="layer-1"] .layer-select').click();
    assert.match(await selection(), /25/);
    await page.locator('[data-layer-id="upper"] .layer-select').click();
    assert.match(await selection(), /25/);
    await drag(1, 1, 2, 2, { button: "right" });
    assert.match(await selection(), /21/);
    await focus();
    await page.keyboard.press("Control+c");
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("다른 앱"),
    );
    const clip = await page.evaluate(() => window.pixeltool.pastePixels());
    assert.equal(clip.width, 5);
    assert.ok(clip.pixels.includes(null));
    assert.ok(clip.pixels.includes("#12345680"));
    // External image replaces the old internal clipboard. All clipboard APIs are mocked.
    await app.evaluate(({ nativeImage }) => {
      globalThis.__testClipboardImage = nativeImage.createFromBuffer(
        globalThis.__png.sync.write({
          width: 1,
          height: 1,
          data: Buffer.from([32, 80, 240, 255]),
        }),
      );
    });
    await focus();
    await page.keyboard.press("Control+v");
    await page.waitForSelector("#placement-actions:not([hidden])");
    const placed = await pixels();
    assert.notDeepEqual(placed, original);
    await page.keyboard.press("Escape");
    assert.deepEqual(await pixels(), original);
    await page.keyboard.press("Control+v");
    await page.waitForSelector("#placement-actions:not([hidden])");
    await page.keyboard.press("Enter");
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), original);
    await app.evaluate(({ nativeImage }) => {
      globalThis.__testClipboardImage = nativeImage.createFromBuffer(
        globalThis.__png.sync.write({
          width: 4097,
          height: 1,
          data: Buffer.alloc(4097 * 4, 255),
        }),
      );
    });
    await focus();
    await page.keyboard.press("Control+v");
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("4096px"),
    );
    assert.deepEqual(await pixels(), original);
    assert.ok(await page.locator("#placement-actions").isHidden());
    await app.evaluate(({ nativeImage }) => {
      globalThis.__testClipboardImage = nativeImage.createEmpty();
    });
    await page.keyboard.press("Control+v");
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("이미지가 없어요"),
    );
    // Per-layer alpha survives restart and new layers do not inherit it.
    await page.locator("#alpha-lock-btn").click();
    await page.locator('[data-layer-id="layer-1"] .layer-select').click();
    assert.equal(
      await page.locator("#alpha-lock-btn").getAttribute("class"),
      "",
    );
    await page.locator('[data-layer-id="upper"] .layer-select').click();
    assert.match(
      await page.locator("#alpha-lock-btn").getAttribute("class"),
      /selected/,
    );
    await page.waitForFunction(
      async () =>
        (await window.pixeltool.loadDraft()).layers[1].alphaLocked === true,
    );
    await page.reload();
    await page.waitForSelector('[data-layer-id="upper"]');
    assert.match(
      await page.locator("#alpha-lock-btn").getAttribute("class"),
      /selected/,
    );
    await page.locator("#layer-duplicate").click();
    assert.match(
      await page.locator("#alpha-lock-btn").getAttribute("class"),
      /selected/,
    );
    await page.locator("#undo-btn").click();
    await page.locator("#layer-add").click();
    assert.equal(
      await page.locator("#alpha-lock-btn").getAttribute("class"),
      "",
    );
    await page.locator("#undo-btn").click();
    await page.locator("#alpha-lock-btn").click();
    await page.locator('[data-tool="pencil"]').click();
    await page.locator("#palette button").nth(7).click();
    await click(2, 7);
    await page.keyboard.down("Shift");
    await click(8, 7);
    await page.keyboard.up("Shift");
    await page.waitForFunction(async () => {
      const d = await window.pixeltool.loadDraft();
      return d.layers
        .find((l) => l.id === d.activeLayerId)
        .pixels.slice(114, 121)
        .every((i) => i === 7);
    });
    await page.locator("#undo-btn").click();
    await page.locator("#undo-btn").click();
    // Explicit intersection, then drag within a selection: retain original pixels until confirmation.
    await page.locator('[data-tool="select"]').click();
    await page.locator("#selection-mode").selectOption("replace");
    await drag(1, 1, 5, 5);
    await page.locator("#selection-mode").selectOption("intersect");
    await drag(3, 3, 6, 6);
    assert.match(await selection(), /9/);
    await page.locator("#selection-mode").selectOption("replace");
    await drag(3, 3, 4, 4);
    await page.waitForSelector("#placement-actions:not([hidden])");
    await focus();
    await page.keyboard.press("Escape");
    // Individual modifier settings do not change the independent right-button choice.
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-editor").click();
    assert.equal(
      await page.locator("#pref-duplicateModifier").inputValue(),
      "ctrl",
    );
    assert.equal(
      await page.locator("#pref-intersectionModifier").inputValue(),
      "ctrl-shift",
    );
    assert.equal(await page.locator("#pref-interactionProfile").count(), 0);
    assert.doesNotMatch(
      await page.locator("#settings-editor").textContent(),
      /Aseprite|CLIP STUDIO/i,
    );
    await page.locator("#pref-duplicateModifier").selectOption("alt");
    await page.locator("#pref-intersectionModifier").selectOption("ctrl-shift");
    assert.equal(
      await page.locator("#pref-rightButton").inputValue(),
      "secondary",
    );
    await page.locator("#pref-rightButton").selectOption("picker");
    await page.locator("#pref-pickerSource").selectOption("visible");
    await page.locator('#settings-form button[type="submit"]').click();
    await page.locator("#settings-dialog").waitFor({ state: "hidden" });
    const saved = JSON.parse(
      await fs.readFile(path.join(profile, "settings.json"), "utf8"),
    ).preferences;
    assert.equal(saved.duplicateModifier, "alt");
    assert.equal(saved.intersectionModifier, "ctrl-shift");
    assert.equal(saved.rightButton, "picker");
    assert.equal(Object.hasOwn(saved, "interactionProfile"), false);
    await page.reload();
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-editor").click();
    assert.equal(
      await page.locator("#pref-duplicateModifier").inputValue(),
      "alt",
    );
    assert.equal(
      await page.locator("#pref-intersectionModifier").inputValue(),
      "ctrl-shift",
    );
    assert.equal(
      await page.locator("#pref-rightButton").inputValue(),
      "picker",
    );
    await page.locator("#settings-dialog .dialog-close").first().click();
    await page.locator('[data-tool="pencil"]').click();
    const beforePick = await pixels();
    await click(2, 2, { button: "right" });
    assert.deepEqual(await pixels(), beforePick);
    assert.match(
      await page.locator("#primary-color").getAttribute("title"),
      /#50A889FF/,
    );
    await page.locator('[data-tool="select"]').click();
    await focus();
    await page.keyboard.press("Control+d");
    await drag(1, 1, 5, 5);
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await drag(3, 3, 6, 6);
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");
    assert.match(await selection(), /9/);
    await page.keyboard.press("Control+d");
    await drag(3, 3, 3, 3);
    await page.locator('[data-tool="move"]').click();
    await page.keyboard.down("Alt");
    await drag(3, 3, 5, 5);
    await page.keyboard.up("Alt");
    await page.waitForSelector("#placement-actions:not([hidden])");
    await focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(async () => {
      const d = await window.pixeltool.loadDraft(),
        p = d.layers.find((l) => l.id === d.activeLayerId).pixels;
      return p[51] !== 0 && p[85] === p[51];
    });
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), beforePick);
    await page.locator('[data-tool="pencil"]').click();
    for (const [width, height, lang, theme] of [
      [1420, 944, "ko", "dark"],
      [1100, 740, "de", "light"],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, s) =>
          BrowserWindow.getAllWindows()[0].setContentSize(...s),
        [width, height],
      );
      await page.locator("#settings-btn").click();
      await page.locator("#pref-language").selectOption(lang);
      await page.locator("#settings-tab-display").click();
      await page.locator("#pref-theme").selectOption(theme);
      await page.locator("#settings-tab-editor").click();
      await page.screenshot({
        path: path.join(root, "artifacts", `individual-controls-${lang}.png`),
      });
      await page.locator('#settings-form button[type="submit"]').click();
      const bounds = await page.locator("#brush-size").boundingBox(),
        palette = await page.locator("#palette-tab").boundingBox();
      assert.ok(bounds.y > 0 && bounds.y + bounds.height < height);
      assert.ok(palette.y > 0 && palette.y + palette.height < height);
      assert.ok(
        await page.locator("#brush-size").evaluate((e) => {
          const r = e.getBoundingClientRect();
          return (
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) ===
            e
          );
        }),
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(root, "artifacts", `editor-habits-${lang}.png`),
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: layer selections, composite/current picker, subtract/intersect, clipboard isolation and external paste, alpha persistence, Shift lines, independent modifiers and persistence, pinned brush and translated layouts",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
