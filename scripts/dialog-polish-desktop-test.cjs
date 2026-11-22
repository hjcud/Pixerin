if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { PNG } = require("pngjs");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("dialog-polish-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(16, 16, "Dialog polish"));
  doc.pixels.fill(7);
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
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(10000);
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    const draft = () => page.evaluate(() => window.pixeltool.loadDraft());
    const original = await draft();
    // All three dialogs use configured commands, including the second slot.
    await page.locator("#settings-btn").click();
    await page.locator('[data-settings-tab="editor"]').click();
    await page.locator("#shortcut-open").click();
    for (const [id, n, key] of [
      ["undo", 0, "Alt+z"],
      ["undo", 1, "Control+Alt+z"],
      ["redo", 0, "Alt+y"],
    ]) {
      await page.locator(`[data-command="${id}"] [data-slot="${n}"]`).click();
      await page.keyboard.press(key);
    }
    await page.locator("#shortcut-save").click();
    await page.locator("#settings-dialog .dialog-close").first().click();
    const fill = async (id, v) => {
      await page.locator("#" + id).fill(String(v));
      await page.locator("#" + id).press("Tab");
    };
    const value = (id) => page.locator("#" + id).inputValue();
    await page.locator("#file-more > summary").click();
    await page.locator("#resize-open").click();
    const resizeLayout = await page.locator("#resize-apply").boundingBox();
    await fill("resize-width", 20);
    await fill("resize-height", 24);
    await page.locator('[data-resize-edge="e"]').focus();
    await page.keyboard.press("Alt+z");
    assert.equal(await value("resize-height"), "16");
    await page.keyboard.press("Alt+y");
    assert.equal(await value("resize-height"), "24");
    // Repeated keydown is one step; separate presses are separate steps.
    for (let i = 0; i < 6; i++) await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    assert.equal(await value("resize-width"), "26");
    await page.keyboard.press("Alt+z");
    assert.equal(await value("resize-width"), "20");
    await page.keyboard.press("Alt+y");
    assert.equal(await value("resize-width"), "26");
    await page.keyboard.press("Alt+z");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Alt+z");
    assert.equal(await value("resize-width"), "21");
    await page.keyboard.press("Alt+z");
    assert.equal(await value("resize-width"), "20");
    const edge = page.locator('[data-resize-edge="e"]');
    const eb = await edge.boundingBox(),
      scale = Number(
        await page.locator("#resize-frame").getAttribute("data-scale"),
      );
    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      eb.x + eb.width / 2 + scale * 3,
      eb.y + eb.height / 2,
      { steps: 4 },
    );
    await page.mouse.up();
    assert.equal(await value("resize-width"), "23");
    await page.keyboard.press("Control+Alt+z");
    assert.equal(await value("resize-width"), "20");
    await page.keyboard.press("Alt+y");
    assert.equal(await value("resize-width"), "23");
    await fill("resize-width", 8);
    await page.locator("#resize-allow-crop").check();
    await page.locator("#resize-undo").click();
    await page.locator("#resize-redo").click();
    assert.equal(await page.locator("#resize-allow-crop").isChecked(), false);
    assert.equal(await page.locator("#resize-apply").isDisabled(), true);
    assert.deepEqual(
      await page.locator("#resize-apply").boundingBox(),
      resizeLayout,
    );
    await page.locator("#resize-dialog [data-close-document-dialog]").click();
    assert.deepEqual((await draft()).layers, original.layers);

    const png = new PNG({ width: 64, height: 48 });
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4;
        png.data.set([x * 4, y * 5, 80, 255], i);
      }
    await page.locator("#reference-file").setInputFiles({
      name: "generated.png",
      mimeType: "image/png",
      buffer: PNG.sync.write(png),
    });
    const crop = async () =>
      Object.fromEntries(
        await Promise.all(
          ["x", "y", "width", "height"].map(async (k) => [
            k,
            Number(await value("reference-crop-" + k)),
          ]),
        ),
      );
    for (const [k, v] of Object.entries({
      width: 24,
      height: 16,
      x: 16,
      y: 12,
    }))
      await fill("reference-crop-" + k, v);
    const before = await crop();
    await page.locator("#reference-canvas").focus();
    for (let i = 0; i < 6; i++) await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    assert.equal((await crop()).x, 22);
    await page.keyboard.press("Alt+z");
    assert.deepEqual(await crop(), before);
    await page.keyboard.press("Alt+y");
    assert.equal((await crop()).x, 22);
    await page.keyboard.press("Alt+z");
    // At a bound a no-op held key must preserve redo.
    await page.locator('[data-reference-edge="e"]').focus();
    for (let i = 0; i < 4; i++) await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    assert.equal((await crop()).width, 28);
    await page.keyboard.press("Alt+z");
    assert.deepEqual(await crop(), before);

    await page.locator("#reference-crop-width").fill("25");
    await page.keyboard.press("Alt+z");
    assert.deepEqual(
      await crop(),
      before,
      "undo commits then reverses a pending numeric edit",
    );
    await page.keyboard.press("Alt+y");
    assert.equal((await crop()).width, 25);
    await page.keyboard.press("Alt+z");
    const referenceLayout = await page
      .locator("#reference-apply")
      .boundingBox();
    await page.locator("#reference-canvas").focus();
    await page.keyboard.press("Alt+z");
    assert.equal((await crop()).y, 0);
    await page.keyboard.press("Alt+y");
    assert.deepEqual(await crop(), before);
    // Zoom stays anchored beneath the pointer, and leaves crop coordinates untouched.
    const b = await page.locator("#reference-canvas").boundingBox();
    const mx = b.x + b.width * 0.6,
      my = b.y + b.height * 0.45;
    await page.mouse.move(mx, my);
    await page.mouse.wheel(0, -180);
    await page.waitForFunction(
      (w) =>
        document.querySelector("#reference-canvas").getBoundingClientRect()
          .width > w,
      b.width,
    );
    const z = await page.locator("#reference-canvas").boundingBox();
    assert.ok(Math.abs((mx - z.x) / z.width - 0.6) < 0.002);
    assert.ok(Math.abs((my - z.y) / z.height - 0.45) < 0.002);
    assert.deepEqual(await crop(), before);
    // Space-pan and middle-button pan only affect the viewport.
    const stage = await page.locator(".reference-crop-stage").boundingBox();
    await page.mouse.move(
      stage.x + stage.width / 2,
      stage.y + stage.height / 2,
    );
    await page.keyboard.down("Space");
    await page.mouse.down();
    await page.mouse.move(
      stage.x + stage.width / 2 + 20,
      stage.y + stage.height / 2 + 10,
    );
    await page.mouse.up();
    await page.keyboard.up("Space");
    const pan = await page.locator("#reference-canvas").boundingBox();
    assert.ok(Math.abs(pan.x - z.x - 20) < 0.1);
    assert.deepEqual(await crop(), before);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(
      stage.x + stage.width / 2 + 30,
      stage.y + stage.height / 2 + 10,
    );
    await page.keyboard.press("Escape");
    await page.mouse.up({ button: "middle" });
    assert.deepEqual(
      await page.locator("#reference-canvas").boundingBox(),
      pan,
    );
    assert.equal(await page.locator("#reference-dialog").isVisible(), true);
    await page.locator("#reference-fit").click();
    await page.locator("#reference-zoom-value").selectOption("actual");
    const actual = await page.locator("#reference-canvas").boundingBox();
    assert.equal(actual.width, 64);
    assert.equal(actual.height, 48);
    await page.locator("#reference-zoom-value").selectOption("selection");
    const fitted = await page.locator("#reference-crop-handles").boundingBox();
    const viewport = await page.locator(".reference-crop-stage").boundingBox();
    assert.ok(
      Math.abs(fitted.x + fitted.width / 2 - viewport.x - viewport.width / 2) <
        1,
    );
    assert.ok(
      Math.abs(
        fitted.y + fitted.height / 2 - viewport.y - viewport.height / 2,
      ) < 1,
    );
    assert.ok(
      fitted.width <= viewport.width - 30 &&
        fitted.height <= viewport.height - 30,
    );
    assert.deepEqual(await crop(), before);
    await page.locator("#reference-fit").click();
    // Resize at a zoomed view, then undo the entire completed drag in one step.
    await page.locator("#reference-zoom-in").click();
    const r = await page.locator('[data-reference-edge="e"]').boundingBox(),
      c = await page.locator("#reference-canvas").boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      r.x + r.width / 2 + (c.width / 64) * 4,
      r.y + r.height / 2,
      { steps: 4 },
    );
    await page.mouse.up();
    assert.equal((await crop()).width, 28);
    await page.keyboard.press("Control+Alt+z");
    assert.deepEqual(await crop(), before);
    await page.keyboard.press("Alt+y");
    assert.equal((await crop()).width, 28);
    await page.locator("#reference-reset-crop").click();
    await page.locator("#reference-undo").click();
    const finalCrop = await crop();
    assert.equal(finalCrop.width, 28);
    assert.deepEqual(
      await page.locator("#reference-apply").boundingBox(),
      referenceLayout,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "dialog-polish-reference.png"),
    });
    await page.locator("#reference-apply").click();
    const url = await page.locator("#reference-thumb").getAttribute("src"),
      output = PNG.sync.read(Buffer.from(url.split(",")[1], "base64"));
    assert.equal(output.width, 28);
    assert.equal(output.height, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 28; x++)
        assert.deepEqual(
          [...output.data.subarray((y * 28 + x) * 4, (y * 28 + x) * 4 + 4)],
          [(x + 16) * 4, (y + 12) * 5, 80, 255],
        );
    await page.locator("#reference-edit").click();
    assert.equal(await page.locator("#reference-undo").isDisabled(), true);
    await fill("reference-crop-width", 1);
    await page.locator("#reference-cancel").click();
    assert.equal(
      await page.locator("#reference-thumb").getAttribute("src"),
      url,
    );

    await page.locator("#refine-open").click();
    await page.locator("#refine-protection > summary").click();
    await page.locator("#refine-protect-paint").click();
    const overlay = await page.locator("#refine-before-overlay").boundingBox();
    const paint = (x, y) =>
      page.mouse.click(
        overlay.x + ((x + 0.5) * overlay.width) / 16,
        overlay.y + ((y + 0.5) * overlay.height) / 16,
      );
    await paint(0, 0);
    await paint(1, 0);
    await page.keyboard.press("Alt+z");
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "1px",
    );
    await paint(0, 0);
    assert.equal(
      await page.locator("#refine-protect-redo").isDisabled(),
      false,
    );
    await page.keyboard.press("Alt+y");
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "2px",
    );
    await page.locator("#refine-protect-clear").click();
    await page.locator("#refine-protect-undo").click();
    assert.equal(
      await page.locator("#refine-protected-count").textContent(),
      "2px",
    );
    await page.locator("#refine-cancel").click();
    assert.deepEqual((await draft()).layers, original.layers);

    await page.locator("#geometry-open").click();
    const apply = await page.locator("#geometry-create").boundingBox();
    await page.locator("#geometry-precise > summary").click();
    await fill("geometry-fill-number", 200);
    assert.equal(await page.locator("#geometry-clipped").isVisible(), true);
    assert.deepEqual(
      await page.locator("#geometry-create").boundingBox(),
      apply,
    );
    const notice = await page.locator("#geometry-clipped").boundingBox();
    assert.ok(notice.y + notice.height <= apply.y);
    await page.screenshot({
      path: path.join(root, "artifacts", "dialog-polish-geometry.png"),
    });
    await page.locator("#geometry-cancel").click();
    await page.locator("#geometry-open").click();
    await page.locator("#geometry-create").click();
    await page.locator("#geometry-edit").click();
    assert.equal(await page.locator("#geometry-create").isDisabled(), true);
    assert.equal(
      await page.locator("#geometry-unavailable").textContent(),
      "변경된 픽셀이 없어요.",
    );
    const disabledLayout = await page.locator("#geometry-create").boundingBox();
    if (!(await page.locator("#geometry-precise").evaluate((el) => el.open)))
      await page.locator("#geometry-precise > summary").click();
    await fill("geometry-fill-number", 110);
    assert.equal(
      await page.locator("#geometry-unavailable").isVisible(),
      false,
    );
    assert.deepEqual(
      await page.locator("#geometry-create").boundingBox(),
      disabledLayout,
    );
    await page.locator("#geometry-cancel").click();
    await page.evaluate(async () => {
      const settings = await window.pixeltool.getSettings();
      await window.pixeltool.savePreferences({
        ...settings.preferences,
        language: "de",
        theme: "light",
        zoomSpeed: 2,
        reverseZoom: true,
      });
    });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.lang === "de");
    await page.locator("#reference-file").setInputFiles({
      name: "generated.png",
      mimeType: "image/png",
      buffer: PNG.sync.write(png),
    });
    const lightApply = await page.locator("#reference-apply").boundingBox();
    const initialZoom = await page.locator("#reference-canvas").boundingBox();
    await page.locator(".reference-crop-stage").evaluate((el) => {
      const b = el.getBoundingClientRect();
      el.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -100,
          clientX: b.x + b.width / 2,
          clientY: b.y + b.height / 2,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    const reverse = await page.locator("#reference-canvas").boundingBox();
    assert.ok(
      Math.abs(reverse.width / initialZoom.width - Math.exp(-0.4)) < 0.002,
      "saved reverse direction and speed apply to reference wheel",
    );
    await page.locator("#reference-fit").click();
    await page.locator("#reference-zoom-in").click();
    assert.deepEqual(
      await page.locator("#reference-apply").boundingBox(),
      lightApply,
    );
    assert.ok(lightApply.y + lightApply.height <= 740);
    await page.screenshot({
      path: path.join(
        root,
        "artifacts",
        "dialog-polish-reference-light-de.png",
      ),
    });
    await page.locator("#reference-cancel").click();
    // A large source is rasterized once. Repeated crop updates touch only overlays.
    const large = new PNG({ width: 4096, height: 3072 });
    large.data.fill(255);
    await page.locator("#reference-file").setInputFiles({
      name: "large-generated.png",
      mimeType: "image/png",
      buffer: PNG.sync.write(large),
    });
    await page.waitForFunction(
      () =>
        document.querySelector("#reference-dialog").open &&
        document.querySelector("#reference-canvas").width === 4096,
    );
    const perf = await page.evaluate(() => {
      const c = document.querySelector("#reference-canvas"),
        ctx = c.getContext("2d");
      const draw = ctx.drawImage,
        clear = ctx.clearRect;
      let paints = 0;
      ctx.drawImage = function (...args) {
        paints++;
        return draw.apply(this, args);
      };
      ctx.clearRect = function (...args) {
        paints++;
        return clear.apply(this, args);
      };
      const input = document.querySelector("#reference-crop-width"),
        started = performance.now();
      for (let i = 0; i < 100; i++) {
        input.value = 1000 + i;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const ms = performance.now() - started;
      ctx.drawImage = draw;
      ctx.clearRect = clear;
      return { paints, ms, width: c.width, height: c.height };
    });
    assert.equal(perf.paints, 0);
    assert.equal(perf.width, 4096);
    console.log("Large reference overlay check:", JSON.stringify(perf));
    await page.locator("#reference-cancel").click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: configured local undo/redo, single-step gestures, crop consent, reference zoom/pan and exact crop output, no-op protection redo, fixed visible 3D notice",
    );
  } catch (error) {
    await (
      await require("./first-editor.cjs")(app)
    ).screenshot({
      path: path.join(root, "artifacts", "dialog-polish-failure.png"),
    });
    throw error;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
