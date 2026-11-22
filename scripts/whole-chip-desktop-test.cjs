if(require('./test-runner.cjs').bootstrap(__filename))return;
const {_electron}=require('./test-electron.cjs'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{PNG}=require('pngjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=await require('./test-runner.cjs').createProfile('whole-chip-');
 const {createDocument,ensureLayers}=await import('../src/core.mjs');
 await fs.writeFile(path.join(profile,'draft.json'),JSON.stringify(ensureLayers(createDocument(16,16))));
 await require('./test-ai-disclosure.cjs')(profile);
 const env={...process.env,PIXELTOOL_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
 let app=await _electron.launch({executablePath:require('electron'),args:[root],env});
 try{
  let page=await require('./first-editor.cjs')(app);
  const width=290,data=Buffer.alloc(width*width*4);
  for(let i=0;i<data.length;i+=4)data.set([0,255,0,255],i);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)for(let yy=0;yy<16;yy++)for(let xx=0;xx<16;xx++)data.set(x===7&&y===7?[193,43,55,255]:[137,151,163,255],((y*18+2+yy)*width+x*18+2+xx)*4);
  const encoded=PNG.sync.write({width,height:width,data}).toString('base64');
  await app.evaluate((_,encoded)=>{globalThis.__chipCalls=[];globalThis.fetch=async(_url,options)=>{globalThis.__chipCalls.push(JSON.parse(options.body));return Response.json({status:'completed',output:[{type:'image_generation_call',status:'completed',result:encoded}]});};},encoded);
  await require('./configure-test-api.cjs')(page);
  await page.locator('#ai-edit-mode').selectOption('whole');
  await page.locator('#ai-options > summary').click();
  assert.equal(await page.locator('#whole-strategy').inputValue(),'latest');
  await page.locator('#prompt').fill('A red pixel');
  await page.locator('#generate-btn').click();
  await page.locator('#proposal-card').waitFor({state:'visible'});
  assert.equal(await page.locator('#conversion-colors').inputValue(),'16');
  assert.equal(await page.locator('#conversion-method').isDisabled(),true);
  assert.equal(await app.evaluate(()=>globalThis.__chipCalls.length),1);
  assert.match(await app.evaluate(()=>globalThis.__chipCalls[0].instructions),/256 detached/);
  assert.equal(await app.evaluate(()=>globalThis.__chipCalls[0].tools[0].background),'opaque');
  // A preview is not an autosave mutation.
  assert((await page.evaluate(()=>window.pixeltool.loadDraft())).layers[0].pixels.every(v=>v===0));
  const discard=page.locator('#discard-btn');
  if(await discard.count())await discard.click();else await page.locator('#proposal-discard').click();
  await page.locator('#whole-strategy').selectOption('chip-region');
  await page.waitForFunction(async()=>((await window.pixeltool.getSettings()).preferences.wholeStrategy)==='chip-region');
  await page.locator('#generate-btn').click();
  await page.locator('#proposal-card').waitFor({state:'visible'});
  assert.equal(await app.evaluate(()=>globalThis.__chipCalls.length),2);
  await page.locator('#apply-btn').click();
  await page.waitForFunction(async()=>(await window.pixeltool.loadDraft()).layers[0].pixels.some(v=>v!==0));
  await page.locator('#undo-btn').click();
  await page.waitForFunction(async()=>(await window.pixeltool.loadDraft()).layers[0].pixels.every(v=>v===0));
  for(const language of ['en','ja','zh-CN','es','fr','de','ko']){
    await page.evaluate(async language=>{const s=await window.pixeltool.getSettings();await window.pixeltool.savePreferences({...s.preferences,language});},language);
    await page.reload();page=await require('./first-editor.cjs')(app);
    await page.locator('#ai-edit-mode').selectOption('whole');
    const options=await page.locator('#whole-strategy').textContent();
    if(language!=='ko')assert.doesNotMatch(options,/[가-힣]/);
  }
  await app.close();app=await _electron.launch({executablePath:require('electron'),args:[root],env});page=await require('./first-editor.cjs')(app);
  await page.locator('#ai-edit-mode').selectOption('whole');
  assert.equal(await page.locator('#whole-strategy').inputValue(),'chip-region');
  console.log('PASS: latest whole-chip request, untouched preview, beta preference persistence and seven translated workflow selectors; all model calls mocked');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
