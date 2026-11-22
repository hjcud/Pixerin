if (require("./test-runner.cjs").bootstrap(__filename)) return;
const {_electron}=require("./test-electron.cjs"),fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict"),{PNG}=require("pngjs");
(async()=>{
  const root=path.resolve(__dirname,".."),baseline=process.argv.includes("--baseline"),mode=baseline?"before":"after";
  const evidence=path.join(root,"artifacts","image-surfaces",mode);await fs.mkdir(evidence,{recursive:true});
  const profile=await require("./test-runner.cjs").createProfile("image-surfaces-");
  const {createDocument,ensureLayers}=await import("../src/core.mjs");
  const doc=ensureLayers(createDocument(32,32,"Image surface fixture"));doc.layers[0].alphaLocked=false;doc.pixels[0]=1;doc.pixels[33]=7;
  const png=new PNG({width:16,height:16});
  for(let y=3;y<13;y++)for(let x=3;x<13;x++)png.data.set(x<5||y<5?[0,0,0,255]:x<9?[233,233,233,255]:[171,216,250,255],(y*16+x)*4);
  const image="data:image/png;base64,"+PNG.sync.write(png).toString("base64");
  doc.editorContext={prompt:"Generated image surface test",reference:{image,purposes:["shape"],note:"Generated transparent pixel fixture"}};
  await fs.writeFile(path.join(profile,"draft.json"),JSON.stringify(doc));
  const env={...process.env,PIXELTOOL_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:require("electron"),args:[root],env});
  let failed=true,page;const result={baseline,views:[],errors:[]};
  app.on("window",p=>p.on("pageerror",e=>result.errors.push(e.message)));
  // Ignore the two-pixel frame: rounded control edges are composited by the OS.
  // Artwork edges are inside the transparent margin and remain in this sample.
  const colors=bytes=>{const p=PNG.sync.read(bytes),unique=new Set();for(let y=2;y<p.height-2;y++)for(let x=2;x<p.width-2;x++){const i=(y*p.width+x)*4;unique.add(p.data.subarray(i,i+4).toString("hex"));}return unique.size;};
  try {
    page=await require("./first-editor.cjs")(app);await require("./editor-ready.cjs")(page);page.setDefaultTimeout(10000);
    const pixels=()=>page.locator("#pixel-canvas").evaluate(c=>Array.from(c.getContext("2d").getImageData(0,0,c.width,c.height).data));
    const original=await pixels();
    const readyImage=async id=>{
      await page.waitForFunction(id=>{const img=document.getElementById(id);return img?.getAttribute("src")&&img.complete&&img.naturalWidth>0;},id);
      await page.locator("#"+id).evaluate(img=>img.decode());
    };
    const captureImage=async(id,theme)=>{
      await readyImage(id);const node=page.locator("#"+id);
      const data=await node.evaluate(img=>{const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext("2d");ctx.drawImage(img,0,0);const s=getComputedStyle(img),r=img.getBoundingClientRect();return {width:img.naturalWidth,height:img.naturalHeight,rgba:Array.from(ctx.getImageData(0,0,c.width,c.height).data),rendering:s.imageRendering,fit:s.objectFit,background:s.backgroundImage,display:[r.width,r.height]};});
      assert.deepEqual(data.rgba,Array.from(png.data),"Reference alpha and source colors remain exact");
      assert.equal(data.fit,"contain","Reference proportions are preserved");
      await page.mouse.move(0,0);const shot=await node.screenshot({path:path.join(evidence,theme+"-"+id+".png"),animations:"disabled"});
      const renderedColors=colors(shot);
      // Include a few backdrop seam shades introduced by browser compositing.
      // The unfixed 3-color fixture renders over 100 colors in the thumbnails.
      if(!baseline){assert.equal(data.rendering,"pixelated");assert.ok(renderedColors<=8,theme+"/"+id+": unexpected interpolated colors "+renderedColors);}
      result.views.push({id,theme,renderedColors,...data,rgba:undefined});
    };
    for(const theme of ["dark","light"]) {
      await page.evaluate(async theme=>{const s=await window.pixeltool.getSettings();await window.pixeltool.savePreferences({...s.preferences,theme});},theme);
      await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
      await page.locator('.dock-tab[data-panel="ai"]').click();
      await captureImage("reference-thumb",theme);
      await page.locator("#reference-edit").click();
      const canvas=page.locator("#reference-canvas");
      assert.equal(await canvas.evaluate(c=>c.getContext("2d").getImageData(0,0,1,1).data[3]),0,"Transparency is not flattened into the crop canvas");
      const background=await canvas.evaluate(c=>getComputedStyle(c).backgroundImage);
      if(!baseline)assert.match(background,/repeating-conic-gradient/);
      await page.locator(".reference-crop-stage").screenshot({path:path.join(evidence,theme+"-crop.png"),animations:"disabled"});
      await page.locator("#reference-cancel").click();
      await page.locator('.dock-tab[data-panel="preview"]').click();await page.locator("#reference-compare").waitFor({state:"visible"});
      await captureImage("reference-compare-image",theme);
      if(!baseline){
        assert.ok(await page.locator("#reference-compare-image").evaluate(img=>img.getBoundingClientRect().width>img.naturalWidth),"A small reference uses the comparison viewport");
        assert.match(await page.locator(".reference-compare-stage").first().evaluate(el=>getComputedStyle(el).backgroundImage),/repeating-conic-gradient/);
      }
      await page.locator("#reference-compare").screenshot({path:path.join(evidence,theme+"-comparison.png"),animations:"disabled"});
    }
    await page.locator('.dock-tab[data-panel="ai"]').click();
    await app.evaluate(()=>{globalThis.__imageSurfaceCalls=0;globalThis.fetch=async(_url,options)=>{
      globalThis.__imageSurfaceCalls++;const ctx=JSON.parse(JSON.parse(options.body).input[0].content[0].text),segment=ctx.editable_segments[0];
      return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({summary:"Generated test proposal",new_colors:[],segments:[{id:segment.id,colors:Array.from({length:segment.length},(_,i)=>i===0?7:null)}]})}]}]});
    };});
    await require("./configure-test-api.cjs")(page);
    if(!await page.locator("#ai-options").evaluate(el=>el.open))await page.locator("#ai-options > summary").click();
    await page.locator("#ai-quality").selectOption("off");
    await page.locator("#prompt").fill("Generated test proposal");await page.locator("#generate-btn").click();await page.locator("#proposal-card").waitFor({state:"visible"});
    const submitted=page.locator("#submitted-reference-image");
    let collapsed=submitted.locator("xpath=ancestor::details[not(@open)]");
    while(await collapsed.count())await collapsed.first().locator(":scope > summary").click();
    await captureImage("submitted-reference-image","light");
    if(!baseline)assert.match(await submitted.evaluate(img=>getComputedStyle(img).backgroundImage),/repeating-conic-gradient/);
    assert.equal(await submitted.getAttribute("src"),image,"Submitted image is the original reference payload");
    await page.locator("#discard-btn").click();assert.deepEqual(await pixels(),original);
    assert.equal((await page.evaluate(()=>window.pixeltool.loadDraft())).editorContext.reference.image,image);
    assert.equal(await app.evaluate(()=>globalThis.__imageSurfaceCalls),1);assert.deepEqual(result.errors,[]);failed=false;
    console.log((baseline?"BASELINE":"PASS")+": reference/crop/submitted/comparison images in both themes; source alpha, colors, payload and artwork preserved; mocked network only.");
    console.log(JSON.stringify(result.views.map(({id,theme,renderedColors,rendering,display})=>({id,theme,renderedColors,rendering,display}))));
  } finally {
    await fs.writeFile(path.join(evidence,"results.json"),JSON.stringify({...result,passed:!failed},null,2));
    if(failed&&page)await page.screenshot({path:path.join(evidence,"failure.png"),animations:"disabled"}).catch(()=>{});
    if(failed)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});else await app.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
