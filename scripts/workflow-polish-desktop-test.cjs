if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("polish-");
  const { createDocument, ensureLayers, documentRGBA } =
      await import("../src/core.mjs"),
    { decodePNG } = await import("../electron/png.mjs");
  const d = ensureLayers(createDocument(16, 16));
  d.palette.push("#12345680");
  d.pixels[0] = 16;
  d.pixels[16] = 8;
  d.layers.push(
    {
      id: "upper",
      name: "Upper",
      visible: true,
      locked: false,
      pixels: Array(256).fill(0),
    },
    {
      id: "hidden",
      name: "Hidden",
      visible: false,
      locked: false,
      pixels: Array(256).fill(0),
    },
  );
  d.layers[1].pixels[34] = 11;
  d.layers[2].pixels[51] = 13;
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
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(10000);
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    const focus = () => page.locator("#overlay-canvas").focus();
    const tool = async (id) => {
      await page.locator(`[data-tool="${id}"]`).click();
      await focus();
    };
    const pos = async (x, y) => {
      const r = await page.locator("#overlay-canvas").boundingBox();
      return [
        r.x + ((x + 0.5) * r.width) / 16,
        r.y + ((y + 0.5) * r.height) / 16,
      ];
    };
    const click = async (x, y) => page.mouse.click(...(await pos(x, y)));
    const startDrag = async (x, y, a, b) => {
      await page.mouse.move(...(await pos(x, y)));
      await page.mouse.down();
      await page.mouse.move(...(await pos(a, b)), { steps: 4 });
    };
    const drag = async (...p) => {
      await startDrag(...p);
      await page.mouse.up();
    };
    const draft = async () => {
      await page.waitForFunction(() =>
        document.querySelector("#save-status").textContent.includes("저장됨"),
      );
      return page.evaluate(() => window.pixeltool.loadDraft());
    };
    await tool("select");
    await drag(0, 0, 1, 0);
    await page.locator("#selection-more > summary").click();
    await page.locator("#transform-action").selectOption("rotate-cw");
    assert.equal((await draft()).layers[0].pixels[16], 8);
    await page.locator("#undo-btn").click();
    await focus();
    await page.keyboard.press("Control+j");
    let now = await draft();
    assert.equal(now.layers.length, 4);
    assert.equal(now.layers[1].pixels[0], 16);
    assert.equal(now.layers[0].pixels[0], 16);
    await page.locator("#undo-btn").click();
    await focus();
    await page.keyboard.press("Control+Shift+j");
    now = await draft();
    assert.equal(now.layers[0].pixels[0], 0);
    assert.equal(now.layers[1].pixels[0], 16);
    assert.deepEqual(documentRGBA(now), documentRGBA(d));
    await page.locator("#undo-btn").click();
    await focus();
    await page.keyboard.press("Control+d");
    await page.locator("#layer-more").selectOption("solo");
    assert.deepEqual(
      (await draft()).layers.map((l) => l.visible),
      [true, false, false],
    );
    await tool("pencil");
    await click(5, 5);
    assert.equal((await draft()).layers[0].pixels[85], 7);
    assert.equal(
      await page.locator('#layer-more option[value="solo"]').textContent(),
      "표시 상태 복원",
    );
    await page.locator("#layer-more").selectOption("solo");
    now = await draft();
    assert.deepEqual(
      now.layers.map((l) => l.visible),
      [true, true, false],
    );
    assert.equal(now.layers[0].pixels[85], 7);
    await page.locator("#undo-btn").click();
    assert.deepEqual(
      (await draft()).layers.map((l) => l.visible),
      [true, false, false],
    );
    await page.locator("#redo-btn").click();
    assert.deepEqual(
      (await draft()).layers.map((l) => l.visible),
      [true, true, false],
    );
    const original = await draft();
    await page.locator("#view-mirror").click();
    assert.equal(
      await page.locator("#view-mirror").getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(await draft(), original);
    const png = path.join(profile, "mirrored-view-export.png");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, png);
    await page.locator("#export-btn").click();
    await page
      .waitForFunction(
        () =>
          document.querySelector("#ai-status").textContent.includes("PNG") ||
          document.querySelector("#toast").textContent.includes("PNG"),
      )
      .catch(() => {});
    assert.deepEqual(
      documentRGBA(decodePNG(await fs.readFile(png))),
      documentRGBA(original),
    );
    await tool("pencil");
    await click(1, 4);
    assert.equal((await draft()).layers[0].pixels[78], 7);
    assert.equal((await draft()).layers[0].pixels[65], 0);
    await tool("picker");
    await click(1, 4);
    assert.match(
      await page.locator("#primary-color").getAttribute("title"),
      /#50A889FF/,
    );
    await page.locator("#undo-btn").click();
    await tool("select");
    await drag(10, 5, 10, 5);
    await startDrag(10, 5, 9, 6);
    assert.match(
      await page.locator("#movement-feedback").textContent(),
      /픽셀 이동.*\+1.*\+1/,
    );
    await page.mouse.up();
    await focus();
    await page.keyboard.press("Escape");
    assert.deepEqual(await draft(), original);
    await page.locator("#selection-drag").selectOption("mask");
    await startDrag(10, 5, 9, 6);
    assert.match(
      await page.locator("#movement-feedback").textContent(),
      /테두리 이동.*\+1.*\+1/,
    );
    assert.equal(
      await page.locator("#overlay-canvas").evaluate((e) => e.style.cursor),
      "grabbing",
    );
    await page.mouse.up();
    assert.equal(await page.locator("#movement-feedback").isVisible(), false);
    assert.deepEqual(await draft(), original);
    await page.locator("#undo-btn").click();
    await page.locator("#selection-drag").selectOption("pixels");
    await focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    now = await draft();
    assert.equal(now.layers[0].pixels[84], 7);
    assert.equal(now.layers[0].pixels[85], 0);
    await page.locator("#undo-btn").click();
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
      await page.locator("#selection-more").evaluate((e) => (e.open = true));
      await page.screenshot({
        path: path.join(root, "artifacts", `workflow-polish-${lang}.png`),
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
      "PASS: transparent-safe rotation, copy/cut selection layers, solo restore after painting and undo/redo, view-only mirror and native PNG export, mirrored picking/drawing/drag/arrows, move feedback/cancel, translated layout",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
