if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("geometry-profile-");
  const { ensureLayers, createDocument, validateDocument, activeLayer } =
    await import("../src/core.mjs");
  const { guideConstraints } = await import("../src/geometry.mjs");
  const initial = ensureLayers(createDocument(16, 16, "Geometry check"));
  initial.pixels[0] = 7;
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
      () => document.getElementById("doc-name").value === "Geometry check",
    );
    const draft = async () => {
      await page.waitForFunction(() =>
        document
          .getElementById("save-status")
          .textContent.includes("복구본 저장됨"),
      );
      return validateDocument(
        JSON.parse(await fs.readFile(path.join(profile, "draft.json"), "utf8")),
      );
    };
    await page.locator("#geometry-open").click();
    assert.equal(
      await page.locator("#geometry-canvas").getAttribute("width"),
      "16",
    );
    await page.locator(".geometry-details > summary").click();
    await page.locator("#geometry-preset").selectOption("front");
    assert.match(
      await page.locator("#geometry-warning").textContent(),
      /한 면/,
    );
    await page.locator("#geometry-preset").selectOption("lying");
    await page.locator("#geometry-color").fill("#50a889");
    await page.screenshot({
      path: path.join(root, "artifacts", "geometry-dialog.png"),
    });
    await page.locator("#geometry-cancel").click();
    assert.deepEqual(await draft(), initial);
    await page.locator("#geometry-open").click();
    await page.locator("#geometry-color").fill("#50a889");
    await page.locator("#geometry-create").click();
    let doc = await draft();
    assert.equal(doc.layers.length, 2);
    assert.deepEqual(doc.layers[0].pixels, initial.pixels);
    assert.equal(doc.layers[0].visible, false);
    assert.ok(guideConstraints(doc));
    assert.equal(await page.locator("#geometry-status").isVisible(), true);
    const guideDoc = doc;
    await page.locator("#undo-btn").click();
    assert.deepEqual(await draft(), initial);
    await page.locator("#redo-btn").click();
    assert.deepEqual(await draft(), guideDoc);
    await page.locator("#layer-duplicate").click();
    assert.deepEqual(
      activeLayer(await draft()).geometryGuide,
      activeLayer(guideDoc).geometryGuide,
    );
    await page.locator("#undo-btn").click();
    if (
      !(await page.locator("#geometry-status-more").evaluate((el) => el.open))
    )
      await page.locator("#geometry-status-more > summary").click();
    await page.locator("#geometry-decoration").selectOption("all");
    assert.equal(activeLayer(await draft()).geometryGuide.decoration, "all");
    if (
      !(await page.locator("#geometry-status-more").evaluate((el) => el.open))
    )
      await page.locator("#geometry-status-more > summary").click();
    await page.locator("#geometry-decoration").selectOption("front");
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
            globalThis.__geometryInput = input;
            globalThis.__geometryFinish = (proposal) =>
              resolve({
                proposal,
                usage: { input_tokens: 100, output_tokens: 20 },
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
    await page.locator("#prompt").fill("금색 문양을 넣어줘");
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.waitForFunction(
      () =>
        document.getElementById("request-stage").textContent === "응답 대기",
    );
    for (const id of [
      "geometry-open",
      "geometry-decoration",
      "geometry-detach",
    ])
      assert.equal(await page.locator("#" + id).isDisabled(), true);
    const frozen = await app.evaluate(() => globalThis.__geometryInput),
      r = guideConstraints(doc);
    assert.deepEqual(frozen.mask, r.editable);
    const i = r.editable.findIndex(Boolean),
      proposal = {
        summary: "금색 문양",
        new_colors: [],
        runs: [{ x: i % 16, y: Math.floor(i / 16), colors: [14] }],
      };
    await app.evaluate((_, p) => globalThis.__geometryFinish(p), proposal);
    await page.locator("#apply-btn").waitFor({ state: "visible" });
    assert.equal(await page.locator("#geometry-detach").isDisabled(), true);
    await page.locator("#apply-btn").click();
    doc = await draft();
    assert.equal(doc.pixels[i], 14);
    assert.ok(guideConstraints(doc));
    assert.ok(
      doc.pixels.every((c, k) => r.editable[k] || c === guideDoc.pixels[k]),
    );
    await page.screenshot({
      path: path.join(root, "artifacts", "geometry-result.png"),
    });
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.waitForFunction(
      () =>
        document.getElementById("request-stage").textContent === "응답 대기",
    );
    await app.evaluate(() =>
      globalThis.__geometryFinish({
        summary: "불법 경계 수정",
        new_colors: [],
        runs: [{ x: 0, y: 0, colors: [14] }],
      }),
    );
    await page.waitForFunction(
      () => !document.getElementById("geometry-detach").disabled,
    );
    assert.deepEqual(await draft(), doc);
    await page.locator('[data-tool="pencil"]').click();
    await page.locator("#palette button").nth(14).click();
    const edge = r.faceIds.findIndex((id, k) => id && r.protectedMask[k]),
      b = await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.click(
      b.x + (((edge % 16) + 0.5) * b.width) / 16,
      b.y + ((Math.floor(edge / 16) + 0.5) * b.height) / 16,
    );
    // Manual edits must reject inconsistent guide geometry atomically.
    // The invalid-guide recovery path is tested with an explicitly invalid fixture.
    assert.deepEqual(await draft(), doc);
    assert.equal(
      await page
        .locator("#geometry-status")
        .evaluate((el) => el.classList.contains("invalid")),
      false,
    );
    assert.ok(guideConstraints(await draft()));
    if (
      !(await page.locator("#geometry-status-more").evaluate((el) => el.open))
    )
      await page.locator("#geometry-status-more > summary").click();
    await page.locator("#geometry-detach").click();
    assert.equal(activeLayer(await draft()).geometryGuide, undefined);
    await page.locator("#undo-btn").click();
    assert.ok(guideConstraints(await draft()));
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.locator("#geometry-open").click();
    await page.locator("#geometry-kind").selectOption("box");
    await page.screenshot({
      path: path.join(root, "artifacts", "geometry-small.png"),
    });
    const overflow = await page.locator("#geometry-dialog").evaluate((el) => ({
      horizontal: el.scrollWidth > el.clientWidth,
      view: el.getBoundingClientRect().bottom > innerHeight,
    }));
    assert.deepEqual(overflow, { horizontal: false, view: false });
    await page.locator("#geometry-cancel").click();
    assert.deepEqual(errors, []);
    const saved = await draft();
    await app.close();
    app = await _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
    });
    page = await require("./first-editor.cjs")(app);
    await page.locator("#geometry-status").waitFor({ state: "visible" });
    assert.deepEqual(await draft(), saved);
    assert.ok(guideConstraints(await draft()));
    console.log(
      "Geometry desktop PASS: native preview, presets, preserved original, atomic history, duplication, frozen AI scope, boundary rejection, stale guide recovery, small layout and restart.",
    );
  } catch (error) {
    if (page)
      await page
        .screenshot({
          path: path.join(root, "artifacts", "geometry-failure.png"),
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
