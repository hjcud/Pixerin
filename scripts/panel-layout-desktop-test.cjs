if(require("./test-runner.cjs").bootstrap(__filename))return;
const {_electron}=require("./test-electron.cjs"),fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict");
(async()=>{
  const root=path.resolve(__dirname,".."),profile=await require("./test-runner.cjs").createProfile("panel-layout-");
  const {createDocument,ensureLayers,activeLayer}=await import("../src/core.mjs");
  const {PANEL_IDS,defaultPanelLayout}=await import("../src/panel-layout.mjs");
  const doc=ensureLayers(createDocument(16,16,"Dock fixture"));doc.palette.push("#50A88973");
  for(let y=2;y<6;y++)for(let x=2;x<6;x++)doc.pixels[y*16+x]=16;
  activeLayer(doc).alphaLocked=true;
  await fs.writeFile(path.join(profile,"draft.json"),JSON.stringify(doc));
  const env={...process.env,PIXELTOOL_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  const launch=()=>_electron.launch({executablePath:require("electron"),args:[root],env});
  let app=await launch(),page,failed=true;const errors=[];
  app.on("window",p=>p.on("pageerror",error=>{errors.push(error.message);console.error("Renderer error:",error.stack);}));
  for(const p of app.windows())p.on("pageerror",error=>{errors.push(error.message);console.error("Renderer error:",error.stack);});
  try{
    page=await require("./first-editor.cjs")(app);page.on("pageerror",e=>errors.push(e.message));await require("./editor-ready.cjs")(page);
    const layout=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("pixeltool.ui.panel-layout.v1")));
    const group=id=>page.locator(`.dock-group:has(.dock-tab[data-panel="${id}"])`);
    const tab=id=>page.locator(`.dock-tab[data-panel="${id}"]`);
    const open=async id=>{await page.locator("#panel-layout-menu > summary").click();await page.locator(`[data-show-panel="${id}"]`).click();};
    const move=async(id,target)=>{await open(id);await group(id).locator(".dock-panel-menu > summary").click();await group(id).locator(`[data-move-panel="${target}"]`).click();};
    const pixels=()=>page.locator("#pixel-canvas").evaluate(c=>Array.from(c.getContext("2d").getImageData(0,0,16,16).data));
    const before=await pixels();
    assert.equal(await page.locator(".dock-group:visible").count(),4);
    await tab("preview").click();assert.ok(await page.locator("#preview-content").isVisible());
    await tab("ai").click();assert.ok(await page.locator("#assistant-content").isVisible());
    await page.locator('.dock-divider-left').focus();await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator('.dock-divider-left').getAttribute("aria-valuenow"),"236");
    await page.keyboard.press("ArrowLeft");
    const toggleLock=async()=>{await page.locator("#panel-layout-menu > summary").click();await page.locator("#panel-layout-lock").click();await page.keyboard.press("Escape");};
    await toggleLock();assert.equal((await layout()).locked,true);
    assert.equal(await page.locator(".dock-divider-left").getAttribute("aria-disabled"),"true");
    assert.equal(await page.locator(".dock-divider-left").getAttribute("tabindex"),"-1");
    const lockedBefore=await layout(),lockedTab=await tab("palette").boundingBox();
    await page.mouse.move(lockedTab.x+25,lockedTab.y+14);await page.mouse.down();await page.mouse.move(lockedTab.x+140,lockedTab.y+65,{steps:8});await page.mouse.up();
    const lockedDivider=await page.locator(".dock-divider-left").boundingBox();
    await page.mouse.move(lockedDivider.x+3,lockedDivider.y+50);await page.mouse.down();await page.mouse.move(lockedDivider.x+80,lockedDivider.y+50,{steps:8});await page.mouse.up();
    await page.locator(".dock-divider-left").dispatchEvent("keydown",{key:"ArrowRight"});
    assert.deepEqual(await layout(),lockedBefore);
    await tab("preview").click();assert.ok(await page.locator("#preview-content").isVisible());await tab("ai").click();
    await toggleLock();assert.equal((await layout()).locked,false);
    await page.evaluate(()=>{globalThis.originalDockNodes=Object.fromEntries(["pixel-canvas","prompt","palette","layer-list","preview-content"].map(id=>[id,document.getElementById(id)]));});
    await page.locator("#prompt").fill("Keep this text while docking");
    await page.locator('[data-tool="select"]').click();
    const r=await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.move(r.x+2.5*r.width/16,r.y+2.5*r.height/16);await page.mouse.down();
    await page.mouse.move(r.x+4.5*r.width/16,r.y+4.5*r.height/16);await page.mouse.up();
    const selected=await page.locator("#selection-dimensions").innerText();
    // Drag a panel into an existing tab strip.
    const from=await tab("palette").boundingBox(),to=await page.locator('[data-dock-group="right-top"] .dock-tab-strip').boundingBox();
    await page.mouse.move(from.x+30,from.y+14);await page.mouse.down();await page.mouse.move(to.x+50,to.y+14,{steps:12});await page.mouse.up();
    assert.ok((await layout()).groups["right-top"].includes("palette"));
    assert.deepEqual(await pixels(),before);assert.equal(await page.locator("#selection-dimensions").innerText(),selected);
    assert.equal(await page.locator("#prompt").inputValue(),"Keep this text while docking");
    // Close every panel; the header menu remains available to reopen each one.
    for(const id of ["tools","palette","layers","ai","preview"]){await open(id);await group(id).locator(".dock-close").click();}
    assert.equal((await layout()).hidden.length,PANEL_IDS.length);assert.equal(await page.locator(".dock-group:visible").count(),0);
    await open("palette");assert.ok(await tab("palette").isVisible());assert.ok((await layout()).groups["right-top"].includes("palette"));
    await move("layers","float");
    const floating=group("layers");assert.ok(await floating.evaluate(el=>el.classList.contains("dock-floating")));
    const originalBounds=await floating.boundingBox(),handle=await floating.locator(".dock-floating-resize").boundingBox();
    await page.mouse.move(handle.x+handle.width-3,handle.y+handle.height-3);await page.mouse.down();await page.mouse.move(handle.x+55,handle.y+35,{steps:8});await page.mouse.up();
    assert.ok((await floating.boundingBox()).width>originalBounds.width+20);
    const floatingSaved=(await layout()).floating["float-layers"];
    await floating.locator(".dock-close").click();await open("layers");assert.deepEqual((await layout()).floating["float-layers"],floatingSaved);
    const moving=await tab("layers").boundingBox();
    await page.mouse.move(moving.x+30,moving.y+14);await page.mouse.down();await page.mouse.move(moving.x+80,moving.y+90,{steps:8});await page.mouse.up();
    assert.equal((await layout()).floating["float-layers"].width,floatingSaved.width);
    // Escape cancels an unfinished panel drag without changing stored geometry.
    const prior=await layout(),f=await tab("layers").boundingBox();
    await page.mouse.move(f.x+30,f.y+14);await page.mouse.down();await page.mouse.move(f.x+80,f.y+80,{steps:5});await page.keyboard.press("Escape");await page.mouse.up();
    assert.deepEqual(await layout(),prior);
    await open("tools");await open("ai");
    assert.ok(await page.evaluate(()=>Object.entries(globalThis.originalDockNodes).every(([id,node])=>document.getElementById(id)===node)));
    // An in-flight mocked AI request survives closing/reopening and moving AI controls.
    await app.evaluate(()=>{globalThis.panelModelCalls=0;globalThis.fetch=async(_url,{signal})=>{globalThis.panelModelCalls++;return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true}));};});
    await require("./configure-test-api.cjs")(page);await page.locator("#generate-btn").click();await page.waitForSelector("#cancel-request:not([hidden])");
    await move("ai","left-top");await group("ai").locator(".dock-close").click();await open("ai");
    assert.ok(await page.locator("#cancel-request").isVisible());await page.locator("#cancel-request").click();
    await page.waitForFunction(()=>!document.getElementById("generate-btn").hidden);assert.equal(await app.evaluate(()=>globalThis.panelModelCalls),1);
    assert.deepEqual(await pixels(),before);
    await open("preview");assert.ok(await page.locator("#assistant-content").isVisible());assert.ok(await page.locator("#preview-content").isVisible());
    // Manual painting still honors selection/alpha and has one undo step.
    await open("tools");await open("palette");await page.locator("#palette button").nth(12).click();await page.locator('[data-tool="pencil"]').click();
    const paint=await page.locator("#overlay-canvas").boundingBox();await page.mouse.click(paint.x+3.5*paint.width/16,paint.y+3.5*paint.height/16);
    assert.notDeepEqual(await pixels(),before);assert.equal((await pixels())[(3*16+3)*4+3],115);
    await page.keyboard.press("Control+z");assert.deepEqual(await pixels(),before);
    await fs.mkdir(path.join(root,"artifacts"),{recursive:true});await page.screenshot({path:path.join(root,"artifacts","panel-layout-custom.png")});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1100,740));
    await page.waitForFunction(()=>innerWidth===1100);
    assert.ok(await group("layers").evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}));
    for(const language of ["en","ja","zh-CN","es","fr","de","ko"]){
      await page.evaluate(async language=>{const s=await window.pixeltool.getSettings();await window.pixeltool.savePreferences({...s.preferences,language});},language);
      await page.waitForFunction(language=>document.documentElement.lang===language,language);
      if(language!=="ko")for(const header of await page.locator(".dock-group-header:visible").all())assert.doesNotMatch(await header.innerText(),/[가-힣]/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await open("preview");await group("preview").locator(".dock-close").click();await toggleLock();const persisted=await layout();
    await app.close();app=await launch();page=await require("./first-editor.cjs")(app);await require("./editor-ready.cjs")(page);
    assert.equal(await tab("preview").isVisible(),false);assert.deepEqual((await layout()).floating,persisted.floating);assert.equal((await layout()).locked,true);
    await open("preview");assert.ok(await tab("preview").isVisible());
    await page.locator("#panel-layout-menu > summary").click();await page.locator("#panel-layout-reset").click();
    assert.deepEqual((await layout()).groups,defaultPanelLayout().groups);
    assert.deepEqual((await layout()).hidden,["animation"]);
    assert.equal(await page.locator(".dock-floating").count(),0);
    assert.equal((await layout()).locked,false);
    const originalPage=page,originalId=await page.evaluate(async()=>(await window.pixeltool.workspaceState()).id);
    await page.locator("#new-btn").click();await page.locator('#new-form button[type="submit"]').click();
    page=await require("./next-editor.cjs")(app,originalPage);
    await open("palette");await group("palette").locator(".dock-close").click();
    await originalPage.waitForFunction(()=>document.querySelector('.dock-tab[data-panel="palette"]').hidden);
    const otherPage=page;
    await page.evaluate(id=>window.pixeltool.workspaceCommand({action:"activate",id}),originalId);
    page=originalPage;await require("./editor-ready.cjs")(page);await open("palette");
    // Another tab's layout update waits for an active paint gesture to finish.
    const gesture=await page.locator("#overlay-canvas").boundingBox();
    await page.mouse.move(gesture.x+3.5*gesture.width/16,gesture.y+3.5*gesture.height/16);await page.mouse.down();
    await otherPage.evaluate(()=>{const key="pixeltool.ui.panel-layout.v1",value=JSON.parse(localStorage.getItem(key));value.hidden.push("palette");value.locked=true;localStorage.setItem(key,JSON.stringify(value));});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await tab("palette").isVisible(),true);
    assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("dock-layout-locked")),false);
    await page.mouse.up();await page.waitForFunction(()=>document.querySelector('.dock-tab[data-panel="palette"]').hidden);
    await page.waitForFunction(()=>document.body.classList.contains("dock-layout-locked"));
    await page.keyboard.press("Control+z");await open("palette");
    assert.deepEqual(await pixels(),before);
    await page.screenshot({path:path.join(root,"artifacts","panel-layout-default.png")});assert.deepEqual(errors,[]);failed=false;
    console.log("PASS: panel drag/tab merge, persisted layout lock blocks pointer/keyboard resize while keeping tab clicks, cross-document lock deferral, close-all/menu reopen, floating resize, Escape cancellation, live DOM/prompt/selection/alpha/undo protection, mocked AI ownership, seven languages, restart and reset.");
  }catch(error){if(page)console.error("Panel failure state:",await page.evaluate(()=>({ready:document.documentElement.dataset.ready,layout:localStorage.getItem("pixeltool.ui.panel-layout.v1")})).catch(()=>null));throw error;}
  finally{if(failed)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});else await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
