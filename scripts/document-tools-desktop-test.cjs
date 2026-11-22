if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    results = [];
  const { createDocument, ensureLayers, documentRGBA } =
    await import("../src/core.mjs");
  const { defaultGuide, rasterizeGuide } = await import("../src/geometry.mjs");
  const { PNG } = require("pngjs");
  async function scenario(name, doc, preferences, run) {
    doc.name = "Review " + name;
    const profile = await require("./test-runner.cjs").createProfile("document-tools-" + name + "-");
    await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
    await fs.writeFile(
      path.join(profile, "settings.json"),
      JSON.stringify({ provider: "codex", preferences }),
    );
    const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
    try {
      const page = await require("./first-editor.cjs")(app);
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.error(e.message);
      });
      const ready = () =>
        page.waitForFunction(
          (name) =>
            document.querySelector("#doc-name").value === name &&
            document
              .querySelector("#save-status")
              .textContent.includes("저장됨"),
          doc.name,
        );
      await ready();
      const draft = () => page.evaluate(() => window.pixeltool.loadDraft());
      const tool = async (id) => {
        await page.locator(`[data-tool="${id}"]`).click();
        await page.locator("#overlay-canvas").focus();
      };
      const drag = async (x, y, a, b, alt = false) => {
        const r = await page.locator("#overlay-canvas").boundingBox();
        const at = (x, y) => [
          r.x + ((x + 0.5) * r.width) / doc.width,
          r.y + ((y + 0.5) * r.height) / doc.height,
        ];
        await page.mouse.move(...at(x, y));
        if (alt) await page.keyboard.down("Alt");
        await page.mouse.down();
        await page.mouse.move(...at(a, b), { steps: 4 });
        await page.mouse.up();
        if (alt) await page.keyboard.up("Alt");
      };
      const menu = async (id) => {
        if (!(await page.locator("#file-more").evaluate((e) => e.open)))
          await page.locator("#file-more > summary").click();
        await page.locator("#" + id).click();
      };
      await run({ page, app, draft, tool, drag, profile, ready, menu });
      assert.deepEqual(errors, []);
      results.push(name);
      console.log("PASS:", name);
    } finally {
      await app.close();
    }
  }
  const fresh = () => ensureLayers(createDocument(16, 16));
  const d = fresh();
  d.pixels[34] = 7;
  d.layers.push({
    id: "locked-alpha",
    name: "Alpha locked",
    visible: true,
    locked: false,
    alphaLocked: true,
    pixels: [7, ...Array(255).fill(0)],
  });
  await scenario("mixed-alpha", d, {}, async ({ page, draft }) => {
    await page.locator("#used-tab").click();
    await page.locator("#used-colors button").first().click();
    await page.locator("#replace-scope").selectOption("all");
    await page.locator("#replace-alpha").fill("0");
    assert.match(await page.locator("#replace-result").textContent(), /제외/);
    await page.locator("#replace-apply").click();
    await page.waitForFunction(
      async () =>
        (await window.pixeltool.loadDraft()).layers[0].pixels[34] === 0,
    );
    assert.equal((await draft()).layers[1].pixels[0], 7);
    await page.locator("#undo-btn").click();
    assert.equal((await draft()).layers[0].pixels[34], 7);
  });
  const p = fresh();
  p.pixels[34] = 7;
  p.pixels[35] = 7;
  p.layers[0].refinementProtection = p.pixels.map((_, i) => i === 34);
  p.layers[0].protectionMode = "pixels";
  await scenario(
    "alt-copy-protection",
    p,
    { duplicateModifier: "alt" },
    async ({ page, draft, tool, drag }) => {
      await tool("select");
      await drag(2, 2, 3, 2);
      await drag(2, 2, 5, 2, true);
      await page.locator("#placement-apply").click();
      await page.waitForFunction(
        async () =>
          (await window.pixeltool.loadDraft()).layers[0].pixels[37] === 7,
      );
      let now = await draft();
      assert.equal(now.layers[0].pixels[34], 7);
      assert.equal(now.layers[0].refinementProtection[37], true);
      await page.locator("#undo-btn").click();
      await tool("move");
      await drag(2, 2, 5, 2);
      await page.locator("#placement-apply").click();
      now = await draft();
      assert.equal(now.layers[0].refinementProtection[34], false);
      assert.equal(now.layers[0].refinementProtection[37], true);
    },
  );
  const g = fresh(),
    r = rasterizeGuide(16, 16, { ...defaultGuide(), decoration: "all" });
  g.layers[0].geometryGuide = r.guide;
  g.layers[0].alphaLocked = false;
  g.pixels = r.pixels.map((c) => {
    let i = g.palette.indexOf(c);
    return i < 0 ? g.palette.push(c) - 1 : i;
  });
  await scenario("guide-conversion", g, {}, async ({ page, draft, tool }) => {
    await tool("select");
    // Reproduce the short canvas available on smaller CI/desktop displays.
    await page.locator("#viewport").evaluate((element) => {
      element.style.maxHeight = "160px";
    });
    await page.keyboard.press("Control+a");
    await page.locator("#selection-more > summary").click();
    await page.waitForFunction(() => {
      const menu = document.querySelector(".selection-more-menu").getBoundingClientRect();
      const viewport = document.querySelector("#viewport").getBoundingClientRect();
      return menu.top >= viewport.top && menu.bottom <= viewport.bottom;
    });
    await page.locator("#transform-flip-x").click();
    await page.locator("#guide-convert-dialog").waitFor({ state: "visible" });
    await page
      .locator("#guide-convert-dialog [data-close-document-dialog]")
      .click();
    assert.deepEqual((await draft()).layers[0].pixels, g.pixels);
    await page.locator("#selection-more > summary").click();
    await page.locator("#transform-flip-x").click();
    await page.locator("#guide-convert-apply").click();
    await page.waitForFunction(
      async () => !(await window.pixeltool.loadDraft()).layers[0].geometryGuide,
    );
    assert.notDeepEqual((await draft()).layers[0].pixels, g.pixels);
    await page.locator("#undo-btn").click();
    assert.deepEqual((await draft()).layers[0].pixels, g.pixels);
    assert.ok((await draft()).layers[0].geometryGuide);
  });
  const invalid = structuredClone(g);
  invalid.layers[0].pixels[0] = 7;
  await scenario(
    "invalid-guide-recovery",
    invalid,
    {},
    async ({ page, draft }) => {
      assert.equal(await page.locator("#generate-btn").isDisabled(), true);
      assert.match(
        await page.locator("#geometry-note").textContent(),
        /입체 가이드/,
      );
      await page.locator("#geometry-status-more > summary").click();
      await page.locator("#geometry-detach").click();
      assert.equal((await draft()).layers[0].geometryGuide, undefined);
      assert.equal((await draft()).layers[0].pixels[0], 7);
    },
  );
  await scenario(
    "document-tools",
    p,
    {},
    async ({ page, app, draft, menu, profile, ready }) => {
      await menu("resize-open");
      await page.locator("#resize-width").fill("32");
      await page.locator("#resize-height").fill("32");
      await page.locator("#resize-apply").click();
      await page.waitForFunction(
        async () => (await window.pixeltool.loadDraft()).width === 32,
      );
      let now = await draft();
      assert.equal(now.layers[0].pixels[330], 7);
      assert.equal(now.layers[0].refinementProtection[330], true);
      await page.locator("#undo-btn").click();
      assert.equal((await draft()).width, 16);
      await menu("resize-open");
      await page.locator("#resize-width").fill("1");
      await page.locator("#resize-height").fill("1");
      assert.equal(await page.locator("#resize-apply").isDisabled(), true);
      await page.locator("#resize-allow-crop").check();
      assert.equal(await page.locator("#resize-apply").isDisabled(), false);
      await page.locator("#resize-dialog [data-close-document-dialog]").click();
      const rgba = documentRGBA(await draft());
      await menu("palette-cleanup-open");
      await page.locator("#palette-cleanup-apply").click();
      now = await draft();
      assert.ok(now.palette.length < 16);
      assert.deepEqual(documentRGBA(now), rgba);
      await page.locator("#undo-btn").click();
      assert.equal((await draft()).palette.length, 16);
      const reference = path.join(profile, "fixture.png");
      await fs.writeFile(
        reference,
        PNG.sync.write({
          width: 8,
          height: 8,
          data: Buffer.alloc(8 * 8 * 4, 255),
        }),
      );
      await page.locator("#reference-file").setInputFiles(reference);
      await page.locator("#reference-dialog").waitFor({ state: "visible" });
      await page.locator("#reference-apply").click();
      await page.locator("#prompt").fill("Preserve this project prompt");
      assert.equal((await draft()).editorContext, undefined);
      await menu("project-context-open");
      await page.locator("#context-store").check();
      await page.locator("#context-apply").click();
      await page.waitForFunction(async () =>
        Boolean((await window.pixeltool.loadDraft()).editorContext?.reference),
      );
      await page.locator("#prompt").fill("Updated saved prompt");
      await page.waitForFunction(
        async () =>
          (await window.pixeltool.loadDraft()).editorContext?.prompt ===
          "Updated saved prompt",
      );
      const file = path.join(profile, "context.pixeltool");
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        });
      }, file);
      await page.locator("#save-btn").click();
      await page.waitForFunction(
        () => !document.querySelector(".workspace").inert,
      );
      assert.ok(
        JSON.parse(await fs.readFile(file, "utf8")).editorContext.reference,
      );
      assert.equal(
        (await draft()).editorContext.prompt,
        "Updated saved prompt",
      );
      await page.reload();
      await ready();
      assert.equal(
        await page.locator("#prompt").inputValue(),
        "Updated saved prompt",
      );
      assert.equal(await page.locator("#reference-attached").isVisible(), true);
      await menu("project-context-open");
      await page.locator("#context-store").uncheck();
      await page.locator("#context-apply").click();
      assert.equal((await draft()).editorContext, undefined);
      assert.equal(await page.locator("#reference-attached").isVisible(), true);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
      );
      await menu("resize-open");
      await page.screenshot({
        path: path.join(root, "artifacts", "document-resize-ko.png"),
      });
      assert.equal(await page.locator("#resize-apply").isVisible(), true);
      await page.locator("#resize-dialog [data-close-document-dialog]").click();
      await page.evaluate(async () => {
        const settings = await window.pixeltool.getSettings();
        await window.pixeltool.savePreferences({
          ...settings.preferences,
          language: "de",
          theme: "light",
        });
      });
      await page.reload();
      await page.waitForFunction(() => document.documentElement.lang === "de");
      await menu("project-context-open");
      await page.screenshot({
        path: path.join(root, "artifacts", "document-context-de.png"),
      });
      assert.equal(await page.locator("#context-apply").isVisible(), true);
      assert.doesNotMatch(
        await page.locator("#context-dialog").textContent(),
        /[가-힣]/,
      );
    },
  );
  await fs.writeFile(
    path.join(root, "artifacts", "document-tools-results.json"),
    JSON.stringify(results, null, 2),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
