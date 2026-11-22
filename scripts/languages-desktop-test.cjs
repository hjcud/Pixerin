if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("languages-");
  const { createDocument, ensureLayers, validateDocument } =
    await import("../src/core.mjs");
  const { t, setLanguage } = await import("../src/i18n.mjs");
  const doc = ensureLayers(createDocument(16, 16));
  doc.name = "열기";
  doc.layers[0].name = "연필";
  doc.pixels[0] = 7;
  const serialized = JSON.stringify(validateDocument(doc));
  await fs.writeFile(path.join(profile, "draft.json"), serialized);
  await require("./test-ai-disclosure.cjs")(profile);
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
  let app = await launch();
  try {
    let page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.setDefaultTimeout(5000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const original = await pixels(),
      prompt = "연필 / 새 작업 / {0} <b>KEEP</b> 日本語";
    await page.locator("#prompt").fill(prompt);
    await page.locator('[data-tool="select"]').click();
    await page.locator("#select-all").click();
    await page.locator("#alpha-lock-btn").click();
    for (const locale of ["en", "ja", "zh-CN", "es", "fr", "de", "ko", "en"]) {
      setLanguage(locale);
      await page.locator("#settings-btn").click();
      await page.locator("#pref-language").selectOption(locale);
      await page.waitForFunction(
        (l) => document.documentElement.lang === l,
        locale,
      );
      assert.equal(
        await page.locator("#settings-dialog h2").textContent(),
        t("설정"),
      );
      assert.equal(
        await page.locator('#pref-language option[value="ko"]').textContent(),
        "한국어",
      );
      await page.locator("#settings-tab-display").click();
      await page.screenshot({
        path: path.join(
          root,
          "artifacts",
          "language-settings-" + locale + ".png",
        ),
      });
      await page.locator("#settings-dialog .dialog-close").first().click();
      assert.equal(
        (
          await page
            .locator('[data-tool="pencil"] > span:nth-child(2)')
            .textContent()
        ).trim(),
        t("연필"),
      );
      assert.equal(
        await page.locator("#active-tool-label").textContent(),
        t("사각 선택"),
      );
      assert.equal(await page.locator("#prompt").inputValue(), prompt);
      assert.equal(await page.locator("#doc-name").inputValue(), "열기");
      assert.equal(await page.locator(".layer-select").textContent(), "연필");
      assert.deepEqual(await pixels(), original);
      // Select all now records one undoable selection change.
      assert.ok(await page.locator("#undo-btn").isEnabled());
      assert.ok(
        (
          await page.locator('[data-tool="eraser"]').getAttribute("title")
        ).startsWith(t("지우개 (E)")),
      );
      const state = await page.evaluate(() => ({
        language: document.documentElement.lang,
        selected: document.querySelector("#selection-summary").textContent,
        overflow: document.documentElement.scrollWidth > innerWidth,
        tools: [...document.querySelectorAll(".tool > span:nth-child(2)")]
          .filter((el) => {
            const a = el.getBoundingClientRect(),
              b = el.parentElement.getBoundingClientRect();
            return a.right > b.right + 1 || a.bottom > b.bottom + 1;
          })
          .map((el) => el.textContent),
      }));
      assert.ok(state.selected.includes("256"));
      assert.equal(state.overflow, false);
      assert.deepEqual(state.tools, []);
      const formatting = await page.evaluate(async locale => {
        const { renderTransmissionLog } = await import("./src/transmission-log-ui.mjs");
        const started = "2026-01-02T03:04:05.000Z";
        await renderTransmissionLog({ transmissionHistory: async () => ({ entries: [{
          started, provider: "api", model: "localization-fixture", status: "completed",
          usage: { input_tokens: 12345, output_tokens: 67890 }, width: 16, height: 16, pixels: 256, calls: 1,
        }] }) });
        return {
          total: document.getElementById("transmission-log-total").textContent,
          summary: document.querySelector("#transmission-log-list summary").textContent,
          number: (12345).toLocaleString(locale), date: new Date(started).toLocaleString(locale),
          font: getComputedStyle(document.documentElement).fontFamily,
        };
      }, locale);
      assert.ok(formatting.total.includes(formatting.number), `${locale}: token grouping follows app language`);
      assert.ok(formatting.summary.includes(formatting.date), `${locale}: history date follows app language`);
      if (locale === "ja") assert.match(formatting.font, /Yu Gothic UI/);
      if (locale === "zh-CN") assert.match(formatting.font, /Microsoft YaHei UI/);
      await page.locator("#refine-open").click();
      assert.equal(
        (await page.locator("#refine-dialog h2").textContent()).trim(),
        t("픽셀 보정"),
      );
      await page.locator("#refine-tab-outline").click();
      if (locale !== "ko")
        assert.doesNotMatch(
          await page.locator("#refine-result").textContent(),
          /[가-힣]/,
        );
      await page.keyboard.press("Escape");
      await page.locator("#geometry-open").click();
      await page.locator('[data-geometry-mode="width"]').click();
      if (locale !== "ko")
        assert.doesNotMatch(
          await page.locator("#geometry-gesture-help").textContent(),
          /[가-힣]/,
        );
      await page.keyboard.press("Escape");
      await page.screenshot({
        path: path.join(
          root,
          "artifacts",
          "language-editor-" + locale + ".png",
        ),
      });
    }
    await page.locator("#inspector-preview").click();
    const opened = app.waitForEvent("window");
    opened.catch(()=>{}); // Preserve the original click failure if opening fails.
    await page.locator("#preview-open").click();
    const preview = await opened;
    await preview.waitForFunction(() => document.documentElement.lang === "en");
    assert.equal(
      (await preview.locator("header strong").textContent()).trim(),
      t("실제 크기 미리보기"),
    );
    await page.locator("#settings-btn").click();
    await page.locator("#pref-language").selectOption("ja");
    await preview.waitForFunction(() => document.documentElement.lang === "ja");
    assert.match(await preview.evaluate(() => getComputedStyle(document.documentElement).fontFamily), /Yu Gothic UI/);
    setLanguage("ja");
    assert.equal(
      (await preview.locator("header strong").textContent()).trim(),
      t("실제 크기 미리보기"),
    );
    await page.locator("#settings-dialog .dialog-close").first().click();
    // Native dialogs use the same saved language, without opening or writing files.
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async (_win, options) => {
        globalThis.__localeSaveTitle = options.title;
        return { canceled: true };
      };
    });
    await page.locator("#save-btn").click();
    assert.equal(
      await app.evaluate(() => globalThis.__localeSaveTitle),
      t("프로젝트 저장"),
    );
    assert.deepEqual(errors, []);
    await app.close();
    app = await launch();
    page = await require("./first-editor.cjs")(app);
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    await page.waitForFunction(() => document.documentElement.lang === "ja");
    assert.equal(await page.locator("#doc-name").inputValue(), "열기");
    assert.deepEqual(await pixels(), original);
    const protectedDocument = JSON.parse(serialized);
    protectedDocument.layers[0].alphaLocked = true;
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(profile, "draft.json"), "utf8")),
      protectedDocument,
    );
    assert.equal(
      await page.locator("#alpha-lock-btn").getAttribute("aria-pressed"),
      "true",
    );
    // Alpha lock now survives restart. Explicitly unlock for the shape-changing AI fixture.
    await page.locator("#alpha-lock-btn").click();
    assert.equal(
      JSON.parse(await fs.readFile(path.join(profile, "settings.json"), "utf8"))
        .preferences.language,
      "ja",
    );
    await app.evaluate(() => {
      globalThis.fetch = async () => new Promise((resolve) => {
        globalThis.__finishLanguageRequest = () => resolve(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "연필", new_colors: [], segments: [{ id: 0, colors: { set: [1, 7] } }] }) }] }] }));
      });
    });
    await require("./configure-test-api.cjs")(page);
    await page.locator("#inspector-ai").click(); // The selected panel tab now survives restart.
    // This fixture manually resolves one request to inspect translated progress.
    // Two-call visual review has its own mocked desktop suite.
    await page.locator("#ai-options > summary").click();
    await page.locator("#ai-quality").selectOption("check");
    await page.locator("#prompt").fill(prompt);
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() => document.body.classList.contains("busy"));
    assert.equal(await page.locator("#submitted-prompt").textContent(), prompt);
    assert.doesNotMatch(await page.locator("#request-stage").textContent(), /[가-힣]/);
    await app.evaluate(() => globalThis.__finishLanguageRequest());
    await page.locator("#proposal-card").waitFor({ state: "visible" });
    assert.equal(await page.locator("#proposal-summary").textContent(), "연필");
    assert.equal(await page.locator("#compare-btn").textContent(), t("원본 보기"));
    await page.locator("#discard-btn").click();
    assert.deepEqual(await pixels(), original);
    assert.equal(await page.locator("#prompt").inputValue(), prompt);
    await app.evaluate(() => {
      globalThis.fetch = async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "연필", new_colors: [], segments: [] }) }] }] });
    });
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() => document.querySelector("#ai-status").textContent === "연필");
    assert.deepEqual(await pixels(), original);
    console.log("PASS: seven languages, immediate/restart persistence, native dialogs and preview synchronization, minimum layout, protected names/prompts/pixels/selection/history, refinement and 3D controls.");
  } finally { await app.close(); setLanguage("ko"); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
