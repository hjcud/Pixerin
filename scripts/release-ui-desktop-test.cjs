if(require("./test-runner.cjs").bootstrap(__filename))return;
const {_electron}=require("./test-electron.cjs"),fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict");
(async()=>{
  const root=path.resolve(__dirname,".."),profile=await require("./test-runner.cjs").createProfile("release-ui-");
  const {createDocument,ensureLayers}=await import("../src/core.mjs");
  const doc=ensureLayers(createDocument(32,32,("Long document name "+"長い이름VeryLongName".repeat(5)).slice(0,100)));doc.name=doc.name.slice(0,100);
  doc.pixels[33]=7;doc.layers[0].name="Layer "+"長い이름UnbrokenLayerName".repeat(3);
  await fs.writeFile(path.join(profile,"draft.json"),JSON.stringify(doc));
  const env={...process.env,PIXELTOOL_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:require("electron"),args:[root],env});let failed=true,page;const errors=[],results=[];
  const watch=p=>p.on("pageerror",e=>{errors.push(e.message);console.error(e.stack);});app.on("window",watch);app.windows().forEach(watch);
  const rectCheck=async(p,selector)=>{
    const el=p.locator(selector).first();await el.scrollIntoViewIfNeeded();
    const row=await el.evaluate(e=>{
      const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {selector:e.id||e.tagName,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
        viewport:[innerWidth,innerHeight],hit:!!hit&&(e===hit||e.contains(hit))};
    });
    assert.ok(row.width>0&&row.height>0&&row.x>=-1&&row.y>=-1&&row.right<=row.viewport[0]+1&&row.bottom<=row.viewport[1]+1&&row.hit,JSON.stringify(row));
  };
  try {
    page=await require("./first-editor.cjs")(app);await require("./editor-ready.cjs")(page);page.setDefaultTimeout(10000);
    const host=(await page.evaluate(()=>window.pixeltool.workspaceState())).host;
    const before=await page.locator("#pixel-canvas").evaluate(c=>Array.from(c.getContext("2d").getImageData(0,0,32,32).data));
    await page.emulateMedia({reducedMotion:"no-preference"});
    const search=page.locator("#command-search"),searchBox=await search.boundingBox();
    await page.mouse.move(searchBox.x+2,searchBox.y+2);await page.mouse.down();
    assert.deepEqual(await search.boundingBox(),searchBox,"Press feedback preserves the full edge hit target");
    await page.mouse.move(0,0);await page.mouse.up();
    assert.equal(await page.locator("#command-dialog").isVisible(),false,"Releasing outside a button cancels its activation");
    await page.emulateMedia({reducedMotion:"reduce"});
    const zoom=page.locator("#zoom-in"),zoomBox=await zoom.boundingBox();
    await page.mouse.move(zoomBox.x+zoomBox.width/2,zoomBox.y+zoomBox.height/2);await page.mouse.down();
    assert.equal(await zoom.locator('[data-icon]').evaluate(el=>getComputedStyle(el).translate),"none");
    await page.mouse.move(0,0);await page.mouse.up();
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.locator("#prompt").fill("UnbrokenPrompt".repeat(250));
    await page.locator("#brush-details").evaluate(e=>e.open=true);
    await page.locator(".symmetry-options").evaluate(e=>e.open=true);
    await page.locator("#shade-options").evaluate(e=>e.open=true);
    for(const [width,height] of [[1440,900],[1100,740]]) {
      await app.evaluate(({BrowserWindow},{host,width,height})=>BrowserWindow.fromId(host).setContentSize(width,height),{host,width,height});
      for(const theme of ["dark","light"])for(const language of ["ko","en","ja","zh-CN","es","fr","de"]) {
        await page.evaluate(async({theme,language})=>{const s=await window.pixeltool.getSettings();await window.pixeltool.savePreferences({...s.preferences,theme,language});},{theme,language});
        await page.waitForFunction(({theme,language})=>document.documentElement.lang===language&&document.documentElement.dataset.theme===theme,{theme,language});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme}/${language}/${width} document overflow`);
        assert.equal(await page.locator("#dock-body-layers").evaluate(e=>e.scrollWidth>e.clientWidth+1),false,`${theme}/${language}/${width} layer action overflow`);
        for(const selector of ["#new-btn","#open-btn","#save-btn","#file-more > summary","#export-btn","#command-search","#panel-layout-menu > summary","#grid-btn","#selection-btn","#alpha-lock-btn","#settings-btn","#generate-btn","#help-btn","#palette-library-open","#layer-add","#layer-duplicate","#layer-up","#layer-down","#layer-delete"])
          await rectCheck(page,selector);
        const header = await page.locator(".header-actions").evaluate(el => {
          const files=el.querySelector(".header-file-actions").getBoundingClientRect(),utilities=el.querySelector(".header-utilities").getBoundingClientRect();
          return {files:files.toJSON(),utilities:utilities.toJSON(),panel:el.querySelector(".header-panel-label").textContent,
            panelIcon:el.querySelector("#panel-layout-menu > summary > [data-icon]").dataset.icon,
            gridIcon:document.querySelector("#grid-btn > [data-icon]").dataset.icon,
            buttons:[...el.querySelectorAll("#new-btn,#open-btn,#save-btn,#export-btn")].map(b=>b.getBoundingClientRect().height)};
        });
        assert.ok(header.utilities.left >= header.files.right, "Window utilities stay separate from file actions");
        assert.ok(header.panel.trim(), "The panel menu has a visible label, distinct from the canvas grid");
        assert.notEqual(header.panelIcon,header.gridIcon,"Panel layout and canvas grid use distinct symbols");
        assert.ok(header.buttons.every(height=>height===header.buttons[0]), "File actions share a consistent height");
        for(const selector of ["#cancel-request","#discard-btn"]) {
          const name=await page.locator(selector).textContent();
          assert.ok(name.trim());if(language!=="ko")assert.doesNotMatch(name,/[가-힣]/,selector+"/"+language);
        }
        for(const selector of ["#command-search","#grid-btn","#selection-btn","#alpha-lock-btn","#layer-add","#layer-duplicate","#layer-delete"]) {
          const control=await page.locator(selector).evaluate(el=>({
            name:el.getAttribute("aria-label"),title:el.title,text:el.textContent.trim(),
            icons:el.querySelectorAll('[data-icon][aria-hidden="true"]').length,
            border:getComputedStyle(el).borderTopWidth,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height
          }));
          assert.ok(control.name&&control.title,selector+" has a translated accessible name and tooltip");
          assert.equal(control.icons,1);assert.equal(control.text,"");assert.equal(control.border,"0px");
          assert.ok(control.width>=24&&control.height>=24,selector+" keeps its hit target");
          if(language!=="ko")assert.doesNotMatch(control.name+control.title,/[가-힣]/,selector+"/"+language);
        }
        await page.locator("#panel-layout-menu > summary").click();await rectCheck(page,"#panel-layout-reset");await page.keyboard.press("Escape");
        await page.locator("#settings-btn").click();
        for(const tab of ["storage","editor","display","ai","info"]) {
          await page.locator("#settings-tab-"+tab).click();await rectCheck(page,'#settings-form button[type="submit"]');
          assert.equal(await page.locator("#settings-dialog").evaluate(e=>e.scrollWidth>e.clientWidth+1),false,`${tab}/${theme}/${language} dialog overflow`);
        }
        await page.locator("#settings-dialog .dialog-close").first().click();
        results.push({width,height,theme,language,status:"pass"});
      }
    }
    for(const selector of ["#grid-btn","#selection-btn"]) {
      const control=page.locator(selector),before=await control.getAttribute("aria-pressed");
      await control.focus();await control.press("Enter");
      assert.equal(await control.getAttribute("aria-pressed"),String(before!=="true"));
      const focus=await control.evaluate(el=>({active:el===document.activeElement,outline:parseFloat(getComputedStyle(el).outlineWidth)}));
      assert.ok(focus.active&&focus.outline>=2,"Keyboard focus stays visible on flat controls");
      await control.press("Enter");assert.equal(await control.getAttribute("aria-pressed"),before);
    }
    // Minimum-size native panel content must remain reachable by scrolling.
    const selectors={tools:"#help-btn",palette:"#palette-library-open",layers:"#layer-add",ai:"#generate-btn",preview:"#preview-open"};
    for(const [id,control] of Object.entries(selectors)) {
      await page.locator("#panel-layout-menu > summary").click();await page.locator(`[data-show-panel="${id}"]`).click();
      const group=page.locator(`.dock-group:has(.dock-tab[data-panel="${id}"])`);
      await group.locator(".dock-panel-menu > summary").click();const opened=app.waitForEvent("window");opened.catch(()=>{});
      await group.locator('[data-move-panel="window"]').click();const panel=await opened;await panel.waitForSelector("#native-panel-return");
      await app.evaluate(({BrowserWindow},url)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url).setContentSize(320,240),panel.url());
      await rectCheck(panel,"#native-panel-return");await rectCheck(panel,control);
      assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,id+" native overflow");
      await panel.screenshot({path:path.join(root,"artifacts",`release-ui-native-${id}.png`)});
      await panel.locator("#native-panel-return").click();await page.bringToFront();results.push({panel:id,width:320,height:240,status:"pass"});
    }
    assert.equal(await page.locator("#doc-name").inputValue(),doc.name);
    assert.equal(await page.locator("#prompt").inputValue(),"UnbrokenPrompt".repeat(250));
    assert.deepEqual(await page.locator("#pixel-canvas").evaluate(c=>Array.from(c.getContext("2d").getImageData(0,0,32,32).data)),before);
    await page.screenshot({path:path.join(root,"artifacts","release-ui-minimum-light.png")});
    assert.deepEqual(errors,[]);failed=false;console.log(`PASS: ${results.length} release UI cases, two themes, seven languages, main/native minimum sizes, long content, settings and action reachability; artwork/input unchanged.`);
  } finally {
    await fs.writeFile(path.join(root,"artifacts","release-ui-results.json"),JSON.stringify({results,errors,passed:!failed},null,2));
    if(failed&&page)await page.screenshot({path:path.join(root,"artifacts","release-ui-failure.png")}).catch(()=>{});
    if(failed)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});else await app.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
