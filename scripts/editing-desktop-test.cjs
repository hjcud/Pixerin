if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("editing-profile-");
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  let page;
  try {
    page =
      (await require("./mock-pixel-clipboard.cjs")(app),
      await require("./first-editor.cjs")(app));
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () => document.querySelectorAll("#palette button").length === 16,
    );
    await require("./editor-ready.cjs")(page);
    const rgba = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) =>
          Array.from(
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        );
    const pixel = async (x, y) =>
      (await rgba()).slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4);
    let box;
    const cell = (x, y) => ({
      x: box.x + ((x + 0.5) * box.width) / 16,
      y: box.y + ((y + 0.5) * box.height) / 16,
    });
    const position = async () => {
      box = await page.locator("#overlay-canvas").boundingBox();
    };
    const click = async (x, y, button = "left") => {
      const p = cell(x, y);
      await page.mouse.click(p.x, p.y, { button });
    };
    const drag = async (x, y, tx, ty) => {
      const a = cell(x, y),
        b = cell(tx, ty);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 4 });
      await page.mouse.up();
    };
    const tool = async (t) => page.locator('[data-tool="' + t + '"]').click();
    const select = async (x, y, tx = x, ty = y) => {
      await tool("select");
      await drag(x, y, tx, ty);
    };
    const clear = async () => {
      await page.locator("#overlay-canvas").focus();
      await page.keyboard.press("Control+d");
    };
    const undo = () => page.locator("#undo-btn").click();
    await position();
    await page.locator("#palette button").nth(7).click();
    await page.locator("#palette button").nth(11).click({ button: "right" });
    await click(0, 0);
    await click(1, 0, "right");
    assert.deepEqual(await pixel(0, 0), [80, 168, 137, 255]);
    assert.deepEqual(await pixel(1, 0), [215, 120, 135, 255]);
    await page.keyboard.press("x");
    await click(2, 0);
    assert.deepEqual(await pixel(2, 0), [215, 120, 135, 255]);
    await page.keyboard.down("Alt");
    await click(0, 0);
    await page.keyboard.up("Alt");
    await click(3, 0);
    assert.deepEqual(await pixel(3, 0), [80, 168, 137, 255]);
    console.log(
      "PASS: left/right palette and drawing, swap, temporary eyedropper",
    );
    const pickedBefore = await rgba();
    for (const button of ["left", "right"]) {
      await tool("picker");
      await click(0, 0, button);
      assert.ok(
        await page
          .locator('[data-tool="pencil"]')
          .evaluate((b) => b.classList.contains("active")),
      );
    }
    await tool("line");
    await page.keyboard.down("Alt");
    await click(0, 0);
    await page.keyboard.up("Alt");
    assert.ok(
      await page
        .locator('[data-tool="line"]')
        .evaluate((b) => b.classList.contains("active")),
    );
    await page.locator("#settings-btn").click();
    await page.locator('[data-settings-tab="editor"]').click();
    assert.ok(await page.locator("#pref-pickerToPencil").isChecked());
    await page.locator("#pref-pickerToPencil").uncheck();
    await page.locator('#settings-form button[type="submit"]').click();
    assert.equal(
      await page.evaluate(
        async () =>
          (await window.pixeltool.getSettings()).preferences.pickerToPencil,
      ),
      false,
    );
    await position();
    await tool("picker");
    await click(0, 0);
    assert.ok(
      await page
        .locator('[data-tool="picker"]')
        .evaluate((b) => b.classList.contains("active")),
    );
    assert.deepEqual(await rgba(), pickedBefore);
    await page.locator("#settings-btn").click();
    await page.locator('[data-settings-tab="editor"]').click();
    await page.locator("#pref-pickerToPencil").check();
    await page.locator('#settings-form button[type="submit"]').click();
    await position();
    console.log(
      "PASS: picker returns to pencil for both buttons; Alt preserves tool; setting saves without artwork changes",
    );

    await select(2, 2, 4, 4);
    assert.match(
      await page.locator("#selection-summary").textContent(),
      /9픽셀/,
    );
    await click(8, 8);
    assert.match(
      await page.locator("#selection-summary").textContent(),
      /영역 없음/,
    );
    await select(2, 2, 4, 4);
    const vr = await page.locator("#viewport").boundingBox();
    await page.mouse.click(vr.x + 6, vr.y + 6);
    assert.match(
      await page.locator("#selection-summary").textContent(),
      /영역 없음/,
    );
    await select(2, 2, 4, 4);
    await tool("pencil");
    const before = await rgba();
    await click(9, 9);
    assert.deepEqual(await rgba(), before);
    await tool("fill");
    await click(3, 3);
    assert.deepEqual(await pixel(2, 2), [80, 168, 137, 255]);
    assert.deepEqual(await pixel(5, 3), [0, 0, 0, 0]);
    await undo();
    assert.deepEqual(await rgba(), before);
    console.log(
      "PASS: selection outside click and workspace click dismiss; fill stays inside selection",
    );

    await clear();
    await tool("rectangle");
    await drag(6, 6, 9, 9);
    assert.deepEqual(await pixel(6, 6), [80, 168, 137, 255]);
    assert.deepEqual(await pixel(7, 7), [0, 0, 0, 0]);
    const rectangle = await rgba();
    await undo();
    assert.deepEqual(await pixel(6, 6), [0, 0, 0, 0]);
    await page.locator("#redo-btn").click();
    assert.deepEqual(await rgba(), rectangle);
    await tool("line");
    let a = cell(10, 2),
      b = cell(13, 5);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(await rgba(), rectangle);
    await drag(10, 2, 13, 5);
    assert.deepEqual(await pixel(12, 4), [80, 168, 137, 255]);
    await undo();
    console.log(
      "PASS: shape drag preview, atomic undo/redo, Esc cancels in-progress shape",
    );

    await select(6, 6, 9, 9);
    await page.keyboard.press("ArrowRight");
    assert.deepEqual(await pixel(6, 6), [0, 0, 0, 0]);
    assert.deepEqual(await pixel(10, 6), [80, 168, 137, 255]);
    await undo();
    assert.deepEqual(await rgba(), rectangle);
    assert.match(
      await page.locator("#selection-summary").textContent(),
      /16픽셀/,
    );
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Control+c");
    a = cell(1, 9);
    await page.mouse.move(a.x, a.y);
    await page.keyboard.press("Control+v");
    assert.deepEqual(await pixel(1, 9), [80, 168, 137, 255]);
    assert.deepEqual(await pixel(2, 10), [0, 0, 0, 0]);
    await page.keyboard.press("Delete");
    assert.deepEqual(await pixel(1, 9), [0, 0, 0, 0]);
    await undo();
    assert.deepEqual(await pixel(1, 9), [80, 168, 137, 255]);
    await undo();
    assert.deepEqual(await rgba(), rectangle);
    console.log(
      "PASS: move, clipboard, delete, and undo restore pixels and selection",
    );

    await clear();
    await tool("pencil");
    await page.locator("#palette button").nth(7).click();
    await page.locator("#palette button").nth(11).click({ button: "right" });
    await click(1, 14);
    for (const x of [3, 4, 5]) await click(x, 14, "right");
    const beforeTransparentMove = await rgba();
    await select(1, 14, 2, 14);
    await page.keyboard.press("ArrowRight");
    assert.deepEqual(await pixel(1, 14), [0, 0, 0, 0]);
    assert.deepEqual(await pixel(2, 14), [80, 168, 137, 255]);
    assert.deepEqual(await pixel(3, 14), [215, 120, 135, 255]);
    assert.match(
      await page.locator("#selection-summary").textContent(),
      /2픽셀/,
    );
    await undo();
    assert.deepEqual(await rgba(), beforeTransparentMove);
    await tool("move");
    await drag(1, 14, 4, 14);
    const transparentMove = await rgba();
    assert.deepEqual(await pixel(4, 14), [80, 168, 137, 255]);
    assert.deepEqual(await pixel(5, 14), [215, 120, 135, 255]);
    await page.keyboard.press("Enter");
    await undo();
    assert.deepEqual(await rgba(), beforeTransparentMove);
    await page.locator("#redo-btn").click();
    assert.deepEqual(await rgba(), transparentMove);
    await undo();
    console.log(
      "PASS: transparent selection pixels preserve destination colors in keyboard/drag moves and undo/redo",
    );

    await clear();
    await tool("pencil");
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("]");
    assert.equal(await page.locator("#brush-size").inputValue(), "2");
    await click(13, 10);
    assert.deepEqual(await pixel(14, 11), [80, 168, 137, 255]);
    await undo();
    const zoomBefore = await page.locator("#zoom-label").textContent();
    const beforeResize = await rgba();
    a = cell(8, 8);
    await page.mouse.move(a.x, a.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(
      () => document.querySelector("#brush-size").value === "3",
    );
    await page.keyboard.up("Control");
    assert.equal(await page.locator("#brush-size-label").textContent(), "3 px");
    assert.equal(await page.locator("#zoom-label").textContent(), zoomBefore);
    assert.deepEqual(await rgba(), beforeResize);
    await click(12, 10);
    assert.deepEqual(await pixel(11, 9), [80, 168, 137, 255]);
    assert.deepEqual(await pixel(13, 11), [80, 168, 137, 255]);
    await undo();
    await page.mouse.move(a.x, a.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(
      () => document.querySelector("#brush-size").value === "2",
    );
    await page.keyboard.up("Control");
    const ctrlWheel = (deltaY, count = 1, target = "#viewport") =>
      page.locator(target).evaluate(
        (element, { deltaY, count }) => {
          for (let i = 0; i < count; i++)
            element.dispatchEvent(
              new WheelEvent("wheel", {
                deltaY,
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
              }),
            );
        },
        { deltaY, count },
      );
    await ctrlWheel(-100, 12);
    assert.equal(await page.locator("#brush-size").inputValue(), "8");
    await ctrlWheel(100, 12);
    assert.equal(await page.locator("#brush-size").inputValue(), "1");
    await ctrlWheel(0);
    await ctrlWheel(-100, 1, ".tools-panel");
    assert.equal(await page.locator("#brush-size").inputValue(), "1");
    await page.locator("#settings-btn").click();
    await ctrlWheel(-100);
    assert.equal(await page.locator("#brush-size").inputValue(), "1");
    await page.locator("#settings-dialog .dialog-close").first().click();
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await ctrlWheel(-100);
    assert.equal(await page.locator("#brush-size").inputValue(), "1");
    await page.mouse.up();
    await undo();
    assert.deepEqual(await rgba(), beforeResize);
    assert.equal(await page.locator("#zoom-label").textContent(), zoomBefore);
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("]");
    assert.equal(await page.locator("#brush-size").inputValue(), "2");
    console.log(
      "PASS: Ctrl+wheel changes brush size and footprint without zoom or artwork changes; limits, scope, modal and stroke locks",
    );
    a = cell(8, 8);
    await page.mouse.move(a.x, a.y);
    await page.mouse.wheel(0, -600);
    assert.notEqual(
      await page.locator("#zoom-label").textContent(),
      zoomBefore,
    );
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -200);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const frozen = await rgba();
    const beforePan = await page.locator("#overlay-canvas").boundingBox();
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.down("Space");
    await page.mouse.move(vr.x + vr.width / 2, vr.y + vr.height / 2);
    await page.mouse.down();
    await page.mouse.move(vr.x + vr.width / 2 - 90, vr.y + vr.height / 2 - 80, {
      steps: 4,
    });
    await page.mouse.up();
    await page.keyboard.up("Space");
    assert.deepEqual(await rgba(), frozen);
    const afterPan = await page.locator("#overlay-canvas").boundingBox();
    assert.ok(
      Math.abs(afterPan.x - beforePan.x + 90) <= 1,
      JSON.stringify({ beforePan, afterPan, vr }),
    );
    assert.ok(Math.abs(afterPan.y - beforePan.y + 80) <= 1);
    assert.equal(
      await page
        .locator("#viewport")
        .evaluate((v) => getComputedStyle(v).overflow),
      "clip",
    );
    assert.equal(
      await page
        .locator("#viewport")
        .evaluate((v) => v.scrollLeft + v.scrollTop),
      0,
    );
    // A small image can move in every direction, including drags on empty space.
    await page.evaluate(() => {
      for (let i = 0; i < 40; i++) document.getElementById("zoom-out").click();
    });
    await page.locator("#fit-btn").click();
    await page.evaluate(() => {
      for (let i = 0; i < 40; i++) document.getElementById("zoom-out").click();
    });
    assert.equal(
      (await page.locator("#overlay-canvas").boundingBox()).width,
      16,
    );
    await tool("hand");
    const v = await page.locator("#viewport").boundingBox();
    for (const [dx, dy] of [
      [100, 70],
      [-180, -100],
      [40, -60],
      [40, 90],
    ]) {
      const before = await page.locator("#overlay-canvas").boundingBox();
      await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
      await page.mouse.down();
      await page.mouse.move(v.x + v.width / 2 + dx, v.y + v.height / 2 + dy, {
        steps: 4,
      });
      await page.mouse.up();
      const after = await page.locator("#overlay-canvas").boundingBox();
      assert.ok(Math.abs(after.x - before.x - dx) <= 1);
      assert.ok(Math.abs(after.y - before.y - dy) <= 1);
    }
    const small = await page.locator("#overlay-canvas").boundingBox();
    const anchor = { x: small.x + 4, y: small.y + 6 };
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.wheel(0, -120);
    await page.waitForFunction(
      () =>
        document.getElementById("pixel-canvas").getBoundingClientRect().width >
        16,
    );
    const enlarged = await page.locator("#overlay-canvas").boundingBox();
    assert.ok(Math.abs(enlarged.x + (4 * enlarged.width) / 16 - anchor.x) <= 1);
    assert.ok(
      Math.abs(enlarged.y + (6 * enlarged.height) / 16 - anchor.y) <= 1,
    );
    assert.deepEqual(await rgba(), frozen);
    await page.locator("#fit-btn").click();
    const centered = await page.locator("#overlay-canvas").boundingBox();
    assert.ok(
      Math.abs(centered.x + centered.width / 2 - v.x - v.width / 2) <= 1,
    );
    assert.ok(
      Math.abs(centered.y + centered.height / 2 - v.y - v.height / 2) <= 1,
    );
    await tool("pencil");
    await page.locator("#fit-btn").click();
    await position();
    console.log(
      "PASS: brush sizing, wheel zoom, Space drag pans without painting",
    );

    await require("./configure-test-api.cjs")(page);
    await page.locator("#model-picker-btn").click();
    await page.locator("#model-select").selectOption("__custom");
    await page.locator("#model-input").fill("catalog-vision");
    await page.locator('#settings-form button[type="submit"]').click();
    await page.waitForSelector("#settings-dialog", { state: "hidden" });
    assert.match(
      await page.locator("#model-label").textContent(),
      /catalog-vision/,
    );
    await page.locator("#model-picker-btn").click();
    await page.locator("#model-select").selectOption("__custom");
    await page.locator("#model-input").fill("custom-model");
    await page.locator('#settings-form button[type="submit"]').click();
    await page.waitForSelector("#settings-dialog", { state: "hidden" });
    assert.equal(
      JSON.parse(await fs.readFile(path.join(profile, "settings.json"), "utf8"))
        .model,
      "custom-model",
    );
    await page.locator("#model-picker-btn").click();
    assert.equal(await page.locator("#model-select").inputValue(), "__custom");
    assert.equal(
      await page.locator("#model-input").inputValue(),
      "custom-model",
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "ux-models.png"),
    });
    await page.locator("#settings-dialog .dialog-close").first().click();
    await page.locator("#help-btn").click();
    assert.equal(await page.locator("#help-dialog").isVisible(), true);
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: path.join(root, "artifacts", "ux-editor.png"),
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1060, 740),
    );
    await page.locator("#fit-btn").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "ux-small.png"),
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: explicit API model ID persistence, shortcut help, minimum layout; zero renderer errors",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: path.join(root, "artifacts", "ux-failure.png") })
        .catch(() => {});
    throw e;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
