if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    profile = await require("./test-runner.cjs").createProfile("progress-profile-");
  await require("./test-ai-disclosure.cjs")(profile);
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [root],
    env,
  });
  let page;
  try {
    page =
      (await require("./mock-pixel-clipboard.cjs")(app),
      await require("./first-editor.cjs")(app));
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () => document.querySelectorAll("#palette button").length > 0,
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await app.evaluate((_, modulePath) => {
      const { ProgressReporter } = process.mainModule.require(modulePath);
      const update = ProgressReporter.prototype.update;
      ProgressReporter.prototype.update = function(event) { globalThis.__activeReporter = this; return update.call(this, event); };
      globalThis.fetch = async (_url, options) => new Promise((resolve, reject) => {
        globalThis.__emitProgress = (event) => globalThis.__activeReporter.update(event);
        globalThis.__finishProgress = () => resolve(Response.json({ status: "completed", usage: { input_tokens: 1234, output_tokens: 80 },
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "초록색 두 픽셀", new_colors: [], segments: [{ id: 0, colors: { set: [0, 7, 1, 7] } }] }) }] }],
        }));
        globalThis.__failProgress = () => reject(new Error("연결 중단 테스트"));
        options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    }, path.join(root, "electron", "progress.mjs"));
    await require("./configure-test-api.cjs")(page);
    // This suite isolates streaming/progress; visual review has its own two-call suite.
    await page.locator('#ai-options > summary').click();
    await page.locator('#ai-quality').selectOption('check');
    await page.locator('#ai-options > summary').click();
    const rgba = () => page.locator("#pixel-canvas").evaluate((c) => Array.from(c.getContext("2d").getImageData(0, 0, c.width, c.height).data));
    const original = await rgba();
    const emit = (event) => app.evaluate((_, event) => globalThis.__emitProgress(event), event);
    const start = async () => {
      await page.locator("#prompt").fill("왼쪽 위에 초록색 두 픽셀을 만들어줘.");
      await page.locator("#generate-btn").click();
      await page.waitForFunction(() => !document.querySelector("#cancel-request").hidden);
    };
    const preview = async () => {
      await emit({ type: "text", itemId: "m", delta: '{"summary":"초록색 두 픽셀","new_colors":[],"segments":[{"id":0,"colors":{"set":[0,7]}}' });
      await page.waitForFunction(() => !document.getElementById("stream-label").hidden);
    };
    await start();
    assert.equal(await page.locator("#cancel-request [data-icon]").getAttribute("data-icon"),"stop");
    assert.equal((await page.locator("#cancel-request").textContent()).trim(),"AI 요청 중단");
    await page.bringToFront();
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-ui-inactive"));
    assert.equal(await page.locator("#request-progress").evaluate(el => getComputedStyle(el).animationName), "ui-ai-flow");
    const host = (await page.evaluate(() => window.pixeltool.workspaceState())).host;
    await app.evaluate(({ BrowserWindow }, host) => BrowserWindow.fromId(host).blur(), host);
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-ui-inactive"));
    assert.equal(await page.locator("#request-progress").evaluate(el => getComputedStyle(el).animationPlayState), "paused");
    await emit({ type: "usage", usage: { input_tokens: 100, output_tokens: 1 } });
    await page.waitForFunction(() => document.getElementById("request-input-tokens").textContent === "100");
    await page.bringToFront();
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-ui-inactive"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator("#request-progress").evaluate(el => getComputedStyle(el).animationName), "none");
    assert.equal(await page.locator("#request-stage").evaluate(el => getComputedStyle(el, "::before").animationName), "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await fs.mkdir(path.join(root,"artifacts","ui-motion-review"),{recursive:true});
    await page.screenshot({path:path.join(root,"artifacts","ui-motion-review","request.png")});
    await fs.mkdir(path.join(root,"artifacts","header-review"),{recursive:true});
    await page.screenshot({path:path.join(root,"artifacts","header-review","header.png"),clip:{x:0,y:0,width:await page.evaluate(()=>innerWidth),height:56}});
    await page.screenshot({path:path.join(root,"artifacts","header-review","request.png")});
    await page.locator("#cancel-request").screenshot({path:path.join(root,"artifacts","header-review","stop-request.png")});
    for (const id of ["prompt", "model-picker-btn", "connection-badge", "undo-btn", "redo-btn", "doc-name", "layer-add", "add-color"])
      assert.ok(await page.locator("#" + id).isDisabled(), id);
    await preview(); assert.notDeepEqual(await rgba(), original);
    const draft = await page.evaluate(() => window.pixeltool.loadDraft());
    assert.ok(!draft || draft.layers.every((layer) => layer.pixels.every((value) => value === 0)));
    await emit({ type: "usage", usage: { input_tokens: 1234, output_tokens: 17 } });
    await page.waitForFunction(() => document.querySelector("#request-output-tokens").textContent === "17");
    await page.locator("#live-preview-toggle").uncheck(); assert.deepEqual(await rgba(), original);
    await page.locator("#live-preview-toggle").check(); assert.notDeepEqual(await rgba(), original);
    await page.waitForFunction(() => document.querySelector("#request-elapsed").textContent !== "0초");
    await page.locator("#cancel-request").click(); assert.deepEqual(await rgba(), original);
    assert.ok(await page.locator("#generate-btn").isVisible());
    const elapsed = await page.locator("#request-elapsed").textContent();
    await emit({ type: "text", itemId: "m", delta: '{"id":1,"colors":8}]}' });
    assert.deepEqual(await rgba(), original); assert.equal(await page.locator("#request-elapsed").textContent(), elapsed);
    console.log("PASS: partial compressed preview, frozen editing, reported usage, preview toggle and cancel preserve original");
    await start(); await preview();
    await app.evaluate(() => globalThis.__finishProgress());
    await page.waitForSelector("#proposal-card:not([hidden])");
    assert.equal(await page.locator("#discard-btn [data-icon]").getAttribute("data-icon"),"trash");
    assert.equal((await page.locator("#discard-btn").textContent()).trim(),"변경안 버리기");
    assert.equal(await page.locator("#request-progress").evaluate(el => getComputedStyle(el).animationName), "none");
    const group = page.locator('.dock-group:has(.dock-tab[data-panel="ai"])');
    await group.locator(".dock-panel-menu > summary").click();
    const nativeOpened = app.waitForEvent("window"); nativeOpened.catch(()=>{});
    await group.locator('[data-move-panel="window"]').click();
    const native = await nativeOpened;await native.waitForSelector("#review-actions:not([hidden])");
    await native.emulateMedia({reducedMotion:"reduce"});
    await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url).setContentSize(260,240),native.url());
    for(const language of ["en","ja","zh-CN","es","fr","de","ko"]) {
      await page.evaluate(async language=>{const s=await window.pixeltool.getSettings();await window.pixeltool.savePreferences({...s.preferences,language});},language);
      await native.waitForFunction(language=>document.documentElement.lang===language,language);
      for(const id of ["apply-btn","discard-btn"]) {
        const button=native.locator("#"+id);await button.scrollIntoViewIfNeeded();
        assert.ok(await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1;}),language+"/"+id+" remains readable in the minimum panel width");
      }
    }
    const actionBounds=await native.locator("#review-actions button").evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().toJSON()));
    assert.ok(actionBounds[1].top>=actionBounds[0].bottom,"Narrow review actions stack instead of squeezing translated labels");
    for(const id of ["apply-btn","discard-btn"]) {
      await native.locator("#"+id).scrollIntoViewIfNeeded();
      assert.ok(await native.locator("#"+id).evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&(hit===el||el.contains(hit));}));
    }
    await native.screenshot({path:path.join(root,"artifacts","ui-motion-review","narrow-review.png")});
    await native.screenshot({path:path.join(root,"artifacts","header-review","narrow-review.png")});
    await native.locator("#native-panel-return").click();await page.bringToFront();
    assert.equal(await page.locator("#request-output-tokens").textContent(), "80");
    const final = await rgba(); assert.notDeepEqual(final, original);
    await page.locator("#apply-btn").click(); await page.locator("#undo-btn").click(); assert.deepEqual(await rgba(), original);
    await start(); await preview(); await app.evaluate(() => globalThis.__failProgress());
    await page.waitForFunction(() => !document.querySelector("#generate-btn").hidden);
    assert.deepEqual(await rgba(), original); assert.ok(await page.locator("#prompt").isEnabled());
    assert.deepEqual(errors, []);
    console.log("PASS: authoritative final usage, atomic apply/undo and failed request restore editing; mocked API only");
    console.log("PASS: AI motion pauses in inactive windows while usage updates continue; reduced motion stops effects; 260px detached review actions stay reachable");
  } finally { await app.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
