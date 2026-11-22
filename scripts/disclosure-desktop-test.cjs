if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("disclosure-profile-");
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
    await page.waitForFunction(() => Boolean(window.pixeltool));
    assert.match(
      await page.evaluate(() =>
        window.pixeltool.requestPatch({}).catch((e) => e.message),
      ),
      /AI 서비스를|전송 범위 안내/,
    );
    assert.match(
      await page.evaluate(() =>
        window.pixeltool.acknowledgeAI(999).catch((e) => e.message),
      ),
      /다시 확인/,
    );
    await page.evaluate(() =>
      window.pixeltool.saveSettings({
        provider: "api",
        model: "gpt-6-astra",
        key: "sk-isolated-test-key",
        remember: false,
      }),
    );
    await page.reload();
    await page.waitForFunction(() =>
      document.getElementById("model-label").textContent.startsWith("OpenAI API"),
    );
    await app.evaluate(() => {
      globalThis.__disclosureCalls = 0;
      globalThis.fetch = async (_url, options) => {
        globalThis.__disclosureCalls++;
        return {
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
                      summary: "Mock edit",
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
                            (_, i) => (i === 0 ? 7 : null),
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
    await page.locator("#prompt").fill("초록 픽셀");
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const before = await pixels();
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.locator("#transmission-dialog").waitFor({ state: "visible" });
    assert.match(
      await page.locator("#transmission-current").textContent(),
      /활성 레이어 전체/,
    );
    await page.locator("#transmission-cancel").click();
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.keyboard.press("Escape");
    assert.equal(await app.evaluate(() => globalThis.__disclosureCalls), 0);
    assert.deepEqual(await pixels(), before);
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.locator("#transmission-accept").click();
    await page.locator("#proposal-card").waitFor({ state: "visible" });
    assert.equal(await app.evaluate(() => globalThis.__disclosureCalls), 1);
    await page.locator("#discard-btn").click();
    await page.locator("#inspector-ai").click();
    await page.locator("#generate-btn").click();
    await page.locator("#proposal-card").waitFor({ state: "visible" });
    assert.equal(await app.evaluate(() => globalThis.__disclosureCalls), 2);
    await page.locator("#discard-btn").click();
    await page.locator("#transmission-details").click();
    assert.equal(await page.locator("#transmission-accept").isVisible(), false);
    await page.keyboard.press("Escape");
    await page.locator("#settings-btn").click();
    await page.locator("#settings-tab-info").click();
    await page.waitForFunction(() =>
      document
        .getElementById("license-electron")
        .textContent.includes("Permission is hereby granted"),
    );
    assert.match(
      await page.locator("#license-pngjs").textContent(),
      /Luke Page/,
    );
    await app.evaluate(({ shell }) => {
      shell.openPath = async (file) => {
        globalThis.__licenseFile = file;
        return "";
      };
    });
    await page.locator("#chromium-notices").click();
    assert.equal(
      path.basename(await app.evaluate(() => globalThis.__licenseFile)),
      "LICENSES.chromium.html",
    );
    await page.locator("#info-transmission").click();
    await page.keyboard.press("Escape");
    assert.ok(await page.locator("#settings-dialog").isVisible());
    assert.deepEqual(errors, []);
    await app.close();
    app = await launch();
    page = await require("./first-editor.cjs")(app);
    await page.waitForFunction(() => Boolean(window.pixeltool));
    assert.equal(
      (await page.evaluate(() => window.pixeltool.getSettings()))
        .aiDisclosureVersion,
      1,
    );
    console.log(
      "PASS: first-use IPC guard, invalid version, cancel/Esc with zero AI calls, one-time acknowledgment, mock requests, restart persistence, license text and local Chromium link.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
