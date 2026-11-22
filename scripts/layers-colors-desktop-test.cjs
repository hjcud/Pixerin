if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("layers-profile-");
  const { createDocument, validateDocument, documentRGBA } =
    await import("../src/core.mjs");
  const original = createDocument(8, 8, "Layers check");
  original.pixels[0] = 7;
  original.pixels[1] = 7;
  await fs.writeFile(
    path.join(profile, "draft.json"),
    JSON.stringify(original),
  );
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
    page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () => document.getElementById("doc-name").value === "Layers check",
    );
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
    const pixel = async (x, y) => {
      const b = await page.locator("#overlay-canvas").boundingBox();
      await page.mouse.click(
        b.x + ((x + 0.5) * b.width) / 8,
        b.y + ((y + 0.5) * b.height) / 8,
      );
    };
    const rgba = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) =>
          Array.from(c.getContext("2d").getImageData(0, 0, 8, 8).data),
        );
    assert.equal((await draft()).layers.length, 1);
    await page.locator("#layer-add").click();
    await page.locator("#layer-more").selectOption("rename");
    await page.locator("#layer-name").fill("Highlights");
    await page.locator("#layer-name").press("Tab");
    await page.locator("#palette button").nth(11).click();
    await pixel(0, 0);
    let doc = await draft();
    assert.equal(doc.layers.length, 2);
    assert.equal(doc.layers[0].pixels[0], 7);
    assert.equal(doc.layers[1].pixels[0], 11);
    assert.deepEqual((await rgba()).slice(0, 4), [215, 120, 135, 255]);
    await page.locator(".layer-row.active .layer-visibility").click();
    assert.deepEqual((await rgba()).slice(0, 4), [80, 168, 137, 255]);
    await pixel(2, 0);
    assert.equal((await draft()).pixels[2], 0);
    await page.locator(".layer-row.active .layer-visibility").click();
    await page.locator(".layer-row.active .layer-lock").click();
    await pixel(2, 0);
    assert.equal((await draft()).pixels[2], 0);
    await page.locator("#undo-btn").click();
    assert.equal((await draft()).layers[1].locked, false);
    await page.locator("#layer-down").click();
    assert.deepEqual((await rgba()).slice(0, 4), [80, 168, 137, 255]);
    await page.locator("#layer-up").click();
    await page.locator("#layer-duplicate").click();
    assert.equal((await draft()).layers.length, 3);
    await page.locator("#layer-delete").click();
    assert.equal((await draft()).layers.length, 2);
    await page.locator("#undo-btn").click();
    assert.equal((await draft()).layers.length, 3);
    await page.locator("#redo-btn").click();
    assert.equal((await draft()).layers.length, 2);
    console.log(
      "PASS: migration, active-layer painting, composite visibility/order, lock, duplicate/delete and undo",
    );
    // Scoped recolor preview never mutates the original; Escape cancels.
    await page.locator("#used-tab").click();
    await page.locator(".used-color").first().click();
    await page.locator("#replace-color").evaluate((el) => {
      el.value = "#ffffff";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal((await draft()).pixels[0], 11);
    assert.match(await page.locator("#replace-result").textContent(), /1픽셀/);
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.getElementById("replace-dialog").open,
    );
    assert.deepEqual((await rgba()).slice(0, 4), [215, 120, 135, 255]);
    await page.locator(".used-color").first().click();
    await page.locator("#replace-color").evaluate((el) => {
      el.value = "#ffffff";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#replace-apply").click();
    doc = await draft();
    assert.equal(doc.palette[doc.pixels[0]], "#FFFFFFFF");
    assert.equal(doc.layers[0].pixels[0], 7);
    await page.locator("#undo-btn").click();
    assert.equal((await draft()).pixels[0], 11);
    // Selection is the default replacement scope, with alpha preserved.
    await page.locator(".layer-select").last().click();
    await page.locator('[data-tool="select"]').click();
    await pixel(0, 0);
    await page.locator(".used-color").first().click();
    assert.equal(
      await page.locator("#replace-scope").inputValue(),
      "selection",
    );
    await page.locator("#replace-color").evaluate((el) => {
      el.value = "#ffffff";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#replace-apply").click();
    doc = await draft();
    assert.equal(doc.palette[doc.pixels[0]], "#FFFFFFFF");
    assert.equal(doc.pixels[1], 7);
    await page.locator("#undo-btn").click();
    await page.locator("#clear-selection").click();
    console.log(
      "PASS: used colors, preview/cancel/apply, selection default and out-of-scope preservation",
    );
    await page.locator('[data-tool="pencil"]').click();
    await page.locator("#palette-tab").click();
    await page.locator("#palette button").nth(7).click();
    const paletteLength = (await draft()).palette.length;
    if (!(await page.locator("#shade-options").evaluate((el) => el.open)))
      await page.locator("#shade-options > summary").click();
    await page.locator('#shade-strip [data-step="1"]').click();
    assert.equal((await draft()).palette.length, paletteLength);
    await pixel(2, 0);
    doc = await draft();
    assert.equal(doc.palette.length, paletteLength + 1);
    const shade = doc.palette[doc.pixels[2]];
    await page.locator('#shade-strip [data-step="2"]').click();
    await page.locator('#shade-strip [data-step="1"]').click();
    await pixel(3, 0);
    doc = await draft();
    assert.equal(doc.palette[doc.pixels[3]], shade);
    assert.equal(doc.palette.length, paletteLength + 1);
    await page.locator("#undo-btn").click();
    await page.locator("#undo-btn").click();
    assert.equal((await draft()).palette.length, paletteLength);
    // Choosing a new shade and painting outside a selection must not append unused colors.
    await page.locator('[data-tool="select"]').click();
    await pixel(0, 0);
    await page.locator('[data-tool="pencil"]').click();
    await pixel(7, 7);
    assert.equal((await draft()).palette.length, paletteLength);
    await page.locator("#clear-selection").click();
    console.log(
      "PASS: fixed-base shade steps, delayed palette insertion, reuse and atomic undo",
    );
    await app.evaluate(
      (_, modulePath) => {
        const { CodexClient } = process.mainModule.require(modulePath);
        CodexClient.prototype.status = async () => ({
          available: true,
          connected: true,
          authType: "chatgpt",
          plan: "pro",
        });
        CodexClient.prototype.requestPatch = async ({ input, onProgress }) => {
          globalThis.__layerInput = input;
          const patch = {
            summary: "Layer edit",
            new_colors: [],
            runs: [{ x: 0, y: 0, colors: [8] }],
          };
          onProgress({
            type: "textDone",
            text: JSON.stringify(
              process.mainModule
                .require(
                  process.mainModule
                    .require("node:path")
                    .join(process.cwd(), "tests", "wire-fixture.mjs"),
                )
                .wirePatch(input, patch),
            ),
          });
          return { proposal: patch };
        };
      },
      path.join(root, "tests", "fixtures", "legacy-codex.mjs"),
    );
    await page.locator(".layer-select").first().click();
    const beforeAI = await draft();
    await page.locator("#prompt").fill("밝은 부분만 다듬어줘");
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.locator("#proposal-card").waitFor({ state: "visible" });
    const input = await app.evaluate(() => globalThis.__layerInput);
    assert.equal(input.document.activeLayerId, beforeAI.activeLayerId);
    assert.ok(input.activeImage.startsWith("data:image/png;base64,"));
    assert.deepEqual((await draft()).layers, beforeAI.layers);
    await page.locator("#apply-btn").click();
    doc = await draft();
    assert.equal(doc.layers[0].pixels[0], 7);
    assert.equal(doc.layers[1].pixels[0], 8);
    await page.locator("#undo-btn").click();
    assert.deepEqual((await draft()).layers, beforeAI.layers);
    await page.screenshot({
      path: path.join(root, "artifacts", "layers-colors.png"),
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "layers-colors-small.png"),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: AI active layer patch preserves other layers; image context, undo, minimum layout and zero renderer errors",
    );
    await app.close();
    const reopened = await _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
    try {
      const pg = await reopened.firstWindow();
      await pg.waitForFunction(
        () => document.getElementById("doc-name").value === "Layers check",
      );
      assert.equal(await pg.locator(".layer-row").count(), 2);
    } finally {
      await reopened.close();
    }
    console.log("PASS: layered autosave survives application restart");
  } catch (error) {
    if (page)
      await page
        .screenshot({ path: path.join(root, "artifacts", "layers-error.png") })
        .catch(() => {});
    await app.close().catch(() => {});
    throw error;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
