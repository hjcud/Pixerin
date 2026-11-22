if(require("./test-runner.cjs").bootstrap(__filename))return;
const {_electron}=require("./test-electron.cjs"),fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict");
(async()=>{
  const root=path.resolve(__dirname,".."),profile=await require("./test-runner.cjs").createProfile("native-panels-");
  const {createDocument,ensureLayers,activeLayer}=await import("../src/core.mjs");
  const doc=ensureLayers(createDocument(16,16,"Native panel fixture"));doc.palette.push("#50A88973");
  for(let y=2;y<6;y++)for(let x=2;x<6;x++)doc.pixels[y*16+x]=16;
  activeLayer(doc).alphaLocked=true;
  await fs.writeFile(path.join(profile,"draft.json"),JSON.stringify(doc));
  const env={...process.env,PIXELTOOL_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  const launch=()=>_electron.launch({executablePath:require("electron"),args:[root],env});
  let app=await launch(),page,failed=true;const errors=[];
  const attach=p=>{p.on("console",m=>{if(["warning","error"].includes(m.type()))console.error("Console:",m.text());});p.on("pageerror",error=>{errors.push(error.message);console.error("Renderer:",error.stack);});};
  app.on("window",attach);app.windows().forEach(attach);
  try {
    page=await require("./first-editor.cjs")(app);await require("./editor-ready.cjs")(page);page.setDefaultTimeout(15000);
    const group=id=>page.locator(`.dock-group:has(.dock-tab[data-panel="${id}"])`);
    const show=async id=>{await page.bringToFront();await page.locator("#panel-layout-menu > summary").click();await page.locator(`[data-show-panel="${id}"]`).click();};
    const detach=async id=>{
      await show(id);await group(id).locator(".dock-panel-menu > summary").click();
      const next=app.waitForEvent("window");next.catch(()=>{});
      await group(id).locator('[data-move-panel="window"]').click();
      const native=await next;native.setDefaultTimeout(15000);await native.waitForSelector("#native-panel-return");return native;
    };
    const close=async native=>{
      const closed=native.waitForEvent("close");closed.catch(()=>{});
      await app.evaluate(({BrowserWindow},url)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url).close(),native.url());
      await closed;
    };
    const pixels=()=>page.locator("#pixel-canvas").evaluate(c=>Array.from(c.getContext("2d").getImageData(0,0,16,16).data));
    const layout=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("pixeltool.ui.panel-layout.v1")));
    const before=await pixels();
    await page.evaluate(()=>{globalThis.originalPanels=Object.fromEntries(["prompt","palette","layer-list","preview-content"].map(id=>[id,document.getElementById(id)]));});
    await page.locator("#prompt").fill("Keep native panel input");
    await page.locator('[data-tool="select"]').click();
    let r=await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.move(r.x+2.5*r.width/16,r.y+2.5*r.height/16);await page.mouse.down();
    await page.mouse.move(r.x+4.5*r.width/16,r.y+4.5*r.height/16);await page.mouse.up();
    const selected=await page.locator("#selection-dimensions").innerText();
    const palette=await detach("palette");
    assert.equal(await page.locator('[data-show-panel="palette"]').getAttribute("data-panel-state"),"window");
    assert.equal(await page.locator("#palette").count(),0);assert.ok(await palette.locator("#palette").isVisible());
    assert.equal(await palette.evaluate(()=>typeof window.pixeltool),"undefined");
    assert.equal(await page.evaluate(()=>globalThis.originalPanels.palette.ownerDocument.URL),palette.url());
    const security=await app.evaluate(({BrowserWindow},url)=>{
      const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url);
      const p=w.webContents.getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration,title:w.getTitle()};
    },palette.url());
    assert.equal(security.sandbox,true);assert.equal(security.contextIsolation,true);assert.equal(security.nodeIntegration,false);assert.match(security.title,/Native panel fixture/);
    await palette.locator("#palette button").nth(12).click();
    await page.bringToFront();await page.locator('[data-tool="pencil"]').click();r=await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.click(r.x+3.5*r.width/16,r.y+3.5*r.height/16);
    assert.notDeepEqual(await pixels(),before);assert.equal((await pixels())[(3*16+3)*4+3],115);
    await palette.bringToFront();await palette.locator("#native-panel-return").focus();await palette.keyboard.press("Control+z");
    assert.deepEqual(await pixels(),before);assert.equal(await page.locator("#selection-dimensions").innerText(),selected);
    // Native bounds can move independently; invalid/offscreen coordinates recover.
    await app.evaluate(({BrowserWindow},url)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url).setBounds({x:120,y:150,width:480,height:570}),palette.url());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem("pixeltool.ui.panel-window-bounds.v1"))?.palette?.width===480);
    await close(palette);await page.waitForSelector("#palette");
    assert.equal(await page.locator('[data-show-panel="palette"]').getAttribute("data-panel-state"),"inside");
    assert.ok(await page.evaluate(()=>document.getElementById("palette")===globalThis.originalPanels.palette));
    const palette2=await detach("palette");
    assert.equal((await app.evaluate(({BrowserWindow},url)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url).getBounds(),palette2.url())).width,480);
    await palette2.locator("#native-panel-return").click();await page.waitForSelector("#palette");
    // All five panel bodies operate as real windows without duplicating state.
    await show("layers");await group("layers").locator(".dock-panel-menu > summary").click();await group("layers").locator('[data-move-panel="float"]').click();
    const tools=await detach("tools"),layers=await detach("layers");
    await app.evaluate(()=>{globalThis.nativeCalls=0;globalThis.fetch=async(_url,{signal})=>{globalThis.nativeCalls++;return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true}));};});
    await require("./configure-test-api.cjs")(page);
    const ai=await detach("ai");
    assert.ok(await page.locator("#preview-content").isVisible());
    // The visible fallback tab owns its menu/close actions, even while the
    // remembered active tab lives in another native window.
    await page.bringToFront();await group("preview").locator(".dock-close").click();
    assert.equal(await page.locator('[data-show-panel="preview"]').getAttribute("data-panel-state"),"closed");
    assert.equal(await page.locator('[data-show-panel="ai"]').getAttribute("data-panel-state"),"window");
    await show("preview");
    await page.bringToFront();await page.locator("#inspector-preview").focus();await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#inspector-preview").getAttribute("aria-selected"),"true");
    assert.equal(await ai.locator("#prompt").inputValue(),"Keep native panel input");
    await ai.locator("#prompt").fill("");
    await ai.locator("#prompt").pressSequentially("Native input must not invoke shortcuts: bee 123");
    assert.ok(await tools.locator('[data-tool="pencil"]').evaluate(el=>el.classList.contains("active")));
    assert.equal(await ai.locator("#prompt").inputValue(),"Native input must not invoke shortcuts: bee 123");
    await ai.locator("#generate-btn").click();await ai.waitForSelector("#cancel-request:not([hidden])");
    const preview=await detach("preview");
    await close(ai);await page.waitForSelector("#cancel-request:not([hidden])");
    const ai2=await detach("ai");await ai2.locator("#cancel-request").click();
    await ai2.waitForSelector("#generate-btn:not([hidden])");assert.equal(await app.evaluate(()=>globalThis.nativeCalls),1);
    assert.deepEqual(await pixels(),before);
    // Layer actions and dynamically rebuilt controls use the same document.
    await layers.locator(".layer-visibility").first().click();assert.notDeepEqual(await pixels(),before);
    await layers.locator(".layer-visibility").first().click();assert.deepEqual(await pixels(),before);
    const originalName=await layers.locator(".layer-select").first().innerText();
    await layers.locator(".layer-select").first().focus();await layers.keyboard.press("F2");
    await layers.locator("#layer-name").fill("Native layer name");await layers.locator("#layer-name").press("Enter");
    assert.equal(await layers.locator(".layer-select").first().innerText(),"Native layer name");
    await layers.keyboard.press("Control+z");assert.equal(await layers.locator(".layer-select").first().innerText(),originalName);
    await tools.locator('[data-tool="pencil"]').click();
    assert.ok(await tools.locator('[data-tool="pencil"]').evaluate(el=>el.classList.contains("active")));
    assert.ok(await preview.locator("#native-preview").isVisible());
    // Shared theme/language and owner dialogs remain usable from detached UI.
    await page.evaluate(async()=>{const s=await window.pixeltool.getSettings();await window.pixeltool.savePreferences({...s.preferences,theme:"light",language:"en"});});
    await ai2.waitForFunction(()=>document.documentElement.dataset.theme==="light"&&document.documentElement.lang==="en");
    assert.equal(await ai2.locator("#native-panel-return").innerText(),"Bring into app");
    await tools.locator("#palette-library-open").count().then(count=>assert.equal(count,0));
    // A detached tool opens the owner's modal and disables remote controls.
    await tools.locator("#help-btn").click();
    await page.waitForSelector("dialog[open]");assert.equal(await layers.evaluate(()=>document.body.inert),true);
    await page.keyboard.press("Escape");await layers.waitForFunction(()=>!document.body.inert);
    await layers.locator(".layer-select").first().click({button:"right"});
    await page.waitForSelector("#layer-context-menu[open]");await page.keyboard.press("Escape");
    await layers.waitForFunction(()=>!document.body.inert);
    assert.equal(await layers.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await fs.mkdir(path.join(root,"artifacts"),{recursive:true});
    await ai2.screenshot({path:path.join(root,"artifacts","native-panel-ai.png")});
    await layers.screenshot({path:path.join(root,"artifacts","native-panel-layers.png")});
    // Header menu focuses the existing window rather than opening a duplicate.
    const count=app.windows().length;await show("ai");assert.equal(app.windows().length,count);
    await show("palette");await group("palette").locator(".dock-close").click();
    assert.equal(await page.locator('[data-show-panel="palette"]').getAttribute("data-panel-state"),"closed");
    await page.locator("#panel-layout-menu > summary").click();await page.locator("#panel-layout-lock").click();await page.keyboard.press("Escape");
    await ai2.bringToFront();await ai2.locator("#generate-btn").click();await ai2.waitForSelector("#cancel-request:not([hidden])");
    const customLayout=await layout();assert.equal(customLayout.locked,true);assert.ok(customLayout.hidden.includes("palette"));
    assert.ok(customLayout.groups["float-layers"].includes("layers"));
    await page.bringToFront();await page.locator("#panel-layout-menu > summary").click();
    assert.equal(await page.locator("#panel-layout-return-all").isEnabled(),true);
    await page.screenshot({path:path.join(root,"artifacts","panel-menu-status.png")});
    await page.locator("#panel-layout-return-all").click();
    await page.waitForSelector("#cancel-request:not([hidden])");assert.deepEqual(await layout(),customLayout);
    assert.equal(await page.locator("#panel-layout-return-all").isDisabled(),true);
    assert.equal(app.windows().filter(p=>p.url().includes("/src/panel.html")).length,0);
    assert.equal(await page.locator("#dock-tab-palette").isVisible(),false);
    assert.equal(await page.locator('[data-show-panel="ai"]').getAttribute("data-panel-state"),"inside");
    await page.locator("#cancel-request").click();await page.waitForSelector("#generate-btn:not([hidden])");
    assert.equal(await app.evaluate(()=>globalThis.nativeCalls),2);assert.deepEqual(await pixels(),before);
    await page.bringToFront();await page.locator("#panel-layout-menu > summary").click();await page.locator("#panel-layout-reset").click();
    await page.waitForFunction(()=>["prompt","palette","layer-list","preview-content"].every(id=>document.getElementById(id)===globalThis.originalPanels[id]));
    assert.equal(app.windows().filter(p=>p.url().includes("/src/panel.html")).length,0);
    assert.deepEqual(await pixels(),before);assert.equal(await page.locator("#prompt").inputValue(),"Native input must not invoke shortcuts: bee 123");
    assert.equal(await page.evaluate(()=>window.open("https://example.com/")===null),true);
    await page.evaluate(()=>{localStorage.setItem("pixeltool.ui.panel-window-bounds.v1",JSON.stringify({palette:{x:-60000,y:-60000,width:60000,height:60000}}));});
    const recovered=await detach("palette");
    assert.ok(await app.evaluate(({BrowserWindow,screen},url)=>{
      const r=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url).getBounds();
      return screen.getAllDisplays().some(({workArea:a})=>r.x>=a.x&&r.y>=a.y&&r.x+r.width<=a.x+a.width&&r.y+r.height<=a.y+a.height);
    },recovered.url()));
    await close(recovered);await page.waitForSelector("#palette");
    // A native panel stays with its originating document across tab switches
    // and work-window transfers, rather than borrowing the active tab's state.
    const originalPage=page,originalId=await page.evaluate(async()=>(await window.pixeltool.workspaceState()).id);
    const ownerAI=await detach("ai");
    const secondId=await page.evaluate(document=>window.pixeltool.createWork({document,saved:true}),createDocument(16,16,"Other native fixture"));
    const other=await require("./next-editor.cjs")(app,page);
    await other.locator("#prompt").fill("Other document input");
    await ownerAI.locator("#prompt").fill("Owner input after tab switch");
    assert.equal(await other.locator("#prompt").inputValue(),"Other document input");
    await other.evaluate(id=>window.pixeltool.workspaceCommand({action:"detach",id}),originalId);
    assert.equal(await ownerAI.locator("#prompt").inputValue(),"Owner input after tab switch");
    assert.deepEqual(await pixels(),before);
    page=other;const otherPreview=await detach("preview"),otherClosed=otherPreview.waitForEvent("close");otherClosed.catch(()=>{});
    await other.evaluate(id=>window.pixeltool.workspaceCommand({action:"close",id}),secondId).catch(error=>{
      if(!error.message.includes("Target page, context or browser has been closed"))throw error;
    });
    await otherClosed;page=originalPage;
    // Quitting with detached controls flushes the document and closes all child
    // windows. Restart uses safe in-app panels and remembers native geometry.
    await app.close();app=await launch();app.on("window",attach);app.windows().forEach(attach);
    page=await require("./first-editor.cjs")(app);await require("./editor-ready.cjs")(page);
    assert.equal(app.windows().filter(p=>p.url().includes("/src/panel.html")).length,0);
    assert.ok(await page.locator("#prompt").count());assert.deepEqual(await pixels(),before);
    assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem("pixeltool.ui.panel-window-bounds.v1"))?.ai));
    assert.deepEqual(errors,[]);failed=false;
    console.log("PASS: five sandboxed native panels, live inside/window/closed badges, visible fallback tab actions, return-all while locked preserves custom groups/sizes/closed panels and an in-flight AI request, retained DOM/input/selection/exact alpha/undo, independent saved bounds, offscreen recovery, language/theme, document ownership and IPC isolation.");
  } finally {
    if(failed)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});else await app.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
