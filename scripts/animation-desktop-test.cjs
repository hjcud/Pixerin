if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."), profile = await require("./test-runner.cjs").createProfile("animation-");
  await fs.mkdir(path.join(root,"artifacts","timeline-review"), {recursive:true});
  const { motionFixture } = await import("../tests/motion-fixture.mjs"), { document: source, plan } = motionFixture();
  plan.frames[1].duration = 16;
  const { validateDocument } = await import("../src/core.mjs");
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(source));
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch({ executablePath: require("electron"), args: [root], env });
  let app = await launch(), page, failed = true; const errors = [], cases = [];
  const watch = p => p.on("pageerror", error => { errors.push(error.message); console.error(error.stack); });
  app.on("window", watch); app.windows().forEach(watch);
  const saved = async predicate => {
    const until = Date.now() + 10000;
    while (Date.now() < until) {
      try { const doc = validateDocument(JSON.parse(await fs.readFile(path.join(profile, "draft.json"), "utf8"))); if (predicate(doc)) return doc; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error("Animation draft was not saved in the expected state");
  };
  try {
    page = await require("./first-editor.cjs")(app); await require("./editor-ready.cjs")(page); page.setDefaultTimeout(10000);
    const frameAction = async id => { await page.locator("#animation-more").click(); await page.locator(id).click(); };
    const generateMotion = async () => { await page.locator("#motion-open").click(); await page.locator("#motion-generate").click(); };
    const pixels = () => page.locator("#pixel-canvas").evaluate(c => Array.from(c.getContext("2d").getImageData(0, 0, c.width, c.height).data));
    const original = await pixels();
    assert.equal(await page.locator("#animation-panel").isVisible(), false);
    await page.locator("#panel-layout-menu > summary").click(); await page.locator('[data-show-panel="animation"]').click();
    assert.equal(await page.locator("#animation-panel").isVisible(), true); cases.push("opt-in header menu");
    await page.locator("#animation-add").click(); await saved(doc => doc.animation?.frames.length === 2);
    assert.deepEqual(await pixels(), original);
    await page.locator('[data-tool="pencil"]').click();
    const box = await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.click(box.x + 1.5 * box.width / 16, box.y + 1.5 * box.height / 16);
    const edited = await saved(doc => doc.pixels[17] !== 0); assert.equal(edited.animation.frames[0].document.pixels[17], 0);
    await page.locator('.animation-frame[data-frame="0"]').click(); assert.deepEqual(await pixels(), original);
    await page.locator('.animation-frame[data-frame="1"]').click(); assert.notDeepEqual(await pixels(), original);
    await page.locator("#undo-btn").click(); await saved(doc => doc.animation?.frames.length === 2 && doc.pixels[17] === 0);
    assert.deepEqual(await pixels(), original); await page.locator("#redo-btn").click(); await saved(doc => doc.pixels[17] !== 0); cases.push("copy-edit frame isolation and one-step undo/redo");
    await page.locator("#panel-layout-menu > summary").click(); await page.locator('[data-show-panel="layers"]').click();
    await page.locator("#layer-add").click(); await saved(doc => doc.layers.length === 2);
    await page.locator("#panel-layout-menu > summary").click(); await page.locator('[data-show-panel="animation"]').click();
    // Panel activation schedules its render on the next animation frame.
    await page.waitForFunction(() => document.querySelectorAll('.animation-row').length === 3);
    assert.equal(await page.locator(".animation-row").count(), 3);
    await page.locator('.animation-frame[data-frame="0"]').click(); assert.equal(await page.locator(".animation-row").count(), 2);
    await page.locator('.animation-frame[data-frame="1"]').click(); assert.equal(await page.locator(".animation-row").count(), 3); cases.push("frame-local layers and bounded track rows");
    await page.locator("#animation-duration").fill("240"); await page.locator("#animation-duration").press("Enter"); await page.locator("#animation-play").focus();
    await saved(doc => doc.animation.frames[1].duration === 240);
    await page.locator("#animation-onion").click();
    await page.locator('.animation-frame[data-frame="0"]').click(); assert.notDeepEqual(await pixels(), original);
    await page.locator("#animation-onion").click(); assert.deepEqual(await pixels(), original); cases.push("onion skin changes display only");
    await page.locator("#animation-play").click(); await page.waitForFunction(() => document.getElementById("animation-position").textContent.includes("2 / 2"));
    await page.locator("#animation-play").click();
    await frameAction("#animation-move-right"); await saved(doc => doc.animation.active === 1 && doc.animation.frames[1].id === "frame-1");
    await page.locator("#undo-btn").click(); await saved(doc => doc.animation.frames[0].id === "frame-1"); cases.push("duration playback and ordering");
    await page.locator('.animation-cel[data-frame="0"]').first().dragTo(page.locator('.animation-cel[data-frame="1"]').first());
    await saved(doc => doc.animation.frames[1].id === "frame-1");
    await page.locator("#undo-btn").click(); await saved(doc => doc.animation.frames[0].id === "frame-1"); cases.push("frame drag reorder");
    await frameAction("#animation-blank"); const blank = await saved(doc => doc.animation.frames.length === 3 && doc.pixels.every(color => !color));
    assert.ok(blank.animation.frames[0].document.pixels.some(Boolean));
    await page.locator("#animation-delete").click(); await saved(doc => doc.animation.frames.length === 2); cases.push("blank and deletion");
    await page.locator('.animation-frame[data-frame="0"]').click();
    await app.evaluate(() => { globalThis.fetch = async () => { throw Error("Unconfigured mock"); }; });
    await require("./configure-test-api.cjs")(page);
    await app.evaluate((_electron, plan) => {
      globalThis.__motionCalls = [];
      globalThis.fetch = async (_url, options) => {
        const body = JSON.parse(options.body); globalThis.__motionCalls.push(body);
        const payload = body.text.format.name === "pixel_mat_motion_review" ? { summary: "Reviewed idle", warnings: [], corrections: [] } : plan;
        return Response.json({ status: "completed", usage: { input_tokens: 120, output_tokens: 60 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }] });
      };
    }, plan);
    await page.locator("#motion-open").click();
    await page.locator("#motion-prompt").fill("Breathe gently and keep feet planted"); await page.locator("#motion-frame-count").fill("4");
    const beforeGeneration = JSON.stringify(await saved(doc => Boolean(doc.animation)));
    await page.locator("#motion-generate").click(); await page.locator("#animation-review").waitFor({ state: "visible" });
    assert.equal(await app.evaluate(() => globalThis.__motionCalls.length), 2);
    assert.equal(JSON.stringify(await saved(doc => Boolean(doc.animation))), beforeGeneration);
    await page.locator('.animation-frame[data-frame="1"]').click(); assert.notDeepEqual(await pixels(), original);
    await page.locator("#motion-discard").click(); assert.deepEqual(await pixels(), original); cases.push("two mocked model calls and discard without artwork changes");
    await generateMotion(); await page.locator("#animation-review").waitFor({ state: "visible" });
    await page.locator("#motion-apply").click(); const applied = await saved(doc => doc.animation?.frames.length === 4);
    assert.equal(applied.animation.frames[0].document, null); assert.deepEqual(await pixels(), original);
    await page.locator("#undo-btn").click(); await saved(doc => doc.animation.frames.length === 2);
    await page.locator("#redo-btn").click(); await saved(doc => doc.animation.frames.length === 4); cases.push("atomic whole-animation apply and undo/redo");
    const history = await page.evaluate(() => window.pixeltool.transmissionHistory());
    assert.equal(history.entries[0].mode, "animation"); assert.equal(history.entries[0].frames, 4); assert.equal(history.entries[0].calls, 2); assert.equal(history.entries[0].usage.input_tokens, 240);
    await page.locator("#request-history-open").click();
    assert.ok((await page.locator("#transmission-log-list").textContent()).includes("AI 움직임")); await page.keyboard.press("Escape");
    const destination = path.join(profile, "sprite-export.zip");
    await app.evaluate(({ dialog }, destination) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination }); }, destination);
    await frameAction("#animation-export");
    const until = Date.now() + 10000; while (Date.now() < until) { try { if ((await fs.stat(destination)).size) break; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.equal((await fs.readFile(destination)).readUInt32LE(), 0x04034B50); cases.push("sprite ZIP and metadata-only token history");
    const zipBytes = await fs.readFile(destination); let apng;
    for (let at = 0; zipBytes.readUInt32LE(at) === 0x04034B50;) {
      const length = zipBytes.readUInt16LE(at + 26), size = zipBytes.readUInt32LE(at + 18), start = at + 30 + length;
      if (zipBytes.toString("utf8", at + 30, start) === "preview.apng") apng = zipBytes.subarray(start, start + size);
      at = start + size;
    }
    const decoded = await page.evaluate(async bytes => {
      const decoder = new ImageDecoder({ data: new Uint8Array(bytes), type: "image/png" }); await decoder.tracks.ready;
      const frames = [];
      for (let i = 0; i < decoder.tracks.selectedTrack.frameCount; i++) {
        const { image } = await decoder.decode({ frameIndex: i }), canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight), context = canvas.getContext("2d");
        context.drawImage(image, 0, 0); frames.push({ rgba: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data), duration: image.duration }); image.close();
      }
      decoder.close(); return frames;
    }, Array.from(apng));
    const { frameAt } = await import("../src/animation.mjs"), { documentRGBA } = await import("../src/core.mjs");
    assert.equal(decoded.length, 4);
    for (let i = 0; i < 4; i++) { assert.deepEqual(decoded[i].rgba, Array.from(documentRGBA(frameAt(applied, i)))); assert.equal(decoded[i].duration, applied.animation.frames[i].duration * 1000); }
    cases.push("Chromium decodes every APNG frame with exact pixels and timing");
    const dockedHost = (await page.evaluate(() => window.pixeltool.workspaceState())).host;
    await app.evaluate(({ BrowserWindow }, host) => BrowserWindow.fromId(host).setContentSize(1100, 740), dockedHost);
    const reachable = async (surface, selector) => {
      await surface.locator(selector).scrollIntoViewIfNeeded();
      const result = await surface.locator(selector).evaluate(el => {
        const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { hit: hit === el || el.contains(hit), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
      });
      assert.deepEqual(result, { hit: true, inside: true }, selector);
    };
    const setBottom = async height => {
      const handle = page.locator('[data-resize-dock="bottom"]'), r = await handle.boundingBox(), current = Number(await handle.getAttribute("aria-valuenow"));
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 + current - height); await page.mouse.up();
      assert.equal(Number(await handle.getAttribute("aria-valuenow")), height);
    };
    await generateMotion(); await page.locator("#animation-review").waitFor({ state: "visible" });
    await setBottom(100);
    for (const selector of ["#motion-apply", "#motion-discard", "#motion-replacement-note", '.animation-frame[data-frame="1"]']) await reachable(page, selector);
    assert.equal(await page.locator("#animation-panel").evaluate(el => getComputedStyle(el).overflowY), "auto");
    await page.locator("#motion-discard").click(); await setBottom(220);
    cases.push("minimum-height proposal keeps replacement notice and apply/discard reachable");
    assert.equal(await page.locator("#animation-grid canvas").count(), 0);
    for (const height of [220, 140, 100]) {
      await setBottom(height);
      for (const id of ["animation-previous", "animation-play", "animation-next", "animation-loop", "animation-onion", "animation-add", "animation-delete", "animation-duration", "motion-open", "animation-more"]) await reachable(page, "#" + id);
      await reachable(page, '.animation-cel[data-frame="0"]');
      assert.equal(await page.locator("#animation-panel").evaluate(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1), false);
    }
    await setBottom(220);
    const scrubOriginal = JSON.stringify(await saved(doc => doc.animation.frames.length === 4));
    const first = await page.locator('.animation-frame[data-frame="0"]').boundingBox(), last = await page.locator('.animation-frame[data-frame="3"]').boundingBox();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down();
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
    assert.equal(await page.locator("#animation-position").textContent(), "4 / 4");
    assert.equal(JSON.stringify(await saved(doc => doc.animation.frames.length === 4)), scrubOriginal);
    await page.keyboard.press("Escape"); await page.mouse.up(); assert.deepEqual(await pixels(), original);
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down();
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2); await page.mouse.up();
    await saved(doc => doc.animation.active === 3);
    await page.locator('.animation-frame[data-frame="0"]').click(); await saved(doc => doc.animation.active === 0);
    for (const language of ["ko", "en", "ja", "zh-CN", "es", "fr", "de"]) {
      await page.evaluate(async language => { const s = await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({ ...s.preferences, language }); }, language);
      await page.waitForFunction(language => document.documentElement.lang === language, language);
      for (const id of ["animation-play", "animation-add", "motion-open", "animation-more"]) {
        assert.equal(await page.locator("#" + id + " [data-icon]").count(), 1, language + id);
        assert.ok(await page.locator("#" + id).getAttribute("aria-label"));
        await reachable(page, "#" + id);
      }
      await page.locator("#motion-open").click(); await reachable(page, "#motion-generate");
      const popup = await page.locator("#motion-panel").boundingBox(), panel = await page.locator("#animation-panel").boundingBox();
      assert.ok(popup.y < panel.y, "Bottom-docked AI form opens above the panel");
      await page.keyboard.press("Escape"); assert.equal(await page.locator("#motion-open").evaluate(el => el === document.activeElement), true);
      await page.locator("#animation-more").click();
      await page.waitForFunction(() => document.getElementById("animation-menu").contains(document.activeElement));
      await page.keyboard.press("End");
      assert.equal(await page.locator("#animation-export").evaluate(el => el === document.activeElement), true);
      await page.keyboard.press("Escape");
    }
    await page.evaluate(async () => { const s = await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({ ...s.preferences, language: "ko" }); });
    await page.waitForFunction(() => document.documentElement.lang === "ko");
    await page.locator(".toast").waitFor({ state: "hidden" });
    await page.locator(".ai-scroll").evaluate(el=>el.scrollTop=0);
    await page.locator("#animation-position").click(); await page.mouse.move(0,0);
    await page.screenshot({ path: path.join(root, "artifacts", "timeline-review", "docked.png") });
    await page.locator("#motion-open").click();
    await page.locator("#motion-panel").evaluate(async el => {
      await Promise.all(el.getAnimations().map(animation => animation.finished));
    });
    assert.equal(await page.locator("#motion-panel").evaluate(el => getComputedStyle(el).opacity), "1");
    await page.screenshot({ path: path.join(root, "artifacts", "timeline-review", "motion-popover.png") }); await page.keyboard.press("Escape");
    await page.evaluate(async () => { const s=await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({...s.preferences,theme:"light"}); });
    await page.waitForFunction(()=>document.documentElement.dataset.theme==="light");
    for(const selector of ["#animation-play","#animation-loop",'.animation-frame[data-frame="1"]',"#motion-open"])await reachable(page,selector);
    await page.mouse.move(0,0);await page.screenshot({path:path.join(root,"artifacts","timeline-review","docked-light.png")});
    await page.locator("#panel-layout-menu > summary").click();await page.locator('[data-show-panel="layers"]').click();
    await reachable(page,"#layer-duplicate");await page.mouse.move(0,0);await page.screenshot({path:path.join(root,"artifacts","timeline-review","layers-light.png")});
    await page.evaluate(async () => { const s=await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({...s.preferences,theme:"dark"}); });
    await page.waitForFunction(()=>document.documentElement.dataset.theme==="dark");
    await page.screenshot({path:path.join(root,"artifacts","timeline-review","layers-dark.png")});
    await page.locator("#panel-layout-menu > summary").click();await page.locator('[data-show-panel="animation"]').click();
    cases.push("bottom dock at 220/140/100px, scrub preview/cancel/commit, accessible icons and seven-language popovers");
    const group = page.locator('.dock-group:has(.dock-tab[data-panel="animation"])');
    await group.locator(".dock-panel-menu > summary").click();
    const opened = app.waitForEvent("window"); opened.catch(() => {}); await group.locator('[data-move-panel="window"]').click();
    const native = await opened; native.setDefaultTimeout(10000); await native.waitForSelector("#animation-panel");
    assert.equal(await native.locator("#motion-prompt").inputValue(), "Breathe gently and keep feet planted");
    const host = (await page.evaluate(() => window.pixeltool.workspaceState())).host;
    await app.evaluate(({ BrowserWindow }, host) => BrowserWindow.fromId(host).setContentSize(1100, 740), host);
    for (const language of ["ko", "en", "ja", "zh-CN", "es", "fr", "de"]) {
      await page.evaluate(async language => { const s = await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({ ...s.preferences, language }); }, language);
      await native.waitForFunction(language => document.documentElement.lang === language, language);
      await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === url).setContentSize(320, 240), native.url());
      for (const selector of ["#animation-play", "#animation-add", "#motion-generate", "#animation-export"]) {
        if (selector === "#motion-generate") await native.locator("#motion-open").click();
        if (selector === "#animation-export") await native.locator("#animation-more").click();
        await native.locator(selector).scrollIntoViewIfNeeded();
        const reach = await native.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, hit: hit === el || el.contains(hit), actual: hit?.outerHTML.slice(0, 250), viewport: [innerWidth, innerHeight] }; });
        if (!reach.hit) await native.screenshot({ path: path.join(root, "artifacts", "animation-native-failure.png") });
        assert.ok(reach.width > 0 && reach.x >= 0 && reach.right <= reach.viewport[0] + 1 && reach.bottom <= reach.viewport[1] + 1 && reach.hit, language + selector + JSON.stringify(reach));
        if (["#motion-generate", "#animation-export"].includes(selector)) {
          await native.keyboard.press("Escape");
          assert.equal(await native.locator(selector === "#motion-generate" ? "#motion-open" : "#animation-more").evaluate(el => el === document.activeElement), true);
        }
      }
      assert.equal(await native.locator("#animation-panel").evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
      if (language !== "ko") assert.doesNotMatch(await native.locator("#animation-panel").innerText(), /[가-힣]/);
    }
    await page.evaluate(async () => { const s = await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({ ...s.preferences, language: "ko" }); });
    await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === url).setContentSize(760, 600), native.url());
    await native.locator("#animation-panel").evaluate(el => el.scrollTop = 0); await native.screenshot({ path: path.join(root, "artifacts", "animation-native.png") });
    await native.locator("#native-panel-return").click(); await page.locator("#animation-panel").waitFor({ state: "visible" }); cases.push("detached timeline, retained input and seven-language narrow layouts");
    const beforeCancel = JSON.stringify(await saved(doc => doc.animation?.frames.length === 4));
    await app.evaluate((_electron, plan) => {
      globalThis.fetch = async () => new Promise(resolve => {
        globalThis.__finishCanceledMotion = () => resolve(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(plan) }] }] }));
      });
    }, plan);
    await generateMotion(); await page.locator("#motion-cancel").waitFor({ state: "visible" });
    assert.equal(await page.locator("#motion-cancel [data-icon]").getAttribute("data-icon"),"stop");
    assert.ok((await page.locator("#motion-cancel").textContent()).trim(),"AI stop has a visible action label distinct from playback controls");
    await page.locator("#motion-cancel").click();
    await app.evaluate(() => globalThis.__finishCanceledMotion());
    await page.waitForFunction(() => !document.body.classList.contains("busy"));
    assert.equal(await page.locator("#animation-review").isVisible(), false);
    assert.equal(JSON.stringify(await saved(doc => doc.animation?.frames.length === 4)), beforeCancel); cases.push("cancellation rejects late responses");
    const projectFile = path.join(profile, "animation.pixeltool");
    await app.evaluate(({ dialog }, projectFile) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: projectFile }); }, projectFile);
    await page.locator("#save-btn").click();
    const projectSaved = Date.now() + 10000;
    while (Date.now() < projectSaved) { try { if (JSON.parse(await fs.readFile(projectFile, "utf8")).version === 3) break; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.equal(validateDocument(JSON.parse(await fs.readFile(projectFile))).animation.frames.length, 4); cases.push("version-three project save");
    await page.locator("#animation-panel").evaluate(el => el.scrollTop = 0); await page.screenshot({ path: path.join(root, "artifacts", "animation-editor.png") });
    const final = JSON.stringify(await saved(doc => doc.animation?.frames.length === 4));
    await app.close(); app = await launch(); page = await require("./first-editor.cjs")(app); await require("./editor-ready.cjs")(page);
    assert.equal(JSON.stringify(await saved(doc => doc.animation?.frames.length === 4)), final); cases.push("restart recovery");
    assert.ok((await page.evaluate(() => window.pixeltool.transmissionHistory())).entries.some(entry => entry.mode === "animation" && entry.frames === 4 && entry.calls === 2));
    assert.deepEqual(errors, []); failed = false;
    console.log("PASS: " + cases.join("; "));
  } finally {
    if (failed && page && !page.isClosed()) await page.screenshot({ path: path.join(root, "artifacts", "animation-failure.png") }).catch(() => {});
    await fs.writeFile(path.join(root, "artifacts", "animation-desktop-results.json"), JSON.stringify({ passed: !failed, cases, errors }, null, 2));
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
