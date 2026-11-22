if(require("./test-runner.cjs").bootstrap(__filename))return;
const {_electron}=require("./test-electron.cjs"),fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict");
(async()=>{
  const root=path.resolve(__dirname,".."),profile=await require("./test-runner.cjs").createProfile("whole-image-");
  const {createDocument,ensureLayers,activeLayer}=await import("../src/core.mjs");
  let doc=ensureLayers(createDocument(3840,2160,"Whole 4K fixture"));doc.pixels.fill(1);
  const layer=activeLayer(doc);layer.refinementProtection=Array(doc.pixels.length).fill(false);layer.refinementProtection[0]=true;
  layer.mask=Array(doc.pixels.length).fill(true);layer.mask[1]=false;layer.maskEnabled=true;
  // A second layer is visible context, not the target of the edit.
  doc.layers.push({id:"other",name:"Other",visible:true,locked:true,pixels:Array(doc.pixels.length).fill(0)});doc.layers[1].pixels[10]=5;
  await fs.writeFile(path.join(profile,"draft.json"),JSON.stringify(doc));doc=null;
  const env={...process.env,PIXELTOOL_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:require("electron"),args:[root],env});let failed=true,diagnosticPage;
  try{
    const page=await require("./first-editor.cjs")(app);page.setDefaultTimeout(90000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
    diagnosticPage=page;
    await require("./editor-ready.cjs")(page);
    await app.evaluate((_,root)=>{
      const {PNG}=process.mainModule.require(root+"/node_modules/pngjs");
      const data=Buffer.alloc(3840*2160*4);
      for(let i=0;i<data.length;i+=4){data[i]=80;data[i+1]=168;data[i+2]=137;data[i+3]=255;}
      // A one-pixel mark that the old 1536px work buffer would lose.
      data.set([244,180,164,255],123*4);
      const png=PNG.sync.write({width:3840,height:2160,data}).toString("base64");
      globalThis.__wholeCalls=0;
      globalThis.fetch=async(url,options)=>{
        globalThis.__wholeCalls++;const b=JSON.parse(options.body);
        if(!b.tools||b.tools[0].action!=="edit"||b.tools[0].size!=="3840x2160"||b.max_tool_calls!==1)throw Error("Unexpected whole-image request");
        globalThis.__wholeDimensions=b.input[0].content.filter(c=>c.type==="input_image").map(c=>{
          const image=PNG.sync.read(Buffer.from(c.image_url.split(",")[1],"base64"));return[image.width,image.height];
        });
        return Response.json({status:"completed",output:[{type:"image_generation_call",status:"completed",result:png}],usage:{input_tokens:100,output_tokens:20}});
      };
    },root);
    await require("./configure-test-api.cjs")(page);
    const pixel=async x=>page.locator("#pixel-canvas").evaluate((c,x)=>Array.from(c.getContext("2d").getImageData(x,0,1,1).data),x);
    assert.ok(await page.locator("#generate-btn").isDisabled());
    await page.locator("#ai-edit-mode").selectOption("whole");
    await page.locator("#prompt").fill("Change the lighting without changing the subject");
    assert.ok(await page.locator("#generate-btn").isEnabled());
    assert.match(await page.locator("#transmission-summary").innerText(),/전체/);
    console.log("Requesting a single mocked whole-frame 4K edit");
    await page.locator("#generate-btn").click();await page.waitForSelector("#proposal-card:not([hidden])",{timeout:120000});
    assert.deepEqual(await pixel(100),[80,168,137,255]);assert.deepEqual(await pixel(0),[36,43,58,255]);
    assert.deepEqual(await pixel(123),[244,180,164,255]);
    assert.equal((await pixel(1))[3],0);assert.deepEqual(await pixel(10),[255,255,255,255]);
    assert.match(await page.locator("#whole-result-note").innerText(),/3840×2160.*3840×2160/);
    assert.ok(await page.locator("#advanced-refine").isHidden());
    assert.equal(await app.evaluate(()=>globalThis.__wholeCalls),1);
    assert.deepEqual(await app.evaluate(()=>globalThis.__wholeDimensions),[[3840,2160],[3840,2160]]);
    // Discard leaves the original and both layers intact; a second explicit
    // request applies as one undoable transaction, without any repair request.
    await page.locator("#discard-btn").click();assert.deepEqual(await pixel(100),[36,43,58,255]);
    await page.locator("#generate-btn").click();await page.waitForSelector("#proposal-card:not([hidden])",{timeout:120000});
    await page.locator("#apply-btn").click();assert.deepEqual(await pixel(100),[80,168,137,255]);
    await page.locator("#undo-btn").click();assert.deepEqual(await pixel(100),[36,43,58,255]);
    await page.locator("#redo-btn").click();assert.deepEqual(await pixel(100),[80,168,137,255]);
    assert.equal(await app.evaluate(()=>globalThis.__wholeCalls),2);
    const history=await page.evaluate(()=>window.pixeltool.transmissionHistory());
    assert.equal(history.entries.length,2);assert.equal(history.entries[0].width,3840);assert.equal(history.entries[0].height,2160);
    assert.equal(history.entries[0].pixels,3840*2160-2);assert.equal(history.entries[0].calls,1);
    await fs.mkdir(path.join(root,"artifacts"),{recursive:true});await page.screenshot({path:path.join(root,"artifacts","whole-image-4k.png")});
    await page.locator("#ai-edit-mode").selectOption("precise");assert.ok(await page.locator("#generate-btn").isDisabled());
    assert.deepEqual(errors,[]);failed=false;
    console.log("PASS: native-size 3840x2160 request/result, single-pixel mark retained without hidden downsampling, exact protections/inactive layer, preview/discard/apply/undo/redo and persisted token metadata; precise scope unchanged.");
  }catch(error){
    if(diagnosticPage)console.error("Editor failure state:",await diagnosticPage.evaluate(()=>({status:document.getElementById("ai-status").textContent,progress:document.getElementById("request-progress").innerText})).catch(()=>null));
    throw error;
  }finally{if(failed)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});else await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
