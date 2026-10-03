if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, "..");
  const profile = await require("./test-runner.cjs").createProfile(
    "preferences-profile-",
  );
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
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector(".layer-thumbnail");
    const submit = () =>
      page.locator('#settings-form button[type="submit"]').click();
    const close = () =>
      page.locator("#settings-dialog .dialog-close").first().click();
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const canvas = await page.locator("#overlay-canvas").boundingBox();
    for (let x = 0; x < 15; x++)
      await page.mouse.click(
        canvas.x + ((x + 0.5) * canvas.width) / 16,
        canvas.y + canvas.height / 32,
      );
    const drawn = await pixels();
    await page.locator("#settings-btn").click();
    assert.equal(await page.locator("#settings-editor").isVisible(), true);
    assert.equal(await page.locator("#settings-ai").isVisible(), false);
    assert.match(
      await page.locator("#history-count").textContent(),
      /실행 취소 15회/,
    );
    await page.locator("#pref-historyLimit").fill("10");
    await page.locator("#pref-historyMemoryMB").fill("8");
    assert.match(
      await page.locator("#history-estimate").textContent(),
      /약 10회/,
    );
    await close();
    assert.match(await page.locator("#undo-btn").getAttribute("title"), /15회/);
    await page.locator("#settings-btn").click();
    assert.equal(await page.locator("#pref-historyLimit").inputValue(), "100");
    await page.locator("#pref-historyLimit").fill("10");
    await page.locator("#pref-historyMemoryMB").fill("8");
    await page.locator("#pref-canvasSize").selectOption("32");
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-grid").uncheck();
    await page.locator("#pref-selectionOutline").uncheck();
    await page.locator("#pref-canvasBackground").selectOption("light");
    await page.locator("#pref-previewKind").selectOption("source");
    await page.locator("#pref-zoomSpeed").selectOption("2");
    await page.locator("#pref-reverseZoom").check();
    await page.locator("#pref-livePreview").uncheck();
    await submit();
    await page.waitForSelector("#settings-dialog", { state: "hidden" });
    assert.deepEqual(await pixels(), drawn);
    assert.match(await page.locator("#undo-btn").getAttribute("title"), /10회/);
    assert.equal(
      await page
        .locator("#grid-btn")
        .evaluate((e) => e.classList.contains("selected")),
      false,
    );
    assert.equal(await page.locator("#live-preview-toggle").isChecked(), false);
    for (let i = 0; i < 10; i++) await page.locator("#undo-btn").click();
    assert.ok(await page.locator("#undo-btn").isDisabled());
    const remaining = await pixels();
    assert.equal(remaining.filter((v, i) => i % 4 === 3 && v).length, 5);
    for (let i = 0; i < 10; i++) await page.locator("#redo-btn").click();
    assert.deepEqual(await pixels(), drawn);
    await page.locator("#new-btn").click();
    assert.equal(await page.locator("#new-width").inputValue(), "32");
    await page.locator("#new-dialog .dialog-close").first().click();
    const zoom = Number(
      (await page.locator("#zoom-label").textContent()).replace("%", ""),
    );
    await page.locator("#overlay-canvas").hover();
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(
      (z) =>
        Number(
          document.getElementById("zoom-label").textContent.replace("%", ""),
        ) < z,
      zoom,
    );
    await page.locator("#settings-btn").click();
    await page.locator("#pref-historyMemoryMB").fill("999");
    await submit();
    assert.match(await page.locator("#settings-error").textContent(), /8~512/);
    assert.ok(await page.locator("#settings-dialog").isVisible());
    await close();
    let persisted = JSON.parse(
      await fs.readFile(path.join(profile, "settings.json"), "utf8"),
    );
    assert.equal(persisted.preferences.historyMemoryMB, 8);
    // Saving AI connection and later preferences must preserve each other's values.
    await page.locator("#connection-badge").click();
    assert.ok(await page.locator("#settings-ai").isVisible());
    await page.locator("#provider-input").selectOption("api");
    await page.locator("#api-key").fill("sk-preferences-test-only");
    await page.locator("#remember-key").uncheck();
    await submit();
    await page.waitForSelector("#settings-dialog", { state: "hidden" });
    let next = JSON.parse(
      await fs.readFile(path.join(profile, "settings.json"), "utf8"),
    );
    assert.deepEqual(next.preferences, persisted.preferences);
    assert.equal(next.provider, "api");
    await page.locator("#settings-btn").click();
    await submit();
    await page.waitForSelector("#settings-dialog", { state: "hidden" });
    assert.deepEqual(
      JSON.parse(
        await fs.readFile(path.join(profile, "settings.json"), "utf8"),
      ),
      next,
    );
    persisted = next;
    const rejection = await page.evaluate(async () => {
      try {
        await window.pixeltool.savePreferences({ historyLimit: -2 });
        return false;
      } catch {
        return true;
      }
    });
    assert.ok(rejection);
    assert.deepEqual(
      JSON.parse(
        await fs.readFile(path.join(profile, "settings.json"), "utf8"),
      ),
      persisted,
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.locator("#settings-btn").click();
    for (const id of ["editor", "display", "ai"]) {
      await page.locator("#settings-tab-" + id).click();
      assert.ok(
        await page
          .locator('#settings-form button[type="submit"]')
          .evaluate((e) => {
            const r = e.getBoundingClientRect();
            return r.bottom <= innerHeight && r.top > 0;
          }),
      );
      assert.equal(
        await page
          .locator(".settings-pages")
          .evaluate((e) => e.scrollWidth > e.clientWidth),
        false,
      );
      await page.screenshot({
        path: path.join(root, "artifacts", "settings-" + id + "-1100.png"),
      });
    }
    await page.locator("#preferences-reset").click();
    await close();
    assert.deepEqual(
      JSON.parse(
        await fs.readFile(path.join(profile, "settings.json"), "utf8"),
      ),
      persisted,
    );
    assert.deepEqual(errors, []);
    await app.close();
    app = await launch();
    page = await require("./first-editor.cjs")(app);
    await page.waitForFunction(
      () => document.body.dataset.canvasBackground === "light",
    );
    await page.waitForSelector(".layer-thumbnail");
    assert.deepEqual(await pixels(), drawn);
    assert.equal(await page.locator("#live-preview-toggle").isChecked(), false);
    await page.locator("#settings-btn").click();
    assert.equal(await page.locator("#pref-historyLimit").inputValue(), "10");
    assert.match(
      await page.locator("#history-count").textContent(),
      /실행 취소 0회/,
    );
    console.log(
      "Preferences desktop PASS: grouped tabs, cancel/reset, history cap with contiguous undo/redo, unchanged pixels, defaults, zoom, validation in renderer/main, minimum layout and restart.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
