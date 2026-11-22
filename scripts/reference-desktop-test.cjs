if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { PNG } = require("pngjs");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("reference-");
  await require("./test-ai-disclosure.cjs")(profile);
  const data = Buffer.alloc(1200 * 800 * 4);
  for (let y = 0; y < 800; y++)
    for (let x = 0; x < 1200; x++) {
      const i = (y * 1200 + x) * 4,
        inside = x >= 300 && x < 500 && y >= 200 && y < 500;
      data[i] = inside ? 0 : 255;
      data[i + 1] = inside ? 68 : 0;
      data[i + 2] = inside ? 255 : 0;
      data[i + 3] = 255;
    }
  const bytes = PNG.sync.write({ width: 1200, height: 800, data });
  const file = {
    name: "private-reference.png",
    mimeType: "image/png",
    buffer: bytes,
  };
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  try {
    let page = await require("./first-editor.cjs")(app),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) =>
          Array.from(
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        );
    const original = await pixels(),
      prompt = "참고 이미지의 장식을 사용해줘. <b>보석</b>";
    await page.locator("#prompt").fill(prompt);
    await page.locator("#reference-file").setInputFiles(file);
    await page.waitForSelector("#reference-dialog[open]");
    assert.ok(await page.locator("#generate-btn").isDisabled());
    for (const [key, value] of Object.entries({
      x: 300,
      y: 200,
      width: 200,
      height: 300,
    })) {
      await page.locator("#reference-crop-" + key).fill(String(value));
      await page.locator("#reference-crop-" + key).press("Tab");
    }
    await page.locator('[data-reference-purpose="shape"]').uncheck();
    assert.ok(await page.locator("#reference-apply").isDisabled());
    await page.locator('[data-reference-purpose="lighting"]').check();
    await page.locator('[data-reference-purpose="details"]').check();
    await page
      .locator("#reference-note")
      .fill("Keep this blue gem <b>unchanged</b>.");
    await page.screenshot({
      path: path.join(root, "artifacts", "reference-crop.png"),
    });
    await page.locator("#reference-apply").click();
    await page.waitForSelector("#reference-attached:not([hidden])");
    const croppedURL = await page
      .locator("#reference-thumb")
      .getAttribute("src");
    await page.locator("#inspector-preview").click();
    assert.ok(await page.locator("#reference-compare").isVisible());
    assert.equal(
      await page.locator("#reference-compare-image").getAttribute("src"),
      croppedURL,
    );
    assert.equal(
      await page
        .locator("#reference-compare-canvas")
        .evaluate((c) => c.clientWidth / c.width),
      7,
    );
    assert.ok(await page.locator("#palette-tab").isVisible());
    const paletteBox = await page.locator("#palette-tab").boundingBox();
    assert.ok(paletteBox.y + paletteBox.height < 740);
    await page.screenshot({
      path: path.join(root, "artifacts", "reference-comparison.png"),
    });
    await page.locator("#reference-compare-edit").click();
    assert.ok(await page.locator("#reference-dialog").isVisible());
    await page.locator("#reference-cancel").click();
    const cropped = PNG.sync.read(
      Buffer.from(croppedURL.split(",")[1], "base64"),
    );
    assert.equal(cropped.width, 200);
    assert.equal(cropped.height, 300);
    for (let i = 0; i < cropped.data.length; i += 4)
      assert.deepEqual([...cropped.data.subarray(i, i + 4)], [0, 68, 255, 255]);
    assert.deepEqual(await pixels(), original);
    assert.ok(await page.locator("#reference-transmission-note").isVisible());
    // Editing/canceling a crop must retain the previous bytes and purposes.
    await page.locator("#reference-edit").click();
    await page.locator("#reference-canvas").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#reference-crop-x").inputValue(), "301");
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#reference-thumb").getAttribute("src"),
      croppedURL,
    );
    await page.locator("#reference-edit").click();
    const box = await page.locator("#reference-canvas").boundingBox();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, {
      steps: 5,
    });
    assert.ok(
      Number(await page.locator("#reference-crop-width").inputValue()) > 600,
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await page.locator("#reference-crop-x").inputValue(), "300");
    await page.locator("#reference-cancel").click();
    await page.locator("#reference-file").setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("invalid"),
    });
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("PNG"),
    );
    assert.equal(
      await page.locator("#reference-thumb").getAttribute("src"),
      croppedURL,
    );
    // Drop and image paste target the reference UI, never document import.
    for (const type of ["drop", "paste"]) {
      await page.evaluate(
        ({ encoded, type }) => {
          const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
            transfer = new DataTransfer();
          transfer.items.add(
            new File([bytes], type + ".png", { type: "image/png" }),
          );
          const el = document.querySelector(
            type === "drop" ? "#reference-section" : "#prompt",
          );
          el.dispatchEvent(
            type === "drop"
              ? new DragEvent("drop", {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer: transfer,
                })
              : new ClipboardEvent("paste", {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: transfer,
                }),
          );
        },
        { encoded: bytes.toString("base64"), type },
      );
      await page.waitForSelector("#reference-dialog[open]");
      await page.locator("#reference-cancel").click();
      assert.deepEqual(await pixels(), original);
      assert.equal(await page.locator("#prompt").inputValue(), prompt);
      assert.equal(
        await page.locator("#reference-thumb").getAttribute("src"),
        croppedURL,
      );
    }
    // Mock clipboard read only; the user's system clipboard is never modified.
    await app.evaluate(({ clipboard, nativeImage }, base64) => {
      clipboard.readImage = () =>
        nativeImage.createFromBuffer(Buffer.from(base64, "base64"));
    }, bytes.toString("base64"));
    await page.locator("#reference-paste").click();
    await page.waitForSelector("#reference-dialog[open]");
    await page.locator("#reference-cancel").click();
    // Exercise JPEG and static WebP decoding too, using temporary generated fixtures.
    const jpeg = await app.evaluate(
      ({ nativeImage }, base64) =>
        nativeImage
          .createFromBuffer(Buffer.from(base64, "base64"))
          .toJPEG(80)
          .toString("base64"),
      bytes.toString("base64"),
    );
    await page.locator("#reference-file").setInputFiles({
      name: "photo.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(jpeg, "base64"),
    });
    await page.waitForSelector("#reference-dialog[open]");
    await page.locator("#reference-cancel").click();
    const webp = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 24;
      c.getContext("2d").fillRect(0, 0, 32, 24);
      return c.toDataURL("image/webp").split(",")[1];
    });
    await page.locator("#reference-file").setInputFiles({
      name: "reference.webp",
      mimeType: "image/webp",
      buffer: Buffer.from(webp, "base64"),
    });
    await page.waitForSelector("#reference-dialog[open]");
    await page.locator("#reference-cancel").click();
    for (const [language, theme] of [
      ["de", "light"],
      ["en", "dark"],
      ["ko", "dark"],
    ]) {
      await page.locator("#settings-btn").click();
      await page.locator("#pref-language").selectOption(language);
      await page.locator("#settings-tab-display").click();
      await page.locator("#pref-theme").selectOption(theme);
      await page.locator('#settings-form button[type="submit"]').click();
      await page.locator("#reference-edit").click();
      assert.equal(
        await page
          .locator("#reference-dialog")
          .evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
      );
      assert.equal(
        await page.locator("#reference-note").inputValue(),
        "Keep this blue gem <b>unchanged</b>.",
      );
      if (language === "de")
        await page.screenshot({
          path: path.join(root, "artifacts", "reference-crop-light-de.png"),
        });
      await page.locator("#reference-cancel").click();
      assert.equal(
        await page.locator("#reference-thumb").getAttribute("src"),
        croppedURL,
      );
    }
    await app.evaluate((_, root) => {
      const { CodexClient } = process.mainModule.require(
        root + "/tests/fixtures/legacy-codex.mjs",
      );
      const { buildRequest, parseResponse } = process.mainModule.require(
        root + "/electron/ai.mjs",
      );
      const { fixedScope } = process.mainModule.require(
        root + "/electron/fixed-patch.mjs",
      );
      CodexClient.prototype.status = async () => ({
        available: true,
        connected: true,
        authType: "chatgpt",
        plan: "pro",
      });
      CodexClient.prototype.requestPatch = async ({
        input,
        model,
        onProgress,
      }) => {
        globalThis.__referenceInput = input;
        globalThis.__referenceBody = buildRequest(input, model);
        onProgress({ type: "stage", stage: "waiting" });
        return new Promise((resolve) => {
          globalThis.__referenceFinish = () => {
            const s = fixedScope(input).segments[0],
              colors = Array(s.length).fill(null);
            colors[0] = 7;
            resolve(
              parseResponse(
                {
                  status: "completed",
                  usage: { input_tokens: 700, output_tokens: 40 },
                  output: [
                    {
                      type: "message",
                      content: [
                        {
                          type: "output_text",
                          text: JSON.stringify({
                            summary: "Reference edit",
                            new_colors: [],
                            segments: [{ id: s.id, colors }],
                            roles: [
                              {
                                id: s.id,
                                roles: "b" + ".".repeat(s.length - 1),
                              },
                            ],
                          }),
                        },
                      ],
                    },
                  ],
                },
                input,
              ),
            );
          };
        });
      };
    }, root);
    await page.locator("#generate-btn").click();
    await page.waitForSelector("#submitted-reference:not([hidden])");
    assert.equal(
      await page.locator("#submitted-reference-image").getAttribute("src"),
      croppedURL,
    );
    assert.ok(await page.locator("#reference-file").isDisabled());
    assert.ok(await page.locator("#reference-edit").isDisabled());
    const captured = await app.evaluate(() => ({
      input: globalThis.__referenceInput,
      body: globalThis.__referenceBody,
    }));
    assert.equal(captured.input.reference.image, croppedURL);
    assert.deepEqual(captured.input.reference.purposes, [
      "lighting",
      "details",
    ]);
    assert.equal(
      captured.input.reference.note,
      "Keep this blue gem <b>unchanged</b>.",
    );
    assert.equal(
      JSON.stringify(captured.body).includes("private-reference.png"),
      false,
    );
    const text = JSON.parse(captured.body.input[0].content[0].text);
    assert.equal(text.width, 16);
    assert.equal(text.visual_reference.reference_width, 200);
    assert.equal(
      captured.body.input[0].content.filter((c) => c.type === "input_image")
        .length,
      3,
    );
    await page.locator("#submitted-settings > summary").click();
    await page.locator("#submitted-transmission").click();
    assert.ok(await page.locator("#transmission-reference").isVisible());
    await page.keyboard.press("Escape");
    await app.evaluate(() => globalThis.__referenceFinish());
    await page.waitForSelector("#proposal-card:not([hidden])");
    await page.locator("#discard-btn").click();
    assert.deepEqual(await pixels(), original);
    await page.locator("#reference-remove").click();
    assert.equal(
      await page.locator("#reference-transmission-note").isVisible(),
      false,
    );
    await page.locator("#generate-btn").click();
    await page.waitForSelector("#submitted-request:not([hidden])");
    assert.equal(
      await app.evaluate(() => globalThis.__referenceInput.reference),
      null,
    );
    await app.evaluate(() => globalThis.__referenceFinish());
    await page.waitForSelector("#proposal-card:not([hidden])");
    await page.locator("#discard-btn").click();
    await page.locator("#reference-file").setInputFiles(file);
    await page.waitForSelector("#reference-dialog[open]");
    await page.locator("#reference-apply").click();
    await page.locator("#new-btn").click();
    await page.locator('[data-size="8"]').click();
    await page.locator('#new-form button[type="submit"]').click();
    page = await require("./next-editor.cjs")(app, page);
    if (await page.locator("#confirm-dialog").isVisible())
      await page.locator("#confirm-skip").click();
    await page.waitForFunction(
      () => document.querySelector("#pixel-canvas").width === 8,
    );
    assert.equal(await page.locator("#reference-attached").isVisible(), false);
    await page.locator("#reference-file").setInputFiles(file);
    await page.waitForSelector("#reference-dialog[open]");
    await page.locator("#reference-apply").click();
    await page.reload();
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    assert.equal(await page.locator("#reference-attached").isVisible(), false);
    const saved = await page.evaluate(async () => ({
      draft: await window.pixeltool.loadDraft(),
      storage: JSON.stringify(localStorage),
    }));
    assert.equal(JSON.stringify(saved).includes("data:image/png"), false);
    assert.equal(JSON.stringify(saved).includes("private-reference"), false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: reference file/drop/paste, PNG/JPEG/WebP, exact crop-only transmission, cancel/failure preservation, frozen request, purpose contract, detach and transient storage.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
