if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("review-layout-");
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
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    assert.equal(await page.locator("#layer-name").count(), 0);
    await page.locator("#layer-add").click();
    await page.locator(".layer-select").nth(1).dblclick();
    await page.locator("#layer-name").fill("Base");
    await page.locator("#layer-name").press("Enter");
    assert.equal(
      await page.locator(".layer-select").nth(1).textContent(),
      "Base",
    );
    await page.locator(".layer-select").nth(1).press("F2");
    await page.locator("#layer-name").fill("Canceled");
    await page.locator("#layer-name").press("Escape");
    assert.equal(
      await page.locator(".layer-select").nth(1).textContent(),
      "Base",
    );
    await page.locator("#undo-btn").click();
    assert.equal(
      await page.locator(".layer-select").nth(1).textContent(),
      "레이어 1",
    );
    await page.locator("#redo-btn").click();
    await page.locator("#layer-more").selectOption("rename");
    await page.locator("#layer-name").fill("   ");
    await page.locator("#layer-name").press("Tab");
    assert.equal(
      await page.locator(".layer-select").nth(1).textContent(),
      "Base",
    );
    await page.locator('[data-tool="select"]').click();
    await page.locator("#select-all").click();
    const strip = await page.locator("#selection-popover").boundingBox();
    assert.ok(strip.height <= 52, JSON.stringify(strip));
    assert.equal(await page.locator("#selection-actions").isVisible(), false);
    await page.locator("#selection-more > summary").click();
    assert.ok(await page.locator("#selection-actions").isVisible());
    assert.ok(await page.locator("#transform-action").isVisible());
    await page.screenshot({
      path: path.join(root, "artifacts", "review-selection-menu.png"),
    });
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#selection-more").evaluate((e) => e.open),
      false,
    );
    assert.match(await page.locator("#selection-summary").textContent(), /256/);
    await app.evaluate(
      (_, file) => {
        const { CodexClient } = process.mainModule.require(file);
        CodexClient.prototype.status = async () => ({
          available: true,
          connected: true,
          authType: "chatgpt",
          plan: "pro",
        });
        CodexClient.prototype.requestPatch = async () => ({
          proposal: {
            summary: "검토용 긴 설명. ".repeat(200),
            new_colors: [],
            runs: [{ x: 0, y: 0, colors: [7, 7] }],
          },
          usage: { input_tokens: 1200, output_tokens: 90 },
        });
      },
      path.join(root, "tests", "fixtures", "legacy-codex.mjs"),
    );
    const prompt = "요청 내용 ".repeat(300);
    await page.locator("#prompt").fill(prompt);
    await page.locator("#generate-btn").click();
    await page.locator("#proposal-card").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#submitted-request").evaluate((e) => e.open),
      false,
    );
    for (const id of [
      "prompt",
      "model-picker-btn",
      "connection-badge",
      "generate-btn",
      "selection-popover",
    ])
      assert.equal(await page.locator("#" + id).isVisible(), false, id);
    assert.equal(
      await page.locator("#proposal-card #request-progress").count(),
      1,
    );
    assert.equal(await page.locator("#usage-note").count(), 0);
    const reachable = async () => {
      for (const id of ["apply-btn", "discard-btn"])
        assert.ok(
          await page.locator("#" + id).evaluate((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.top >= 0 &&
              r.bottom <= innerHeight &&
              e.contains(
                document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                ),
              )
            );
          }),
          id,
        );
    };
    await reachable();
    await page
      .locator(".ai-scroll")
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    await reachable();
    await page.locator(".ai-scroll").evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({
      path: path.join(root, "artifacts", "review-fixed-footer.png"),
    });
    await page.locator("#inspector-preview").click();
    await reachable();
    await page.locator("#inspector-ai").click();
    await page.locator("#submitted-request > summary").click();
    assert.equal(
      await page.locator("#submitted-prompt").textContent(),
      prompt.trim(),
    );
    await page.locator("#discard-btn").click();
    assert.equal(
      await page
        .locator("#request-progress")
        .evaluate((e) => e.parentElement.id),
      "assistant-content",
    );
    assert.equal(await page.locator("#prompt").inputValue(), prompt);
    assert.ok(await page.locator("#prompt").isEnabled());
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-theme").selectOption("light");
    await page.locator('#settings-form button[type="submit"]').click();
    await page.locator("#generate-btn").click();
    await page.locator("#proposal-card").waitFor({ state: "visible" });
    await reachable();
    await page.screenshot({
      path: path.join(root, "artifacts", "review-fixed-footer-light.png"),
    });
    await page.locator("#apply-btn").click();
    await page.locator("#undo-btn").click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: inline rename on inactive layer, F2/menu, Enter/Escape/blur/undo, one-row selection and transient menu, fixed review actions under long content and preview tab, frozen form, single usage record, preserved draft, small dark/light layout.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
