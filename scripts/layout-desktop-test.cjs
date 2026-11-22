if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const root = path.resolve(__dirname, "..");
  const profile = await require("./test-runner.cjs").createProfile("layout-profile-");
  const { createAutotile } = await import("../src/autotile.mjs");
  const foreground = Array.from(
    { length: 256 },
    (_, i) =>
      ["#337B9CFF", "#3F87A4FF", "#377F9FFF"][(i * 7 + Math.floor(i / 16)) % 3],
  );
  const doc = createAutotile(
    16,
    "물",
    "흙",
    foreground,
    Array(256).fill("#916242FF"),
  );
  const saved = JSON.stringify(doc);
  await fs.writeFile(path.join(profile, "draft.json"), saved);
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  try {
    const page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => document.body.dataset.mode === "autotile");
    await page.locator("#toast").waitFor({ state: "hidden" });
    const visibleInPanel = async (selector) => {
      assert.ok(await page.locator(selector).isVisible(), selector);
      assert.ok(
        await page.locator(selector).evaluate((el) => {
          const r = el.getBoundingClientRect();
          const panel = el.closest(".ai-scroll")?.getBoundingClientRect();
          return (
            r.top >= 0 &&
            r.bottom <= (panel?.bottom ?? innerHeight) &&
            r.left >= 0 &&
            r.right <= innerWidth
          );
        }),
        selector + " is fully in view",
      );
    };
    for (const [width, height] of [
      [1424, 960],
      [1100, 740],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0].setSize(...size),
        [width, height],
      );
      await page.waitForFunction(
        (width) => innerWidth < width && innerWidth > width - 40,
        width,
      );
      await page.locator("#inspector-ai").click();
      await page.locator("#fit-btn").click();
      await visibleInPanel("#overlay-canvas");
      for (const id of [
        "#prompt",
        "#generate-btn",
        "#auto-source-cards",
        "#auto-inspect",
        "#auto-export",
      ])
        await visibleInPanel(id);
      assert.equal(await page.locator(".ai-panel #auto-open").count(), 0);
      assert.equal(await page.locator(".preview-section").isVisible(), false);
      assert.equal(await page.locator("#auto-status").isVisible(), false);
      await page.locator("#inspector-preview").click();
      await visibleInPanel("#auto-status");
      assert.equal(await page.locator("#prompt").isVisible(), false);
      assert.equal(await page.locator(".transform-bar").isVisible(), false);
      await page.screenshot({
        path: path.join(root, "artifacts", `layout-autotile-${width}.png`),
      });
    }
    await page.locator("#preview-kind").selectOption("source");
    assert.equal(await page.locator("#auto-status").isVisible(), false);
    assert.equal(await page.locator(".preview-section").isVisible(), true);
    assert.ok(
      await page
        .locator("#large-preview")
        .evaluate((c) => c.clientWidth > c.width),
    );
    await page.locator("#preview-kind").selectOption("result");
    await page.locator("#inspector-ai").click();
    await page.locator("#ai-options > summary").click();
    assert.ok(await page.locator("#ai-palette").isVisible());
    await page.locator("#ai-options > summary").click();
    await page.locator("#auto-more > summary").click();
    await visibleInPanel("#export-btn");
    await page.locator("#prompt").click();
    assert.equal(
      await page.locator("#auto-more").evaluate((el) => el.open),
      false,
    );
    await visibleInPanel("#geometry-open");
    await page.locator("#new-btn").click();
    await page.screenshot({
      path: path.join(root, "artifacts", "layout-create-1100.png"),
    });
    await page.locator("#tile-open").click();
    assert.equal(await page.locator("#new-dialog").isVisible(), false);
    assert.ok(await page.locator("#tile-dialog").isVisible());
    assert.ok(await page.locator("#tile-use-current").isDisabled());
    await page.locator("#tile-dialog .dialog-close").first().click();
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(profile, "draft.json"), "utf8")),
      JSON.parse(saved),
    );
    await page.locator("#auto-more > summary").click();
    await page.locator("#auto-single").click();
    await page.waitForFunction(() => document.body.dataset.mode === "image");
    assert.equal(await page.locator("#mode-context").isVisible(), false);
    assert.ok(await page.locator(".header-actions #export-btn").isVisible());
    assert.equal(await page.locator("#auto-export").isVisible(), false);
    await visibleInPanel("#prompt");
    await visibleInPanel("#generate-btn");
    await page.screenshot({
      path: path.join(root, "artifacts", "layout-image-1100.png"),
    });
    await page.locator("#undo-btn").click();
    await page.waitForFunction(() => document.body.dataset.mode === "autotile");
    assert.deepEqual(errors, []);
    console.log(
      "Layout desktop PASS: default/minimum window, visible prompt/actions, contextual controls, creation navigation, preview switch, disclosures, source export, unchanged draft and mode undo.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
