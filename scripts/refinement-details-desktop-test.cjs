if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("refine-details-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(16, 16, "Cluster details"));
  doc.palette = ["#00000000", "#338461FF", "#398967FF"];
  doc.pixels.fill(0);
  for (let y = 2; y < 14; y++)
    for (let x = 2; x < 14; x++) doc.pixels[y * 16 + x] = 1;
  doc.pixels[85] = 2;
  doc.pixels[138] = doc.pixels[139] = 2;
  const file = path.join(profile, "draft.json");
  await fs.writeFile(file, JSON.stringify(doc));
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
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const initial = await pixels();
    await page.locator("#alpha-lock-btn").click();
    // Alpha lock is persisted per layer. Preview edits must preserve this
    // confirmed state, rather than the fixture from before the lock toggle.
    await page.waitForFunction(
      async () =>
        (await window.pixeltool.loadDraft()).layers[0].alphaLocked === true,
    );
    const beforePreview = await page.evaluate(() =>
      window.pixeltool.loadDraft(),
    );
    await page.locator("#refine-open").click();
    await page.locator("#refine-tab-clusters").click();
    assert.equal(await page.locator("#refine-candidates input").count(), 2);
    assert.ok(await page.locator("#refine-apply").isDisabled());
    await page.locator("#refine-protection > summary").click();
    await page.locator("#refine-protect-paint").click();
    const point = async (x, y) => {
      const b = await page.locator("#refine-before-overlay").boundingBox();
      return {
        x: b.x + (b.width * (x + 0.5)) / 16,
        y: b.y + (b.height * (y + 0.5)) / 16,
      };
    };
    let a = await point(5, 5),
      b = await point(6, 5);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y);
    await page.mouse.up();
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "2px",
    );
    assert.ok(
      await page.locator('[data-candidate-id="cluster:85"]').isDisabled(),
    );
    await page.locator("#refine-protect-undo").click();
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "0px",
    );
    a = await point(5, 5);
    await page.mouse.click(a.x, a.y);
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "1px",
    );
    await page.locator("#refine-tab-outline").click();
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "1px",
    );
    assert.equal(await page.locator("#refine-error").isVisible(), false);
    await page.locator("#refine-tab-clusters").click();
    await page.locator("#refine-select-candidates").click();
    assert.equal(
      await page.locator("#refine-change-count").textContent(),
      "2px 변경",
    );
    assert.deepEqual(
      (await pixels()).slice(85 * 4, 86 * 4),
      initial.slice(85 * 4, 86 * 4),
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    const bounds = await page.locator("#refine-dialog").boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 740);
    assert.equal(
      await page
        .locator("#refine-dialog")
        .evaluate((e) => e.scrollWidth > e.clientWidth),
      false,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "refine-details-dark.png"),
    });
    assert.deepEqual(
      JSON.parse(await fs.readFile(file, "utf8")),
      beforePreview,
    );
    await page.locator("#refine-apply").click();
    const applied = await pixels();
    assert.notDeepEqual(applied, initial);
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), initial);
    await page.locator("#redo-btn").click();
    assert.deepEqual(await pixels(), applied);
    await page.locator("#undo-btn").click();
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-theme").selectOption("light");
    await page.locator('#settings-form button[type="submit"]').click();
    await page.locator("#refine-open").click();
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "0px",
    );
    await page.locator("#refine-tab-shading").focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.locator("#refine-tab-clusters").getAttribute("aria-selected"),
      "true",
    );
    await page.locator("#refine-protection > summary").click();
    await page.locator("#refine-protect-paint").click();
    a = await point(5, 5);
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(a.x, a.y, { button: "right" });
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "0px",
    );
    await page.mouse.click(a.x, a.y);
    await page.locator("#refine-protect-clear").click();
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "0px",
    );
    await page.locator("#refine-protect-undo").click();
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "1px",
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "refine-details-light.png"),
    });
    await page.locator("#refine-cancel").click();
    assert.deepEqual(await pixels(), initial);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: spatial cluster candidates, protected brush/interpolated drag/right erasure/undo/clear, cross-mode masks, atomic apply/undo/redo, unchanged autosave during preview, reset on close, four-tab keyboard and small dark/light layouts.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
