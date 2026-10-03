if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("theme-profile-");
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
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    assert.equal(await page.locator("#theme-toggle").count(), 0);
    const original = await pixels();
    const checkArtSurfaces = async () => {
      const colors = await page.evaluate(() => {
        const selectors = [
          ".viewport",
          ".canvas-stack",
          ".preview-tile",
          ".preview-tile.light",
          ".layer-thumbnail",
          ".color-slot i",
          ".tile-repeat-stage",
          "#auto-map",
          "#auto-atlas",
          "#auto-selected",
        ];
        return selectors.flatMap((selector) =>
          [...document.querySelectorAll(selector)].map((element) => {
            const style = getComputedStyle(element);
            // The foreground swatch is artwork; only its checkerboard is neutral.
            const background =
              selector === ".color-slot i"
                ? style.backgroundImage.slice(
                    style.backgroundImage.indexOf("repeating-conic-gradient"),
                  )
                : `${style.backgroundColor} ${style.backgroundImage}`;
            return { selector, background };
          }),
        );
      });
      for (const { selector, background } of colors) {
        for (const match of background.matchAll(
          /rgba?\((\d+), (\d+), (\d+)/g,
        )) {
          assert.ok(
            match[1] === match[2] && match[2] === match[3],
            `${selector}: ${background}`,
          );
        }
      }
    };
    await checkArtSurfaces();
    const canvas = await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.click(canvas.x + 5, canvas.y + 5);
    const drawn = await pixels();
    assert.notDeepEqual(drawn, original);
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-theme").selectOption("light");
    await page.locator('#settings-form button[type="submit"]').click();
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    assert.deepEqual(await pixels(), drawn);
    await checkArtSurfaces();
    await page.screenshot({
      path: path.join(root, "artifacts", "theme-light.png"),
    });
    assert.equal(
      await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
      "light",
    );
    await page.waitForFunction(
      (expectedWidth) =>
        document.querySelector(".brand-logo").complete &&
        document.querySelector(".brand-logo").naturalWidth === expectedWidth,
      Number((await fs.readFile(path.join(root, "src", "brand", "pixerin-logo-dark.svg"), "utf8")).match(/<svg[^>]*width="([0-9]+)"/)[1]),
    );
    assert.match(
      await page.locator(".brand-logo").getAttribute("src"),
      /logo-dark/,
    );
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), original);
    await page.locator("#redo-btn").click();
    assert.deepEqual(await pixels(), drawn);
    const previewOpened = app.waitForEvent("window");
    await page.locator("#inspector-preview").click();
    await page.locator("#preview-open").click();
    await page.locator("#inspector-ai").click();
    const preview = await previewOpened;
    assert.ok(preview);
    await preview.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    const previewPixels = await preview
      .locator("#preview-1")
      .evaluate((c) => [
        ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
      ]);
    assert.deepEqual(previewPixels, drawn);
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-theme").selectOption("dark");
    await page.locator('#settings-form button[type="submit"]').click();
    await preview.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    await checkArtSurfaces();
    await page.screenshot({
      path: path.join(root, "artifacts", "theme-dark.png"),
    });
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-theme").selectOption("light");
    await page.locator("#settings-dialog .dialog-close").first().click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-theme").selectOption("light");
    await page.locator('#settings-form button[type="submit"]').click();
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await page.locator("#transmission-details").click();
    const dialog = await page.locator("#transmission-dialog").boundingBox();
    assert.ok(
      dialog.x >= 0 && dialog.y >= 0 && dialog.y + dialog.height <= 740,
    );
    await page.keyboard.press("Escape");
    assert.deepEqual(await pixels(), drawn);
    assert.deepEqual(errors, []);
    const preferences = await page.evaluate(
      async () => (await window.pixeltool.getSettings()).preferences,
    );
    const invalid = await page.evaluate(
      (p) =>
        window.pixeltool
          .savePreferences({ ...p, theme: "invalid" })
          .catch((e) => e.message),
      preferences,
    );
    assert.match(invalid, /theme/);
    await app.close();
    app = await launch();
    page = await require("./first-editor.cjs")(app);
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    await page.waitForFunction(
      () => document.querySelectorAll(".layer-thumbnail").length > 0,
    );
    assert.equal(
      (await page.evaluate(() => window.pixeltool.getSettings())).preferences
        .theme,
      "light",
    );
    console.log(
      "PASS: theme toggle/save/cancel/restart, native window and separate preview theme, logo loading, invalid theme rejection, unchanged artwork and undo/redo, small-window disclosure.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
