if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { PNG } = require("pngjs");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("reference-safety-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const full = new PNG({ width: 64, height: 48 }),
    saved = new PNG({ width: 32, height: 24 });
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 64; x++)
      full.data.set([x * 4, y * 5, 100, 255], (y * 64 + x) * 4);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 32; x++)
      saved.data.set([(x + 16) * 4, (y + 12) * 5, 100, 255], (y * 32 + x) * 4);
  const image =
    "data:image/png;base64," + PNG.sync.write(saved).toString("base64");
  const doc = ensureLayers(createDocument(16, 16, "Reference safety"));
  doc.pixels.fill(7);
  doc.layers[0].refinementProtection = Array(256).fill(false);
  doc.layers[0].refinementProtection[0] = true;
  doc.editorContext = {
    prompt: "Generated test",
    reference: { image, purposes: ["shape"], note: "Keep the ornament" },
  };
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
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("#reference-thumb[src]");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    const draft = () => page.evaluate(() => window.pixeltool.loadDraft());
    const original = await draft();
    const field = (k) => page.locator("#reference-crop-" + k);
    const fill = async (k, v) => {
      await field(k).fill(String(v));
      await field(k).press("Tab");
    };
    const shape = () => page.locator("#reference-crop-handles").boundingBox();
    await page.locator("#reference-edit").click();
    assert.equal(await page.locator("#reference-reconnect").isVisible(), true);
    assert.match(
      await page.locator("#reference-source-note").textContent(),
      /전송용/,
    );
    const before = await shape(),
      applyPosition = await page.locator("#reference-apply").boundingBox();
    for (const invalid of ["", "0", "1.5", "1000"]) {
      await fill("width", invalid);
      assert.equal(await page.locator("#reference-apply").isDisabled(), true);
      assert.equal(await field("width").getAttribute("aria-invalid"), "true");
      assert.equal(await field("width").inputValue(), invalid);
      assert.deepEqual(
        await shape(),
        before,
        "invalid input does not change selection",
      );
      assert.deepEqual(
        await page.locator("#reference-apply").boundingBox(),
        applyPosition,
      );
    }
    await page.locator('[data-reference-purpose="palette"]').check();
    assert.equal(
      await field("width").inputValue(),
      "1000",
      "unrelated options preserve invalid input",
    );
    await page.locator("#reference-undo").click();
    assert.equal(await field("width").inputValue(), "32");
    await fill("width", 20);
    await fill("x", 20); // width + x is invalid as a pair.
    assert.equal(await page.locator("#reference-apply").isDisabled(), true);
    await fill("width", 12);
    assert.equal(await page.locator("#reference-apply").isDisabled(), false);
    assert.equal(await field("x").inputValue(), "20");
    await page.locator("#reference-cancel").click();
    assert.equal((await draft()).editorContext.reference.image, image);

    await page.locator("#reference-edit").click();
    const source = {
      name: "original-generated.png",
      mimeType: "image/png",
      buffer: PNG.sync.write(full),
    };
    // The reconnect button invokes the file chooser, then stages the source.
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("#reference-reconnect").click();
    await (await chooserPromise).setFiles(source);
    await page.waitForFunction(
      () => document.querySelector("#reference-canvas").width === 64,
    );
    assert.match(
      await page.locator("#reference-source-note").textContent(),
      /다시 선택/,
    );
    assert.equal(
      await page.locator("#reference-note").inputValue(),
      "Keep the ornament",
    );
    assert.equal((await draft()).editorContext.reference.image, image);
    await page.locator("#reference-cancel").click();
    await page.locator("#reference-edit").click();
    assert.equal(await page.locator("#reference-reconnect").isVisible(), true);
    await page.locator("#reference-source-file").setInputFiles(source);
    await page.waitForFunction(
      () => document.querySelector("#reference-canvas").width === 64,
    );
    for (const [k, v] of Object.entries({ width: 8, height: 8, x: 20, y: 12 }))
      await fill(k, v);
    await page.locator("#reference-zoom-value").selectOption("selection");
    const width = (await page.locator("#reference-canvas").boundingBox()).width;
    const edge = page.locator('[data-reference-edge="e"]');
    await edge.focus();
    for (let i = 0; i < 20; i++) await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    assert.equal(await field("width").inputValue(), "28");
    const handle = await edge.boundingBox(),
      stage = await page.locator(".reference-crop-stage").boundingBox();
    assert.ok(
      handle.x >= stage.x && handle.x + handle.width <= stage.x + stage.width,
    );
    assert.ok(
      handle.y >= stage.y && handle.y + handle.height <= stage.y + stage.height,
    );
    assert.equal(
      (await page.locator("#reference-canvas").boundingBox()).width,
      width,
    );
    await page.keyboard.press("Control+z");
    assert.equal(await field("width").inputValue(), "8");
    await page.locator("#reference-canvas").focus();
    for (let i = 0; i < 24; i++) await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    const moving = await shape();
    assert.ok(
      moving.x + moving.width <= stage.x + stage.width,
      "keyboard movement follows the leading edge",
    );
    await page.keyboard.press("Control+z");
    assert.equal(await field("x").inputValue(), "20");
    await page.locator("#reference-fit").click();
    for (const [k, v] of Object.entries({
      x: 16,
      y: 12,
      width: 32,
      height: 24,
    }))
      await fill(k, v);
    await page.screenshot({
      path: path.join(root, "artifacts", "reference-reconnected.png"),
    });
    await page.locator("#reference-apply").click();
    const result = PNG.sync.read(
      Buffer.from(
        (await draft()).editorContext.reference.image.split(",")[1],
        "base64",
      ),
    );
    assert.deepEqual(result.data, saved.data);
    assert.equal(result.width, 32);
    await page.locator("#reference-edit").click();
    assert.equal(await page.locator("#reference-reconnect").isVisible(), false);
    await page.locator("#reference-cancel").click();

    await page.locator("#file-more > summary").click();
    await page.locator("#resize-open").click();
    await page.locator("#resize-width").fill("8");
    await page.locator("#resize-width").press("Tab");
    const bounds = await page.locator("#resize-apply").boundingBox();
    await page.locator("#resize-compare").click();
    assert.equal(await page.locator("#resize-frame").isVisible(), false);
    assert.equal(await page.locator("#resize-comparison").isVisible(), true);
    assert.equal(await page.locator("#resize-apply").isDisabled(), true);
    assert.deepEqual(await page.locator("#resize-apply").boundingBox(), bounds);
    const red = await page.locator("#resize-comparison").evaluate((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] > d[i + 1] * 1.2 && d[i + 3]) count++;
      return count;
    });
    assert.ok(red > 20, "cropped cells receive visible red highlighting");
    await page.screenshot({
      path: path.join(root, "artifacts", "resize-crop-comparison.png"),
    });
    await page.locator("#resize-compare").click();
    assert.equal(await page.locator("#resize-frame").isVisible(), true);
    await page.locator("#resize-allow-crop").check();
    await page.locator("#resize-apply").click();
    assert.equal((await draft()).width, 8);
    await page.locator("#undo-btn").click();
    assert.deepEqual((await draft()).layers, original.layers);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: strict crop input, fixed feedback, keyboard follow at constant zoom, staged source reconnect/cancel/exact output, crop comparison and atomic apply/undo",
    );
  } catch (e) {
    await (
      await require("./first-editor.cjs")(app)
    ).screenshot({
      path: path.join(root, "artifacts", "reference-safety-failure.png"),
    });
    throw e;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
