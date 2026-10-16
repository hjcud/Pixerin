if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("refinement-profile-");
  const { createDocument, ensureLayers, documentRGBA } =
    await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(16, 16, "Refinement fixture"));
  doc.palette = [
    "#00000000",
    "#111111FF",
    "#164D34FF",
    "#216847FF",
    "#338461FF",
    "#4CA777FF",
    "#77C795FF",
    "#A1DEB3FF",
  ];
  doc.pixels.fill(0);
  for (let y = 3; y < 13; y++)
    for (let x = 3; x < 13; x++)
      doc.pixels[y * 16 + x] =
        x === 3 || y === 3 || x === 12 || y === 12 ? 1 : 2 + ((x + y) % 6);
  doc.pixels[0] = 2;
  doc.pixels[6 * 16 + 6] = 1;
  doc.layers.push({
    id: "untouched",
    name: "Protected",
    visible: false,
    locked: true,
    pixels: Array(256).fill(7),
  });
  const draftPath = path.join(profile, "draft.json");
  await fs.writeFile(draftPath, JSON.stringify(doc));
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
    await app.evaluate(
      (_, modulePath) => {
        const { CodexClient } = process.mainModule.require(modulePath);
        CodexClient.prototype.status = async () => ({
          available: true,
          connected: true,
          authType: "chatgpt",
          plan: "pro",
        });
        globalThis.__refineCalls = [];
        CodexClient.prototype.requestPatch = async ({ input }) => {
          globalThis.__refineCalls.push(input);
          return new Promise((resolve) => {
            globalThis.__refineFinish = () =>
              resolve({
                proposal: {
                  summary: "Mock",
                  new_colors: [],
                  runs: [{ x: 0, y: 0, colors: [7] }],
                },
              });
          });
        };
      },
      path.join(root, "tests", "fixtures", "legacy-codex.mjs"),
    );
    await page.reload();
    await page.waitForSelector("#palette button");
    await require("./editor-ready.cjs")(page);
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const baseline = await pixels();
    assert.deepEqual(baseline, [...documentRGBA(doc)]);
    const basePrompt = "금색 문양과 초록 표지를 유지해줘.";
    await page.locator("#prompt").fill(basePrompt);
    const open = async (mode = "shading") => {
      await page.locator("#refine-open").click();
      if (mode !== "shading") await page.locator("#refine-tab-" + mode).click();
    };
    const cancel = () => page.locator("#refine-cancel").click();
    const waitSaved = () =>
      page.waitForFunction(() =>
        document
          .getElementById("save-status")
          .textContent.includes("복구본 저장됨"),
      );
    await open();
    assert.ok(await page.locator("#refine-apply").isEnabled());
    assert.notDeepEqual(await pixels(), baseline);
    assert.deepEqual(
      JSON.parse(await fs.readFile(draftPath, "utf8")),
      JSON.parse(JSON.stringify(doc)),
    );
    await cancel();
    assert.deepEqual(await pixels(), baseline);
    await open();
    await page.locator("#refine-diff").check();
    const shadePreview = await pixels();
    await page.locator("#refine-apply").click();
    assert.deepEqual(await pixels(), shadePreview);
    await waitSaved();
    let saved = JSON.parse(await fs.readFile(draftPath, "utf8"));
    assert.deepEqual(saved.layers[1], doc.layers[1]);
    assert.deepEqual(saved.palette, doc.palette);
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), baseline);
    await page.locator("#redo-btn").click();
    assert.deepEqual(await pixels(), shadePreview);
    await page.locator("#undo-btn").click();
    await open("outline");
    const outlinePreview = await pixels();
    assert.notDeepEqual(outlinePreview, baseline);
    assert.deepEqual(
      outlinePreview.slice(102 * 4, 103 * 4),
      baseline.slice(102 * 4, 103 * 4),
    );
    for (let i = 0; i < 256; i++)
      assert.equal(outlinePreview[i * 4 + 3], baseline[i * 4 + 3]);
    await page.locator("#refine-apply").click();
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), baseline);
    await page.locator("#alpha-lock-btn").click();
    await open("silhouette");
    assert.ok(await page.locator("#refine-alpha").isChecked());
    assert.ok(
      await page.locator('[data-candidate-id="island:0"]').isDisabled(),
    );
    assert.ok(await page.locator("#refine-apply").isDisabled());
    await page.locator("#refine-alpha").uncheck();
    await page.locator('[data-candidate-id="island:0"]').check();
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.candidateId),
      "island:0",
    );
    await cancel();
    assert.equal(
      await page.locator("#alpha-lock-btn").getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(await pixels(), baseline);
    await open("silhouette");
    await page.locator("#refine-alpha").uncheck();
    const overlay = await page.locator("#refine-before-overlay").boundingBox();
    await page.mouse.click(
      overlay.x + overlay.width / 32,
      overlay.y + overlay.height / 32,
    );
    assert.ok(await page.locator('[data-candidate-id="island:0"]').isChecked());
    await page.locator("#refine-apply").click();
    assert.equal((await pixels())[3], 0);
    assert.equal(
      await page.locator("#alpha-lock-btn").getAttribute("aria-pressed"),
      "false",
    );
    await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), baseline);
    await page.locator("#ai-options > summary").click();
    for (const mode of ["shading", "outline", "silhouette", "clusters"]) {
      await open(mode);
      assert.equal(
        await page.locator("#refine-tab-" + mode).getAttribute("aria-selected"),
        "true",
      );
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#prompt").inputValue(), basePrompt);
    }
    assert.equal(await app.evaluate(() => globalThis.__refineCalls.length), 0);
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() => document.body.classList.contains("busy"));
    assert.ok(await page.locator("#refine-open").isDisabled());
    assert.equal(
      (await app.evaluate(() => globalThis.__refineCalls[0])).prompt,
      basePrompt,
    );
    await app.evaluate(() => globalThis.__refineFinish());
    await page.locator("#proposal-card").waitFor({ state: "visible" });
    assert.ok(await page.locator("#refine-open").isDisabled());
    await page.locator("#discard-btn").click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    await open();
    for (const mode of ["shading", "outline", "silhouette"]) {
      await page.locator("#refine-tab-" + mode).click();
      const bounds = await page.locator("#refine-dialog").boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 740);
      const apply = await page.locator("#refine-apply").boundingBox();
      assert.ok(apply.y + apply.height < 740);
      assert.equal(
        await page
          .locator("#refine-dialog")
          .evaluate((e) => e.scrollWidth > e.clientWidth),
        false,
      );
      await page.screenshot({
        path: path.join(root, "artifacts", "refine-" + mode + ".png"),
      });
    }
    await cancel();
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-display").click();
    await page.locator("#pref-theme").selectOption("light");
    await page.locator('#settings-form button[type="submit"]').click();
    await open();
    await page.screenshot({
      path: path.join(root, "artifacts", "refine-light.png"),
    });
    await cancel();
    await waitSaved();
    assert.deepEqual(await pixels(), baseline);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: local previews, cancel/apply/undo/redo, unchanged draft/layers, alpha protection, explicit silhouette list/canvas selection, prompt preservation, zero local AI calls, mock busy/proposal locks, small dark/light layouts.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
