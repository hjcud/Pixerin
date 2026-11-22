if(require('./test-runner.cjs').bootstrap(__filename))return;
const {_electron}=require('./test-electron.cjs'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=await require('./test-runner.cjs').createProfile('native-review-');
 const {createDocument,ensureLayers}=await import('../src/core.mjs');const doc=ensureLayers(createDocument(8,8,'Visual review fixture'));doc.layers[0].alphaLocked=false;
 await fs.writeFile(path.join(profile,'draft.json'),JSON.stringify(doc));
 const env={...process.env,PIXELTOOL_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:require('electron'),args:[root],env});let page,failed=true;const cases=[],errors=[];
 try{
  page=await require('./first-editor.cjs')(app);await require('./editor-ready.cjs')(page);page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate((_,root)=>{
   globalThis.__reviewMode='revise';globalThis.__reviewCalls=[];
   const response=value=>Response.json({status:'completed',usage:{input_tokens:10,output_tokens:3},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
   globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body),ctx=JSON.parse(body.input[0].content[0].text);
    const reviewing=body.text?.format?.name==='native_visual_review';globalThis.__reviewCalls.push(reviewing?'review':'draft');
    const empty={summary:'Keep',new_colors:[],segments:[]};
    if(reviewing){
      if(globalThis.__reviewMode==='hold')return new Promise((resolve,reject)=>{
       globalThis.__lateReview=()=>resolve(response({decision:'keep',summary:'Keep',findings:[],patch:empty}));
       options.signal.addEventListener('abort',()=>reject(new DOMException('Canceled','AbortError')),{once:true});
      });
      const span=ctx.editable_segments.find(s=>s.y===2&&s.x<=2&&s.x+s.length>2);
      return response({decision:'revise',summary:'Restore the eye',findings:['Missing eye <img src=x onerror="window.__injected=true"> '+'A'.repeat(160)],patch:{summary:'Eye',new_colors:[],segments:globalThis.__reviewMode==='oversized'?ctx.editable_segments.map(s=>({id:s.id,colors:1})):[{id:span.id,colors:{set:[2-span.x,1]}}]}});
    }
    const segments=ctx.editable_segments.filter(s=>s.y>=1&&s.y<=3).map(s=>({id:s.id,colors:Array.from({length:s.length},(_,i)=>s.x+i>=1&&s.x+i<=4?7:null)}));
    return response({summary:'Face draft',new_colors:[],segments});
   };
  },root);
  await require('./configure-test-api.cjs')(page);
  const saved=async()=>await page.evaluate(()=>window.pixeltool.loadDraft());
  const nativePixels=raw=>raw?.layers?.[0]?.pixels||raw?.pixels||[];
  const start=async()=>{await page.locator('#prompt').fill('두 눈이 보이는 얼굴');await page.locator('#generate-btn').click();};
  await start();await page.locator('#proposal-card').waitFor({state:'visible'});
  assert.deepEqual(await app.evaluate(()=>globalThis.__reviewCalls),['draft','review']);
  assert.ok(nativePixels(await saved()).every(v=>v===0),'The proposal never writes the document');
  await page.locator('#quality-report > summary').click();
  assert.equal(await page.locator('#quality-visual-findings li').count(),1);assert.equal(await page.locator('#quality-visual-findings img').count(),0);
  assert.equal(await page.evaluate(()=>window.__injected),undefined);
  const group=page.locator('.dock-group:has(.dock-tab[data-panel="ai"])');
  await group.locator('.dock-panel-menu > summary').click();const opened=app.waitForEvent('window');opened.catch(()=>{});
  await group.locator('[data-move-panel="window"]').click();const panel=await opened;panel.setDefaultTimeout(10000);
  await panel.waitForSelector('#quality-report');
  await app.evaluate(({BrowserWindow},url)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url).setContentSize(320,240),panel.url());
  for(const language of ['ko','en','ja','zh-CN','es','fr','de']){
   await page.evaluate(async language=>{const s=await window.pixeltool.getSettings();await window.pixeltool.savePreferences({...s.preferences,language});},language);
   await page.waitForFunction(language=>document.documentElement.lang===language,language);
   assert.ok((await panel.locator('#quality-result').textContent()).trim());
   await panel.locator('#apply-btn').scrollIntoViewIfNeeded();
   assert.ok(await panel.locator('#apply-btn').isEnabled());
   assert.ok(await panel.locator('#quality-visual-findings').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   assert.ok(await panel.locator('#apply-btn').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);}));
  }
  await page.evaluate(async()=>{const s=await window.pixeltool.getSettings();await window.pixeltool.savePreferences({...s.preferences,language:'ko'});});
  await fs.mkdir(path.join(root,'artifacts','native-review'),{recursive:true});
  await panel.locator('#quality-report').scrollIntoViewIfNeeded();
  await panel.screenshot({path:path.join(root,'artifacts','native-review','native-findings.png'),animations:'disabled'});
  await panel.locator('#native-panel-return').click();
  await page.locator('#quality-report').waitFor({state:'visible'});
  await page.locator('#quality-report').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,'artifacts','native-review','proposal.png'),animations:'disabled'});
  await page.locator('#apply-btn').click();await page.waitForFunction(async()=>{const d=await window.pixeltool.loadDraft();return d?.layers?.[0]?.pixels[18]===1;});
  await page.locator('#undo-btn').click();await page.waitForFunction(async()=>{const d=await window.pixeltool.loadDraft();return d.layers[0].pixels.every(v=>v===0);});
  cases.push('default repair uses one rendered visual review, safe text findings, seven locales, atomic apply and undo');
  await app.evaluate(()=>{globalThis.__reviewMode='revise';globalThis.__reviewCalls=[];});
  await start();await page.locator('#proposal-card').waitFor({state:'visible'});
  if(!await page.locator('#quality-report').evaluate(el=>el.open))await page.locator('#quality-report > summary').click();
  await page.locator('#quality-use-draft').click();assert.match(await page.locator('#quality-counts').textContent(),/0px/);
  await page.locator('#apply-btn').click();await page.waitForFunction(async()=>{const d=await window.pixeltool.loadDraft();return d.layers[0].pixels[18]===7;});
  await page.locator('#undo-btn').click();await page.waitForFunction(async()=>{const d=await window.pixeltool.loadDraft();return d.layers[0].pixels.every(v=>v===0);});
  cases.push('choosing the draft removes the visual patch and remains one undoable edit');
  await app.evaluate(()=>{globalThis.__reviewMode='oversized';globalThis.__reviewCalls=[];});
  await start();await page.locator('#proposal-card').waitFor({state:'visible'});
  assert.deepEqual(await app.evaluate(()=>globalThis.__reviewCalls),['draft','review']);
  if(!await page.locator('#quality-report').evaluate(el=>el.open))await page.locator('#quality-report > summary').click();
  assert.match(await page.locator('#quality-result').textContent(),/초안/);assert.ok(await page.locator('#quality-visual-findings').isHidden());
  assert.ok(nativePixels(await saved()).every(v=>v===0));await page.locator('#discard-btn').click();
  cases.push('an excessive visual redraw falls back to the uncommitted draft');
  await app.evaluate(()=>{globalThis.__reviewMode='hold';globalThis.__reviewCalls=[];});
  await start();await page.waitForFunction(()=>!document.querySelector('#cancel-request').hidden);
  for(let i=0;i<100;i++){if((await app.evaluate(()=>globalThis.__reviewCalls)).includes('review'))break;await page.waitForTimeout(20);}
  assert.deepEqual(await app.evaluate(()=>globalThis.__reviewCalls),['draft','review']);
  await page.locator('#cancel-request').click();await app.evaluate(()=>globalThis.__lateReview());
  await page.locator('#generate-btn').waitFor({state:'visible'});assert.ok(await page.locator('#proposal-card').isHidden());
  assert.ok(nativePixels(await saved()).every(v=>v===0));cases.push('cancel and late review never apply either proposal');
  await app.evaluate(()=>{globalThis.__reviewMode='revise';globalThis.__reviewCalls=[];});
  if(!await page.locator('#ai-options').evaluate(el=>el.open))await page.locator('#ai-options > summary').click();
  await page.locator('#ai-quality').selectOption('check');await start();await page.locator('#proposal-card').waitFor({state:'visible'});
  assert.deepEqual(await app.evaluate(()=>globalThis.__reviewCalls),['draft']);await page.locator('#discard-btn').click();
  cases.push('check-only retains the single-request path');
  assert.deepEqual(errors,[]);failed=false;console.log('PASS: '+cases.join('; ')+'. All model calls mocked.');
 }finally{
  await fs.mkdir(path.join(root,'artifacts','native-review'),{recursive:true});await fs.writeFile(path.join(root,'artifacts','native-review','results.json'),JSON.stringify({passed:!failed,cases,errors},null,2));
  if(failed&&page)await page.screenshot({path:path.join(root,'artifacts','native-review','failure.png')}).catch(()=>{});
  if(failed)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});else await app.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
