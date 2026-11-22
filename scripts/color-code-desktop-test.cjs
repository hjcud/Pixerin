if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("color-code-profile-");
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
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    const field = page.locator("#color-label"),
      count = () => page.locator("#palette button").count();
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const initial = await pixels(),
      originalCount = await count();
    const enter = async (value) => {
      await field.fill(value);
      await field.press("Enter");
    };
    await enter("fa0");
    assert.equal(await field.inputValue(), "#FFAA00");
    assert.equal(await count(), originalCount + 1);
    assert.deepEqual(await pixels(), initial);
    assert.match(
      await page.locator("#primary-color").getAttribute("style"),
      /#FFAA00FF/,
    );
    await enter("#ffaa00");
    assert.equal(await count(), originalCount + 1);
    await field.fill("not-a-color");
    await field.press("Enter");
    assert.equal(await field.getAttribute("aria-invalid"), "true");
    assert.equal(await count(), originalCount + 1);
    assert.deepEqual(await pixels(), initial);
    await field.press("Escape");
    assert.equal(await field.inputValue(), "#FFAA00");
    assert.equal(await page.locator("#color-code-error").isVisible(), false);
    await field.fill("#112233");
    await field.press("Escape");
    assert.equal(await count(), originalCount + 1);
    assert.equal(await field.inputValue(), "#FFAA00");
    await field.fill("123456");
    await page.locator("#inspector-ai").click();
    assert.equal(await field.inputValue(), "#123456");
    assert.equal(await count(), originalCount + 2);
    await page.locator("#secondary-color").click();
    await enter("#abc8");
    assert.equal(await field.inputValue(), "#AABBCC88");
    assert.match(
      await page.locator("#secondary-color").getAttribute("style"),
      /#AABBCC88/,
    );
    const c = await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.click(c.x + c.width / 32, c.y + c.height / 32, {
      button: "right",
    });
    const painted = (await pixels()).slice(0, 4);
    assert.equal(painted[3], 136);
    // Chromium's premultiplied canvas readback can round translucent RGB by one.
    [170, 187, 204].forEach((v, i) => assert.ok(Math.abs(painted[i] - v) <= 1));
    await page.waitForFunction(() =>
      document
        .getElementById("save-status")
        .textContent.includes("복구본 저장됨"),
    );
    const draft = JSON.parse(
      await fs.readFile(path.join(profile, "draft.json"), "utf8"),
    );
    assert.equal(
      draft.palette[
        draft.layers.find((l) => l.id === draft.activeLayerId).pixels[0]
      ],
      "#AABBCC88",
    );
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), initial);
    await page.locator("#primary-color").click();
    await page.locator("#color-input").evaluate((el) => {
      el.value = "#654321";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#add-color").click();
    assert.equal(await field.inputValue(), "#654321");
    assert.match(
      await page.locator("#primary-color").getAttribute("style"),
      /#654321FF/,
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await field.fill("#12345678");
    await field.focus();
    await page.screenshot({
      path: path.join(root, "artifacts", "color-code-edit.png"),
    });
    await field.press("Escape");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: editable HEX, shorthand/alpha/no-hash parsing, Enter/blur apply, Escape cancel, invalid value protection, color reuse, left/right drawing, undo, native picker and small layout.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
