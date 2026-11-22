if(require("./test-runner.cjs").bootstrap(__filename))return;
const {_electron}=require("./test-electron.cjs"),fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict"),{PNG}=require("pngjs");
(async()=>{
  const root=path.resolve(__dirname,".."),profile=await require("./test-runner.cjs").createProfile("canvas-drop-");
  const {createDocument,ensureLayers}=await import("../src/core.mjs");
  const doc=ensureLayers(createDocument(16,16,"Canvas drop fixture"));doc.pixels.fill(8);
  for(const i of [17,18,33])doc.pixels[i]=7;doc.pixels[34]=9;
  doc.layers.push({id:"untouched",name:"Hidden fixture",visible:false,locked:true,pixels:Array(256).fill(9)});
  await fs.writeFile(path.join(profile,"draft.json"),JSON.stringify(doc));
  const image=(width,height,rgba)=>PNG.sync.write({width,height,data:Buffer.from(rgba)},{colorType:6});
  const png=image(3,2,[255,0,0,255,0,255,0,128,0,0,0,0,255,0,0,255,0,0,0,0,0,255,0,128]);
  const env={...process.env,PIXELTOOL_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:require("electron"),args:[root],env});let page,failed=true;const errors=[];
  app.on("window",p=>p.on("pageerror",error=>{errors.push(error.message);console.error(error.stack);}));
  try {
    await require("./mock-pixel-clipboard.cjs")(app);
    page=await require("./first-editor.cjs")(app);await require("./editor-ready.cjs")(page);page.on("pageerror",e=>errors.push(e.message));
    const state=()=>page.evaluate(()=>window.pixeltool.workspaceState());
    const originalId=(await state()).id;
    const pixels=()=>page.locator("#pixel-canvas").evaluate(c=>Array.from(c.getContext("2d").getImageData(0,0,16,16).data));
    const pixel=async(x,y)=>(await pixels()).slice((y*16+x)*4,(y*16+x)*4+4);
    const point=async(x,y)=>{
      const r=await page.locator("#overlay-canvas").boundingBox(),mirrored=await page.locator("#view-mirror").getAttribute("aria-pressed");
      return [r.x+(mirrored==="true"?15.5-x:x+.5)*r.width/16,r.y+(y+.5)*r.height/16];
    };
    const drop=async(bytes=png,{selector="#overlay-canvas",name="part.png",type="image/png",x=5,y=6,kind="drop"}={})=>{
      const [clientX,clientY]=await point(x,y);
      await page.evaluate(({encoded,selector,name,type,clientX,clientY,kind})=>{
        const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],name,{type}));
        document.querySelector(selector).dispatchEvent(new DragEvent(kind,{bubbles:true,cancelable:true,dataTransfer:transfer,clientX,clientY}));
      },{encoded:Buffer.from(bytes).toString("base64"),selector,name,type,clientX,clientY,kind});
      if(kind==="drop")await page.waitForFunction(()=>!document.querySelector(".workspace").inert,null,{polling:100});
    };
    const before=await pixels(),sourceColor=await pixel(1,1),background=await pixel(0,0);
    // Drag affordance appears over the canvas and clears outside or on drop.
    await drop(png,{kind:"dragover"});assert.ok(await page.locator("#canvas-drop-hint").isVisible());
    await page.locator("#viewport").dispatchEvent("dragleave");assert.equal(await page.locator("#canvas-drop-hint").isVisible(),false);
    await drop();await page.waitForSelector("#placement-actions:not([hidden])");
    assert.equal((await state()).documentCount,1);assert.equal((await state()).id,originalId);
    assert.equal(await page.locator("#canvas-drop-hint").isVisible(),false);
    assert.deepEqual(await pixel(5,6),[255,0,0,255]);assert.equal((await pixel(6,6))[3],128);
    assert.deepEqual(await pixel(7,6),background);assert.deepEqual(await pixel(6,7),background);
    const draft=JSON.parse(await fs.readFile(path.join(profile,"draft.json"),"utf8"));
    assert.equal(draft.layers.find(l=>l.id===draft.activeLayerId).pixels[101],8,"preview does not overwrite autosave");
    await page.locator("#overlay-canvas").focus();await page.keyboard.press("ArrowRight");assert.deepEqual(await pixel(6,6),[255,0,0,255]);
    await page.keyboard.press("Escape");assert.deepEqual(await pixels(),before);
    await drop();await page.locator("#placement-apply").click();
    await page.waitForFunction(()=>document.getElementById("save-status").textContent==="복구본 저장됨");
    const saved=JSON.parse(await fs.readFile(path.join(profile,"draft.json"),"utf8"));
    assert.deepEqual(saved.layers.find(l=>l.id==="untouched").pixels,doc.layers[1].pixels);
    assert.equal(saved.palette[saved.layers.find(l=>l.id===saved.activeLayerId).pixels[6*16+6]],"#00FF0080");
    await page.locator("#overlay-canvas").focus();await page.keyboard.press("Control+z");assert.deepEqual(await pixels(),before);
    await page.keyboard.press("Control+Shift+z");assert.deepEqual(await pixel(5,6),[255,0,0,255]);
    await page.keyboard.press("Control+z");
    // Drop coordinates follow display mirroring and never depend on stale hover.
    await page.locator("#view-mirror").click();await drop(png,{x:9,y:4});
    assert.deepEqual(await pixel(9,4),[255,0,0,255]);
    await page.locator("#placement-cancel").click();await page.locator("#view-mirror").click();assert.deepEqual(await pixels(),before);
    // Invalid files, oversize placement, layer locks and alpha lock cannot write.
    for(const bytes of [Buffer.from("invalid"),image(17,1,Array(17).fill([255,0,0,255]).flat())]) {
      await drop(bytes);assert.equal(await page.locator("#placement-actions").isVisible(),false);assert.deepEqual(await pixels(),before);
    }
    await page.locator('.layer-row[data-layer-id="'+doc.activeLayerId+'"] .layer-lock').click();
    await drop();assert.equal(await page.locator("#placement-actions").isVisible(),false);
    await page.locator('.layer-row[data-layer-id="'+doc.activeLayerId+'"] .layer-lock').click();
    await page.locator("#alpha-lock-btn").click();await drop();assert.equal(await page.locator("#placement-actions").isVisible(),false);
    await page.locator("#alpha-lock-btn").click();assert.deepEqual(await pixels(),before);
    // A second drop must not implicitly apply an unconfirmed placement.
    await drop();const pending=await pixels();await drop(png,{x:9,y:9});assert.deepEqual(await pixels(),pending);
    await page.locator("#placement-cancel").click();assert.deepEqual(await pixels(),before);
    await page.locator("#help-btn").click();await drop();
    assert.equal(await page.locator("#help-dialog").isVisible(),true);
    assert.equal(await page.locator("#placement-actions").isVisible(),false);await page.keyboard.press("Escape");
    const manyColors=image(17,17,Array.from({length:289},(_,i)=>[i&255,i>>8,0,255]).flat());
    const preparing=drop(manyColors);preparing.catch(()=>{});
    await page.waitForSelector("#image-size-dialog[open]");await page.locator("#image-size-cancel").click();await preparing;
    assert.equal(await page.locator("#placement-actions").isVisible(),false);assert.deepEqual(await pixels(),before);
    // Copy a nonrectangular three-pixel selection. The bounding box is 2x2;
    // the unselected fourth pixel must stay transparent in the clipboard image.
    await page.locator('[data-tool="select"]').click();
    await page.mouse.move(...await point(1,1));await page.mouse.down();await page.mouse.move(...await point(2,1));await page.mouse.up();
    await page.keyboard.down("Shift");await page.mouse.click(...await point(1,2));await page.keyboard.up("Shift");
    assert.match(await page.locator("#selection-summary").innerText(),/3픽셀/);
    await page.locator("#overlay-canvas").focus();await page.keyboard.press("Control+c");
    await page.waitForFunction(()=>document.getElementById("toast").textContent.includes("2 × 2"));
    const copied=await app.evaluate(()=>({size:globalThis.__testClipboardImage.getSize(),png:globalThis.__testClipboardImage.toPNG().toString("base64")}));
    assert.deepEqual(copied.size,{width:2,height:2});assert.equal(PNG.sync.read(Buffer.from(copied.png,"base64")).data[15],0);
    await page.mouse.move(...await point(10,10));await page.keyboard.press("Control+v");await page.waitForSelector("#placement-actions:not([hidden])");
    assert.deepEqual(await pixel(10,10),sourceColor);assert.deepEqual(await pixel(11,11),background);
    assert.match(await page.locator("#selection-summary").innerText(),/3픽셀/);
    await page.locator("#placement-apply").click();await page.locator("#overlay-canvas").focus();await page.keyboard.press("Control+z");assert.deepEqual(await pixels(),before);
    // Canvas drop during mocked AI work is rejected before import/placement.
    await app.evaluate(()=>{globalThis.fetch=async(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true}));});
    await require("./configure-test-api.cjs")(page);await page.locator("#prompt").fill("Mock only");await page.locator("#generate-btn").click();await page.waitForSelector("#cancel-request:not([hidden])");
    await drop();assert.equal(await page.locator("#placement-actions").isVisible(),false);assert.deepEqual(await pixels(),before);
    await page.locator("#cancel-request").click();await page.waitForSelector("#generate-btn:not([hidden])");
    // PNG outside the canvas and project files on the canvas retain new-tab import.
    await drop(png,{selector:".app-header"});let other=await require("./next-editor.cjs")(app,page);
    assert.equal(await other.locator("#doc-name").inputValue(),"part");
    await other.evaluate(id=>window.pixeltool.workspaceCommand({action:"activate",id}),originalId);await require("./editor-ready.cjs")(page);
    await drop(Buffer.from(JSON.stringify(createDocument(8,8,"Project drop fixture"))),{name:"part.pixeltool",type:"application/json"});
    other=await require("./next-editor.cjs")(app,page);assert.equal(await other.locator("#doc-name").inputValue(),"Project drop fixture");
    assert.deepEqual(await pixels(),before);assert.deepEqual(errors,[]);failed=false;
    console.log("PASS: PNG canvas drop preview/drag/confirm/cancel/undo, native coordinates under mirroring, exact source alpha and transparent holes, active-layer isolation, locks/invalid/oversize/pending/modal/AI rejection, explicit import preparation cancellation, selected-only nonrectangular clipboard copy/paste, and existing new-tab file drops; no live AI or system clipboard use.");
  } finally {if(failed)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});else await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
