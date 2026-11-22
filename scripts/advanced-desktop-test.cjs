if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("advanced-profile-");
  const { createDocument, ensureLayers, validateDocument, documentRGBA } =
    await import("../src/core.mjs");
  const { decodePNG } = await import("../electron/png.mjs");
  const initial = ensureLayers(createDocument(8, 8, "Advanced check"));
  initial.pixels[0] = 7;
  initial.pixels[1] = 8;
  initial.layers.push({
    id: "upper",
    name: "Light",
    visible: true,
    locked: false,
    pixels: Array(64).fill(0),
  });
  initial.layers[1].pixels[8] = 11;
  initial.activeLayerId = "upper";
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(initial));
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
      () => document.getElementById("doc-name").value === "Advanced check",
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
    const cell = async (x, y) => {
      const b = await page.locator("#overlay-canvas").boundingBox();
      return {
        x: b.x + ((x + 0.5) * b.width) / 8,
        y: b.y + ((y + 0.5) * b.height) / 8,
      };
    };
    const click = async (x, y) => {
      const p = await cell(x, y);
      await page.mouse.click(p.x, p.y);
    };
    const select = async (x1, y1, x2, y2) => {
      await page.locator('[data-tool="select"]').click();
      const a = await cell(x1, y1),
        b = await cell(x2, y2);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y);
      await page.mouse.up();
    };
    const rgba = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) =>
          Array.from(c.getContext("2d").getImageData(0, 0, 8, 8).data),
        );
    await page.locator("#used-tab").click();
    assert.equal(await page.locator("#palette-panel").isVisible(), false);
    assert.equal(await page.locator("#used-panel").isVisible(), true);
    await page.locator("#used-tab").press("ArrowLeft");
    assert.equal(await page.locator("#palette-panel").isVisible(), true);
    assert.equal(await page.locator(".layer-thumbnail").count(), 2);
    await page.locator("#layer-resizer").focus();
    const height = Number(
      await page.locator("#layer-resizer").getAttribute("aria-valuenow"),
    );
    await page.keyboard.press("ArrowUp");
    assert.equal(
      Number(
        await page.locator("#layer-resizer").getAttribute("aria-valuenow"),
      ),
      height + 10,
    );
    const composite = await rgba();
    await page.locator("#layer-more").selectOption("merge");
    assert.equal((await draft()).layers.length, 1);
    assert.deepEqual(await rgba(), composite);
    await page.locator("#undo-btn").click();
    assert.equal((await draft()).layers.length, 2);
    await page.locator("#layer-more").selectOption("solo");
    let doc = await draft();
    assert.equal(doc.layers[0].visible, false);
    await page.locator("#undo-btn").click();
    const out = path.join(profile, "layer.png");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, out);
    await page.locator("#layer-more").selectOption("export");
    await page.waitForFunction(() =>
      document
        .getElementById("toast")
        .textContent.includes("선택한 레이어를 PNG"),
    );
    assert.deepEqual(
      [...documentRGBA(decodePNG(await fs.readFile(out)))],
      [...documentRGBA(initial, false)],
    );
    console.log(
      "PASS: color tabs, thumbnails, adjustable layers, exact merge/undo, solo and active-layer PNG",
    );
    await page.locator("#shade-options > summary").click();
    await page.locator("#ramp-edit").click();
    await page.locator("#ramp-name").fill("보라 그림자");
    await page.locator("#ramp-shadow").selectOption("#97516AFF");
    await page.locator("#ramp-base").selectOption("#50A889FF");
    await page.locator("#ramp-light").selectOption("#F5D99AFF");
    await page.locator("#ramp-save").click();
    doc = await draft();
    assert.equal(doc.shadeRamps[0].name, "보라 그림자");
    assert.equal(await page.locator("#shade-strip button").count(), 3);
    assert.equal(await page.locator("#shade-strength").isDisabled(), true);
    await page.locator('#shade-strip [data-step="-1"]').click();
    await page.locator('[data-tool="pencil"]').click();
    await click(2, 2);
    doc = await draft();
    assert.equal(doc.palette[doc.pixels[18]], "#97516AFF");
    await page.locator("#undo-btn").click();
    assert.equal((await draft()).pixels[18], 0);
    await page.locator("#palette button").nth(7).click();
    assert.equal(await page.locator("#shade-strip button").count(), 5);
    if (!(await page.locator("#brush-details").evaluate((e) => e.open)))
      await page.locator("#brush-details > summary").click();
    await page.locator("#symmetry-toggle").check();
    await click(2, 2);
    doc = await draft();
    assert.equal(doc.pixels[18], 7);
    assert.equal(doc.pixels[21], 7);
    await page.locator("#undo-btn").click();
    await page.locator("#symmetry-toggle").uncheck();
    await select(0, 1, 1, 1);
    if (!(await page.locator("#selection-more").evaluate((e) => e.open)))
      await page.locator("#selection-more > summary").click();
    await page.locator("#transform-action").selectOption("flip-x");
    doc = await draft();
    assert.equal(doc.pixels[8], 0);
    assert.equal(doc.pixels[9], 11);
    await page.locator("#undo-btn").click();
    if (!(await page.locator("#selection-more").evaluate((e) => e.open)))
      await page.locator("#selection-more > summary").click();
    await page.locator("#transform-action").selectOption("rotate-cw");
    doc = await draft();
    assert.equal(doc.pixels[8], 11);
    assert.equal(doc.pixels[16], 0);
    await page.locator("#undo-btn").click();
    await select(0, 1, 0, 1);
    if (!(await page.locator("#selection-more").evaluate((e) => e.open)))
      await page.locator("#selection-more > summary").click();
    await page.locator("#transform-action").selectOption("duplicate");
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    doc = await draft();
    assert.equal(doc.pixels[8], 11);
    assert.equal(doc.pixels[9], 11);
    await page.locator("#undo-btn").click();
    await page.locator("#clear-selection").click();
    console.log(
      "PASS: named ramps, palette reuse, symmetry, selection transforms and duplicate move preserve originals",
    );
    const opened = app.waitForEvent("window");
    await page.locator("#inspector-preview").click();
    await page.locator("#preview-open").click();
    await page.locator("#inspector-ai").click();
    const preview = await opened;
    await preview.waitForFunction(() =>
      document.getElementById("status").textContent.includes("현재 작업"),
    );
    assert.equal(
      await preview.evaluate(() => typeof window.pixeltool),
      "undefined",
    );
    await preview.locator("#background").selectOption("light");
    assert.equal(
      await preview.locator("#previews").getAttribute("class"),
      "light",
    );
    await page.locator('[data-tool="pencil"]').click();
    await click(3, 3);
    await preview.waitForFunction(
      () =>
        document
          .getElementById("preview-1")
          .getContext("2d")
          .getImageData(3, 3, 1, 1).data[3] === 255,
    );
    const previewBytes = await preview
      .locator("#preview-4")
      .evaluate((c) =>
        Array.from(c.getContext("2d").getImageData(0, 0, 8, 8).data),
      );
    assert.deepEqual(previewBytes, await rgba());
    assert.equal(
      await preview.locator("#preview-4").evaluate((c) => c.style.width),
      "32px",
    );
    await preview.screenshot({
      path: path.join(root, "artifacts", "floating-preview.png"),
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("preview.html"))
        .close(),
    );
    await page.locator("#undo-btn").click();
    console.log(
      "PASS: isolated always-on-top preview receives live exact-size frames and supports background switching",
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
          globalThis.__advancedInput = input;
          const patch = {
            summary: "Invalid color",
            new_colors: ["#123456FF"],
            runs: [{ x: 0, y: 1, colors: [input.document.palette.length] }],
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
    if (!(await page.locator("#ai-options").evaluate((el) => el.open)))
      await page.locator("#ai-options > summary").click();
    await page.locator("#ai-palette").selectOption("existing");
    if (!(await page.locator("#ai-options").evaluate((el) => el.open)))
      await page.locator("#ai-options > summary").click();
    await page.locator("#ai-shape").selectOption("preserve");
    assert.equal(
      await page.locator("#alpha-lock-btn").getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#prompt").fill("그림자 색만 변경");
    const before = await draft();
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() =>
      document.getElementById("ai-status").textContent.includes("기존 팔레트"),
    );
    assert.equal(await page.locator("#proposal-card").isVisible(), false);
    assert.deepEqual((await draft()).layers, before.layers);
    const input = await app.evaluate(() => globalThis.__advancedInput);
    assert.equal(input.paletteOnly, true);
    assert.equal(input.alphaLock, true);
    assert.equal(input.mask.filter(Boolean).length, 1);
    if (!(await page.locator("#ai-options").evaluate((el) => el.open)))
      await page.locator("#ai-options > summary").click();
    await page.locator("#ai-shape").selectOption("change");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.locator("#fit-btn").click();
    await page.locator("#toast").evaluate((el) => (el.hidden = true));
    await page.screenshot({
      path: path.join(root, "artifacts", "advanced-small.png"),
    });
    for (const id of ["shade-strip", "color-tabs", "help-btn"]) {
      // Expanded tool sections use the scrollable left panel.
      await page
        .locator(id === "color-tabs" ? ".color-tabs" : "#" + id)
        .scrollIntoViewIfNeeded();
      const b = await page
        .locator(id === "color-tabs" ? ".color-tabs" : "#" + id)
        .boundingBox();
      assert.ok(
        b.y >= 0 && b.y + b.height <= (await page.evaluate(() => innerHeight)),
        id + " outside viewport",
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: palette-only rejection, shape/alpha sync, minimum layout and zero renderer errors",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: path.join(root, "artifacts", "advanced-error.png"),
        })
        .catch(() => {});
    throw e;
  } finally {
    await app.close();
  }
  const reopened = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  try {
    const page = await reopened.firstWindow();
    await page.waitForFunction(
      () => document.getElementById("doc-name").value === "Advanced check",
    );
    assert.equal(
      await page
        .locator("#ramp-select option")
        .filter({ hasText: "보라 그림자" })
        .count(),
      1,
    );
  } finally {
    await reopened.close();
  }
  console.log("PASS: project shade ramps survive restart");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
