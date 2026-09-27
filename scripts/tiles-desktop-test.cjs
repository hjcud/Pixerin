if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { PNG } = require("pngjs");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("tiles-profile-");
  const { createDocument, ensureLayers, validateDocument } =
    await import("../src/core.mjs");
  const initial = ensureLayers(createDocument(16, 16, "Tile check"));
  initial.pixels.fill(7);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (y % 8 === 0 || (x + (y < 8 ? 0 : 4)) % 8 === 0)
        initial.pixels[y * 16 + x] = 6;
  initial.layers.push({
    id: "hidden",
    name: "Original backup",
    visible: false,
    locked: true,
    pixels: initial.pixels.map(() => 14),
  });
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(initial));
  await require("./test-ai-disclosure.cjs")(profile);
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    }),
    page;
  try {
    page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () => document.getElementById("doc-name").value === "Tile check",
    );
    const draft = async () => {
      await page.waitForFunction(() =>
        document
          .getElementById("save-status")
          .textContent.includes("복구본 저장됨"),
      );
      return validateDocument(
        JSON.parse(
          await fs.readFile(
            await require("./draft-file.cjs")(page, profile),
            "utf8",
          ),
        ),
      );
    };
    const preview = () =>
      page
        .locator("#tile-preview")
        .evaluate((c) =>
          Array.from(
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        );
    await page.locator("#new-btn").click();
    await page.locator("#tile-open").click();
    await page.locator("#tile-material").selectOption("custom");
    await page.locator("#tile-use-current").click();
    assert.match(await page.locator("#tile-error").textContent(), /소재/);
    await page.locator("#tile-custom").fill("이끼 낀 벽돌");
    await page.locator("#tile-use-current").click();
    const enabled = await draft();
    assert.deepEqual(enabled.layers, initial.layers);
    assert.deepEqual(enabled.tileMode, {
      material: "이끼 낀 벽돌",
      wrap: true,
    });
    assert.equal(await page.locator("#geometry-open").isDisabled(), true);
    assert.equal(
      await page.locator("#tile-preview").getAttribute("width"),
      "48",
    );
    const originalPreview = await preview();
    await page.locator("#palette button").nth(14).click();
    const b = await page.locator("#overlay-canvas").boundingBox(),
      unit = b.width / 16;
    await page.mouse.move(b.x + 15.5 * unit, b.y + 5.5 * unit);
    await page.mouse.down();
    await page.mouse.move(b.x + 17.5 * unit, b.y + 5.5 * unit);
    await page.mouse.up();
    const painted = await draft();
    for (const x of [15, 0, 1]) assert.equal(painted.pixels[5 * 16 + x], 14);
    assert.equal(painted.pixels[5 * 16 + 7], initial.pixels[5 * 16 + 7]);
    assert.notDeepEqual(await preview(), originalPreview);
    assert.deepEqual(painted.layers[1], initial.layers[1]);
    await page.locator("#undo-btn").click();
    assert.deepEqual(await draft(), enabled);
    assert.deepEqual(await preview(), originalPreview);
    await page.locator("#redo-btn").click();
    assert.deepEqual(await draft(), painted);
    if (!(await page.locator("#tile-status-more").evaluate((el) => el.open)))
      await page.locator("#tile-status-more > summary").click();
    await page.locator("#tile-wrap").uncheck();
    assert.equal((await draft()).tileMode.wrap, false);
    await page.locator("#undo-btn").click();
    await page.locator("#preview-kind").selectOption("source");
    await page.locator("#tile-check").click();
    assert.equal(await page.locator("#preview-kind").inputValue(), "result");
    assert.ok(await page.locator("#tile-preview-dialog").isVisible());
    await page.screenshot({
      path: path.join(root, "artifacts", "tiles-large.png"),
    });
    await page.locator("#tile-preview-dialog .dialog-close").click();
    if (!(await page.locator("#tile-status-more").evaluate((el) => el.open)))
      await page.locator("#tile-status-more > summary").click();
    await page.locator("#tile-edges-quick").click();
    assert.ok(await page.locator("#prompt").isVisible());
    assert.match(await page.locator("#selection-summary").textContent(), /112/);
    await app.evaluate(
      (_, modulePath) => {
        const { CodexClient } = process.mainModule.require(modulePath);
        CodexClient.prototype.status = async () => ({
          available: true,
          connected: true,
          authType: "chatgpt",
          plan: "pro",
        });
        CodexClient.prototype.requestPatch = async ({
          input,
          onProgress,
          signal,
        }) =>
          new Promise((resolve, reject) => {
            globalThis.__tileInput = input;
            globalThis.__tileEmit = onProgress;
            globalThis.__tileFinish = (p) =>
              resolve({
                proposal: p,
                usage: { input_tokens: 100, output_tokens: 20 },
              });
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
            onProgress({ type: "stage", stage: "waiting" });
          });
      },
      path.join(root, "tests", "fixtures", "legacy-codex.mjs"),
    );
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.waitForFunction(
      () =>
        document.getElementById("request-stage").textContent === "응답 대기",
    );
    for (const id of [
      "tile-open",
      "tile-wrap",
      "tile-select-edges",
      "tile-disable",
    ])
      assert.equal(await page.locator("#" + id).isDisabled(), true);
    const input = await app.evaluate(() => globalThis.__tileInput);
    assert.equal(input.mask.filter(Boolean).length, 112);
    assert.equal(input.document.tileMode.material, "이끼 낀 벽돌");
    const preAI = await preview(),
      proposal = {
        summary: "경계 연결",
        new_colors: [],
        runs: [{ x: 0, y: 0, colors: [13] }],
      };
    await app.evaluate(
      (_, p) =>
        globalThis.__tileEmit({
          type: "textDone",
          text: JSON.stringify(
            process.mainModule
              .require(
                process.mainModule
                  .require("node:path")
                  .join(process.cwd(), "tests", "wire-fixture.mjs"),
              )
              .wirePatch(globalThis.__tileInput, p),
          ),
        }),
      proposal,
    );
    await page.waitForFunction(
      () => !document.getElementById("stream-label").hidden,
    );
    assert.notDeepEqual(await preview(), preAI);
    await app.evaluate((_, p) => globalThis.__tileFinish(p), proposal);
    await page.locator("#apply-btn").waitFor({ state: "visible" });
    assert.equal(await page.locator("#tile-disable").isDisabled(), true);
    await page.locator("#compare-btn").click();
    assert.deepEqual(await preview(), preAI);
    await page.locator("#compare-btn").click();
    await page.locator("#apply-btn").click();
    const applied = await draft();
    assert.equal(applied.pixels[0], 13);
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.waitForFunction(
      () =>
        document.getElementById("request-stage").textContent === "응답 대기",
    );
    await app.evaluate(() =>
      globalThis.__tileFinish({
        summary: "잘못된 범위",
        new_colors: [],
        runs: [{ x: 4, y: 4, colors: [14] }],
      }),
    );
    await page.waitForFunction(
      () => !document.getElementById("tile-open").disabled,
    );
    assert.deepEqual(await draft(), applied);
    const exportPath = path.join(profile, "tile.png");
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, exportPath);
    await page.locator("#export-btn").click();
    await page.waitForFunction(() =>
      document.getElementById("toast").textContent.includes("내보냈어요"),
    );
    const png = PNG.sync.read(await fs.readFile(exportPath));
    assert.equal(png.width, 16);
    assert.equal(png.height, 16);
    if (!(await page.locator("#tile-status-more").evaluate((el) => el.open)))
      await page.locator("#tile-status-more > summary").click();
    await page.locator("#tile-disable").click();
    assert.equal((await draft()).tileMode, undefined);
    assert.equal(
      await page.locator("#tile-preview-section").isVisible(),
      false,
    );
    await page.locator("#undo-btn").click();
    assert.deepEqual(await draft(), applied);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    const preservedPrompt = await page.locator("#prompt").inputValue();
    await page.locator("#new-btn").click();
    await page.locator("#tile-open").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "tiles-small.png"),
    });
    await page.locator("#tile-material").selectOption("water");
    await page.locator("#tile-size").selectOption("8");
    const sourcePage = page;
    await page.locator("#tile-create").click();
    page = await require("./next-editor.cjs")(app, page);
    assert.equal(
      await sourcePage.locator("#prompt").inputValue(),
      preservedPrompt,
    );
    const newTile = await draft();
    assert.equal(newTile.width, 8);
    assert.equal(newTile.tileMode.material, "물");
    assert.equal(newTile.layers.length, 1);
    assert.ok(newTile.pixels.every((c) => newTile.palette[c] === "#35799FFF"));
    assert.ok((await page.locator("#prompt").inputValue()).length > 0);
    assert.deepEqual(errors, []);
    await app.close();
    app = await _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
    page = await require("./first-editor.cjs")(app);
    await page.locator("#tile-status").waitFor({ state: "visible" });
    assert.deepEqual(await draft(), newTile);
    console.log(
      "Tiles desktop PASS: existing pixels/layers preserved, wrapped pointer stroke, undo/redo, 3x3 live/compare preview, AI selection/locks, native PNG, safe new tile flow, small layout and restart.",
    );
  } catch (error) {
    if (page)
      await page
        .screenshot({ path: path.join(root, "artifacts", "tiles-failure.png") })
        .catch(() => {});
    throw error;
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
