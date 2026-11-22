if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."), evidence = path.join(root, "artifacts/interface-review");
  await fs.mkdir(evidence, { recursive: true });
  const profile = await require("./test-runner.cjs").createProfile("interface-review-");
  const { createDocument, ensureLayers } = await import("../src/core.mjs");
  const doc = ensureLayers(createDocument(32, 32, "Review fixture"));
  for (let y = 8; y < 26; y++) for (let x = 8; x < 24; x++)
    doc.pixels[y * 32 + x] = x === 8 || x === 23 || y === 8 || y === 25 ? 3 : x < 13 ? 10 : 7;
  await fs.writeFile(path.join(profile, "draft.json"), JSON.stringify(doc));
  const env = { ...process.env, PIXELTOOL_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: require("electron"), args: [root], env });
  let page, failed = true; const results = { dialogs: [], unnamedControls: [], views: [], buttons: [], errors: [] };
  const unnamedControls = nodes => nodes.filter(el => {
    if (el.type === "hidden" || el.closest("[hidden],[aria-hidden=true]")) return false;
    const labelled = (el.getAttribute("aria-labelledby") || "").split(/\s+/).some(id => el.ownerDocument.getElementById(id)?.textContent.trim());
    return !labelled && !el.getAttribute("aria-label") && !el.title &&
      ![...(el.labels || [])].some(l => l.textContent.trim()) &&
      !el.textContent.trim() && !el.querySelector("img[alt]")?.alt && !el.placeholder;
  }).map(el => ({ id: el.id, tag: el.tagName, type: el.type, html: el.outerHTML.slice(0, 200) }));
  app.on("window", p => p.on("pageerror", e => results.errors.push(e.message)));
  try {
    page = await require("./first-editor.cjs")(app); await require("./editor-ready.cjs")(page);
    page.setDefaultTimeout(8000); page.on("pageerror", e => results.errors.push(e.message));
    results.dialogs = await page.locator("dialog").evaluateAll(nodes => nodes.map(el => ({
      id: el.id, title: el.querySelector("h2")?.textContent.trim(),
      name: el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") || "").split(/\s+/).map(id => el.ownerDocument.getElementById(id)?.textContent.trim() || "").join(" ").trim(),
    })));
    results.unnamedControls = await page.locator("button,input,select,textarea,canvas[tabindex]").evaluateAll(unnamedControls);
    await fs.writeFile(path.join(evidence, "inventory.json"), JSON.stringify(results, null, 2));
    assert.deepEqual(results.dialogs.filter(d => !d.name), [], "Every dialog needs an accessible name");
    assert.deepEqual(results.unnamedControls, [], "Every control needs an accessible name");
    const host = (await page.evaluate(() => window.pixeltool.workspaceState())).host;
    await app.evaluate(({ BrowserWindow }, host) => BrowserWindow.fromId(host).setContentSize(1100, 740), host);
    const pixels = () => page.locator("#pixel-canvas").evaluate(c => Array.from(c.getContext("2d").getImageData(0, 0, c.width, c.height).data));
    const before = await pixels();
    const originalPage = page;
    const originalWork = (await page.evaluate(() => window.pixeltool.workspaceState())).id;
    const revealControl = async id => {
      const control = page.locator("#" + id);
      let collapsed = control.locator("xpath=ancestor::details[not(@open)]");
      while (await collapsed.count()) await collapsed.first().locator(":scope > summary").click();
      return control;
    };
    const clickControl = async id => (await revealControl(id)).click();
    const auditButtons = async (surface, context) => {
      const buttons=await surface.locator("button[data-action-role]").evaluateAll(nodes=>nodes.map(el=>{
        const icon=el.querySelector("[data-icon]"),svg=icon?.querySelector("svg"),r=icon?.getBoundingClientRect();
        return {id:el.id,role:el.dataset.actionRole,label:el.textContent.trim(),name:el.getAttribute("aria-label"),icon:icon?.dataset.icon,
          pixel:svg?.getAttribute("shape-rendering")==="crispEdges"&&svg?.getAttribute("viewBox")==="0 0 16 16",
          visible:!!el.getClientRects().length,overflow:el.scrollWidth>el.clientWidth+1,
          iconWidth:r?.width,iconHeight:r?.height};
      }));
      for(const button of buttons) {
        assert.ok(button.pixel,context+": "+JSON.stringify(button)+" keeps its source-grid icon after rendering and translation");
        assert.ok(button.label||button.name,context+": an icon must retain an accessible action name");
        if(button.visible) {
          assert.equal(button.overflow,false,context+": "+JSON.stringify(button));
          assert.equal(button.iconWidth,16,context+": native pixel icon width");
          assert.equal(button.iconHeight,16,context+": native pixel icon height");
        }
      }
      results.buttons.push({context,buttons});
    };
    await auditButtons(page,"mounted editor");
    const checkDialog = async (id, context) => {
      const modal = page.locator("#" + id); await modal.waitFor({ state: "visible" });
      assert.ok(await modal.evaluate(e => e.open));
      assert.deepEqual(await modal.locator("button,input,select,textarea,canvas[tabindex]").evaluateAll(unnamedControls), [], id + " dynamic control names");
      const bounds = await modal.evaluate(e => {
        const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, overflow: e.scrollWidth > e.clientWidth + 1 };
      });
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.right <= bounds.width + 1 && bounds.bottom <= bounds.height + 1, id + JSON.stringify(bounds));
      assert.equal(bounds.overflow, false, id + "/" + context);
      await auditButtons(modal,id+"/"+context);
      for (const list of await modal.locator("ul").all())
        assert.equal(await list.evaluate(e => getComputedStyle(e).listStyleType), "none", id + " browser list markers");
      if (context === "ko" || context.endsWith("/fixture") || (id === "ramp-dialog" && context === "fr"))
        await page.screenshot({ path: path.join(evidence, id + (context === "fr" ? "-fr" : "") + ".png"), animations:"disabled" });
      const close = modal.locator('button.dialog-close,button[data-close-layer-dialog],button[data-close-document-dialog],button[id$="cancel"],#command-close').first();
      if (await close.count()) {
        await close.scrollIntoViewIfNeeded();
        assert.ok(await close.evaluate(e => { const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === hit || e.contains(hit); }), id + " close action");
      }
      await page.keyboard.press("Escape");
      assert.equal(await modal.evaluate(e => e.open), false, id + " Escape");
      results.views.push({ id, context, status: "pass" });
    };
    assert.equal((await page.locator("#model-label").textContent()).trim(), "모델 선택");
    assert.equal((await page.locator("#transmission-summary").textContent()).trim(), "AI 서비스가 연결되지 않았습니다.");
    await page.locator("#transmission-details").click();
    assert.ok(await page.locator("#transmission-provider").isHidden());
    assert.doesNotMatch(await page.locator("#transmission-dialog").innerText(), /\bundefined\b|\bnone\b/);
    await checkDialog("transmission-dialog", "offline");
    await app.evaluate(() => { globalThis.__reviewNetworkCalls = 0; globalThis.fetch = async () => { globalThis.__reviewNetworkCalls++; throw Error("Unexpected live call"); }; });
    await require("./configure-test-api.cjs")(page);
    for (const language of ["ko", "en", "ja", "zh-CN", "es", "fr", "de"]) {
      await page.evaluate(async language => { const s = await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({ ...s.preferences, language }); }, language);
      await page.waitForFunction(language => document.documentElement.lang === language, language);
      if (!await page.locator("#ai-options").evaluate(e => e.open)) await page.locator("#ai-options > summary").click();
      const quality = await page.locator("#ai-quality").inputValue();
      await page.locator("#ai-economy").check();
      assert.ok(await page.locator("#ai-quality-effective").isVisible());
      assert.ok(await page.locator("#ai-quality").isDisabled());
      await page.locator("#ai-economy").uncheck();
      assert.ok(await page.locator("#ai-quality-effective").isHidden());
      assert.equal(await page.locator("#ai-quality").inputValue(), quality);
      await page.locator("#ai-edit-mode").selectOption("whole");
      assert.ok(await page.locator("#ai-quality-effective").isVisible());
      await page.locator("#transmission-details").click();
      assert.ok(await page.locator("#transmission-advanced").isVisible());
      if (language !== "ko") assert.doesNotMatch(await page.locator("#transmission-dialog").innerText(), /[가-힣]/);
      await checkDialog("transmission-dialog", language + "/whole");
      await page.locator("#ai-edit-mode").selectOption("precise");
      for (const [trigger, id] of [["new-btn", "new-dialog"], ["script-open", "script-dialog"], ["help-btn", "help-dialog"], ["ramp-edit", "ramp-dialog"], ["palette-library-open", "palette-library-dialog"], ["refine-open", "refine-dialog"], ["geometry-open", "geometry-dialog"], ["layer-mask-open", "layer-mask-dialog"], ["request-history-open", "request-history-dialog"]]) {
        await clickControl(trigger);
        if(id === "script-dialog" && language === "ko") {
          await page.locator("#script-name").fill("Review fixture tool");
          await page.locator("#script-save").click();
          assert.equal((await page.locator("#script-revert").textContent()).trim(),"저장본 복원");
        }
        await checkDialog(id, language);
      }
      for (const [trigger, id] of [["recovery-open", "recovery-dialog"], ["resize-open", "resize-dialog"], ["image-size-open", "image-size-dialog"], ["palette-cleanup-open", "palette-cleanup-dialog"], ["project-context-open", "context-dialog"]]) {
        await page.locator("#file-more > summary").click(); await page.locator("#" + trigger).click(); await checkDialog(id, language);
      }
      await page.locator("#settings-btn").click(); await page.locator("#settings-tab-editor").click();
      await page.locator("#shortcut-open").click(); await checkDialog("shortcut-dialog", language);
      await checkDialog("settings-dialog", language);
      await page.locator("#used-tab").click(); await page.locator(".used-color").first().click();
      await checkDialog("replace-dialog", language); await page.locator("#palette-tab").click();
      await page.locator("#layer-more").selectOption("align"); await checkDialog("layer-align-dialog", language);
      await page.locator(".layer-select").first().click({ button: "right" }); await checkDialog("layer-context-menu", language);
      await page.locator("#command-search").click(); await page.locator("#command-query").fill("zzzz-nothing");
      assert.ok(await page.locator("#command-empty").isVisible()); await checkDialog("command-dialog", language);
      await page.evaluate(async () => { const s = await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({ ...s.preferences, rightButton: "picker" }); });
      await page.locator("#help-btn").click();
      assert.notEqual((await page.locator("#help-mouse-action").textContent()).trim(), "왼쪽 / 오른쪽 색으로 그리기");
      if (language !== "ko") assert.doesNotMatch(await page.locator("#help-dialog").innerText(), /[가-힣]/);
      await checkDialog("help-dialog", language + "/picker");
      await page.evaluate(async () => { const s = await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({ ...s.preferences, rightButton: "secondary" }); });
      if (language === "ko") {
        await page.screenshot({ path: path.join(evidence, "editor.png") });
        await page.locator("#transmission-details").click();
        await page.screenshot({ path: path.join(evidence, "transmission.png") }); await checkDialog("transmission-dialog", "capture");
      }
    }
    assert.deepEqual(await pixels(), before);
    results.controlCount = await page.locator("button,input,select,textarea,canvas[tabindex]").count();
    assert.equal(await app.evaluate(() => globalThis.__reviewNetworkCalls), 0);
    await page.evaluate(async () => { const s = await window.pixeltool.getSettings(); await window.pixeltool.savePreferences({ ...s.preferences, language: "ko" }); });
    // Proposal-only fixture, generated response and no live provider call.
    await app.evaluate(() => {
      globalThis.fetch = async (_url, options) => {
        globalThis.__reviewNetworkCalls++;
        const segments = JSON.parse(JSON.parse(options.body).input[0].content[0].text).editable_segments;
        const proposal = {
          summary: "Review proposal", new_colors: [],
          segments: [{ id: segments[0].id, colors: Array.from({ length: segments[0].length }, (_, i) => i === 0 ? 7 : null) }],
          roles: [{ id: segments[0].id, roles: "b" + ".".repeat(segments[0].length - 1), materials: "a" + ".".repeat(segments[0].length - 1), faces: "a" + ".".repeat(segments[0].length - 1) }],
        };
        return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }] });
      };
    });
    await page.locator("#ai-quality").selectOption("check"); await page.locator("#prompt").fill("Review fixture pixel");
    await page.locator("#generate-btn").click(); await page.locator("#proposal-card").waitFor({ state: "visible" });
    await page.evaluate(() => window.pixeltool.saveSettings({ provider: "anthropic", model: "fixture-model", key: "fixture-session-only", remember: false }));
    await clickControl("submitted-transmission");
    assert.match(await page.locator("#transmission-provider").textContent(), /OpenAI API/);
    await checkDialog("transmission-dialog", "submitted-provider/fixture");
    await require("./configure-test-api.cjs")(page);
    await page.locator("#quality-report > summary").click(); await page.locator("#quality-protection-edit").click();
    await checkDialog("quality-protection-dialog", "ko/fixture");
    await page.locator("#discard-btn").click(); assert.deepEqual(await pixels(), before);
    assert.equal(await app.evaluate(() => globalThis.__reviewNetworkCalls), 1);
    const { PNG } = require("pngjs"), image = new PNG({ width: 16, height: 16 }); image.data.fill(255);
    await page.locator("#reference-file").setInputFiles({ name: "generated-review.png", mimeType: "image/png", buffer: PNG.sync.write(image) });
    await checkDialog("reference-dialog", "ko/fixture");
    await clickControl("folder-add"); await page.locator(".folder-select").click(); await checkDialog("folder-dialog", "ko/fixture");
    await page.locator("#undo-btn").click(); assert.deepEqual(await pixels(), before);
    await clickControl("geometry-open"); await page.locator("#geometry-create").click();
    assert.ok(await page.locator('#ai-edit-mode option[value="whole"]').isDisabled());
    await page.locator("#alpha-lock-btn").click(); await page.locator("#overlay-canvas").focus(); await page.keyboard.press("Control+a");
    await (await revealControl("transform-action")).selectOption("flip-x"); await checkDialog("guide-convert-dialog", "ko/fixture");
    for (let i = 0; i < 6 && await page.locator(".layer-select").count() > 1; i++) await page.locator("#undo-btn").click();
    assert.deepEqual(await pixels(), before);
    await page.locator("#overlay-canvas").focus(); await page.keyboard.press("Control+w"); await checkDialog("confirm-dialog", "ko/fixture");
    // Open generated tile documents through the normal creation UI.
    await clickControl("new-btn"); await clickControl("auto-open"); await checkDialog("auto-create-dialog", "ko/fixture");
    await clickControl("new-btn"); await clickControl("auto-open"); await page.locator("#auto-create").click();
    page = await require("./next-editor.cjs")(app, page);
    assert.ok(await page.locator('#ai-edit-mode option[value="whole"]').isDisabled());
    await clickControl("auto-inspect"); await checkDialog("auto-workbench", "ko/fixture");
    await clickControl("new-btn"); await clickControl("tile-open");
    assert.ok(await page.locator("#tile-use-current").isDisabled(), "A guided source cannot be converted in place");
    assert.ok(await page.locator("#tile-create").isEnabled(), "A separate new tile remains available");
    await checkDialog("tile-dialog", "ko/fixture");
    await clickControl("new-btn"); await clickControl("tile-open"); await page.locator("#tile-create").click();
    page = await require("./next-editor.cjs")(app, page);
    assert.ok(await page.locator('#ai-edit-mode option[value="whole"]').isDisabled());
    await page.locator("#inspector-preview").click(); await clickControl("tile-preview-open"); await checkDialog("tile-preview-dialog", "ko/fixture");
    await page.locator(`[data-work-id="${originalWork}"]`).click(); page = originalPage; await require("./editor-ready.cjs")(page);
    assert.deepEqual(await pixels(), before);
    assert.deepEqual([...new Set(results.views.map(v => v.id))].sort(), results.dialogs.map(d => d.id).sort(), "Every dialog type was opened through its UI");
    assert.deepEqual(results.errors, []); failed = false;
    console.log(`PASS: ${results.dialogs.length} named dialogs, complete mounted-control name inventory and ${results.views.length} seven-language dialog views with reachable close actions, bounded layouts, Escape and unchanged artwork.`);
  } finally {
    results.passed = !failed;
    await fs.writeFile(path.join(evidence, "results.json"), JSON.stringify(results, null, 2));
    if (failed && page) await page.screenshot({ path: path.join(evidence, "failure.png") }).catch(() => {});
    if (failed) await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); else await app.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
