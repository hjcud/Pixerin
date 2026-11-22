if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("geometry-manipulation-profile-");
  const { createDocument, ensureLayers, validateDocument } =
    await import("../src/core.mjs");
  const { defaultGuide, rasterizeGuide, guideConstraints } =
    await import("../src/geometry.mjs");
  const initial = ensureLayers(createDocument(32, 32, "3D edit protection"));
  initial.layers[0].pixels[0] = 7;
  initial.layers[0].locked = true;
  const guide = { ...defaultGuide(), decoration: "all" },
    raster = rasterizeGuide(32, 32, guide);
  const pixels = raster.pixels.map((c) => {
    let i = initial.palette.indexOf(c);
    if (i < 0) i = initial.palette.push(c) - 1;
    return i;
  });
  const paint = raster.faceIds.findIndex(
    (id, i) => id === 1 && !raster.protectedMask[i],
  );
  pixels[paint] = 14;
  initial.layers.push({
    id: "editable-shape",
    name: "Painted book",
    visible: true,
    locked: false,
    pixels,
    geometryGuide: guide,
  });
  initial.activeLayerId = "editable-shape";
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(initial));
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
    await page.waitForFunction(
      () => document.getElementById("doc-name").value === "3D edit protection",
    );
    const state = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [
            "yaw",
            "elevation",
            "roll",
            "aspect",
            "height",
            "thickness",
            "fill",
          ].map((k) => [k, document.getElementById("geometry-" + k).value]),
        ),
      );
    const png = () =>
      page.locator("#geometry-canvas").evaluate((c) => c.toDataURL());
    const draft = async () => {
      await page.waitForFunction(() =>
        document
          .getElementById("save-status")
          .textContent.includes("복구본 저장됨"),
      );
      return validateDocument(
        JSON.parse(await fs.readFile(path.join(profile, "draft.json"), "utf8")),
      );
    };
    const drag = async (locator, dx, dy, release = true) => {
      // History/mode changes schedule a projection redraw. Read the handle's
      // position after that frame rather than clicking a stale bounding box.
      await locator.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const b = await locator.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, {
        steps: 6,
      });
      if (release) await page.mouse.up();
    };
    await page.locator("#layer-more").selectOption("geometry");
    assert.ok(await page.locator("#geometry-edit-note").isVisible());
    assert.ok(
      (await page.locator("#geometry-canvas").boundingBox()).width >= 128,
    );
    assert.ok(await page.locator("#geometry-undo").isDisabled());
    const start = await state(),
      startPNG = await png();
    await page.locator('[data-geometry-mode="width"]').click();
    await drag(page.locator('[data-geometry-handle="width"]'), 35, 0, false);
    const pendingWidth = await state();
    for (const type of ["pointercancel", "lostpointercapture"])
      await page
        .locator("#geometry-model-stage")
        .dispatchEvent(type, { pointerId: 99 });
    assert.deepEqual(await state(), pendingWidth);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(await state(), start);
    await drag(page.locator('[data-geometry-handle="width"]'), 35, 0, false);
    const releasedWidth = await state();
    await page
      .locator("#geometry-model-stage")
      .dispatchEvent("lostpointercapture", { pointerId: 1, buttons: 0 });
    await page.mouse.up();
    assert.deepEqual(await state(), releasedWidth);
    assert.notEqual((await state()).aspect, start.aspect);
    await page.keyboard.press("Control+z");
    assert.deepEqual(await state(), start);
    assert.equal(await png(), startPNG);
    assert.ok(await page.locator("#geometry-undo").isDisabled());
    await page.keyboard.press("Control+Shift+z");
    assert.notEqual((await state()).aspect, start.aspect);
    await page.locator("#geometry-undo").click();
    await page.locator('[data-geometry-mode="height"]').click();
    await drag(page.locator('[data-geometry-handle="height"]'), 0, -30);
    assert.ok(
      await page.locator("#geometry-redo").isDisabled(),
      JSON.stringify({ start, afterHeightDrag: await state() }),
    );
    assert.notEqual((await state()).height, start.height);
    const beforeRing = await state();
    await page.locator('[data-geometry-mode="rotate"]').click();
    await drag(page.locator('[data-geometry-handle="roll"]'), 28, 14);
    assert.notEqual((await state()).roll, beforeRing.roll);
    const beforeCancel = await state();
    await page.locator('[data-geometry-mode="depth"]').click();
    await drag(page.locator('[data-geometry-handle="depth"]'), 25, 0, false);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(await state(), beforeCancel);
    await page.locator("#geometry-fit").click();
    const beforeMove = await png(),
      pr = await page.locator("#geometry-canvas").boundingBox();
    await drag(
      page.locator("#geometry-canvas"),
      (pr.width / 32) * 2,
      pr.height / 32,
    );
    const moved = await png();
    assert.notEqual(moved, beforeMove);
    await page.locator("#geometry-undo").click();
    assert.equal(await png(), beforeMove);
    await page.locator("#geometry-redo").click();
    assert.equal(await png(), moved);
    const beforeScale = await state();
    await drag(page.locator('[data-pixel-handle="se"]'), -16, -16);
    assert.ok(Number((await state()).fill) < Number(beforeScale.fill));
    await page.locator("#geometry-undo").click();
    assert.deepEqual(await state(), beforeScale);
    await page.locator("#geometry-precise > summary").click();
    const beforeNumber = await state();
    await page.locator("#geometry-thickness-number").fill("45");
    await page.locator("#geometry-thickness-number").press("Enter");
    assert.equal((await state()).thickness, "45");
    await page.keyboard.press("Control+z");
    assert.deepEqual(await state(), beforeNumber);
    await page.locator("#geometry-precise > summary").click();
    await page.locator("#geometry-compare").click();
    const originalRGBA = await page
      .locator("#geometry-canvas")
      .evaluate((c) =>
        Array.from(
          c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ),
      );
    assert.deepEqual(
      originalRGBA,
      pixels.flatMap((i) =>
        [1, 3, 5, 7].map((j) =>
          parseInt(initial.palette[i].slice(j, j + 2), 16),
        ),
      ),
    );
    assert.equal(
      await page.locator('[data-pixel-handle="se"]').isVisible(),
      false,
    );
    await page.locator("#geometry-compare").click();
    assert.equal(await png(), moved);
    await page.screenshot({
      path: path.join(root, "artifacts", "geometry-manipulation-review.png"),
    });
    assert.deepEqual(await draft(), initial);
    await page.locator("#geometry-create").click();
    const result = await draft();
    assert.equal(result.layers.length, 3);
    assert.deepEqual(result.layers[0], initial.layers[0]);
    assert.deepEqual(result.layers[1], {
      ...initial.layers[1],
      visible: false,
    });
    const created = result.layers[2];
    assert.equal(created.geometryGuide.offsetX, 2);
    assert.equal(created.geometryGuide.offsetY, 1);
    assert.ok(created.geometryGuide.zoom > 0);
    assert.equal(created.geometryGuide.decoration, "all");
    assert.ok(guideConstraints(result));
    await page.locator("#undo-btn").click();
    assert.deepEqual(await draft(), initial);
    await page.locator("#redo-btn").click();
    assert.deepEqual(await draft(), result);
    await page.locator("#geometry-edit").click();
    assert.ok(await page.locator("#geometry-create").isDisabled());
    await page.locator("#geometry-cancel").click();
    assert.deepEqual(await draft(), result);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: handles, one-step drag undo, redo branching, ring, cancel, native move/resize, numeric undo, original comparison, layered re-edit preservation, persisted scale/position, global undo/redo and unchanged cancel.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: path.join(
            root,
            "artifacts",
            "geometry-manipulation-failure.png",
          ),
        })
        .catch(() => {});
    throw e;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
