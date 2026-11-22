if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("convenience-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(16, 16)),
    lines = Array(256).fill(0);
  for (let y = 2; y <= 9; y++)
    for (let x = 2; x <= 9; x++)
      if (x === 2 || x === 9 || y === 2 || y === 9) lines[y * 16 + x] = 1;
  doc.layers.push({
    id: "lines",
    name: "Lines",
    visible: true,
    locked: true,
    pixels: lines,
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
    let page = await require("./first-editor.cjs")(app),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(10000);
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    const selectTool = async (tool) => {
      await page.locator(`[data-tool="${tool}"]`).click();
      await page.locator("#overlay-canvas").focus();
    };
    const pos = async (x, y) => {
      const r = await page.locator("#overlay-canvas").boundingBox();
      return [
        r.x + ((x + 0.5) * r.width) / 16,
        r.y + ((y + 0.5) * r.height) / 16,
      ];
    };
    const click = async (x, y) => page.mouse.click(...(await pos(x, y)));
    const drag = async (x, y, a, b) => {
      await page.mouse.move(...(await pos(x, y)));
      await page.mouse.down();
      await page.mouse.move(...(await pos(a, b)), { steps: 4 });
      await page.mouse.up();
    };
    const draft = () => page.evaluate(() => window.pixeltool.loadDraft());
    const waitCount = async (n) =>
      page.waitForFunction(
        async (n) =>
          (await window.pixeltool.loadDraft()).layers[0].pixels.filter(Boolean)
            .length === n,
        n,
      );
    const countSelection = async () =>
      Number(
        (await page.locator("#selection-summary").textContent()).match(
          /\d+/,
        )?.[0] || 0,
      );
    const setSize = async (n) =>
      page.locator("#brush-size").evaluate((el, n) => {
        el.value = n;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, n);
    for (const [tool, size] of [
      ["pencil", 2],
      ["eraser", 4],
      ["line", 3],
      ["brush-select", 5],
    ]) {
      await selectTool(tool);
      await setSize(size);
    }
    await page.reload();
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    for (const [tool, size] of [
      ["pencil", 2],
      ["eraser", 4],
      ["line", 3],
      ["brush-select", 5],
    ]) {
      await selectTool(tool);
      assert.equal(
        await page.locator("#brush-size").inputValue(),
        String(size),
      );
    }
    await selectTool("pencil");
    await setSize(1);
    await selectTool("fill");
    await page.locator("#fill-source").selectOption("visible");
    await click(4, 4);
    await waitCount(36);
    assert.deepEqual((await draft()).layers[1].pixels, lines);
    await page.locator("#undo-btn").click();
    await waitCount(0);
    await page.locator("#fill-source").selectOption("layer");
    await click(4, 4);
    await waitCount(256);
    await page.locator("#undo-btn").click();
    await waitCount(0);
    await page.locator("#fill-source").selectOption("visible");
    await page.locator("#alpha-lock-btn").click();
    await click(4, 4);
    assert.equal((await draft()).layers[0].pixels.filter(Boolean).length, 0);
    await selectTool("select");
    await drag(3, 3, 4, 4);
    assert.equal(await countSelection(), 4);
    await page.keyboard.press("Control+d");
    assert.equal(await countSelection(), 0);
    await page.keyboard.press("Control+Shift+d");
    assert.equal(await countSelection(), 4);
    await page.locator("#selection-drag").selectOption("mask");
    // Boundary movement works under alpha lock; cancel restores the exact original mask.
    await page.mouse.move(...(await pos(3, 3)));
    await page.mouse.down();
    await page.mouse.move(...(await pos(6, 6)));
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await countSelection(), 4);
    await drag(3, 3, 5, 4);
    assert.equal(await countSelection(), 4);
    assert.equal(await page.locator("#placement-actions").isVisible(), false);
    assert.equal((await draft()).layers[0].pixels.filter(Boolean).length, 0);
    await page.locator("#alpha-lock-btn").click();
    await selectTool("fill");
    await click(5, 4);
    await waitCount(4);
    assert.deepEqual(
      (await draft()).layers[0].pixels.flatMap((v, i) => (v ? [i] : [])),
      [69, 70, 85, 86],
    );
    await page.locator("#undo-btn").click();
    await waitCount(0);
    // Undo the alpha toggle and boundary move, keeping the document untouched.
    await page.locator("#undo-btn").click();
    await page.locator("#undo-btn").click();
    await selectTool("select");
    await page.keyboard.press("ArrowRight");
    await page.locator("#alpha-lock-btn").click();
    await selectTool("fill");
    await click(4, 3);
    await waitCount(4);
    assert.deepEqual(
      (await draft()).layers[0].pixels.flatMap((v, i) => (v ? [i] : [])),
      [52, 53, 68, 69],
    );
    await page.locator("#undo-btn").click();
    await waitCount(0);
    await selectTool("select");
    await page.keyboard.press("Control+d");
    await page.locator("#reselect").click();
    assert.equal(await countSelection(), 4);
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    assert.equal(await countSelection(), 4);
    await page.keyboard.press("Control+d");
    await page.locator("#new-btn").click();
    await page.locator('#new-form button[type="submit"]').click();
    page = await require("./next-editor.cjs")(app, page);
    if (await page.locator("#confirm-dialog").isVisible())
      await page.locator("#confirm-skip").click();
    await page.locator("#new-dialog").waitFor({ state: "hidden" });
    await selectTool("select");
    assert.equal(await page.locator("#reselect").isEnabled(), false);
    for (const [lang, theme] of [
      ["ko", "dark"],
      ["de", "light"],
    ]) {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
      );
      await page.locator("#settings-btn").click();
      await page.locator("#pref-language").selectOption(lang);
      await page.locator("#settings-tab-display").click();
      await page.locator("#pref-theme").selectOption(theme);
      await page.locator('#settings-form button[type="submit"]').click();
      await page.locator("#settings-dialog").waitFor({ state: "hidden" });
      await selectTool("select");
      await page.screenshot({
        path: path.join(root, "artifacts", `convenience-${lang}.png`),
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: per-tool brush persistence, composite/current fill, active-layer and alpha protection, reselect, boundary-only drag/cancel/undo/arrows/clamping, document reset, localized layout",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
