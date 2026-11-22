if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { PNG } = require("pngjs");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("autotile-profile-");
  const { createDocument, ensureLayers, validateDocument } =
    await import("../src/core.mjs");
  const { autoConstraints, assertAutoIntegrity } =
    await import("../src/autotile.mjs");
  const initial = ensureLayers(createDocument(16, 16, "Autotile check"));
  initial.pixels.fill(7);
  initial.tileMode = { material: "잔디", wrap: true };
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(initial));
  await require("./test-ai-disclosure.cjs")(profile);
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    }),
    page;
  try {
    page = await require("./first-editor.cjs")(app);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () => document.getElementById("doc-name").value === "Autotile check",
    );
    const draft = async () => {
      await page.waitForFunction(() =>
        document
          .getElementById("save-status")
          .textContent.includes("복구본 저장됨"),
      );
      return validateDocument(
        JSON.parse(
          await fs.readFile(
            await require("./draft-file.cjs")(page, profile),
            "utf8",
          ),
        ),
      );
    };
    const small = () =>
      page
        .locator("#auto-small-map")
        .evaluate((c) =>
          Array.from(
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        );
    await page.locator("#new-btn").click();
    await page.locator("#auto-open").click();
    assert.equal(await page.locator("#auto-fg").inputValue(), "current");
    await page.screenshot({
      path: path.join(root, "artifacts", "autotile-create.png"),
    });
    await page.locator("#auto-create-dialog .dialog-close").first().click();
    assert.deepEqual(await draft(), initial);
    await page.locator("#new-btn").click();
    await page.locator("#auto-open").click();
    await page.locator("#auto-size").selectOption("32");
    assert.ok(await page.locator("#auto-create").isDisabled());
    assert.match(
      await page.locator("#auto-create-error").textContent(),
      /같은 타일 크기/,
    );
    await page.locator("#auto-size").selectOption("16");
    const sourcePage = page;
    await page.locator("#auto-create").click();
    page = await require("./next-editor.cjs")(app, page);
    assert.deepEqual(
      validateDocument(
        await sourcePage.evaluate(() => window.pixeltool.loadDraft()),
      ),
      initial,
    );
    let doc = await draft();
    assert.equal(doc.layers.length, 5);
    assert.equal(doc.autotile.foreground, "잔디");
    assert.equal(doc.tileMode, undefined);
    assertAutoIntegrity(doc);
    assert.equal(await page.locator(".layer-dock").isVisible(), false);
    assert.equal(await page.locator("#alpha-lock-btn").isDisabled(), true);
    const created = doc;
    await page.locator("#palette button").nth(2).click();
    const click = async (x, y) => {
      const b = await page.locator("#overlay-canvas").boundingBox();
      await page.mouse.click(
        b.x + ((x + 0.5) * b.width) / 16,
        b.y + ((y + 0.5) * b.height) / 16,
      );
    };
    await click(0, 0);
    assert.deepEqual((await draft()).pixels, created.pixels);
    await click(2, 2);
    assert.notEqual((await draft()).pixels[34], created.pixels[34]);
    assertAutoIntegrity(await draft());
    await page.locator("#undo-btn").click();
    assert.deepEqual(await draft(), created);
    await page.locator('[data-source="inner"]').click();
    assert.equal((await draft()).activeLayerId, "auto-inner");
    await page.locator("#auto-inspect").click();
    await page.locator("#auto-map-preset").selectOption("hole");
    await page.screenshot({
      path: path.join(root, "artifacts", "autotile-hole.png"),
    });
    await page.locator("#auto-workbench .dialog-close").click();
    const hole = await draft();
    assert.equal(hole.autotile.map[3 * 10 + 4], false);
    await page.locator("#auto-inspect").click();
    const box = await page.locator("#auto-map").boundingBox();
    const mapDialogBox = await page.locator("#auto-workbench").boundingBox();
    assert.equal(
      await page.locator(".auto-piece-inspector").isVisible(),
      false,
    );
    await page.mouse.move(
      box.x + box.width * 0.05,
      box.y + box.height * 0.0625,
    );
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width * 0.35,
      box.y + box.height * 0.0625,
    );
    assert.deepEqual(
      await page.locator("#auto-workbench").boundingBox(),
      mapDialogBox,
    );
    assert.deepEqual(await page.locator("#auto-map").boundingBox(), box);
    assert.equal(
      await page.locator(".auto-piece-inspector").isVisible(),
      false,
    );
    await page.mouse.up();
    await page.locator("#auto-workbench .dialog-close").click();
    assert.ok((await draft()).autotile.map.slice(0, 4).every(Boolean));
    await page.locator("#undo-btn").click();
    assert.deepEqual((await draft()).autotile.map, hole.autotile.map);
    await page.locator("#auto-inspect").click();
    await page.locator("#auto-show").selectOption("atlas");
    assert.equal(await page.locator("#auto-map-preset").isVisible(), false);
    assert.equal(
      await page.locator("#auto-foreground-brush").isVisible(),
      false,
    );
    await page.locator("#auto-show").selectOption("map");
    assert.ok(await page.locator("#auto-foreground-brush").isVisible());
    await page.locator("#auto-show").selectOption("atlas");
    const atlas = await page.locator("#auto-atlas").boundingBox();
    const atlasDialogBox = await page.locator("#auto-workbench").boundingBox();
    const chooseTile = async (index) =>
      page.mouse.click(
        atlas.x + (((index % 8) + 0.5) / 8) * atlas.width,
        atlas.y + ((Math.floor(index / 8) + 0.5) / 6) * atlas.height,
      );
    await chooseTile(46);
    assert.equal(await page.locator("#auto-source-links button").count(), 1);
    assert.equal(
      await page.locator("#auto-source-links button").innerText(),
      "내부 원본 편집",
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "autotile-source-single.png"),
    });
    await chooseTile(47);
    assert.equal(await page.locator("#auto-source-links button").count(), 0);
    for (let index = 0; index < 48; index++) {
      await chooseTile(index);
      assert.deepEqual(
        await page.locator("#auto-workbench").boundingBox(),
        atlasDialogBox,
      );
      assert.deepEqual(await page.locator("#auto-atlas").boundingBox(), atlas);
    }
    const { BLOB_MASKS, quadrantRole } = await import("../src/autotile.mjs");
    const mixedIndex = BLOB_MASKS.findIndex(
      (mask) =>
        new Set(
          [
            [false, false],
            [true, false],
            [false, true],
            [true, true],
          ].map(([r, b]) => quadrantRole(mask, r, b)),
        ).size > 1,
    );
    await chooseTile(mixedIndex);
    const expectedRoles = [
      ...new Set(
        [
          [false, false],
          [true, false],
          [false, true],
          [true, true],
        ].map(([r, b]) => quadrantRole(BLOB_MASKS[mixedIndex], r, b)),
      ),
    ];
    assert.deepEqual(
      await page
        .locator("#auto-source-links button")
        .evaluateAll((buttons) => buttons.map((b) => b.dataset.role)),
      expectedRoles,
    );
    assert.ok(
      await page.locator("#auto-source-links small").first().isVisible(),
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "autotile-source-mixed.png"),
    });

    await page.mouse.click(
      atlas.x + atlas.width / 16,
      atlas.y + atlas.height / 12,
    );
    assert.match(
      await page.locator("#auto-source-links [data-role=outer]").textContent(),
      /바깥 모서리/,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "autotile-atlas.png"),
    });
    await page.locator("#auto-source-links [data-role=outer]").click();
    assert.equal((await draft()).activeLayerId, "auto-outer");
    await page.locator('[data-source="full"]').click();
    doc = await draft();
    await app.evaluate(
      (_, modulePath) => {
        const { CodexClient } = process.mainModule.require(modulePath);
        CodexClient.prototype.status = async () => ({
          available: true,
          connected: true,
          authType: "chatgpt",
          plan: "pro",
        });
        CodexClient.prototype.requestPatch = async ({
          input,
          onProgress,
          signal,
        }) =>
          new Promise((resolve, reject) => {
            globalThis.__autoInput = input;
            globalThis.__autoEmit = onProgress;
            globalThis.__autoFinish = (p) =>
              resolve({
                proposal: p,
                usage: { input_tokens: 1000, output_tokens: 50 },
              });
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
            onProgress({ type: "stage", stage: "waiting" });
          });
      },
      path.join(root, "tests", "fixtures", "legacy-codex.mjs"),
    );
    const beforePreview = await small();
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.waitForFunction(
      () =>
        document.getElementById("request-stage").textContent === "응답 대기",
    );
    for (const id of [
      "auto-open",
      "auto-source",
      "auto-map-preset",
      "auto-export",
      "auto-single",
    ])
      assert.equal(await page.locator("#" + id).isDisabled(), true);
    const input = await app.evaluate(() => globalThis.__autoInput);
    assert.deepEqual(input.mask, autoConstraints(doc).editable);
    const i = input.mask.findIndex(Boolean),
      proposal = {
        summary: "공유 잔디 명암",
        new_colors: ["#123456FF"],
        runs: [
          { x: i % 16, y: Math.floor(i / 16), colors: [doc.palette.length] },
        ],
      };
    await app.evaluate(
      (_, p) =>
        globalThis.__autoEmit({
          type: "textDone",
          text: JSON.stringify(
            process.mainModule
              .require(
                process.mainModule
                  .require("node:path")
                  .join(process.cwd(), "tests", "wire-fixture.mjs"),
              )
              .wirePatch(globalThis.__autoInput, p),
          ),
        }),
      proposal,
    );
    await page.waitForFunction(
      () => !document.getElementById("stream-label").hidden,
    );
    assert.notDeepEqual(await small(), beforePreview);
    await app.evaluate((_, p) => globalThis.__autoFinish(p), proposal);
    await page.locator("#apply-btn").waitFor({ state: "visible" });
    await page.locator("#compare-btn").click();
    assert.deepEqual(await small(), beforePreview);
    await page.locator("#compare-btn").click();
    await page.locator("#apply-btn").click();
    const applied = await draft();
    assertAutoIntegrity(applied);
    assert.equal(applied.palette[applied.pixels[i]], "#123456FF");
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.waitForFunction(
      () =>
        document.getElementById("request-stage").textContent === "응답 대기",
    );
    await app.evaluate(() =>
      globalThis.__autoFinish({
        summary: "경계 변경",
        new_colors: [],
        runs: [{ x: 0, y: 0, colors: [0] }],
      }),
    );
    await page.waitForFunction(
      () => !document.getElementById("auto-source").disabled,
    );
    assert.deepEqual(await draft(), applied);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, profile);
    await page.locator("#auto-export").click();
    await page.waitForFunction(() =>
      document.getElementById("toast").textContent.includes("연결 규칙 JSON"),
    );
    const folder = path.join(
        profile,
        (await fs.readdir(profile)).find((n) => n.includes("-autotile-")),
      ),
      png = PNG.sync.read(await fs.readFile(path.join(folder, "tiles.png"))),
      manifest = JSON.parse(
        await fs.readFile(path.join(folder, "tiles.json"), "utf8"),
      );
    assert.deepEqual([png.width, png.height], [128, 96]);
    assert.equal(manifest.lookup.length, 256);
    assert.equal(manifest.tiles.length, 47);
    assert.deepEqual(
      validateDocument(
        JSON.parse(
          await fs.readFile(path.join(folder, "source.pixeltool"), "utf8"),
        ),
      ),
      applied,
    );
    if (!(await page.locator("#auto-more").evaluate((el) => el.open)))
      await page.locator("#auto-more > summary").click();
    await page.locator("#auto-single").click();
    assert.equal((await draft()).autotile, undefined);
    assert.equal((await draft()).layers.length, 1);
    await page.locator("#undo-btn").click();
    assert.deepEqual(await draft(), applied);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.locator("#auto-inspect").click();
    await page.locator("#auto-show").selectOption("map");
    assert.equal(
      await page.locator(".auto-piece-inspector").isVisible(),
      false,
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "autotile-small.png"),
    });
    assert.equal(
      await page
        .locator("#auto-workbench")
        .evaluate((e) => e.scrollWidth > e.clientWidth),
      false,
    );
    await page.locator("#auto-workbench .dialog-close").click();
    assert.deepEqual(errors, []);
    await app.close();
    app = await _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
    page = await require("./first-editor.cjs")(app);
    await page.locator("#inspector-preview").click();
    await page.locator("#auto-status").waitFor({ state: "visible" });
    assert.deepEqual(await draft(), applied);
    console.log(
      "Autotile desktop PASS: preserved input/cancel, reusable sources, protected painting, map stroke history, tile-to-source navigation, AI live/compare/scope locks, PNG+JSON+source export, conversion undo, small layout and restart.",
    );
  } catch (error) {
    if (page)
      await page
        .screenshot({
          path: path.join(root, "artifacts", "autotile-failure.png"),
        })
        .catch(() => {});
    throw error;
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
