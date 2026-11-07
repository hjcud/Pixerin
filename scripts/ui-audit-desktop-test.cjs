if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  path = require("node:path"),
  fs = require("node:fs/promises"),
  { PNG } = require("pngjs"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("ui-audit-");
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
    const measure = () =>
      page.evaluate(() => {
        const ids = [
          ".drawing-controls",
          ".pinned-tool-options",
          ".color-library",
          ".color-slots",
          ".help-button",
        ];
        return ids.map((id) => {
          const e = document.querySelector(id),
            r = e.getBoundingClientRect();
          return {
            id,
            top: r.top,
            bottom: r.bottom,
            height: r.height,
            scroll: e.scrollHeight,
            client: e.clientHeight,
          };
        });
      });
    const reachable = async () => {
      for (const row of await measure())
        assert.ok(row.top >= 0 && row.bottom <= 740, JSON.stringify(row));
      assert.ok(
        await page.locator("#help-btn").evaluate((e) => {
          const r = e.getBoundingClientRect();
          return e.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
      );
    };
    await reachable();
    await page.locator('[data-tool="wand"]').click();
    await reachable();
    await page.screenshot({
      path: path.join(root, "artifacts", "ui-audit-wand.png"),
    });
    await page.locator('[data-tool="pencil"]').click();
    await page.locator("#brush-details > summary").click();
    await page.locator(".symmetry-options > summary").click();
    await page.locator("#shade-options > summary").click();
    await reachable();
    await page.screenshot({
      path: path.join(root, "artifacts", "ui-audit-expanded.png"),
    });
    await page.locator("#settings-btn").click();
    for (const tab of ["editor", "display", "storage", "ai", "info"]) {
      await page.locator("#settings-tab-" + tab).click();
      const r = await page.locator("#settings-dialog").boundingBox();
      assert.ok(r.y >= 0 && r.y + r.height <= 740);
    }
    await page.locator("#settings-tab-editor").click();
    await page.locator("#pref-historyLimit").fill("1");
    await page.locator("#settings-tab-display").click();
    await page.locator('#settings-form button[type="submit"]').click();
    assert.equal(
      await page.locator("#settings-tab-editor").getAttribute("aria-selected"),
      "true",
    );
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "pref-historyLimit",
    );
    assert.equal(
      await page.locator("#pref-historyLimit").getAttribute("aria-invalid"),
      "true",
    );
    assert.match(
      await page.locator("#settings-error").textContent(),
      /10~2000/,
    );
    assert.doesNotMatch(
      await page.locator("#settings-error").textContent(),
      /historyLimit/,
    );
    await page.locator("#pref-historyLimit").fill("100");
    assert.equal(
      await page.locator("#pref-historyLimit").getAttribute("aria-invalid"),
      null,
    );
    await page.locator("#settings-tab-storage").click();
    await page.locator("#pref-recoveryMemoryMB").fill("");
    await page.locator("#settings-tab-info").click();
    await page.locator('#settings-form button[type="submit"]').click();
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "pref-recoveryMemoryMB",
    );
    await page.locator("#pref-recoveryMemoryMB").fill("256");
    await page.screenshot({
      path: path.join(root, "artifacts", "ui-audit-settings.png"),
    });
    await page.keyboard.press("Escape");
    await page.locator('[data-tool="select"]').click();
    await page.locator("#selection-shape").selectOption("ellipse");
    assert.match(
      await page.locator('[data-tool="select"]').getAttribute("title"),
      /타원 선택.*M/,
    );
    await page.locator("#command-search").click();
    await page.locator("#command-query").fill("타원 선택");
    assert.equal(await page.locator('[data-command-id="select"]').count(), 1);
    await page.keyboard.press("Escape");
    await page.locator("#file-more > summary").focus();
    assert.equal(await page.locator("#file-more > summary").evaluate(e=>getComputedStyle(e,"::before").display), "none");
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "save-as-btn",
    );
    await page.keyboard.press("End");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "project-context-open",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#file-more").evaluate((e) => e.open),
      false,
    );
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Tab");
    assert.equal(
      await page.locator("#file-more").evaluate((e) => e.open),
      false,
    );
    await page.locator("#file-more > summary").click();
    await page.locator("#image-size-open").click();
    await page.locator("#image-size-aspect").uncheck();
    await page.locator("#image-size-width").fill("24");
    await page.locator("#image-size-height").fill("12");
    await page.locator("#image-size-aspect").check();
    await page.locator("#image-size-width").fill("32");
    assert.equal(await page.locator("#image-size-height").inputValue(), "16");
    const before = await page.locator("#image-size-apply").boundingBox();
    await page.locator("#image-size-width").fill("");
    assert.ok(await page.locator("#image-size-apply").isDisabled());
    assert.equal(
      await page.locator("#image-size-width").getAttribute("aria-invalid"),
      "true",
    );
    assert.deepEqual(
      await page.locator("#image-size-apply").boundingBox(),
      before,
    );
    await page.locator("#image-size-width").fill("3840");
    assert.ok(await page.locator("#image-size-double").isDisabled());
    await page.locator("#image-size-cancel").click();
    const file = path.join(profile, "crop.png"),
      rgba = Buffer.alloc(512 * 256 * 4, 255);
    for(let i=0;i<rgba.length;i+=4){rgba[i]=(i/4)&255;rgba[i+1]=((i/4)>>8)&1;}
    await fs.writeFile(
      file,
      PNG.sync.write({ width: 512, height: 256, data: rgba }),
    );
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, file);
    await page.locator("#open-btn").click();
    await page.waitForSelector("#image-size-dialog[open]");
    assert.ok(await page.locator("#image-size-original").isDisabled());
    await page.locator("#image-crop-width").fill("128");
    await page.locator("#image-crop-height").fill("128");
    await page.locator("#image-crop-x").fill("100");
    await page.locator("#image-crop-y").fill("64");
    await page.locator("#image-size-width").fill("32");
    await page.locator("#image-crop-x").fill("101");
    assert.equal(await page.locator("#image-size-width").inputValue(), "32");
    const stage = await page.locator("#image-size-source").boundingBox(),
      scale = Math.min((stage.width - 24) / 512, (stage.height - 24) / 256),
      x = stage.x + stage.width / 2 - 256 * scale + (101 + 64) * scale,
      y = stage.y + stage.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20 * scale, y);
    await page.mouse.up();
    assert.ok(
      Math.abs(
        Number(await page.locator("#image-crop-x").inputValue()) - 121,
      ) <= 1,
    );
    assert.equal(await page.locator("#image-crop-width").inputValue(), "128");
    assert.equal(await page.locator("#image-size-width").inputValue(), "32");
    const moved = await page.locator("#image-crop-x").inputValue();
    await page.mouse.move(x + 20 * scale, y);
    await page.mouse.down();
    await page.mouse.move(x + 40 * scale, y);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await page.locator("#image-crop-x").inputValue(), moved);
    await page.locator("#image-size-cancel").click();
    for (const locale of ["en", "ja", "zh-CN", "es", "fr", "de", "ko"]) {
      await page.locator("#settings-btn").click();
      await page.locator("#pref-language").selectOption(locale);
      await page.locator("#settings-tab-display").click();
      await page.locator("#pref-showHints").check();
      await page
        .locator("#pref-theme")
        .selectOption(locale === "ko" ? "dark" : "light");
      await page.locator('#settings-form button[type="submit"]').click();
      await page.locator('[data-tool="pencil"]').click();
      await reachable();
      await page.locator("#file-more > summary").click();
      assert.ok(await page.locator("#image-size-open").isVisible());
      if (locale !== "ko")
        assert.doesNotMatch(
          await page.locator("#file-more .file-menu").innerText(),
          /[가-힣]/,
        );
      await page.keyboard.press("Escape");
    }
    await page.screenshot({
      path: path.join(root, "artifacts", "ui-audit-final.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: bounded expanded panels in seven languages/light-dark, settings error focus, current-mode hints/search, keyboard menu, ratio locking, stable validation, crop movement/cancel and output size preservation.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
