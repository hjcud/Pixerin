if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron: electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
(async () => {
  const { createDocument, documentRGBA, ensureLayers } =
    await import("../src/core.mjs");
  const { decodePNG } = await import("../electron/png.mjs");
  const artifacts = path.join(root, "artifacts");
  await fs.mkdir(artifacts, { recursive: true });
  const profile = await require("./test-runner.cjs").createProfile("desktop-profile-");
  const fixture = createDocument(16, 16, "Green potion");
  const rows = [
    "................",
    "......bbbb......",
    ".....boooob.....",
    ".....bodddb.....",
    "......bccb......",
    "......bhcb......",
    ".....bchhcb.....",
    "....bcchhccb....",
    "...bchhhhhccb...",
    "...bcggggggcb...",
    "...bcgllgggcb...",
    "...bcgllggscb...",
    "...bcggggsscb...",
    "....bcgssscb....",
    ".....bbbbbb.....",
    "................",
  ];
  const colors = { ".": 0, b: 1, o: 14, d: 13, c: 3, h: 4, g: 7, l: 9, s: 6 };
  rows.forEach((row, y) => {
    assert.equal(row.length, 16);
    Array.from(row).forEach((c, x) => (fixture.pixels[y * 16 + x] = colors[c]));
  });
  const fixtureFile = path.join(artifacts, "sample.pixeltool");
  await fs.writeFile(fixtureFile, JSON.stringify(fixture));
  await require("./test-ai-disclosure.cjs")(profile);
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: require("electron"),
    args: [root],
    cwd: root,
    env,
    timeout: 30000,
  });
  let page;
  try {
    page = await require("./first-editor.cjs")(app);
    await page.waitForSelector("#overlay-canvas");
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.waitForFunction(() => Boolean(window.pixeltool));
    const readPixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) =>
          Array.from(
            c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ),
        );
    assert.equal(await page.title(), "Pixel Mat");
    assert.equal(
      await page.locator(".brand-logo").getAttribute("alt"),
      "Pixel Mat",
    );
    await page.waitForFunction(() => {
      const logo = document.querySelector(".brand-logo");
      return (
        logo.complete && logo.naturalWidth === 86 && logo.naturalHeight === 16
      );
    });
    assert.equal(
      await page.locator("#dimension-badge").textContent(),
      "16 × 16",
    );
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, fixtureFile);
    await page.locator("#open-btn").click();
    page = await require("./next-editor.cjs")(app, page);
    await page.waitForFunction(
      () => document.getElementById("doc-name").value === "Green potion",
    );
    const baseline = await readPixels();
    assert.deepEqual(baseline, Array.from(documentRGBA(fixture)));
    let box = await page.locator("#overlay-canvas").boundingBox();
    const cell = (x, y) => ({
      x: box.x + ((x + 0.5) * box.width) / 16,
      y: box.y + ((y + 0.5) * box.height) / 16,
    });
    await page.locator('[data-tool="select"]').click();
    let a = cell(5, 8),
      b = cell(10, 11);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    assert.match(
      await page.locator("#selection-summary").textContent(),
      /24픽셀/,
    );
    await page.locator('[data-tool="pencil"]').click();
    a = cell(0, 0);
    await page.mouse.click(a.x, a.y);
    assert.deepEqual(await readPixels(), baseline);
    a = cell(6, 9);
    await page.locator("#palette button").nth(15).click();
    await page.mouse.click(a.x, a.y);
    assert.notDeepEqual(await readPixels(), baseline);
    await page.locator("#undo-btn").click();
    assert.deepEqual(await readPixels(), baseline);
    await page.locator("#redo-btn").click();
    assert.notDeepEqual(await readPixels(), baseline);
    await page.locator("#undo-btn").click();
    console.log(
      "PASS: native editor, continuous pointer selection, restricted drawing, undo/redo",
    );
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-ai").click();
    await page.locator("#provider-input").selectOption("api");
    await page.locator("#api-key").fill("sk-local-fixture-not-a-real-key");
    await page.locator("#remember-key").check();
    await page.locator('#settings-form button[type="submit"]').click();
    await page.waitForSelector("#settings-dialog", { state: "hidden" });
    await page.evaluate(() => window.pixeltool.acknowledgeAI(1));
    const stored = await fs.readFile(
      path.join(profile, "settings.json"),
      "utf8",
    );
    assert.ok(!stored.includes("sk-local-fixture"));
    assert.ok(JSON.parse(stored).encryptedKey);
    assert.match(
      await page.locator("#connection-badge").textContent(),
      /키 설정됨/,
    );
    console.log("PASS: encrypted key storage; UI receives status only");
    await app.evaluate(() => {
      globalThis.fetch = async (url, options) => {
        if (url !== "https://api.openai.com/v1/responses")
          throw new Error("unexpected URL");
        const body = JSON.parse(options.body),
          context = JSON.parse(body.input[0].content[0].text);
        globalThis.__lastContext = context;
        const r = context.editable_segments[0];
        return {
          ok: true,
          json: async () => ({
            status: "completed",
            usage: { input_tokens: 1234, output_tokens: 120 },
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      summary:
                        "선택한 영역의 첫 픽셀을 밝은 색으로 조정했어요. (자동화 테스트 응답)",
                      new_colors: [],
                      segments: [
                        {
                          id: r.id,
                          colors: Array.from({ length: r.length }, (_, i) =>
                            i === 0 ? 15 : null,
                          ),
                        },
                      ],
                    }),
                  },
                ],
              },
            ],
          }),
        };
      };
    });
    await page.locator("#prompt").fill("선택한 부분의 하이라이트를 다듬어줘.");
    await page.locator("#inspector-ai").click();
    // This fixture owns one transport reply; native-review has a separate
    // two-request suite for the default repair workflow.
    await page.locator('#ai-options > summary').click();
    await page.locator('#ai-quality').selectOption('check');
    await page.locator("#generate-btn").click();
    await page.waitForSelector("#proposal-card:not([hidden])");
    assert.match(await page.locator("#changed-count").textContent(), /1px/);
    const preview = await readPixels();
    assert.notDeepEqual(preview, baseline);
    await page.locator("#compare-btn").click();
    assert.deepEqual(await readPixels(), baseline);
    await page.locator("#compare-btn").click();
    assert.deepEqual(await readPixels(), preview);
    const context = await app.evaluate(() => globalThis.__lastContext);
    assert.equal(
      context.editable_segments.reduce((n, r) => n + r.length, 0),
      24,
    );
    await page.locator("#apply-btn").click();
    assert.deepEqual(await readPixels(), preview);
    await page.locator("#request-history-open").click();
    assert.equal(
      await page.locator("#request-history-list details").count(),
      1,
    );
    assert.match(
      await page.locator("#request-history-list .field-help").textContent(),
      /변경안 적용됨/,
    );
    assert.equal(await page.locator("#request-history-list canvas").count(), 2);
    const historyFrames = await page
      .locator("#request-history-list canvas")
      .evaluateAll((cs) =>
        cs.map((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]),
      );
    assert.deepEqual(historyFrames, [baseline, preview]);
    await page.screenshot({
      path: path.join(root, "artifacts", "ai-request-history.png"),
    });
    await page.locator("#request-history-list button").click();
    assert.equal(
      await page.locator("#prompt").inputValue(),
      "선택한 부분의 하이라이트를 다듬어줘.",
    );
    assert.deepEqual(await readPixels(), preview);
    await page.locator("#undo-btn").click();
    assert.deepEqual(await readPixels(), baseline);
    console.log("PASS: mocked API → strict patch → compare → apply → undo");
    // A response outside the frozen selection must never reach a preview.
    await app.evaluate(() => {
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    summary: "invalid",
                    new_colors: [],
                    segments: [{ id: 9999, colors: [15] }],
                  }),
                },
              ],
            },
          ],
        }),
      });
    });
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.waitForFunction(() =>
      document.getElementById("ai-status").textContent.includes("고정 구간"),
    );
    assert.deepEqual(await readPixels(), baseline);
    assert.equal(await page.locator("#proposal-card").isVisible(), false);
    console.log(
      "PASS: invalid out-of-selection API response rejected without changes",
    );
    // Deferred replies lock manual edits while allowing the frozen patch to finish.
    await app.evaluate(() => {
      globalThis.fetch = (_url, options) =>
        new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
          globalThis.__respond = () =>
            resolve({
              ok: true,
              json: async () => ({
                status: "completed",
                output: [
                  {
                    type: "message",
                    content: [
                      {
                        type: "output_text",
                        text: JSON.stringify({
                          summary: "stale",
                          new_colors: [],
                          segments: [
                            {
                              id: 0,
                              colors: Array.from(
                                {
                                  length: JSON.parse(
                                    JSON.parse(options.body).input[0].content[0]
                                      .text,
                                  ).editable_segments[0].length,
                                },
                                (_, i) => (i === 0 ? 15 : null),
                              ),
                            },
                          ],
                        }),
                      },
                    ],
                  },
                ],
              }),
            });
        });
    });
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await app.evaluate(async () => {
      for (let i = 0; i < 100 && !globalThis.__respond; i++)
        await new Promise((r) => setTimeout(r, 20));
    });
    a = cell(6, 9);
    assert.equal(await page.locator("#undo-btn").isDisabled(), true);
    const frozen = await readPixels();
    await page.mouse.click(a.x, a.y);
    assert.deepEqual(await readPixels(), frozen);
    await app.evaluate(() => globalThis.__respond());
    await page.locator("#proposal-card").waitFor({ state: "visible" });
    await page.locator("#discard-btn").click();
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.waitForSelector("#cancel-request:not([hidden])");
    await page.locator("#cancel-request").click();
    await page.waitForFunction(
      () => !document.getElementById("generate-btn").disabled,
    );
    console.log(
      "PASS: pending API requests lock manual edits; valid response and cancellation restore controls",
    );
    const savedFile = path.join(artifacts, "saved.pixeltool");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, savedFile);
    await page.keyboard.press("Control+Shift+S");
    await page.waitForFunction(() =>
      document.getElementById("toast").textContent.includes("saved.pixeltool"),
    );
    assert.deepEqual(
      JSON.parse(await fs.readFile(savedFile, "utf8")),
      JSON.parse(JSON.stringify(ensureLayers(fixture))),
    );
    const pngFile = path.join(artifacts, "exported.png");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, pngFile);
    await page.locator("#export-btn").click();
    await page.waitForFunction(() =>
      document.getElementById("toast").textContent.includes("exported.png"),
    );
    const exported = decodePNG(await fs.readFile(pngFile), "exported");
    assert.deepEqual(documentRGBA(exported), documentRGBA(fixture));
    console.log(
      "PASS: native save dialogs, project persistence and exact PNG export",
    );
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-ai").click();
    await page.locator("#clear-key-btn").click();
    await page.waitForSelector("#settings-dialog", { state: "hidden" });
    assert.equal(
      JSON.parse(await fs.readFile(path.join(profile, "settings.json"), "utf8"))
        .encryptedKey,
      null,
    );
    await page.locator("#new-btn").click();
    await page.locator('[data-size="32"]').click();
    await page.locator('#new-form button[type="submit"]').click();
    page = await require("./next-editor.cjs")(app, page);
    await page.waitForFunction(
      () =>
        document.getElementById("dimension-badge").textContent === "32 × 32",
    );
    assert.equal(
      await page.locator("#pixel-canvas").evaluate((c) => c.width),
      32,
    );
    // Return to sample for a visual QA artifact.
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, fixtureFile);
    await page.locator("#open-btn").click();
    page = await require("./next-editor.cjs")(app, page);
    await page.waitForFunction(
      () => document.getElementById("doc-name").value === "Green potion",
    );
    await page.locator('[data-tool="select"]').click();
    box = await page.locator("#overlay-canvas").boundingBox();
    a = cell(3, 9);
    b = cell(12, 13);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page
      .locator("#prompt")
      .fill("선택한 액체 부분의 음영을 더 간결하게 정리해줘.");
    await page.locator("#toast").evaluate((el) => (el.hidden = true));
    await page.screenshot({ path: path.join(artifacts, "desktop.png") });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 740),
    );
    await page.locator("#fit-btn").click();
    await page.screenshot({ path: path.join(artifacts, "desktop-small.png") });
    assert.ok(await page.locator("#generate-btn").isVisible());
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.deepEqual(pageErrors, []);
    console.log(
      "PASS: new canvas, minimum window layout; zero renderer exceptions",
    );
  } catch (error) {
    if (page)
      await page
        .screenshot({ path: path.join(artifacts, "failure.png") })
        .catch(() => {});
    throw error;
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
