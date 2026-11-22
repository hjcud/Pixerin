if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs/promises");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile =
      await require("./test-runner.cjs").createProfile("drawing-tools-");
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
    await require("./editor-ready.cjs")(page);
    const tool = (name) => page.locator(`[data-tool="${name}"]`).click();
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const colored = async () =>
      (await pixels()).flatMap((v, i) =>
        i % 4 === 3 && v ? [(i - 3) / 4] : [],
      );
    const pos = async (x, y) => {
      const b = await page.locator("#overlay-canvas").boundingBox();
      return {
        x: b.x + ((x + 0.5) * b.width) / 16,
        y: b.y + ((y + 0.5) * b.height) / 16,
      };
    };
    const click = async (x, y) => {
      const p = await pos(x, y);
      await page.mouse.click(p.x, p.y);
    };
    const drag = async (a, b) => {
      const p = await pos(...a),
        q = await pos(...b);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(q.x, q.y, { steps: 8 });
      await page.mouse.up();
    };
    const undo = () => page.locator("#undo-btn").click();
    const key = async (k) => {
      await page.locator("#overlay-canvas").focus();
      await page.keyboard.press(k);
    };
    await tool("rectangle");
    await page.selectOption("#shape-kind", "ellipse");
    await drag([2, 2], [10, 10]);
    const ellipse = await colored();
    assert.ok(ellipse.length > 15);
    assert.ok(!ellipse.includes(6 * 16 + 6));
    await undo();
    assert.equal((await colored()).length, 0);
    await page.locator("#shape-filled").check();
    await drag([2, 2], [10, 10]);
    assert.ok((await colored()).includes(6 * 16 + 6));
    await undo();
    await tool("select");
    await page.selectOption("#selection-shape", "ellipse");
    await drag([2, 2], [10, 10]);
    await tool("rectangle");
    await drag([0, 0], [15, 15]);
    assert.ok((await colored()).includes(6 * 16 + 6));
    assert.ok(!(await colored()).includes(2 * 16 + 2));
    await undo();
    await key("Control+d");
    await tool("select");
    await page.selectOption("#selection-shape", "polygon");
    await click(2, 2);
    await click(12, 2);
    await click(2, 12);
    assert.ok(await page.locator("#path-actions").isVisible());
    await key("Escape");
    assert.ok(await page.locator("#path-actions").isHidden());
    assert.ok(
      (await page.locator("#selection-summary").innerText()).includes("없음"),
    );
    await click(2, 2);
    await click(12, 2);
    await click(12, 12);
    await key("Backspace");
    await click(2, 12);
    await key("Enter");
    await tool("rectangle");
    await drag([0, 0], [15, 15]);
    assert.ok((await colored()).includes(3 * 16 + 3));
    assert.ok(!(await colored()).includes(11 * 16 + 11));
    await undo();
    await key("Control+d");
    await tool("select");
    await page.selectOption("#selection-shape", "lasso");
    const a = await pos(3, 3);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (const p of [
      [11, 3],
      [11, 11],
      [3, 11],
      [3, 3],
    ]) {
      const q = await pos(...p);
      await page.mouse.move(q.x, q.y, { steps: 3 });
    }
    await page.mouse.up();
    assert.ok(
      (await page.locator("#selection-summary").innerText()).includes("81"),
    );
    await key("Control+d");
    await tool("rectangle");
    await page.selectOption("#shape-kind", "polygon");
    await click(2, 2);
    await click(12, 2);
    await click(2, 12);
    await page.locator("#doc-name").focus();
    assert.equal((await colored()).length, 0);
    assert.ok(await page.locator("#path-actions").isHidden());
    await click(2, 2);
    await click(12, 2);
    await click(2, 12);
    await key("Enter");
    assert.ok((await colored()).includes(3 * 16 + 3));
    const polygon = await pixels();
    await undo();
    assert.equal((await colored()).length, 0);
    await page.locator("#redo-btn").click();
    assert.deepEqual(await pixels(), polygon);
    await undo();
    await tool("line");
    await page.selectOption("#line-kind", "curve");
    await drag([2, 3], [12, 3]);
    const control = await pos(7, 13);
    await page.mouse.move(control.x, control.y);
    assert.ok((await colored()).some((i) => Math.floor(i / 16) >= 7));
    await key("Escape");
    assert.equal((await colored()).length, 0);
    await drag([2, 3], [12, 3]);
    await click(7, 13);
    assert.ok((await colored()).includes(3 * 16 + 2));
    assert.ok((await colored()).includes(3 * 16 + 12));
    await undo();
    await tool("pencil");
    await page.locator("#brush-details").evaluate((el) => (el.open = true));
    await page.locator("#symmetry-toggle").check();
    await page.locator("#symmetry-vertical").check();
    await page.locator(".symmetry-options").evaluate((el) => (el.open = true));
    await page.locator("#symmetry-x").fill("4.5");
    await page.locator("#symmetry-x").press("Tab");
    await page.locator("#symmetry-y").fill("5");
    await page.locator("#symmetry-y").press("Tab");
    await click(2, 3);
    assert.deepEqual(await colored(), [50, 55, 114, 119]);
    await undo();
    await page.locator("#symmetry-edit").click();
    await drag([4, 1], [6, 1]);
    assert.equal(Number(await page.locator("#symmetry-x").inputValue()), 6);
    const from = await pos(6, 1),
      to = await pos(9, 1);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y);
    await key("Escape");
    await page.mouse.up();
    assert.equal(Number(await page.locator("#symmetry-x").inputValue()), 6);
    assert.equal((await colored()).length, 0);
    await key("Escape");
    await page.locator("#symmetry-toggle").uncheck();
    await page.locator("#symmetry-vertical").uncheck();
    await click(2, 2);
    const art = await pixels();
    await page.locator("#palette-library-open").click();
    await page.locator("#palette-library-name").fill("Library test");
    await page.locator("#palette-library-save").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#palette-library-list").options.length === 1,
    );
    const palettes = await page.evaluate(() => window.pixeltool.listPalettes());
    assert.equal(palettes[0].palette.name, "Library test");
    await page.locator("#palette-library-close").click();
    const custom = {
      format: "pixerin-palette",
      version: 1,
      name: "Imported",
      colors: ["#12345678"],
      shadeRamps: [
        {
          name: "Custom ramp",
          colors: ["#12345678", "#445566FF", "#FFFFFFFF"],
        },
      ],
    };
    const importFile = path.join(profile, "source.palette.json"),
      exportFile = path.join(profile, "export.palette.json");
    await fs.writeFile(importFile, JSON.stringify(custom));
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, importFile);
    await page.locator("#palette-library-open").click();
    await page.locator("#palette-library-import").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#palette-library-list").options.length === 2,
    );
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, exportFile);
    await page.locator("#palette-library-export").click();
    await page.waitForFunction(
      () => !document.querySelector("#palette-library-export").disabled,
    );
    assert.deepEqual(JSON.parse(await fs.readFile(exportFile, "utf8")), custom);
    await page.locator("#palette-library-apply").click();
    await page.waitForSelector("#palette-library-dialog", { state: "hidden" });
    assert.deepEqual(await pixels(), art);
    assert.equal(await page.locator("#palette button").count(), 17);
    await undo();
    assert.equal(await page.locator("#palette button").count(), 16);
    assert.deepEqual(await pixels(), art);
    await page.locator("#palette-library-open").click();
    await page.locator("#palette-library-delete").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#palette-library-list").options.length === 1,
    );
    await page.locator("#palette-library-close").click();
    await page.reload();
    await require("./editor-ready.cjs")(page);
    await page.locator("#palette-library-open").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#palette-library-list").options.length === 1,
    );
    assert.equal(
      await page.locator("#palette-library-list option").innerText(),
      "Imported",
    );
    const duplicateIds = await page.evaluate(
      (p) =>
        Promise.all([
          window.pixeltool.savePalette(p),
          window.pixeltool.savePalette(p),
        ]),
      custom,
    );
    assert.equal(duplicateIds[0], duplicateIds[1]);
    assert.equal(
      (await page.evaluate(() => window.pixeltool.listPalettes())).length,
      1,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "palette-library.png"),
    });
    await page.locator("#palette-library-close").click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    for (const locale of ["en", "ja", "zh-CN", "es", "fr", "de", "ko"]) {
      await page.locator("#settings-btn").click();
      await page.locator("#pref-language").selectOption(locale);
      await page.keyboard.press("Escape");
      await tool("select");
      await page.selectOption("#selection-shape", "polygon");
      const label = await page
        .locator('[data-tool="select"] span:not([data-icon])')
        .innerText();
      if (locale !== "ko") assert.doesNotMatch(label, /[가-힣]/);
      await page.locator("#palette-library-open").click();
      if (locale !== "ko")
        assert.doesNotMatch(
          await page.locator("#palette-library-dialog").innerText(),
          /[가-힣]/,
        );
      await page.locator("#palette-library-apply").scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const box = await page.locator("#palette-library-apply").boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= 740);
      await page.locator("#palette-library-close").click();
    }
    assert.deepEqual(errors, []);
    console.log(
      "Drawing modes, gesture rollback, symmetry and palette import/export/reuse passed.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
