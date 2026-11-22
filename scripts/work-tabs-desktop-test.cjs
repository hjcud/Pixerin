if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const ready = require("./editor-ready.cjs");
const first = require("./first-editor.cjs");

(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("work-tabs-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const initial = ensureLayers(createDocument(16, 16, "First"));
  initial.pixels[0] = 7;
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(initial));
  await require("./test-ai-disclosure.cjs")(profile);
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const errors = [];
  const start = async () => {
    app = await _electron.launch({
      executablePath: require("electron"),
      args: [root],
      env,
      timeout: 30000,
    });
    app.on("window", (p) => p.on("pageerror", (e) => errors.push(e.message)));
    const p = await first(app);
    p.setDefaultTimeout(10000);
    return p;
  };
  const state = (p) => p.evaluate(() => window.pixeltool.workspaceState());
  const waitState = async (p, predicate) => {
    for (let i = 0; i < 200; i++) {
      if (predicate(await state(p))) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("Workspace state did not settle");
  };
  const draft = async (p) =>
    ensureLayers(await p.evaluate(() => window.pixeltool.loadDraft()));
  const command = (p, action, extra = {}) =>
    p.evaluate((input) => window.pixeltool.workspaceCommand(input), {
      action,
      ...extra,
    });
  const find = async (id) => {
    for (let i = 0; i < 150; i++) {
      for (const p of app
        .windows()
        .filter((p) => p.url() === "pixeltool://app/index.html")) {
        p.setDefaultTimeout(10000);
        if (
          (await p
            .evaluate(() =>
              window.pixeltool?.workspaceState().then((s) => s.id),
            )
            .catch(() => null)) === id
        ) {
          await p.waitForFunction(
            () => document.documentElement.dataset.ready === "true",
          );
          return p;
        }
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("Editor not found: " + id);
  };
  const draw = async (p, x, y) => {
    const b = await p.locator("#overlay-canvas").boundingBox();
    await p.mouse.click(
      b.x + ((x + 0.5) * b.width) / 16,
      b.y + ((y + 0.5) * b.height) / 16,
    );
    await p.waitForFunction(() =>
      document
        .querySelector("#save-status")
        .textContent.includes("복구본 저장됨"),
    );
  };
  try {
    const a = await start();
    await ready(a);
    const header=await a.locator(".app-header").boundingBox(),strip=await a.locator("#work-tabs").boundingBox();
    assert.ok(strip.y>=header.y+header.height-1,"document tabs follow the shared header");
    const aId = (await state(a)).id;
    await a.locator("#prompt").fill("Keep this prompt");
    await draw(a, 3, 3);
    const aPainted = await draft(a);
    const selected = "";
    await a.click("#new-btn");
    await a.fill("#new-name", "Second");
    await a.locator('#new-form button[type="submit"]').click();
    while ((await state(a)).tabs.length !== 2)
      await new Promise((r) => setTimeout(r, 20));
    const bId = (await state(a)).active,
      b = await find(bId);
    await ready(b);
    assert.notEqual(aId, bId);
    assert.deepEqual(await draft(a), aPainted);
    await draw(b, 5, 5);
    const bPainted = await draft(b);
    assert.equal(bPainted.pixels[0], 0);
    console.log("created and drew second");
    await b.keyboard.press("Control+Tab");
    await ready(a);
    assert.equal(await a.locator("#prompt").inputValue(), "Keep this prompt");
    if (selected)
      assert.equal(await a.locator("#selection-info").textContent(), selected);
    await a.keyboard.press("Control+z");
    assert.equal((await draft(a)).pixels[3 * 16 + 3], 0);
    assert.deepEqual(await draft(b), bPainted);
    await a.keyboard.press("Control+Shift+z");
    console.log("independent undo passed");
    // Separate native file destinations; save dialogs are isolated fixtures.
    const aFile = path.join(profile, "first.pixeltool"),
      bFile = path.join(profile, "second.pixeltool");
    await app.evaluate(
      ({ dialog }, files) => {
        globalThis.saveFiles = files;
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: globalThis.saveFiles.shift(),
        });
      },
      [aFile, bFile],
    );
    await a.keyboard.press("Control+s");
    await a.waitForFunction(() => !document.querySelector(".workspace").inert);
    await command(a, "activate", { id: bId });
    await ready(b);
    await b.keyboard.press("Control+s");
    await b.waitForFunction(() => !document.querySelector(".workspace").inert);
    assert.equal(JSON.parse(await fs.readFile(aFile, "utf8")).name, "First");
    assert.equal(JSON.parse(await fs.readFile(bFile, "utf8")).name, "Second");
    console.log("save destinations passed");
    // Native pointer dragging reorders without reloading either renderer.
    const tabs = b.locator(".work-tab-select");
    await tabs.nth(1).waitFor({ state: "visible" });
    // Save metadata can replace tab nodes between two awaited boundingBox reads.
    const [to, from] = await tabs.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    assert.ok(from.width > 0 && to.width > 0);
    await b.mouse.move(from.x + 40, from.y + 15);
    await b.mouse.down();
    await b.mouse.move(to.x + 3, to.y + 15, { steps: 8 });
    await b.mouse.up();
    await waitState(b, (s) => s.tabs[0].id === s.id);
    console.log("drag reorder passed");
    // Mock the API transport, retaining main-process ownership and IPC routing.
    await app.evaluate(
      () => {
        globalThis.fetch = (_url,{signal}) =>
          new Promise((resolve, reject) => {
            globalThis.finishTabAI = () =>
              resolve(Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({
                  summary: "Two pixels",new_colors: [],segments:[{id:0,colors:[7,7,null,null,null,null,null,null]}],
                })}]}],
                usage: { input_tokens: 10, output_tokens: 5 },
              }));
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
          });
      },
    );
    await require("./configure-test-api.cjs")(b);
    await b.locator("#prompt").fill("두 픽셀을 그려줘");
    await b.keyboard.press("Enter");
    await app.evaluate(async () => {
      for (let i = 0; i < 300 && !globalThis.finishTabAI; i++)
        await new Promise((r) => setTimeout(r, 10));
      if (!globalThis.finishTabAI) throw new Error("Mock AI not started");
    });
    console.log("AI request started");
    // New work and other-document manual editing stay available during AI.
    assert.equal(await b.locator("#new-btn").isEnabled(), true);
    await command(b, "activate", { id: aId });
    await ready(a);
    await a.keyboard.press("Control+d");
    await draw(a, 6, 6);
    await a.keyboard.press("Control+a");
    await a.keyboard.press("ArrowRight");
    await a.waitForSelector("#placement-actions:not([hidden])");
    const zoomBefore = await a.locator("#zoom-label").textContent();
    // Detach through the menu and move the same renderer back through another window.
    await a.locator(".work-menu summary").click();
    await a.locator('[data-work-action="detach"]').click();
    await waitState(a, (s) => s.windows.length === 2);
    assert.equal((await state(a)).id, aId);
    assert.equal(await a.locator("#prompt").inputValue(), "Keep this prompt");
    assert.equal(await a.locator("#placement-actions").isVisible(), true);
    assert.equal(await a.locator("#zoom-label").textContent(), zoomBefore);
    await a.click("#placement-cancel");
    let separate = await state(a),
      bHost = (await state(b)).host;
    assert.notEqual(separate.host, bHost);
    const marker = await b.evaluate(
      () => (globalThis.tabMarker = crypto.randomUUID()),
    );
    await command(b, "move", { window: separate.host });
    await waitState(b, (s) => s.windows.length === 1);
    assert.equal(await b.evaluate(() => globalThis.tabMarker), marker);
    await command(b, "activate", { id: aId });
    await command(a, "detach");
    separate = await state(a);
    bHost = (await state(b)).host;
    // Another document cannot cancel the active request.
    await a.evaluate(() => window.pixeltool.cancelRequest());
    assert.equal((await state(b)).tabs.find((x) => x.id === bId).busy, true);
    await app.evaluate(() => globalThis.finishTabAI());
    await b.waitForSelector("#apply-btn:not([disabled])", {
      state: "attached",
    });
    assert.equal(await a.locator("#apply-btn").isVisible(), false);
    await command(b, "activate", { id: bId });
    await ready(b);
    await b.click("#apply-btn");
    assert.equal((await draft(b)).pixels[0], 7);
    assert.equal((await draft(a)).pixels[1], 0);
    // Cross-window drag joins a retained editor, with a controlled native target rectangle.
    await app.evaluate(
      ({ BrowserWindow }, ids) => {
        const target = BrowserWindow.fromId(ids.target),
          source = BrowserWindow.fromId(ids.source);
        target.setBounds({ x: 40, y: 40, width: 1100, height: 740 });
        source.setBounds({ x: 250, y: 250, width: 1100, height: 740 });
      },
      { target: bHost, source: separate.host },
    );
    await ready(a);
    const position = await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id).getContentBounds(),
      bHost,
    );
    const sourcePosition = await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id).getContentBounds(),
      separate.host,
    );
    const sourceTab=await a.locator(".work-tab-select").first().boundingBox();
    const targetStrip=await b.locator("#work-tabs").boundingBox();
    await a.mouse.move(sourceTab.x+40,sourceTab.y+15);
    await a.mouse.down();
    await a.mouse.move(
      position.x + 30 - sourcePosition.x,
      position.y + targetStrip.y + targetStrip.height/2 - sourcePosition.y,
      { steps: 12 },
    );
    await a.mouse.up();
    await waitState(a, (s) => s.windows.length === 1);
    assert.deepEqual(
      (await state(a)).tabs.map((t) => t.id),
      [aId, bId],
    );
    // Unsaved tab close is cancellable; confirmation affects only that work.
    await a.keyboard.press("Control+w");
    await a.waitForSelector("#confirm-dialog[open]");
    await a.click("#confirm-cancel");
    assert.equal((await state(a)).tabs.length, 2);
    // Save-as cannot overwrite a file already owned by another open tab.
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, bFile);
    await assert.rejects(
      () => a.evaluate((doc) => window.pixeltool.saveProjectAs(doc), aPainted),
      /다른 탭/,
    );
    // Restore both windows and documents on app quit; existing .pixeltool stays v2.
    await a.screenshot({
      path: path.join(root, "artifacts", "work-tabs-final.png"),
    });
    const topStrip=await a.locator("#work-tabs").boundingBox();
    await a.screenshot({path:path.join(root,"artifacts","work-tabs-header.png"),clip:{x:0,y:0,width:await a.evaluate(()=>innerWidth),height:Math.ceil(topStrip.y+topStrip.height)}});
    const h = await a.evaluate(() => innerHeight);
    const activeTab=await a.locator('.work-tab-select[aria-selected="true"]').boundingBox();
    await a.mouse.move(activeTab.x+40,activeTab.y+15);
    await a.mouse.down();
    await a.mouse.move(50, h + 60, { steps: 12 });
    await a.mouse.up();
    await waitState(a, (s) => s.windows.length === 2);
    const expected = (await state(a)).id;
    await app.close();
    app = null;
    const restart = await start();
    await ready(restart);
    const restoredA = await find(expected),
      restoredB = await find(bId);
    assert.equal((await state(restoredA)).windows.length, 2);
    assert.equal((await draft(restoredA)).pixels[6 * 16 + 6], 7);
    assert.equal((await draft(restoredB)).pixels[0], 7);
    assert.equal((await draft(restoredB)).version, 2);
    await command(restoredA, "move", { window: (await state(restoredB)).host });
    await ready(restoredA);
    await restoredB.evaluate(() =>
      localStorage.setItem(
        "pixeltool.ui.shortcuts.v1",
        JSON.stringify({ "work-next": ["Ctrl+tab", "Alt+n"] }),
      ),
    );
    await restoredA.waitForTimeout(80);
    await restoredA.keyboard.press("Alt+n");
    await waitState(restoredA, (s) => s.active === bId);
    await command(restoredB, "activate", { id: expected });
    await ready(restoredA);
    await restoredA.evaluate(async () => {
      const s = await window.pixeltool.getSettings();
      await window.pixeltool.savePreferences({
        ...s.preferences,
        theme: "light",
        language: "en",
      });
    });
    await restoredA.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    assert.equal(
      await restoredA.locator(".work-menu summary").getAttribute("title"),
      "Document menu",
    );
    await restoredA.screenshot({
      path: path.join(root, "artifacts", "work-tabs-light.png"),
    });
    await restoredA.evaluate(async () => {
      const s = await window.pixeltool.getSettings();
      await window.pixeltool.savePreferences({
        ...s.preferences,
        theme: "dark",
        language: "ko",
      });
    });
    await restoredA.keyboard.press("Control+w");
    await restoredA.waitForSelector("#confirm-dialog[open]");
    await restoredA.click("#confirm-skip");
    await waitState(restoredB, (s) => s.tabs.length === 1);
    assert.ok(
      (await restoredB.evaluate(() => window.pixeltool.listRecovery())).some(
        (e) => e.name === "First",
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: independent edits/history/files, native tab reorder, live AI ownership, detach/rejoin, close cancellation, restart windows, archived recovery, file conflicts",
    );
  } catch (error) {
    console.error("TEST FAILURE", error);
    throw error;
  } finally {
    await app?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
