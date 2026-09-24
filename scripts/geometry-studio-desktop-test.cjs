if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("geometry-studio-profile-");
  const { rasterizeGuide, freezeGuideScale, defaultGuide } =
    await import("../src/geometry.mjs");
  const studioZoom = freezeGuideScale(16, 16, defaultGuide()).zoom;
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  let page;
  try {
    page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    const prompt = "기존 프롬프트를 그대로 유지";
    await page.locator("#prompt").fill(prompt);
    assert.equal(await page.locator(".tools-panel #geometry-open").count(), 1);
    await page.locator("#geometry-open").click();
    const model = page.locator("#geometry-model");
    const params = async () =>
      page.evaluate(() => {
        const get = (key) => document.getElementById("geometry-" + key).value;
        return {
          kind: get("kind"),
          pose: get("pose"),
          color: get("color").toUpperCase(),
          decoration: "front",
          ...Object.fromEntries(
            [
              "yaw",
              "elevation",
              "roll",
              "aspect",
              "height",
              "thickness",
              "fill",
            ].map((key) => [
              key,
              Number(get(key)) /
                (["yaw", "elevation", "roll"].includes(key) ? 1 : 100),
            ]),
          ),
        };
      });
    const verifyRaster = async () => {
      const guide = await params(),
        expected = rasterizeGuide(16, 16, {
          ...guide,
          zoom: studioZoom,
        }).pixels.flatMap((c) =>
          [1, 3, 5, 7].map((i) => parseInt(c.slice(i, i + 2), 16)),
        );
      const pixels = await page
        .locator("#geometry-canvas")
        .evaluate((c) =>
          Array.from(
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        );
      assert.deepEqual(pixels, expected);
    };
    const drag = async (dx, dy, release = true) => {
      await model.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const b = await model.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, {
        steps: 5,
      });
      if (release) await page.mouse.up();
    };
    const original = await params();
    await drag(65, 24);
    const rotated = await params();
    assert.notEqual(rotated.yaw, original.yaw);
    assert.notEqual(rotated.elevation, original.elevation);
    await verifyRaster();
    await page.keyboard.down("Shift");
    await drag(30, 0);
    await page.keyboard.up("Shift");
    assert.notEqual((await params()).roll, rotated.roll);
    const beforeCancel = await params();
    await drag(-40, 30, false);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(await params(), beforeCancel);
    assert.ok(await page.locator("#geometry-dialog").isVisible());
    for (const [mode, key, dx, dy] of [
      ["width", "aspect", 30, 0],
      ["height", "height", 0, -35],
      ["depth", "thickness", 35, 0],
      ["scale", "fill", -20, 20],
    ]) {
      await page.locator(`[data-geometry-mode="${mode}"]`).click();
      assert.equal(
        await page.locator("[data-geometry-handle]:visible").count(),
        1,
      );
      assert.ok(
        await page.locator(`[data-geometry-handle="${mode}"]`).isVisible(),
      );
      const before = await params();
      await drag(dx, dy);
      const after = await params();
      assert.notEqual(after[key], before[key]);
      for (const other of Object.keys(before).filter((k) => k !== key))
        assert.equal(after[other], before[other]);
      await verifyRaster();
    }
    await page.locator('[data-geometry-mode="rotate"]').click();
    const beforeKey = await params();
    await model.press("ArrowLeft");
    assert.equal((await params()).yaw, beforeKey.yaw - 2);
    const beforeWheel = await params();
    await model.hover();
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(
      (old) => Number(document.getElementById("geometry-fill").value) !== old,
      Math.round(beforeWheel.fill * 100),
    );
    assert.ok((await params()).fill > beforeWheel.fill);
    await page.locator("#geometry-precise > summary").click();
    await page.locator("#geometry-yaw-number").fill("145");
    await page.locator("#geometry-elevation-number").fill("-35");
    await page.locator("#geometry-height-number").fill("135");
    await verifyRaster();
    assert.equal((await params()).height, 1.35);
    await page.locator("#geometry-height-number").fill("999");
    assert.ok(await page.locator("#geometry-create").isDisabled());
    await page.locator("#geometry-height-number").press("Escape");
    assert.equal(
      await page.locator("#geometry-height-number").inputValue(),
      "135",
    );
    assert.ok(await page.locator("#geometry-create").isEnabled());
    await page.locator("#geometry-reset").click();
    assert.equal((await params()).yaw, 25);
    assert.equal((await params()).height, 1);
    // Isolated axes must not disturb the other two angles, even after a tilted view.
    for (const [axis, dx, dy] of [
      ["yaw", 45, 0],
      ["elevation", 0, 40],
      ["roll", 45, 0],
    ]) {
      await page.locator("#geometry-rotation-axis").selectOption(axis);
      const before = await params();
      await drag(dx, dy);
      const after = await params();
      assert.notEqual(after[axis], before[axis]);
      for (const key of ["yaw", "elevation", "roll"].filter((k) => k !== axis))
        assert.equal(after[key], before[key]);
      await page.locator("#geometry-undo").click();
      assert.deepEqual(await params(), before);
    }
    await page.locator("#geometry-rotation-axis").selectOption("yaw");
    await page.locator("#geometry-rotation-snap").check();
    await drag(35, 0);
    assert.equal((await params()).yaw % 15, 0);
    await model.press("ArrowRight");
    assert.equal((await params()).yaw % 15, 0);
    await page.locator("#geometry-rotation-snap").uncheck();
    await page.locator("#geometry-rotation-axis").selectOption("rotate");
    for (const kind of ["prism", "pyramid", "diamond"]) {
      await page.locator("#geometry-kind").selectOption(kind);
      await page.locator("#geometry-preset").selectOption("isometric");
      assert.equal((await params()).kind, kind);
      assert.equal((await params()).yaw, 45);
      await verifyRaster();
      assert.ok(await page.locator("#geometry-create").isEnabled());
      await page.locator("#geometry-precise > summary").click();
      await page.screenshot({
        path: path.join(root, "artifacts", `geometry-${kind}.png`),
      });
      await page.locator("#geometry-precise > summary").click();
    }
    await page.locator("#geometry-kind").selectOption("book");
    await page.locator("#geometry-reset").click();
    await page.locator("#geometry-precise > summary").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "geometry-studio-dark.png"),
    });
    await page.locator("#geometry-cancel").click();
    assert.equal(await page.locator("#prompt").inputValue(), prompt);
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-theme").selectOption("light");
    await page.locator('#settings-form button[type="submit"]').click();
    await page.locator("#geometry-open").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "geometry-studio-light.png"),
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.locator("#geometry-precise > summary").click();
    await page.locator(".geometry-details > summary").click();
    const layout = await page.evaluate(() => {
      const d = document.getElementById("geometry-dialog"),
        b = document.getElementById("geometry-create").getBoundingClientRect(),
        m = document.getElementById("geometry-model").getBoundingClientRect(),
        p = document.getElementById("geometry-canvas").getBoundingClientRect();
      return {
        overflow: d.scrollWidth > d.clientWidth,
        buttonVisible: b.bottom <= innerHeight && b.top >= 0,
        order: m.right < p.left,
      };
    });
    assert.deepEqual(layout, {
      overflow: false,
      buttonVisible: true,
      order: true,
    });
    await page.screenshot({
      path: path.join(root, "artifacts", "geometry-studio-small.png"),
    });
    await page.locator("#geometry-create").click();
    assert.equal(await page.locator("#prompt").inputValue(), prompt);
    await page.locator("#undo-btn").click();
    assert.equal(await page.locator("#geometry-status").isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: left tool, direct rotation/roll/dimensions/scale, wheel and keyboard, cancel gesture, exact synchronized native raster, numeric validation, prompt preservation, themes, small layout, apply/undo.",
    );
  } catch (error) {
    if (page)
      await page
        .screenshot({
          path: path.join(root, "artifacts", "geometry-studio-failure.png"),
        })
        .catch(() => {});
    throw error;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
