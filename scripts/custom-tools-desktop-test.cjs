if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("custom-tools-"),
    env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
  let app = await launch(),
    page;
  try {
    page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("#overlay-canvas");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.waitForFunction(
      () => innerWidth === 1100 || innerWidth === 1084,
    );
    // Resizing preserves the document zoom; fit before targeting edge pixels.
    await page.locator("#fit-btn").click();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const click = async (x, y) => {
      const b = await page.locator("#overlay-canvas").boundingBox();
      await page.mouse.click(
        b.x + ((x + 0.5) * b.width) / 16,
        b.y + ((y + 0.5) * b.height) / 16,
      );
    };
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    await click(1, 1);
    await click(2, 1);
    await click(6, 6);
    const original = await pixels();
    await page.keyboard.press("w");
    await click(1, 1);
    assert.match(await page.locator("#selection-summary").textContent(), /2/);
    assert.match(
      await page.locator("#overlay-canvas").getAttribute("title"),
      /2픽셀/,
    );
    await page.keyboard.down("Shift");
    await click(6, 6);
    await page.keyboard.up("Shift");
    assert.match(await page.locator("#selection-summary").textContent(), /3/);
    await page.keyboard.press("Control+z");
    assert.match(await page.locator("#selection-summary").textContent(), /2/);
    assert.deepEqual(await pixels(), original);
    await page.locator(".user-tools-section > summary").click();
    await page.locator("#script-open").click();
    assert.equal((await page.locator("#script-revert").textContent()).trim(),"기본값 복원");
    await page.locator("#script-name").fill("연필");
    await page
      .locator("#script-source")
      .fill(
        'const c=api.addColor("#EE1122FF"); for(let i=0;i<api.mask.length;i++) if(api.mask[i])api.setPixel(i%api.width,Math.floor(i/api.width),c);',
      );
    await page.locator("#script-save").click();
    assert.equal((await page.locator("#script-revert").textContent()).trim(),"저장본 복원");
    const savedToolSource=await page.locator("#script-source").inputValue();
    await page.locator("#script-source").fill('throw new Error("unsaved draft");');
    await page.locator("#script-revert").click();
    assert.equal(await page.locator("#script-source").inputValue(),savedToolSource);
    await page.screenshot({
      path: path.join(root, "artifacts", "custom-script-dialog.png"),
    });
    await page.locator("#script-run").click();
    await page.waitForFunction(
      () => !document.getElementById("script-apply").disabled,
    );
    assert.deepEqual(await pixels(), original);
    await page.locator("#script-apply").click();
    assert.notDeepEqual(await pixels(), original);
    await page.keyboard.press("Control+z");
    assert.deepEqual(await pixels(), original);
    await page.locator(".user-tool").click();
    await page.locator("#script-source").fill("api.setPixel(0,0,7);");
    await page.locator("#script-run").click();
    await page.waitForFunction(
      () => !document.getElementById("script-run").disabled,
    );
    assert.ok(await page.locator("#script-apply").isDisabled());
    assert.deepEqual(await pixels(), original);
    await page.locator("#script-source").fill("while(true){}");
    await page.locator("#script-run").click();
    await page.locator("#script-cancel-run").waitFor({state:"visible"});
    assert.equal(await page.locator("#script-cancel-run [data-icon]").getAttribute("data-icon"),"stop");
    assert.equal((await page.locator("#script-cancel-run").textContent()).trim(),"실행 중단");
    await page.locator("#script-cancel-run").click();
    await page.waitForFunction(()=>!document.getElementById("script-run").disabled);
    assert.ok(await page.locator("#script-apply").isDisabled());
    assert.deepEqual(await pixels(),original,"Stopping a worker does not apply or undo artwork");
    await page.locator("#script-run").click();
    await page.waitForFunction(() =>
      document.getElementById("script-status").textContent.includes("시간"),
    );
    assert.ok(await page.locator("#script-apply").isDisabled());
    await page.locator("#script-source").fill("api.setPixel(1,1,7);");
    await page.locator("#script-run").click();
    await page.waitForFunction(
      () => !document.getElementById("script-run").disabled,
    );
    await page.locator("#script-dialog .dialog-close").first().click();
    await page.locator("#settings-btn").click();
    await page.locator('[data-settings-tab="editor"]').click();
    await page.locator("#shortcut-open").click();
    const slot = (id, n) =>
      page.locator(`[data-command="${id}"] [data-slot="${n}"]`);
    await slot("pencil", 0).click();
    await page.keyboard.press("q");
    await slot("pencil", 1).click();
    await page.keyboard.press("Alt+q");
    await slot("eraser", 0).click();
    await page.keyboard.press("q");
    assert.match(await page.locator("#shortcut-status").textContent(), /이미/);
    await page.locator("#shortcut-conflict").click();
    assert.equal(
      await page.evaluate(
        () => document.activeElement.closest("[data-command]")?.dataset.command,
      ),
      "pencil",
    );
    await page
      .locator('[data-command="pencil"] .shortcut-command-reset')
      .click();
    assert.equal(await slot("pencil", 0).textContent(), "B");
    await slot("pencil", 0).click();
    await page.keyboard.press("q");
    await slot("pencil", 1).click();
    await page.keyboard.press("Alt+q");
    await page.locator('[data-command^="script:"] [data-slot="0"]').click();
    await page.keyboard.press("Control+Alt+r");
    await page.screenshot({
      path: path.join(root, "artifacts", "custom-shortcut-dialog.png"),
    });
    await page.evaluate(async () =>
      (await import("/src/i18n-dom.mjs")).applyLanguage("en"),
    );
    assert.equal(
      await page
        .locator('[data-command^="script:"] > span > span')
        .textContent(),
      "연필",
    );
    await page.evaluate(async () =>
      (await import("/src/i18n-dom.mjs")).applyLanguage("ko"),
    );
    await page.locator("#shortcut-save").click();
    await page.locator("#settings-dialog .dialog-close").first().click();
    await page.keyboard.press("Control+Alt+r");
    assert.ok(await page.locator("#script-dialog").isVisible());
    await page.locator("#script-dialog .dialog-close").first().click();
    await page.keyboard.press("e");
    await page.keyboard.press("b");
    assert.ok(
      await page
        .locator('[data-tool="eraser"]')
        .evaluate((b) => b.classList.contains("active")),
    );
    await page.keyboard.press("q");
    assert.ok(
      await page
        .locator('[data-tool="pencil"]')
        .evaluate((b) => b.classList.contains("active")),
    );
    await page.keyboard.press("e");
    await page.keyboard.press("Alt+q");
    assert.ok(
      await page
        .locator('[data-tool="pencil"]')
        .evaluate((b) => b.classList.contains("active")),
    );
    // Worker CSP must prevent network and nested workers, even for imported scripts.
    const isolation = await page.evaluate(async () => {
      const { runScript } = await import("/src/script-tools.mjs");
      const context = {
        width: 1,
        height: 1,
        pixels: [0],
        palette: ["#00000000"],
        mask: [true],
        primary: 0,
        secondary: 0,
      };
      const results = [];
      for (const source of [
        'importScripts("https://example.com/a.js")',
        'new Worker("pixeltool://app/src/script-worker.js")',
        'if(typeof process!=="undefined"||typeof window!=="undefined")throw Error("exposed");',
      ]) {
        try {
          await runScript(source, context);
          results.push("ok");
        } catch {
          results.push("blocked");
        }
      }
      return results;
    });
    assert.deepEqual(isolation, ["blocked", "blocked", "ok"]);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "custom-tools-editor.png"),
    });
    assert.deepEqual(errors, []);
    await app.close();
    app = await launch();
    page = await require("./first-editor.cjs")(app);
    await page.waitForSelector("#overlay-canvas");
    await page.keyboard.press("e");
    await page.keyboard.press("q");
    assert.ok(
      await page
        .locator('[data-tool="pencil"]')
        .evaluate((b) => b.classList.contains("active")),
    );
    assert.equal(await page.locator(".user-tool").count(), 1);
    await page.locator(".user-tools-section > summary").click();
    await page.locator(".user-tool").click();
    assert.equal(
      await page.locator("#script-source").inputValue(),
      "api.setPixel(1,1,7);",
    );
    await page.locator("#script-dialog .dialog-close").first().click();
    await page.keyboard.press(".");
    const selectedRGBA = await page
      .locator("#primary-color")
      .evaluate((el) =>
        el.style.getPropertyValue("--swatch-color").toUpperCase(),
      );
    const paletteSize = await page.locator("#palette button").count();
    await page.locator(".user-tool").click();
    await page
      .locator("#script-source")
      .fill(
        "for(let i=0;i<api.mask.length;i++)if(api.mask[i])api.setPixel(i%api.width,Math.floor(i/api.width),api.primary);",
      );
    await page.locator("#script-run").click();
    await page.waitForFunction(
      () => !document.getElementById("script-run").disabled,
    );
    const actualRGBA = await page.locator("#script-preview").evaluate(
      (c) =>
        "#" +
        [...c.getContext("2d").getImageData(1, 1, 1, 1).data]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase(),
    );
    assert.equal(actualRGBA, selectedRGBA);
    assert.equal(
      await page.locator("#palette button").count(),
      paletteSize,
      "preview must not mutate the palette",
    );
    // Importing keeps the earlier draft available as a separate entry.
    await page
      .locator("#script-import")
      .setInputFiles({
        name: "parameter-demo.js",
        mimeType: "text/javascript",
        buffer: Buffer.from(
          '// @params [{"id":"amount","label":"Strength","type":"number","min":0,"max":100,"step":1,"default":40},{"id":"color","label":"Color","type":"color","default":"#123456"}]\nconst c=api.addColor(api.params.color);for(let i=0;i<api.mask.length;i++)if(api.mask[i]&&api.params.amount>0)api.setPixel(i%api.width,Math.floor(i/api.width),c);',
        ),
      });
    await page.waitForSelector('[data-param="amount"]');
    assert.equal(
      await page.locator('[data-param="amount"]').inputValue(),
      "40",
    );
    assert.equal(await page.locator("#script-list option").count(), 3);
    await page.locator("#script-run").click();
    await page.waitForFunction(
      () => !document.getElementById("script-apply").disabled,
    );
    const previewPixels = () =>
      page
        .locator("#script-preview")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const result = await previewPixels();
    await page.locator("#script-original").check();
    assert.deepEqual(await previewPixels(), await pixels());
    await page.locator("#script-original").uncheck();
    assert.deepEqual(await previewPixels(), result);
    await page.locator("#script-diff").check();
    assert.notDeepEqual(await previewPixels(), result);
    await page.locator("#script-diff").uncheck();
    await page.locator('[data-param="amount"]').fill("0");
    assert.ok(await page.locator("#script-apply").isDisabled());
    await page.locator('[data-param="amount"]').fill("101");
    await page.locator("#script-run").click();
    assert.match(
      await page.locator("#script-status").textContent(),
      /매개변수/,
    );
    await page.locator("#script-save").click();
    await page.locator("#script-delete").click();
    assert.equal(await page.locator(".user-tool").count(), 1);
    await app.close();
    app = await launch();
    page = await require("./first-editor.cjs")(app);
    await page.waitForSelector("#overlay-canvas");
    await page.locator(".user-tools-section > summary").click();
    await page.locator("#script-open").click();
    await page.locator("#script-restore").click();
    assert.equal(await page.locator(".user-tool").count(), 2);
    assert.equal(
      await page.locator("#script-name").inputValue(),
      "parameter-demo",
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "custom-tools-enhanced.png"),
    });
    console.log(
      "PASS: connected selection/add/undo; script preview/apply/undo/protection/timeout/isolation; two bindings/conflict/restart; minimum layout",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
