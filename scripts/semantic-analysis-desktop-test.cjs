if(require('./test-runner.cjs').bootstrap(__filename))return;
const{_electron}=require('./test-electron.cjs'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=await require('./test-runner.cjs').createProfile('semantic-analysis-');
 await require('./test-ai-disclosure.cjs')(profile);
 const env={...process.env,PIXELTOOL_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:require('electron'),args:[root],env});let failed=false;
 try{
  const page=await require('./first-editor.cjs')(app);await require('./editor-ready.cjs')(page);page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate((_,root)=>{
   const{PNG}=process.mainModule.require(root+'/node_modules/pngjs'),data=Buffer.alloc(64*64*4);for(let i=0;i<4096;i++)data.set([30,170,100,255],i*4);
   const result=PNG.sync.write({width:64,height:64,data}).toString('base64');globalThis.__semanticCalls=[];
   globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);globalThis.__semanticCalls.push(body);
    if(body.tools)return Response.json({status:'completed',output:[{type:'image_generation_call',status:'completed',result}]});
    const context=JSON.parse(body.input[0].content[0].text),plan={sourceHash:context.sourceHash,summary:'Source-derived materials',outline:'none',confidence:.95,regions:[],features:[],warnings:[]};
    return new Promise((resolve,reject)=>{globalThis.__releaseSemantic=(stale=false)=>resolve(Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...plan,sourceHash:stale?'0'.repeat(64):plan.sourceHash})}]}],usage:{input_tokens:121,output_tokens:43}}));options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
   };
  },root);
  await require('./configure-test-api.cjs')(page);
  const pixels=()=>page.locator('#pixel-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data));
  const before=await pixels();await page.locator('#ai-edit-mode').selectOption('whole');await page.locator('#prompt').fill('A small green object');await page.locator('#generate-btn').click();await page.waitForSelector('#proposal-card:not([hidden])');const baseline=await pixels();
  await page.locator('#advanced-conversion summary').click();await page.locator('#conversion-method').selectOption('semantic');
  assert.match(await page.locator('#conversion-request-note').innerText(),/1회/);assert.equal(await app.evaluate(()=>globalThis.__semanticCalls.length),1);
  await page.locator('#advanced-reconvert').click();await page.waitForSelector('#conversion-cancel:not([hidden])');assert.ok(await page.locator('#apply-btn').isDisabled());await page.locator('#conversion-cancel').click();await page.waitForFunction(()=>!document.querySelector('#advanced-reconvert').disabled);assert.deepEqual(await pixels(),baseline);
  await page.locator('#advanced-reconvert').click();await page.waitForFunction(()=>document.querySelector('#advanced-reconvert').disabled);await app.evaluate(()=>globalThis.__releaseSemantic(true));await page.waitForFunction(()=>!document.querySelector('#advanced-reconvert').disabled);assert.deepEqual(await pixels(),baseline);
  await page.locator('#advanced-reconvert').click();await page.waitForFunction(()=>document.querySelector('#advanced-reconvert').disabled);await app.evaluate(()=>globalThis.__releaseSemantic());await page.waitForFunction(()=>!document.querySelector('#advanced-reconvert').disabled);
  assert.match(await page.locator('#conversion-request-note').innerText(),/재사용/);
  const callCount=await app.evaluate(()=>globalThis.__semanticCalls.length);await page.locator('#conversion-colors').selectOption('8');await page.locator('#advanced-reconvert').click();await page.waitForFunction(()=>!document.querySelector('#advanced-reconvert').disabled);assert.equal(await app.evaluate(()=>globalThis.__semanticCalls.length),callCount);
  await page.locator('#conversion-method').selectOption('recompose');assert.ok(await page.locator('#conversion-recompose-note').isVisible());await page.locator('#advanced-reconvert').click();await page.waitForFunction(()=>!document.querySelector('#advanced-reconvert').disabled);assert.equal(await app.evaluate(()=>globalThis.__semanticCalls.length),callCount);
  const history=await page.evaluate(()=>window.pixeltool.transmissionHistory()),analyses=history.entries.filter(e=>e.mode==='analysis');assert.equal(analyses.length,3);assert.ok(analyses.some(e=>e.status==='canceled'));assert.ok(analyses.some(e=>e.status==='error'));assert.ok(analyses.some(e=>e.status==='completed'&&e.usage.input_tokens===121&&e.width===64&&e.height===64));assert.ok(!JSON.stringify(history).includes('Source-derived'));
  for(const language of ['en','ja','zh-CN','es','fr','de','ko']){await page.evaluate(async language=>{const s=await window.pixeltool.getSettings();await window.pixeltool.savePreferences({...s.preferences,language});},language);await page.waitForFunction(language=>document.documentElement.lang===language,language);for(const id of ['conversion-method','advanced-reconvert','conversion-request-note','conversion-recompose-note'])assert.ok(await page.locator('#'+id).evaluate(e=>e.scrollWidth<=e.clientWidth+1),language+':'+id);}
  await page.locator('#apply-btn').click();assert.notDeepEqual(await pixels(),before);await page.locator('#undo-btn').click();assert.deepEqual(await pixels(),before);assert.deepEqual(errors,[]);
  console.log('PASS: explicit analysis, cancel, stale-plan rejection, one-call cache, preview dimensions/token history, seven languages, atomic apply/undo; mocked API only');
 }catch(e){failed=true;throw e;}finally{if(failed)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});else await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
