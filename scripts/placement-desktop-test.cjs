if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("placement-");
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  let diagnosticPage;
  try {
    const page =
        (await require("./mock-pixel-clipboard.cjs")(app),
        await require("./first-editor.cjs")(app)),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    diagnosticPage = page;
    const canvas = page.locator("#overlay-canvas");
    await page.evaluate(() => {
      window.placementInputTrace = [];
      for (const name of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "lostpointercapture",
        "blur",
      ])
        window.addEventListener(
          name,
          (e) => {
            window.placementInputTrace.push({
              event: name,
              x: e.clientX,
              y: e.clientY,
              buttons: e.buttons,
              shift: e.shiftKey,
              target: e.target?.id,
              focus: document.hasFocus(),
            });
            window.placementInputTrace = window.placementInputTrace.slice(-30);
          },
          true,
        );
    });
    const rgba = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const pixel = async (x, y) =>
      (await rgba()).slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4);
    const point = async (x, y) => {
      const b = await canvas.boundingBox();
      return [
        b.x + ((x + 0.5) * b.width) / 16,
        b.y + ((y + 0.5) * b.height) / 16,
      ];
    };
    const click = async (x, y, button = "left") =>
      page.mouse.click(...(await point(x, y)), { button });
    const drag = async (x, y, tx, ty, shift = false, cancel = false) => {
      await page.mouse.move(...(await point(x, y)));
      if (shift) await page.keyboard.down("Shift");
      await page.mouse.down();
      await page.mouse.move(...(await point(tx, ty)), { steps: 4 });
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
      if (shift) await page.keyboard.up("Shift");
    };
    const tool = (t) => page.locator(`[data-tool="${t}"]`).click();
    const key = (k) => page.keyboard.press(k);
    const selectionCount = () =>
      page.locator("#selection-summary").textContent();
    await page.locator("#palette button").nth(7).click();
    await page.locator("#palette button").nth(11).click({ button: "right" });
    await click(1, 1);
    for (const x of [4, 5, 6]) await click(x, 1, "right");
    const original = await rgba(),
      green = await pixel(1, 1),
      pink = await pixel(4, 1);
    await tool("select");
    await drag(1, 1, 2, 1);
    await page.waitForFunction(
      () =>
        document.getElementById("save-status").textContent ===
        "복구본 저장됨",
    );
    const saved = await fs.readFile(path.join(profile, "draft.json"), "utf8");
    const historyCount = await page.locator("#undo-btn").getAttribute("title");
    for (let i = 0; i < 3; i++) await key("ArrowRight");
    assert.deepEqual(await pixel(4, 1), green);
    assert.deepEqual(await pixel(5, 1), pink);
    await key("ArrowRight");
    assert.deepEqual(await pixel(4, 1), pink);
    assert.deepEqual(await pixel(5, 1), green);
    assert.deepEqual(await pixel(6, 1), pink);
    assert.equal(
      await fs.readFile(path.join(profile, "draft.json"), "utf8"),
      saved,
      "preview must not overwrite autosave",
    );
    assert.equal(
      await page.locator("#undo-btn").getAttribute("title"),
      historyCount,
    );
    for (let i = 0; i < 4; i++) await key("ArrowLeft");
    assert.deepEqual(await rgba(), original);
    await key("Escape");
    assert.ok(await page.locator("#placement-actions").isHidden());
    assert.match(await selectionCount(), /2픽셀/);

    await tool("move");
    await drag(1, 1, 4, 1);
    await drag(4, 1, 5, 1);
    assert.deepEqual(await pixel(4, 1), pink);
    assert.deepEqual(await pixel(5, 1), green);
    assert.deepEqual(await pixel(6, 1), pink);
    const finalMove = await rgba();
    await key("Enter");
    assert.ok(await page.locator("#placement-actions").isHidden());
    await key("Control+z");
    assert.deepEqual(await rgba(), original);
    await key("Control+Shift+z");
    assert.deepEqual(await rgba(), finalMove);
    await key("Control+z");

    await drag(1, 1, 4, 3, true);
    assert.deepEqual(await pixel(4, 1), green);
    assert.deepEqual(await pixel(4, 3), [0, 0, 0, 0]);
    await page.locator("#placement-cancel").click();
    assert.deepEqual(await rgba(), original);
    await drag(1, 1, 3, 5, true);
    assert.deepEqual(await pixel(1, 5), green);
    assert.deepEqual(await pixel(3, 5), [0, 0, 0, 0]);
    await canvas.focus();
    await key("Escape");
    await drag(1, 1, 4, 1, false, true);
    assert.deepEqual(await rgba(), original);

    await key("Control+c");
    await page.mouse.move(...(await point(4, 1)));
    await key("Control+v");
    assert.deepEqual(await pixel(4, 1), green);
    assert.deepEqual(await pixel(5, 1), pink);
    await key("ArrowRight");
    assert.deepEqual(await pixel(4, 1), pink);
    assert.deepEqual(await pixel(5, 1), green);
    await page.locator("#placement-cancel").click();
    assert.deepEqual(await rgba(), original);
    await canvas.focus();
    await key("Control+v");
    await page.locator("#placement-apply").click();
    const pasted = await rgba();
    assert.notDeepEqual(pasted, original);
    await canvas.focus();
    await key("Control+z");
    assert.deepEqual(await rgba(), original);
    await key("Control+Shift+z");
    assert.deepEqual(await rgba(), pasted);
    await key("Control+z");

    await key("Control+Shift+i");
    assert.match(await selectionCount(), /254픽셀/);
    await key("Control+z");
    assert.match(await selectionCount(), /2픽셀/);
    await key("Control+d");
    assert.match(await selectionCount(), /영역 없음/);
    await key("Control+z");
    assert.match(await selectionCount(), /2픽셀/);
    await key("Control+a");
    assert.match(await selectionCount(), /256픽셀/);
    await key("Control+z");
    assert.match(await selectionCount(), /2픽셀/);
    assert.deepEqual(await rgba(), original);

    await key("ArrowRight");
    await tool("pencil");
    assert.ok(await page.locator("#placement-actions").isHidden());
    assert.deepEqual(await pixel(2, 1), green);
    await key("Control+z");
    assert.deepEqual(await rgba(), original);
    await tool("move");
    await drag(1, 1, 4, 1);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "placement-preview.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: frozen background across repeated moves/pastes, transparent paste, cancel/confirm/undo/redo, unchanged autosave, Shift axes, selection history, tool switch and minimum layout",
    );
  } catch (error) {
    console.error(
      "Placement input trace:",
      await diagnosticPage
        ?.evaluate(() => window.placementInputTrace)
        .catch(() => []),
    );
    throw error;
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
