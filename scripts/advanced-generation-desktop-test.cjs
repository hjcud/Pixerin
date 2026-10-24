if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."), profile = await require("./test-runner.cjs").createProfile("advanced-generation-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(8, 8));
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
  await require("./test-ai-disclosure.cjs")(profile);
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch({ executablePath: require("electron"), args: [root], env });
  let app = await launch();
  let failed = false;
  try {
    const page = await require("./first-editor.cjs")(app), errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await require("./editor-ready.cjs")(page);
    console.log("Editor ready");
    await app.evaluate((_, root) => {
      const { PNG } = process.mainModule.require(root + "/node_modules/pngjs");
      const png = PNG.sync.write({ width: 64, height: 64, data: Buffer.from(Array.from({ length: 4096 }, (_, i) => {
        const x = i % 64, y = Math.floor(i / 64);
        return ((x >= 24 && x < 27) || (x >= 40 && x < 43)) && y >= 24 && y < 28
          ? [20, 20, 20, 255] : [40, 200, 100, 255];
      }).flat()) }).toString("base64");
      globalThis.__imageCalls = [];
      globalThis.fetch = async (_url, options) => {
        const body = JSON.parse(options.body), signal = options.signal;
        globalThis.__imageCalls.push(body);
        if (!body.tools) return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "Mock finishing pass", new_colors: [], segments: [] }) }] }] });
        return new Promise((resolve, reject) => {
          globalThis.__releaseImage = () => resolve(Response.json({ status: "completed", output: [{ type: "image_generation_call", status: "completed", result: png }] }));
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      };
    }, root);
    await require("./configure-test-api.cjs")(page);
    const pixels = () => page.locator("#pixel-canvas").evaluate((c) => Array.from(c.getContext("2d").getImageData(0, 0, c.width, c.height).data));
    const before = await pixels();
    assert.equal(await page.locator("#ai-advanced").isChecked(), false);
    assert.equal(await page.locator("#ai-economy").isChecked(), false);
    await page.locator("#ai-economy").check();
    assert.ok(await page.locator("#economy-note").isVisible());
    assert.ok(await page.locator("#quality-request-note").isHidden());
    assert.equal(await app.evaluate(() => globalThis.__imageCalls.length), 0);
    console.log("Testing opt-in and cancellation");
    await page.locator("#ai-edit-mode").selectOption("whole");
    assert.equal(await app.evaluate(() => globalThis.__imageCalls.length), 0);
    assert.ok(await page.locator("#advanced-generation-note").isVisible());
    assert.ok(await page.locator("#quality-request-note").isHidden());
    await page.locator("#prompt").fill("작은 초록 보석");
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() => !document.querySelector("#cancel-request").hidden);
    assert.ok(await page.locator("#ai-advanced").isDisabled());
    assert.ok(await page.locator("#ai-economy").isDisabled());
    await page.locator("#cancel-request").click();
    await page.waitForFunction(() => !document.querySelector("#generate-btn").hidden);
    assert.deepEqual(await pixels(), before);
    console.log("Testing preview and discard");
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() => !document.querySelector("#cancel-request").hidden);
    await app.evaluate(() => globalThis.__releaseImage());
    await page.waitForSelector("#proposal-card:not([hidden])");
    const preview = await pixels(); assert.notDeepEqual(preview, before);
    assert.equal(await app.evaluate(() => globalThis.__imageCalls.length), 2);
    const saved = await page.evaluate(() => window.pixeltool.loadDraft());
    assert.ok(saved.layers[0].pixels.every((p) => p === 0));
    assert.ok(await page.locator("#advanced-refine").isHidden());
    assert.ok(await page.locator("#whole-result-note").isVisible());
    await page.locator("#advanced-conversion summary").click();
    await page.locator('[popovertarget="conversion-method-help"]').hover();
    assert.ok(await page.locator("#conversion-method-help").isVisible());
    await page.keyboard.press("Escape");
    assert.ok(await page.locator("#proposal-card").isVisible());
    assert.deepEqual(await pixels(), preview);
    await page.locator("#conversion-colors").selectOption("8");
    await page.locator("#conversion-threshold").selectOption("192");
    await page.locator("#conversion-anchor").selectOption("end");
    await page.locator("#advanced-reconvert").click();
    await page.waitForFunction(() => !document.querySelector("#advanced-reconvert").disabled);
    assert.equal(await app.evaluate(() => globalThis.__imageCalls.length), 2);
    assert.deepEqual(await pixels(), preview);
    assert.equal(await page.locator("#conversion-method").inputValue(), "features");
    assert.equal(await page.locator("#conversion-fit").inputValue(), "frame");
    await page.locator("#conversion-method").selectOption("structure");
    await page.locator("#conversion-fit").selectOption("content");
    await page.locator("#advanced-reconvert").click();
    await page.waitForFunction(() => !document.querySelector("#advanced-reconvert").disabled);
    assert.equal(await app.evaluate(() => globalThis.__imageCalls.length), 2);
    assert.notDeepEqual(await pixels(), preview);
    await page.locator("#conversion-fit").selectOption("frame");
    await page.locator("#conversion-method").selectOption("nearest");
    await page.locator("#advanced-reconvert").click();
    await page.waitForFunction(() => !document.querySelector("#advanced-reconvert").disabled);
    assert.notDeepEqual(await pixels(), preview);
    await page.locator("#conversion-method").selectOption("features");
    await page.locator("#advanced-reconvert").click();
    await page.waitForFunction(() => !document.querySelector("#advanced-reconvert").disabled);
    assert.deepEqual(await pixels(), preview);
    assert.equal(await app.evaluate(() => globalThis.__imageCalls.length), 2);
    assert.ok((await page.evaluate(() => window.pixeltool.loadDraft())).layers[0].pixels.every((p) => p === 0));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1100, 740));
    for (const language of ["en", "ja", "zh-CN", "es", "fr", "de", "ko"]) {
      await page.evaluate(async (language) => {
        const settings = await window.pixeltool.getSettings();
        await window.pixeltool.savePreferences({ ...settings.preferences, language });
      }, language);
      await page.waitForFunction((language) => document.documentElement.lang === language, language);
      for (const id of ["advanced-conversion", "conversion-method", "conversion-fit", "advanced-reconvert", "economy-note"])
        assert.ok(await page.locator("#" + id).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${language}: ${id}`);
    }
    await page.locator("#discard-btn").click();
    assert.deepEqual(await pixels(), before);
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() => !document.querySelector("#cancel-request").hidden);
    await app.evaluate(() => globalThis.__releaseImage());
    await page.waitForSelector("#proposal-card:not([hidden])");
    await page.locator("#apply-btn").click();
    assert.deepEqual(await pixels(), preview);
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), before);
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() => !document.querySelector("#cancel-request").hidden);
    await app.evaluate(() => globalThis.__releaseImage());
    await page.waitForSelector("#proposal-card:not([hidden])");
    await page.locator("#apply-btn").click();
    await page.locator("#ai-edit-mode").selectOption("precise");
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() => !document.querySelector("#generate-btn").hidden);
    const calls = await app.evaluate(() => globalThis.__imageCalls);
    assert.equal(calls.length, 5);
    assert.equal(calls[4].tools, undefined);
    assert.ok(!calls[4].instructions.includes("user-requested finishing pass"));
    assert.ok(calls.every((call) => call.store === false));
    assert.equal(await page.locator("#ai-advanced").isChecked(), false);
    assert.deepEqual(await pixels(), preview);
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), before);
    await page.locator("#ai-edit-mode").selectOption("whole");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1100, 740));
    for (const language of ["en", "ja", "zh-CN", "es", "fr", "de", "ko"]) {
      await page.evaluate(async (language) => {
        const settings = await window.pixeltool.getSettings();
        await window.pixeltool.savePreferences({ ...settings.preferences, language });
      }, language);
      await page.waitForFunction((language) => document.documentElement.lang === language, language);
      assert.ok(await page.locator("#advanced-generation-note").isVisible());
      assert.ok(await page.locator("#advanced-generation-note").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await page.locator("#advanced-conversion-note").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await page.locator("#ai-advanced").isChecked());
    }
    await page.screenshot({ path: path.join(root, "artifacts/advanced-generation-desktop.png") });
    assert.deepEqual(errors, []);
    await app.close(); app = await launch();
    const reopened = await require("./first-editor.cjs")(app);
    await require("./editor-ready.cjs")(reopened);
    assert.equal(await reopened.locator("#ai-advanced").isChecked(), false);
    console.log("PASS: precise/whole modes, local reconversion without model calls, frozen options, cancel/discard, apply/undo, explicit precise request, seven-language controls and restart; no live model calls");
  } catch (error) {
    failed = true;
    console.error(error);
    throw error;
  } finally {
    if (failed) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    else await app.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
