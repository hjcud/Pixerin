if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("icon-quality-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(8, 8));
  doc.palette = [
    "#00000000",
    "#707070FF",
    "#747474FF",
    "#FFFFFFFF",
    "#404040FF",
  ];
  doc.layers[0].refinementProtection = Array(64).fill(false);
  doc.layers[0].refinementProtection[0] = true;
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
    const page = await require("./first-editor.cjs")(app),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Renderer:", e.message);
    });
    page.on("console", (m) => {
      if (m.type() === "error") console.error("Console:", m.text());
    });
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await app.evaluate((_, root) => {
      const { CodexClient } = process.mainModule.require(
        root + "/tests/fixtures/legacy-codex.mjs",
      );
      const { validateDocument } = process.mainModule.require(
        root + "/src/core.mjs",
      );
      globalThis.__qualityCalls = 0;
      CodexClient.prototype.status = async () => ({
        available: true,
        connected: true,
        authType: "chatgpt",
        plan: "pro",
      });
      CodexClient.prototype.requestPatch = async ({ input, signal }) => {
        globalThis.__qualityCalls++;
        globalThis.__qualityInput = input;
        const document = validateDocument(input.document);
        if (input.qualityRepair)
          return new Promise((resolve, reject) => {
            globalThis.__qualityRelease = () =>
              resolve({
                proposal: {
                  summary: "Local repair",
                  new_colors: [],
                  runs: input.mask.flatMap((v, i) =>
                    v ? [{ x: i % 8, y: Math.floor(i / 8), colors: [4] }] : [],
                  ),
                },
                usage: { input_tokens: 40, output_tokens: 20 },
              });
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          });
        const roles = Array(64).fill(""),
          runs = [];
        for (let y = 1; y <= 6; y++)
          for (let x = 1; x <= 6; x++) {
            const i = y * 8 + x;
            roles[i] = i === 27 ? "h" : i === 45 ? "d" : "b";
            if (input.mask[i])
              runs.push({ x, y, colors: [i === 27 ? 2 : i === 45 ? 3 : 1] });
          }
        return {
          proposal: { summary: "Mock gem", new_colors: [], runs },
          roles,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      };
    }, root);
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) =>
          Array.from(
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        );
    const original = await pixels();
    await page.locator("#prompt").fill("작은 보석의 명암을 또렷하게 만들어줘.");
    assert.ok(await page.locator("#quality-request-note").isVisible());
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() =>
      document.querySelector("#request-stage").textContent.includes("2차"),
    );
    assert.ok(await page.locator("#ai-quality").isDisabled());
    assert.equal((await pixels())[27 * 4], 116);
    const raw = await page.evaluate(() => window.pixeltool.loadDraft());
    assert.ok(
      raw.layers[0].pixels.every((v) => v === 0),
      "Draft preview never changes autosave",
    );
    const repairMask = await app.evaluate(() => globalThis.__qualityInput.mask);
    assert.equal(repairMask[0], false);
    assert.equal(repairMask[27], false);
    assert.equal(repairMask[45], false);
    await app.evaluate(() => globalThis.__qualityRelease());
    await page.waitForSelector("#proposal-card:not([hidden])");
    assert.equal((await pixels())[19 * 4], 64);
    await page.locator("#quality-report > summary").click();
    assert.ok(await page.locator("#corner-preview").evaluate((el) => el.open));
    await page.locator("#quality-protection-edit").click();
    const review = page.locator("#quality-protection-canvas");
    const reviewPixels = () => review.evaluate((c) => c.toDataURL());
    const reviewPoint = async (x, y) => {
      const r = await review.boundingBox();
      return [
        r.x + ((x + 0.5) * r.width) / 8,
        r.y + ((y + 0.5) * r.height) / 8,
      ];
    };
    await page.mouse.move(...(await reviewPoint(2, 2)));
    await page.mouse.down();
    await review.dispatchEvent("lostpointercapture", {
      pointerId: 1,
      buttons: 0,
    });
    await page.mouse.up();
    const protectedStroke = await reviewPixels();
    await page.mouse.move(...(await reviewPoint(1, 1)));
    await page.mouse.down();
    const pendingStroke = await reviewPixels();
    const [clientX, clientY] = await reviewPoint(5, 5);
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ])
      await review.dispatchEvent(type, {
        pointerId: 99,
        pointerType: "touch",
        clientX,
        clientY,
        button: 0,
        buttons: 1,
      });
    assert.equal(
      await reviewPixels(),
      pendingStroke,
      "foreign pointers retain the owning protection gesture",
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(
      await reviewPixels(),
      protectedStroke,
      "Escape retains prior completed marks",
    );
    await page.mouse.move(...(await reviewPoint(1, 1)));
    await page.mouse.down();
    await page.mouse.move(...(await reviewPoint(1, 2)));
    await review.evaluate((c) => c.releasePointerCapture(1));
    await page.mouse.move(...(await reviewPoint(2, 1)));
    await page.mouse.up();
    assert.equal(
      await reviewPixels(),
      protectedStroke,
      "capture loss restores the pending marks",
    );
    await review.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await page.locator("#quality-protection-cancel").click();
    assert.equal(
      await page.locator("#quality-protection-saved").isVisible(),
      false,
    );
    await page.locator("#quality-protection-edit").click();
    await review.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await page.screenshot({
      path: path.join(root, "artifacts", "protection-review.png"),
    });
    await page.locator("#quality-protection-save").click();
    assert.ok(await page.locator("#quality-protection-saved").isVisible());
    assert.equal(
      await app.evaluate(() => globalThis.__qualityCalls),
      2,
      "Review uses no AI calls",
    );
    assert.match(await page.locator("#quality-counts").textContent(), /1 → 0/);
    assert.ok(await page.locator("#quality-comparison").isVisible());
    await page.locator("#request-progress > summary").click();
    assert.equal(
      await page.locator("#request-input-tokens").textContent(),
      "140",
    );
    assert.equal(
      await page.locator("#request-output-tokens").textContent(),
      "70",
    );
    await page.locator("#quality-comparison").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(root, "artifacts", "icon-quality-review.png"),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      await page
        .locator("#assistant-content")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
    for (const [language, theme] of [
      ["de", "light"],
      ["ko", "dark"],
    ]) {
      await page.locator("#settings-btn").click();
      await page.locator("#pref-language").selectOption(language);
      await page.locator("#settings-tab-display").click();
      await page.locator("#pref-theme").selectOption(theme);
      await page.locator('#settings-form button[type="submit"]').click();
      await page.locator("#quality-comparison").scrollIntoViewIfNeeded();
      assert.equal(
        await page
          .locator("#assistant-content")
          .evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
      );
      assert.equal((await pixels())[19 * 4], 64);
      if (language === "de") {
        assert.match(
          await page.locator("#quality-counts").textContent(),
          /Befunde/,
        );
        await page.screenshot({
          path: path.join(root, "artifacts", "icon-quality-light-de.png"),
        });
        await page.locator("#quality-protection-edit").click();
        const b = await page
          .locator("#quality-protection-dialog")
          .boundingBox();
        assert.ok(
          b.x >= 0 &&
            b.y >= 0 &&
            b.x + b.width <= 1100 &&
            b.y + b.height <= 740,
        );
        await page.screenshot({
          path: path.join(root, "artifacts", "protection-review-light-de.png"),
        });
        await page.locator("#quality-protection-cancel").click();
      }
    }
    await page.locator("#quality-use-draft").click();
    assert.equal((await pixels())[19 * 4], 112);
    assert.equal(await page.locator("#quality-comparison").isVisible(), false);
    await page.locator("#apply-btn").click();
    await page.waitForFunction(
      async () =>
        (await window.pixeltool.loadDraft()).layers[0]
          .refinementProtection?.[9] === true,
    );
    const protectedDraft = await page.evaluate(() =>
      window.pixeltool.loadDraft(),
    );
    assert.ok(
      protectedDraft.layers[0].refinementProtection[0],
      "Existing marks retained",
    );
    assert.ok(protectedDraft.layers[0].refinementProtection[27]);
    assert.ok(protectedDraft.layers[0].refinementProtection[45]);
    const painted = await pixels();
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), original);
    await page.waitForFunction(
      async () =>
        (await window.pixeltool.loadDraft()).layers[0]
          .refinementProtection?.[9] === false,
    );
    await page.locator("#redo-btn").click();
    assert.deepEqual(await pixels(), painted);
    await page.locator("#undo-btn").click();
    await page.locator("#ai-options > summary").click();
    await page.locator("#ai-quality").selectOption("check");
    assert.equal(
      await page.locator("#quality-request-note").isVisible(),
      false,
    );
    await page.locator("#generate-btn").click();
    await page.waitForSelector("#proposal-card:not([hidden])");
    assert.equal(await app.evaluate(() => globalThis.__qualityCalls), 3);
    await page.locator("#discard-btn").click();
    assert.deepEqual(await pixels(), original);
    // Persistence and all source-language strings stay outside artwork data.
    await page.reload();
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    assert.equal(await page.locator("#ai-quality").inputValue(), "check");
    assert.ok(await page.locator("#ai-quality-protect").isChecked());
    assert.deepEqual(errors, []);
    console.log(
      "Icon quality desktop passed: repair scope, frozen draft, combined usage, comparison, atomic undo, inspection-only and persistence.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
