if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."), profile = await require("./test-runner.cjs").createProfile("ui-copy-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(32, 32, "그림・이름 · KEEP 日本語")); doc.pixels[33] = 7;
  doc.layers[0].name = "레이어・이름 · KEEP";
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: require("electron"), args: [root], env });
  let page, failed = true; const errors = [], cases = [];
  app.on("window", p => p.on("pageerror", error => errors.push(error.message)));
  const checkHelp = async (surface, id, { dialog, language = "ko", hover = false } = {}) => {
    const trigger = surface.locator(`[popovertarget="${id}"]`), popup = surface.locator("#" + id);
    await trigger.scrollIntoViewIfNeeded();
    const appearance = await trigger.evaluate(el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return { border: s.borderTopWidth, radius: s.borderRadius, background: s.backgroundColor, width: r.width, height: r.height };
    });
    assert.equal(appearance.border, "0px"); assert.equal(appearance.radius, "0px");
    assert.equal(appearance.background, "rgba(0, 0, 0, 0)");
    assert.ok(appearance.width >= 24 && appearance.height >= 24, "Bare help retains an accessible hit target");
    if (hover) { await surface.mouse.move(0, 0); await trigger.hover(); }
    else if (await trigger.evaluate(el => el.ownerDocument.activeElement === el)) await trigger.press("Space");
    else await trigger.focus();
    await surface.waitForFunction(id => document.getElementById(id).matches(":popover-open"), id);
    const result = await popup.evaluate(el => {
      const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + 12);
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight,
        text: el.innerText, reachable: el === hit || el.contains(hit), overflow: el.scrollWidth > el.clientWidth + 1 };
    });
    assert.ok(result.x >= 0 && result.y >= 0 && result.right <= result.width && result.bottom <= result.height, JSON.stringify(result));
    assert.ok(result.reachable); assert.equal(result.overflow, false);
    assert.doesNotMatch(result.text, /[\u30fb\u00b7\u2219\u2022\u2027\u22c5]/u);
    const anchor = await trigger.boundingBox();
    assert.ok(result.bottom <= anchor.y || result.y >= anchor.y + anchor.height, "Help must leave its trigger exposed");
    assert.ok((await trigger.getAttribute("aria-label")).length > 3);
    if (language !== "ko") {
      assert.doesNotMatch(result.text, /[가-힣]/, id + "/" + language);
      assert.doesNotMatch(await trigger.getAttribute("aria-label"), /[가-힣]/);
    }
    // Help consumes Escape. The underlying form, selection and work stay open.
    await surface.keyboard.press("Escape");
    assert.equal(await popup.evaluate(el => el.matches(":popover-open")), false);
    if (dialog) assert.ok(await surface.locator(dialog).evaluate(el => el.open));
    cases.push({ id, language, surface: surface === page ? "main" : "native", status: "pass" });
  };
  try {
    page = await require("./first-editor.cjs")(app); page.on("pageerror", error => errors.push(error.message));
    await require("./editor-ready.cjs")(page); page.setDefaultTimeout(7000);
    await app.evaluate(() => { globalThis.__copyNetworkCalls = 0; globalThis.fetch = async () => { globalThis.__copyNetworkCalls++; throw Error("Unexpected network request"); }; });
    assert.equal(await page.locator("#generate-label").textContent(),"AI 연결 설정");
    assert.equal(await page.locator('#generate-btn [data-icon="settings"]').count(),1);
    await page.locator("#generate-btn").click();
    assert.ok(await page.locator("#settings-dialog").isVisible());
    assert.equal(await page.locator("#settings-tab-ai").getAttribute("aria-selected"),"true");
    await page.keyboard.press("Escape");
    await require("./configure-test-api.cjs")(page);
    await page.waitForFunction(()=>document.getElementById("generate-label").textContent==="AI 수정안 만들기");
    assert.equal(await page.locator('#generate-btn [data-icon="spark"]').count(),1);
    const host = (await page.evaluate(() => window.pixeltool.workspaceState())).host;
    await app.evaluate(({ BrowserWindow }, host) => BrowserWindow.fromId(host).setContentSize(1100, 740), host);
    const pixels = () => page.locator("#pixel-canvas").evaluate(c => Array.from(c.getContext("2d").getImageData(0, 0, c.width, c.height).data));
    const original = await pixels(), prompt = "내 요청・KEEP · {0} 日本語";
    await page.locator("#prompt").fill(prompt);
    await page.locator("#overlay-canvas").focus(); await page.keyboard.press("Control+a");
    const selection = await page.locator("#selection-summary").textContent();
    for (const language of ["ko", "en", "ja", "zh-CN", "es", "fr", "de"]) {
      await page.evaluate(async language => { const s = await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({ ...s.preferences, language }); }, language);
      await page.waitForFunction(language => document.documentElement.lang === language, language);
      if(!await page.locator("#ai-options").evaluate(el=>el.open))await page.locator("#ai-options > summary").click();
      await page.locator("#ai-palette").selectOption("existing");
      await page.locator("#ai-shape").selectOption("preserve");
      const expected=await page.evaluate(()=>[document.querySelector('#ai-palette option:checked').textContent.trim(),document.querySelector('#ai-shape option:checked').textContent.trim()].join(', '));
      await page.locator("#ai-options > summary").click();
      assert.equal(await page.locator("#ai-options-summary").textContent(),expected);
      assert.equal(await page.locator("#ai-options-summary").getAttribute("title"),expected);
      const bounds=await page.locator("#ai-options-summary").evaluate(el=>({right:el.getBoundingClientRect().right,parent:el.parentElement.getBoundingClientRect().right,overflow:el.parentElement.scrollWidth>el.parentElement.clientWidth+1}));
      assert.ok(bounds.right<=bounds.parent+1&&!bounds.overflow,language+" collapsed option summary");
      await page.locator("#ai-options > summary").click();
      await page.locator("#ai-palette").selectOption("new");await page.locator("#ai-shape").selectOption("change");
      await page.locator("#ai-options > summary").click();
      if(language!=="ko")assert.doesNotMatch(await page.locator(".ai-footer").innerText(),/[가-힣]/,"Footer labels and scope stay translated");
      assert.ok(await page.locator("#quality-request-note").isVisible());
      await page.locator("#ai-economy").check();
      assert.ok(await page.locator("#quality-request-note").isHidden());
      assert.match(await page.locator("#transmission-summary").textContent(),/64×64/);
      await page.locator("#ai-economy").uncheck();
      await checkHelp(page, "economy-help", { language, hover: true });
      await checkHelp(page, "edit-mode-help", { language });
      await page.locator("#ai-edit-mode").selectOption("whole");
      assert.ok(await page.locator("#advanced-generation-note").isVisible());
      assert.ok(await page.locator("#quality-request-note").isHidden());
      assert.doesNotMatch(await page.locator("#transmission-summary").textContent(),/64×64/);
      await page.locator("#transmission-details").click();
      assert.ok(await page.locator("#transmission-advanced").isVisible());
      await page.keyboard.press("Escape");
      await checkHelp(page, "edit-mode-help", { language });
      await page.locator("#ai-edit-mode").selectOption("precise");
      assert.ok(await page.locator("#quality-request-note").isVisible());
      await page.locator("#settings-btn").click();
      for (const [tab, ids] of Object.entries({ storage: ["recovery-storage-help"], editor: ["modifier-help", "history-memory-help"], display: ["display-preferences-help", "live-preview-help"], ai: ["model-requirements-help"] })) {
        await page.locator("#settings-tab-" + tab).click();
        for (const id of ids) await checkHelp(page, id, { language, dialog: "#settings-dialog" });
      }
      await page.locator("#settings-dialog .dialog-close").first().click();
      await page.locator("#request-history-open").click();
      await checkHelp(page, "token-accounting-help", { language, dialog: "#request-history-dialog" });
      await page.locator("#request-history-dialog .dialog-close").click();
    }
    await page.evaluate(async () => { const s = await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({ ...s.preferences, language: "ko", showHints: false }); });
    assert.ok(await page.locator("#transmission-summary").isVisible(), "Data transmission remains visible when optional hints are off");
    // Touch/click pins help while moving to its scrollable content; outside click dismisses it.
    const trigger = page.locator('[popovertarget="edit-mode-help"]');
    await trigger.click(); await page.locator("#edit-mode-help").hover();
    assert.ok(await page.locator("#edit-mode-help").evaluate(el => el.matches(":popover-open")));
    await trigger.click();
    assert.equal(await page.locator("#edit-mode-help").evaluate(el => el.matches(":popover-open")), false);
    await trigger.click();
    await page.locator("#prompt").click();
    assert.equal(await page.locator("#edit-mode-help").evaluate(el => el.matches(":popover-open")), false);
    await page.screenshot({ path: path.join(root, "artifacts/ui-copy-main.png") });
    await page.locator("#settings-btn").click(); await page.locator("#settings-tab-display").click();
    await page.locator("#settings-dialog").evaluate(async el => {
      await Promise.all(el.getAnimations().map(animation => animation.finished));
    });
    await page.screenshot({ path: path.join(root, "artifacts/ui-copy-settings.png") });
    await page.locator("#settings-dialog .dialog-close").first().click();
    const group = page.locator('.dock-group:has(.dock-tab[data-panel="ai"])');
    await group.locator(".dock-panel-menu > summary").click();
    const opened = app.waitForEvent("window"); opened.catch(() => {});
    await group.locator('[data-move-panel="window"]').click(); const panel = await opened;
    panel.setDefaultTimeout(7000);
    await panel.waitForSelector("#native-panel-return");
    // Bringing a retained WebContentsView forward does not activate its OS host.
    const ownerHost = (await page.evaluate(() => window.pixeltool.workspaceState())).host;
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).focus(), ownerHost);
    await panel.waitForFunction(()=>document.documentElement.hasAttribute("data-ui-inactive"));
    await app.evaluate(({ BrowserWindow }, url) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === url);
      win.focus(); win.webContents.focus();
    }, panel.url());
    await panel.waitForFunction(()=>!document.documentElement.hasAttribute("data-ui-inactive"));
    await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === url).setContentSize(320, 240), panel.url());
    await checkHelp(panel, "edit-mode-help", { hover: true });
    await checkHelp(panel, "economy-help");
    await panel.locator('[popovertarget="edit-mode-help"]').focus();
    await panel.keyboard.press("Tab");
    assert.equal(await panel.evaluate(() => document.activeElement.id), "edit-mode-help");
    await panel.keyboard.press("End");
    await panel.waitForFunction(() => { const p = document.getElementById("edit-mode-help"); return p.scrollHeight <= p.clientHeight || p.scrollTop > 0; });
    await panel.locator("#edit-mode-help").evaluate(el => el.scrollTop = 0);
    await panel.locator("#edit-mode-help").evaluate(async el => {
      await Promise.all(el.getAnimations().map(animation => animation.finished));
    });
    assert.equal(await panel.locator("#edit-mode-help").evaluate(el => getComputedStyle(el).opacity), "1");
    await panel.screenshot({ path: path.join(root, "artifacts/ui-copy-native-help.png") });
    await panel.keyboard.press("Escape");
    assert.ok(await panel.locator('[popovertarget="edit-mode-help"]').evaluate(el => el.ownerDocument.activeElement === el), "Escape returns keyboard focus to the help trigger");
    assert.equal(await panel.locator("#edit-mode-help").evaluate(el => el.matches(":popover-open")), false);
    await panel.locator("#native-panel-return").click();
    assert.equal(await page.locator("#prompt").inputValue(), prompt);
    assert.equal(await page.locator("#doc-name").inputValue(), doc.name);
    assert.equal(await page.locator(".layer-select").textContent(), doc.layers[0].name);
    assert.equal(await page.locator("#selection-summary").textContent(), selection);
    assert.equal(await page.locator("body").evaluate(el => el.classList.contains("space-pan")), false);
    assert.deepEqual(await pixels(), original);
    assert.equal(await app.evaluate(() => globalThis.__copyNetworkCalls), 0);
    assert.deepEqual(errors, []); failed = false;
    console.log(`PASS: ${cases.length} contextual help cases; seven languages, modal Escape, hover/focus/click, 320x240 native adoption, visible data notice and unchanged artwork/input; no network calls.`);
  } finally {
    await fs.writeFile(path.join(root, "artifacts/ui-copy-results.json"), JSON.stringify({ passed: !failed, cases, errors }, null, 2));
    if (failed && page) await page.screenshot({ path: path.join(root, "artifacts/ui-copy-failure.png") }).catch(() => {});
    if (failed) await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); else await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
