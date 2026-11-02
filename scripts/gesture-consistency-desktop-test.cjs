if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { PNG } = require("pngjs");
(async () => {
  const root = path.resolve(__dirname, "..");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const { createAutotile } = await import("../src/autotile.mjs");
  async function run(doc, fn) {
    const profile = await require("./test-runner.cjs").createProfile("gesture-consistency-");
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
      await page.waitForSelector("#palette button");
      await require("./editor-ready.cjs")(page);
      const draft = () => page.evaluate(() => window.pixeltool.loadDraft());
      const image = (id) =>
        page
          .locator("#" + id)
          .evaluate((c) => [
            ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ]);
      const at = async (id, x, y, w = 16, h = 16) => {
        const b = await page.locator("#" + id).boundingBox();
        return [
          b.x + ((x + 0.5) * b.width) / w,
          b.y + ((y + 0.5) * b.height) / h,
        ];
      };
      await fn({ app, page, draft, image, at });
      assert.deepEqual(errors, []);
    } catch (e) {
      await (
        await require("./first-editor.cjs")(app)
      ).screenshot({
        path: path.join(root, "artifacts", "gesture-consistency-failure.png"),
      });
      throw e;
    } finally {
      await app.close();
    }
  }
  const d = ensureLayers(createDocument(16, 16, "Gestures"));
  d.pixels.fill(7);
  await run(d, async ({ app, page, draft, image, at }) => {
    // Mask cancellation retains earlier strokes and does not consume redo history.
    await page.locator("#layer-mask-open").click();
    await page.mouse.move(...(await at("layer-mask-canvas", 0, 0)));
    await page.mouse.down();
    await page
      .locator("#layer-mask-canvas")
      .dispatchEvent("lostpointercapture", { pointerId: 1, buttons: 0 });
    await page.mouse.up();
    await page.locator("#layer-mask-undo").click();
    const blank = await image("layer-mask-canvas");
    await page.mouse.move(...(await at("layer-mask-canvas", 1, 1)));
    await page.mouse.down();
    await page.mouse.move(...(await at("layer-mask-canvas", 3, 1)));
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await page.locator("#layer-mask-dialog").isVisible(), true);
    assert.deepEqual(await image("layer-mask-canvas"), blank);
    assert.equal(await page.locator("#layer-mask-redo").isDisabled(), false);
    await page.locator("#layer-mask-redo").click();
    const completed = await image("layer-mask-canvas");
    await page.mouse.move(...(await at("layer-mask-canvas", 2, 2)));
    await page.mouse.down();
    await page.mouse.move(...(await at("layer-mask-canvas", 3, 2)));
    await page
      .locator("#layer-mask-canvas")
      .evaluate((c) => c.releasePointerCapture(1));
    await page.mouse.move(...(await at("layer-mask-canvas", 4, 2)));
    await page.mouse.up();
    assert.deepEqual(await image("layer-mask-canvas"), completed);
    await page.locator("#layer-mask-apply").click();
    assert.equal((await draft()).layers[0].mask[0], false);
    assert.equal((await draft()).layers[0].mask[17], true);
    await page.locator("#undo-btn").click();
    // Refinement Escape preserves the first completed protection stroke.
    await page.locator("#refine-open").click();
    await page.locator("#refine-protection > summary").click();
    await page.locator("#refine-protect-paint").click();
    await page.mouse.click(...(await at("refine-before-overlay", 0, 0)));
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "1px",
    );
    await page.mouse.move(...(await at("refine-before-overlay", 1, 1)));
    await page.mouse.down();
    await page.mouse.move(...(await at("refine-before-overlay", 3, 1)));
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await page.locator("#refine-dialog").isVisible(), true);
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "1px",
    );
    await page.locator("#refine-cancel").click();
    // Reference resize/move use source pixels; cancel keeps the stored image intact.
    await page.locator("#reference-file").setInputFiles({
      name: "fixture.png",
      mimeType: "image/png",
      buffer: PNG.sync.write({
        width: 64,
        height: 48,
        data: Buffer.alloc(64 * 48 * 4, 255),
      }),
    });
    const crop = async () =>
      Object.fromEntries(
        await Promise.all(
          ["x", "y", "width", "height"].map(async (k) => [
            k,
            Number(await page.locator("#reference-crop-" + k).inputValue()),
          ]),
        ),
      );
    for (const [key, v] of Object.entries({
      x: 16,
      y: 12,
      width: 24,
      height: 16,
    })) {
      await page.locator("#reference-crop-" + key).fill(String(v));
      await page.locator("#reference-crop-" + key).press("Tab");
    }
    const move = async (target, dx, dy, cancel = false) => {
      const r = await target.boundingBox(),
        b = await page.locator("#reference-canvas").boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        r.x + r.width / 2 + (dx * b.width) / 64,
        r.y + r.height / 2 + (dy * b.height) / 48,
        { steps: 3 },
      );
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
    };
    await move(page.locator('[data-reference-edge="e"]'), 4, 0);
    assert.deepEqual(await crop(), { x: 16, y: 12, width: 28, height: 16 });
    const rc = await page.locator("#reference-canvas").boundingBox();
    await page.mouse.move(
      rc.x + (30 * rc.width) / 64,
      rc.y + (20 * rc.height) / 48,
    );
    await page.mouse.down();
    await page.mouse.move(
      rc.x + (33 * rc.width) / 64,
      rc.y + (22 * rc.height) / 48,
    );
    await page.mouse.up();
    assert.deepEqual(await crop(), { x: 19, y: 14, width: 28, height: 16 });
    await move(page.locator('[data-reference-edge="nw"]'), 5, 3, true);
    assert.deepEqual(await crop(), { x: 19, y: 14, width: 28, height: 16 });
    await page.locator('[data-reference-edge="e"]').focus();
    await page.keyboard.press("Shift+ArrowRight");
    assert.equal((await crop()).width, 38);
    await page.locator("#reference-apply").click();
    const url = await page.locator("#reference-thumb").getAttribute("src");
    assert.equal(
      PNG.sync.read(Buffer.from(url.split(",")[1], "base64")).width,
      38,
    );
    await page.locator("#reference-edit").click();
    await move(page.locator('[data-reference-edge="w"]'), 2, 0);
    await page.locator("#reference-cancel").click();
    assert.equal(
      await page.locator("#reference-thumb").getAttribute("src"),
      url,
    );
    // Opening precision/lighting panels only scrolls settings, never the previews/footer.
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await page.locator("#geometry-open").click();
    const layout = async () =>
      Promise.all(
        [
          "geometry-dialog",
          "geometry-model-stage",
          "geometry-pixel-stage",
          "geometry-create",
        ].map((id) => page.locator("#" + id).boundingBox()),
      );
    const before = await layout();
    await page.locator("#geometry-lighting > summary").click();
    await page.locator("#geometry-light-enabled").check();
    assert.deepEqual(await layout(), before);
    await page.locator("#geometry-precise > summary").click();
    assert.deepEqual(await layout(), before);
    assert.ok(
      before[3].y + before[3].height <= 740,
      "geometry apply remains visible",
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "geometry-fixed-settings.png"),
    });
    await page.locator("#geometry-cancel").click();
    // An alignment error has reserved space; opening it does not shift Apply.
    await page.locator("#layer-add").click();
    await page.locator("#layer-more").selectOption("align");
    const align = await page.locator("#layer-align-apply").boundingBox();
    await page.locator("#layer-align-reference").selectOption("active");
    assert.ok((await page.locator("#layer-align-status").textContent()).length);
    assert.deepEqual(
      await page.locator("#layer-align-apply").boundingBox(),
      align,
    );
    await page.locator("#layer-align-dialog [data-close-layer-dialog]").click();
    await page.evaluate(async () => {
      const s = await window.pixeltool.getSettings();
      await window.pixeltool.savePreferences({
        ...s.preferences,
        language: "de",
        theme: "light",
      });
    });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.lang === "de");
    await page.locator("#geometry-open").click();
    const light = await layout();
    await page.locator("#geometry-lighting > summary").click();
    assert.deepEqual(await layout(), light);
    assert.ok(light[3].y + light[3].height <= 740);
    await page.screenshot({
      path: path.join(
        root,
        "artifacts",
        "geometry-fixed-settings-light-de.png",
      ),
    });
    console.log(
      "PASS: mask/protection stroke rollback, crop handles/move/keyboard/cancel, crop-only output and stable geometry/alignment layouts",
    );
  });
  const auto = createAutotile(
    16,
    "Grass",
    "Dirt",
    Array(256).fill("#50A889FF"),
    Array(256).fill("#A2754AFF"),
  );
  auto.autotile.map.fill(false);
  await run(auto, async ({ page, draft, image, at }) => {
    await page.locator("#auto-inspect").click();
    await page.mouse.click(...(await at("auto-map", 1, 1, 10, 8)));
    const committed = (await draft()).autotile.map;
    const pixels = await image("auto-map");
    await page.mouse.move(...(await at("auto-map", 3, 3, 10, 8)));
    await page.mouse.down();
    await page.mouse.move(...(await at("auto-map", 4, 3, 10, 8)));
    assert.notDeepEqual(await image("auto-map"), pixels);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await page.locator("#auto-workbench").isVisible(), true);
    assert.deepEqual(await image("auto-map"), pixels);
    assert.deepEqual((await draft()).autotile.map, committed);
    await page.mouse.move(...(await at("auto-map", 5, 5, 10, 8)));
    await page.mouse.down();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    assert.deepEqual(await image("auto-map"), pixels);
    await page.keyboard.press("Escape");
    await page.locator("#undo-btn").click();
    assert.ok((await draft()).autotile.map.every((v) => !v));
    console.log(
      "PASS: autotile Escape/blur restores only pending stroke and preserves undo",
    );
  });
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
