if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { PNG } = require("pngjs");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile =
      await require("./test-runner.cjs").createProfile("large-document-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(256, 128, "Large test"));
  doc.pixels[0] = 11;
  doc.pixels[100 * 256 + 200] = 7;
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
  await require("./test-ai-disclosure.cjs")(profile);
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  try {
    let page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await require("./editor-ready.cjs")(page);
    assert.equal(
      await page.locator("#pixel-canvas").getAttribute("width"),
      "256",
    );
    assert.ok(await page.locator("#generate-btn").isDisabled());
    assert.ok(
      (await page.locator("#ai-region-note").innerText()).includes("64px"),
    );
    await app.evaluate((_, root) => {
      const { CodexClient } = process.mainModule.require(
          root + "/tests/fixtures/legacy-codex.mjs",
        ),
        { buildRequest, parseResponse } = process.mainModule.require(
          root + "/electron/ai.mjs",
        );
      globalThis.__largeCalls = 0;
      CodexClient.prototype.status = async () => ({
        available: true,
        connected: true,
        authType: "chatgpt",
        plan: "pro",
      });
      CodexClient.prototype.requestPatch = async ({ input }) => {
        globalThis.__largeCalls++;
        const body = buildRequest(input, "mock");
        globalThis.__largePayload = JSON.parse(body.input[0].content[0].text);
        const segment = globalThis.__largePayload.editable_segments[0],
          colors = Array(segment.length).fill(null);
        colors[0] = 5;
        return parseResponse(
          {
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      summary: "Mock region edit",
                      new_colors: [],
                      segments: [{ id: segment.id, colors }],
                    }),
                  },
                ],
              },
            ],
          },
          input,
        );
      };
    }, root);
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const original = await pixels();
    const position = async (x, y) => {
      const r = await page.locator("#overlay-canvas").boundingBox();
      return {
        x: r.x + ((x + 0.5) * r.width) / 256,
        y: r.y + ((y + 0.5) * r.height) / 128,
      };
    };
    await page.locator('[data-tool="select"]').click();
    const a = await position(80, 64),
      b = await position(95, 79);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await page.locator("#ai-quality").evaluate((el) => {
      el.value = "off";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#prompt").fill("Edit the selected region");
    assert.ok(await page.locator("#generate-btn").isEnabled());
    await page.locator("#generate-btn").click();
    await page.waitForSelector("#apply-btn:not([disabled])");
    await page.locator("#apply-btn").click();
    const payload = await app.evaluate(() => globalThis.__largePayload);
    assert.equal(payload.width, 64);
    assert.equal(payload.rows.length, 64);
    const after = await pixels();
    assert.deepEqual(
      after.slice((64 * 256 + 80) * 4, (64 * 256 + 80) * 4 + 4),
      [255, 255, 255, 255],
    );
    assert.deepEqual(after.slice(0, 4), original.slice(0, 4));
    assert.equal(await app.evaluate(() => globalThis.__largeCalls), 1);
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), original);
    await page.locator("#overlay-canvas").focus();
    await page.keyboard.press("Control+d");
    await page.locator("#zoom-label").click();
    await page.locator("#zoom-value").fill("1600");
    await page.locator("#zoom-apply").click();
    assert.equal(
      await page.locator("#overlay-canvas").getAttribute("width"),
      "4096",
    );
    await page.locator("#fit-btn").click();
    await page.locator("#file-more > summary").click();
    await page.locator("#image-size-open").click();
    const initialBox = await page.locator("#image-size-dialog").boundingBox();
    await page.locator("#image-size-half").click();
    assert.equal(await page.locator("#image-size-width").inputValue(), "128");
    assert.equal(await page.locator("#image-size-height").inputValue(), "64");
    const changedBox = await page.locator("#image-size-dialog").boundingBox();
    assert.equal(Math.round(changedBox.height), Math.round(initialBox.height));
    await page.locator("#image-size-apply").click();
    assert.equal(
      await page.locator("#pixel-canvas").getAttribute("width"),
      "128",
    );
    await page.locator("#undo-btn").click();
    assert.equal(
      await page.locator("#pixel-canvas").getAttribute("width"),
      "256",
    );
    assert.deepEqual(await pixels(), original);
    const saveFile = path.join(profile, "large.pixeltool");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, saveFile);
    await page.locator("#save-btn").click();
    await page.waitForFunction(() =>
      document.querySelector("#save-status").textContent.includes("저장됨"),
    );
    const saved = JSON.parse(await fs.readFile(saveFile, "utf8"));
    assert.equal(saved.width, 256);
    assert.equal(saved.height, 128);
    await page.reload();
    await require("./editor-ready.cjs")(page);
    assert.deepEqual(await pixels(), original);
    // An oversized generated PNG is prepared rather than replacing existing artwork.
    const rgba = Buffer.alloc(512 * 32 * 4);
    for (let i = 0; i < 512 * 32; i++) {
      rgba[i * 4] = i % 256;
      rgba[i * 4 + 1] = Math.floor(i / 256) % 256;
      rgba[i * 4 + 2] = 40;
      rgba[i * 4 + 3] = i % 11 ? 255 : 0;
    }
    const file = path.join(profile, "large.png");
    await fs.writeFile(
      file,
      PNG.sync.write({ width: 512, height: 32, data: rgba }),
    );
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, file);
    await page.locator("#open-btn").click();
    await page.waitForSelector("#image-size-dialog[open]");
    assert.ok(await page.locator("#image-size-apply").isDisabled());
    await page.locator("#image-size-cancel").click();
    assert.deepEqual(await pixels(), original);
    await page.locator("#open-btn").click();
    await page.waitForSelector("#image-size-dialog[open]");
    const source = await page.locator("#image-size-source").boundingBox();
    await page.mouse.move(
      source.x + source.width * 0.25,
      source.y + source.height * 0.5,
    );
    await page.mouse.down();
    await page.mouse.move(
      source.x + source.width * 0.7,
      source.y + source.height * 0.53,
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await page.locator("#image-crop-width").inputValue(), "512");
    assert.ok(await page.locator("#image-size-dialog").isVisible());
    await page.locator("#image-size-reduce").check();
    assert.ok(await page.locator("#image-size-apply").isEnabled());
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await page.locator("#image-size-apply").scrollIntoViewIfNeeded();
    const apply = await page.locator("#image-size-apply").boundingBox();
    assert.ok(apply.y >= 0 && apply.y + apply.height <= 740);
    await page.screenshot({
      path: path.join(root, "artifacts", "image-import-preparation.png"),
    });
    const next = require("./next-editor.cjs")(app, page);
    await page.locator("#image-size-apply").click();
    page = await next;
    assert.equal(
      await page.locator("#pixel-canvas").getAttribute("width"),
      "256",
    );
    assert.equal(
      await page.locator("#pixel-canvas").getAttribute("height"),
      "16",
    );
    assert.ok((await page.locator("#palette button").count()) <= 256);
    page.on("pageerror", (e) => errors.push(e.message));
    for (const locale of ["en", "ja", "zh-CN", "es", "fr", "de", "ko"]) {
      await page.locator("#settings-btn").click();
      await page.locator("#pref-language").selectOption(locale);
      await page.keyboard.press("Escape");
      await page.locator("#file-more > summary").click();
      await page.locator("#image-size-open").click();
      if (locale !== "ko")
        assert.doesNotMatch(
          await page.locator("#image-size-dialog").innerText(),
          /[가-힣]/,
        );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.locator("#image-size-cancel").click();
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: large canvas, bounded mock AI, scale/undo, persistence and explicit PNG crop/reduction.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
