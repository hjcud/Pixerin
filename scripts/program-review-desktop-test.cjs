if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("program-review-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(16, 16, "Review fixture"));
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  const failures = [];
  try {
    const page = await require("./first-editor.cjs")(app),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.bringToFront();
    const c = page.locator("#overlay-canvas");
    const pixels = () =>
      page
        .locator("#pixel-canvas")
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    const at = async (x, y) => {
      const r = await c.boundingBox();
      return [
        r.x + ((x + 0.5) * r.width) / 16,
        r.y + ((y + 0.5) * r.height) / 16,
      ];
    };
    const foreign = async (type, x = 9, y = 9) => {
      const [clientX, clientY] = await at(x, y);
      await c.dispatchEvent(type, {
        pointerId: 99,
        pointerType: "touch",
        clientX,
        clientY,
        button: 0,
        buttons: 1,
        bubbles: true,
      });
    };
    async function check(name, fn) {
      try {
        await fn();
        console.log("PASS:", name);
      } catch (e) {
        failures.push(name + ": " + e.message);
        console.error("FAIL:", name, e.message);
      }
    }
    await check(
      "foreign pointers cannot mutate or end a pencil stroke",
      async () => {
        await page.mouse.move(...(await at(1, 1)));
        await page.mouse.down();
        const painted = await pixels();
        await foreign("pointermove");
        assert.deepEqual(await pixels(), painted);
        await foreign("pointerup");
        await page.keyboard.press("Escape");
        await page.mouse.up();
        assert.ok((await pixels()).every((v, i) => i % 4 !== 3 || v === 0));
      },
    );
    await page.mouse.up();
    await page.keyboard.press("Escape");
    await check(
      "capture loss with held buttons rolls back only the pending pencil stroke",
      async () => {
        await page.mouse.click(...(await at(0, 0)));
        const before = await pixels();
        await page.mouse.move(...(await at(4, 6)));
        await page.mouse.down();
        // Exercise the held-button branch explicitly. Windows can report a
        // native release with buttons=0; that separate branch must wait for up.
        await c.dispatchEvent("lostpointercapture", {
          pointerId: 1,
          pointerType: "mouse",
          buttons: 1,
        });
        await page.mouse.move(...(await at(5, 6)));
        await page.mouse.up();
        assert.deepEqual(await pixels(), before);
      },
    );
    await check(
      "released capture before pointerup completes exactly one edit",
      async () => {
        const before = await pixels();
        await page.mouse.move(...(await at(7, 7)));
        await page.mouse.down();
        await page.mouse.move(...(await at(8, 7)));
        const drawn = await pixels();
        assert.notDeepEqual(drawn, before);
        await c.dispatchEvent("lostpointercapture", {
          pointerId: 1,
          pointerType: "mouse",
          buttons: 0,
        });
        await page.mouse.up();
        assert.deepEqual(await pixels(), drawn);
        await page.keyboard.press("Control+z");
        assert.deepEqual(await pixels(), before);
      },
    );
    await check(
      "layer panel resizing owns its pointer and cancels cleanly",
      async () => {
        const handle = page.locator(".dock-divider-bottom");
        const height = async () => Number(await handle.getAttribute("aria-valuenow")),
          original = await height(),
          r = await handle.boundingBox();
        await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
        await page.mouse.down();
        await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 - 25);
        const pending = await height();
        assert.notEqual(pending, original);
        await handle.dispatchEvent("pointermove", {
          pointerId: 99,
          clientY: 0,
        });
        await handle.dispatchEvent("pointerup", { pointerId: 99 });
        assert.equal(await height(), pending);
        await page.keyboard.press("Escape");
        await page.mouse.up();
        assert.equal(await height(), original);
      },
    );
    await check(
      "dropping a project into a modal cannot replace its source",
      async () => {
        await page.locator("#layer-mask-open").click();
        await page.evaluate((doc) => {
          const transfer = new DataTransfer();
          transfer.items.add(
            new File(
              [JSON.stringify({ ...doc, name: "Unexpected replacement" })],
              "drop.pixeltool",
            ),
          );
          document.querySelector("#layer-mask-dialog").dispatchEvent(
            new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: transfer,
            }),
          );
        }, doc);
        // Flush the import promise and its IPC work before asserting no replacement confirmation.
        await page.evaluate(() => window.pixeltool.listRecovery());
        assert.equal(await page.locator("#confirm-dialog").isVisible(), false);
        assert.equal(
          await page.locator("#doc-name").inputValue(),
          "Review fixture",
        );
      },
    );
    await page.evaluate(() =>
      document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
    );
    await check(
      "project import locks the workspace and rejects overlapping drops",
      async () => {
        await app.evaluate(({ ipcMain }, doc) => {
          ipcMain.removeHandler("project:open");
          ipcMain.handle(
            "project:open",
            () =>
              new Promise((resolve) => {
                globalThis.releaseReviewOpen = () =>
                  resolve({
                    ok: true,
                    value: { kind: "project", document: doc },
                  });
              }),
          );
        }, doc);
        await page.locator("#open-btn").click();
        await app.evaluate(async () => {
          while (!globalThis.releaseReviewOpen)
            await new Promise((r) => setTimeout(r, 10));
        });
        assert.equal(
          await page.locator(".workspace").evaluate((el) => el.inert),
          true,
        );
        await page.evaluate((doc) => {
          const transfer = new DataTransfer();
          transfer.items.add(
            new File(
              [JSON.stringify({ ...doc, name: "Second drop" })],
              "second.pixeltool",
            ),
          );
          document.dispatchEvent(
            new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: transfer,
            }),
          );
        }, doc);
        assert.equal(await page.locator("#confirm-dialog").isVisible(), false);
        await app.evaluate(() => globalThis.releaseReviewOpen());
        await page.waitForFunction(
          () => !document.querySelector(".workspace").inert,
        );
        assert.equal(
          await page.locator("#doc-name").inputValue(),
          "Review fixture",
        );
        assert.ok((await pixels()).every((v, i) => i % 4 !== 3 || v === 0));
        await page.evaluate(() => {
          const transfer = new DataTransfer();
          transfer.items.add(new File(["invalid"], "bad.pixeltool"));
          document.dispatchEvent(
            new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: transfer,
            }),
          );
        });
        await page.waitForFunction(
          () => !document.querySelector(".workspace").inert,
        );
        assert.equal(
          await page.locator("#doc-name").inputValue(),
          "Review fixture",
        );
      },
    );
    await check(
      "3D studio respects both configured undo shortcuts and composition",
      async () => {
        await page.locator("#settings-btn").click();
        await page.locator('[data-settings-tab="editor"]').click();
        await page.locator("#shortcut-open").click();
        for (const [command, slot, key] of [
          ["undo", 0, "Alt+z"],
          ["undo", 1, "Control+Alt+z"],
          ["redo", 0, "Alt+y"],
        ]) {
          await page
            .locator(`[data-command="${command}"] [data-slot="${slot}"]`)
            .click();
          await page.keyboard.press(key);
        }
        await page.locator("#shortcut-save").click();
        await page.locator("#settings-dialog .dialog-close").first().click();
        await page.locator("#geometry-open").click();
        await page.locator("#geometry-precise > summary").click();
        const yaw = page.locator("#geometry-yaw-number"),
          model = page.locator("#geometry-model");
        const original = await yaw.inputValue();
        await yaw.fill("42");
        await yaw.press("Tab");
        await model.focus();
        await model.dispatchEvent("keydown", {
          key: "z",
          ctrlKey: true,
          altKey: true,
          isComposing: true,
          bubbles: true,
        });
        assert.equal(await yaw.inputValue(), "42");
        await page.keyboard.press("Control+Alt+z");
        assert.equal(await yaw.inputValue(), original);
        await page.keyboard.press("Alt+y");
        assert.equal(await yaw.inputValue(), "42");
        await page.keyboard.press("Alt+z");
        assert.equal(await yaw.inputValue(), original);
        await page.locator("#geometry-cancel").click();
      },
    );
    await check(
      "document naming works while the active paint layer is locked",
      async () => {
        await page.locator(".layer-lock").first().click();
        await page.locator("#doc-name").fill("Locked document rename");
        await page.locator("#doc-name").blur();
        assert.equal(
          await page.locator("#doc-name").inputValue(),
          "Locked document rename",
        );
      },
    );
    await check(
      "overlapping settings updates retain both changes",
      async () => {
        await page.evaluate(async () => {
          await Promise.all([
            window.pixeltool.saveSettings({
              provider: "api",
              key: "sk-isolated-release-fixture",
              remember: false,
              model: "review-model",
            }),
            window.pixeltool.acknowledgeAI(1),
          ]);
        });
        const settings = await page.evaluate(() =>
          window.pixeltool.getSettings(),
        );
        assert.equal(settings.model, "review-model");
        assert.equal(settings.aiDisclosureVersion, 1);
      },
    );
    await check(
      "startup blocks editing and saving until recovery has finished",
      async () => {
        await app.evaluate(({ ipcMain }, doc) => {
          ipcMain.removeHandler("draft:load");
          ipcMain.handle(
            "draft:load",
            () =>
              new Promise((resolve) => {
                globalThis.releaseReviewStartup = () =>
                  resolve({ ok: true, value: doc });
              }),
          );
        }, doc);
        await page.reload({ waitUntil: "commit" });
        await page.waitForFunction(
          () => document.body.getAttribute("aria-busy") === "true",
        );
        assert.equal(await page.evaluate(() => document.body.inert), true);
        await page.keyboard.press("Control+s");
        assert.equal(await page.locator("#save-status").textContent(), "");
        await app.evaluate(async () => {
          while (!globalThis.releaseReviewStartup)
            await new Promise((r) => setTimeout(r, 10));
          globalThis.releaseReviewStartup();
        });
        await page.waitForFunction(
          () => document.documentElement.dataset.ready === "true",
        );
        assert.equal(await page.evaluate(() => document.body.inert), false);
        assert.equal(
          await page.locator("#doc-name").inputValue(),
          "Review fixture",
        );
        assert.ok((await pixels()).every((v, i) => i % 4 !== 3 || v === 0));
      },
    );
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
  }
  assert.deepEqual(failures, []);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
