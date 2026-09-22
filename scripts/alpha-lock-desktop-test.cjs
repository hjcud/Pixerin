if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("alpha-profile-");
  const { createDocument } = await import("../src/core.mjs");
  const doc = createDocument(8, 8, "Alpha lock check");
  doc.palette.push("#50A88980");
  doc.pixels[0] = 16;
  doc.pixels[1] = 7;
  doc.pixels[8] = 7;
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
  await require("./test-ai-disclosure.cjs")(profile);
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
      () => document.getElementById("doc-name").value === "Alpha lock check",
    );
    await app.evaluate(
      (_, modulePath) => {
        const { CodexClient } = process.mainModule.require(modulePath);
        globalThis.__alphaCalls = 0;
        CodexClient.prototype.status = async () => ({
          available: true,
          connected: true,
          authType: "chatgpt",
          plan: "pro",
        });
        CodexClient.prototype.requestPatch = async ({ input }) => {
          globalThis.__alphaCalls++;
          globalThis.__alphaInput = input;
          return {
            proposal: {
              summary: "색을 바꿨어요.",
              new_colors: [],
              runs: [{ x: 0, y: 0, colors: [11] }],
            },
          };
        };
      },
      path.join(root, "tests", "fixtures", "legacy-codex.mjs"),
    );
    const read = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) =>
          Array.from(
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        );
    const original = await read(),
      box = await page.locator("#overlay-canvas").boundingBox();
    const cell = (x, y) => ({
      x: box.x + ((x + 0.5) * box.width) / 8,
      y: box.y + ((y + 0.5) * box.height) / 8,
    });
    const click = async (x, y, button = "left") => {
      const p = cell(x, y);
      await page.mouse.click(p.x, p.y, { button });
    };
    await page.locator("#palette button").nth(11).click();
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("t");
    assert.equal(
      await page.locator("#alpha-lock-btn").getAttribute("aria-pressed"),
      "true",
    );
    assert.match(await page.locator("#scope-badge").textContent(), /3px/);
    await click(0, 0);
    await click(4, 4);
    let data = await read();
    assert.equal(data[3], 128);
    assert.deepEqual(
      data.slice((4 * 8 + 4) * 4, (4 * 8 + 4) * 4 + 4),
      [0, 0, 0, 0],
    );
    await page.locator("#undo-btn").click();
    assert.deepEqual(await read(), original);
    await click(1, 0, "right");
    assert.deepEqual(await read(), original);
    assert.equal(await page.locator('[data-tool="eraser"]').isDisabled(), true);
    await page.locator("#overlay-canvas").focus();
    for (const key of ["Delete", "v", "Control+x", "Control+v"])
      await page.keyboard.press(key);
    assert.deepEqual(await read(), original);
    console.log(
      "PASS: locked pencil preserves alpha/background; erase, move, cut, and paste cannot change silhouette",
    );

    if (!(await page.locator("#selection-popover").isVisible()))
      await page.locator("#edit-tools-toggle").click();
    if (!(await page.locator("#selection-more").evaluate((e) => e.open)))
      await page.locator("#selection-more > summary").click();
    await page.locator("#selection-actions").selectOption("painted");
    assert.match(
      await page.locator("#selection-summary").textContent(),
      /3픽셀/,
    );
    if (!(await page.locator("#selection-popover").isVisible()))
      await page.locator("#edit-tools-toggle").click();
    if (!(await page.locator("#selection-more").evaluate((e) => e.open)))
      await page.locator("#selection-more > summary").click();
    await page.locator("#selection-actions").selectOption("fill-primary");
    data = await read();
    assert.equal(data[3], 128);
    assert.equal(data[7], 255);
    assert.equal(data[11], 0);
    assert.equal(data[0], 215);
    await page.locator("#undo-btn").click();
    assert.deepEqual(await read(), original);
    await page.locator("#palette button").nth(7).click();
    if (!(await page.locator("#selection-popover").isVisible()))
      await page.locator("#edit-tools-toggle").click();
    if (!(await page.locator("#selection-more").evaluate((e) => e.open)))
      await page.locator("#selection-more > summary").click();
    await page.locator("#selection-actions").selectOption("color");
    assert.match(
      await page.locator("#selection-summary").textContent(),
      /2픽셀/,
    );
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Control+d");
    await page.locator('[data-tool="select"]').click();
    await click(4, 4);
    assert.equal(await page.locator("#generate-btn").isDisabled(), true);
    await page.locator("#prompt").fill("선택한 곳의 색을 바꿔줘");
    await page.keyboard.press("Control+Enter");
    assert.equal(await app.evaluate(() => globalThis.__alphaCalls), 0);
    assert.deepEqual(await read(), original);
    console.log(
      "PASS: quick painted/color selections and fill; empty intersection sends no inference",
    );

    if (!(await page.locator("#select-all").isVisible()))
      await page.locator("#edit-tools-toggle").click();
    await page.locator("#select-all").click();
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.waitForSelector("#proposal-card:not([hidden])");
    const input = await app.evaluate(() => globalThis.__alphaInput);
    assert.equal(input.alphaLock, true);
    assert.equal(input.mask.filter(Boolean).length, 3);
    assert.equal(await page.locator("#alpha-lock-btn").isDisabled(), true);
    data = await read();
    assert.equal(data[0], 215);
    assert.equal(data[3], 128);
    assert.equal(data[11], 0);
    await page.locator("#apply-btn").click();
    await page.locator("#undo-btn").click();
    assert.deepEqual(await read(), original);
    if (!(await page.locator("#selection-popover").isVisible()))
      await page.locator("#edit-tools-toggle").click();
    if (!(await page.locator("#selection-more").evaluate((e) => e.open)))
      await page.locator("#selection-more > summary").click();
    await page.locator("#selection-actions").selectOption("painted");
    await page.screenshot({
      path: path.join(root, "artifacts", "alpha-lock.png"),
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.locator("#fit-btn").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "alpha-lock-small.png"),
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: GPT receives frozen painted-only mask; preview/apply/undo preserve alpha; compact layout",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: path.join(root, "artifacts", "alpha-failure.png") })
        .catch(() => {});
    throw e;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
