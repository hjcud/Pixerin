import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceAnalysisContext,validateSemanticPlan,requestSourceAnalysis,buildSourceAnalysisRequest} from '../electron/semantic-analysis.mjs';
import {semanticDraft} from '../electron/semantic-conversion.mjs';
import {fitSourceContour} from '../electron/contour-fit.mjs';
import {imageProposal,sourceForAnalysis} from '../electron/image-generation.mjs';
import {GeneratedSourceCache} from '../electron/generated-source-cache.mjs';
import {TransmissionLog} from '../electron/transmission-log.mjs';
import {createDocument,ensureLayers,activeLayer,applyProposal,documentRGBA} from '../src/core.mjs';
import {PNG} from 'pngjs';
const raster=(w,h,fn)=>({width:w,height:h,data:Buffer.from(Array.from({length:w*h},(_,i)=>fn(i%w,Math.floor(i/w))).flat())});
const plan=c=>({sourceHash:c.sourceHash,summary:'Source materials',outline:'none',confidence:.95,regions:[],features:[],warnings:[]});
const region=(swatches,role,priority=90)=>({name:role,box:[0,0,1,1],swatches,role,priority,confidence:.95});
const feature=(name,swatches,optional=false)=>({name,box:[0,0,1,1],swatches,optional,kind:'identity',priority:optional?30:100,confidence:.95,direction:[0,0]});
test('semantic plans reject stale sources, invalid colors, boxes, directions and oversized replies',()=>{
 const source=raster(8,8,()=>[200,140,80,255]),c=sourceAnalysisContext(source,{width:16,height:16}),p=plan(c);
 assert.deepEqual(validateSemanticPlan(p,c),p);
 for(const bad of [{...p,sourceHash:'0'.repeat(64)},{...p,regions:[region([99],'primary')]},{...p,regions:[{...region([0],'primary'),box:[.9,0,.2,1]}]},{...p,features:[{...feature('end',[0]),kind:'tip'}]},{...p,features:Array(25).fill(feature('x',[0]))}])assert.throws(()=>validateSemanticPlan(bad,c));
 assert.throws(()=>semanticDraft({...source,data:Buffer.alloc(256)},16,16,{context:c,plan:p}));
});
test('primary bright material is retained, while an optional reflection loses competing coverage',()=>{
 const image=raster(16,16,(x)=>x%8<3?[255,255,255,255]:[40,140,200,255]),c=sourceAnalysisContext(image,{width:2,height:2}),white=c.palette.find(p=>p.rgb[0]===255).id,blue=1-white;
 const p=plan(c);p.regions=[region([white],'highlight',10),region([blue],'primary',90)];
 const reflection=semanticDraft(image,2,2,{context:c,plan:p,contour:false});
 p.regions=[region([white],'primary',100),region([blue],'shadow',0)];
 const primary=semanticDraft(image,2,2,{context:c,plan:p,contour:false});
 assert.equal(reflection.data[0],40);assert.equal(primary.data[0],255);
 assert.ok(Array.from(primary.data).every((v,i)=>i%4!==3||v===255));
});
test('mandatory identity wins a native-cell collision with optional glint',()=>{
 const image=raster(8,8,(x)=>x<2?[255,255,255,255]:[30,25,20,255]),c=sourceAnalysisContext(image,{width:1,height:1}),p=plan(c),white=c.palette.find(p=>p.rgb[0]===255).id;
 p.features=[feature('glint',[white],true),feature('pupil',[1-white])];
 const result=semanticDraft(image,1,1,{context:c,plan:p,contour:false});
 assert.equal(result.data[0],30);assert.equal(result.diagnostics.features.find(f=>f.name==='glint').status,'deferred');
});
test('low confidence preserves baseline, protected pixels cannot supply an output color, output stays indexed',()=>{
 const image=raster(32,32,(x,y)=>x<16?[200,20,40,255]:[20,y*7,150,255]),c=sourceAnalysisContext(image,{width:16,height:16}),p=plan(c),writable=Uint8Array.from({length:256},(_,i)=>Number(i%16<8));
 p.confidence=.4;
 const result=semanticDraft(image,16,16,{context:c,plan:p,colors:8,writable});
 assert.match(result.diagnostics.warnings.at(-1),/Low-confidence/);
 for(let i=0;i<256;i++)if(writable[i]&&result.data[i*4+3])assert.equal(result.data[i*4],200);else assert.equal(result.data[i*4+3],0);
});
test('contour polygon fitting keeps circle, narrow diagonal and true transparent hole without AA',()=>{
 for(const [shape,fn]of[['circle',(x,y)=>(x-64)**2+(y-64)**2<48**2],['diagonal',(x,y)=>Math.abs(x-y)<7],['ring',(x,y)=>{const d=(x-64)**2+(y-64)**2;return d<48**2&&d>25**2;}]]){
  const image=raster(128,128,(x,y)=>fn(x,y)?[10,30,80,255]:[0,0,0,0]),r=fitSourceContour(image,16,16);
  assert.ok(r.mask,shape);assert.ok(r.mask.some(Boolean));assert.ok(r.diagnostics.verticesAfter<r.diagnostics.verticesBefore);assert.ok(r.mask.every(x=>x===0||x===1));
  if(shape==='ring')assert.equal(r.mask[8*16+8],0);if(shape==='diagonal')assert.equal(r.mask[8*16+8],1);
 }
});
test('automatic source analysis uses the configured provider, one source preview and strict structured output',async()=>{
 const image=raster(8,8,()=>[20,30,40,255]),c=sourceAnalysisContext(image,{width:16,height:16}),p=plan(c);
 for(const provider of ['api','anthropic','gemini']){let calls=0;
  const result=await requestSourceAnalysis({image,width:16,height:16,provider,key:'test-key',model:'test-model',fetchImpl:async(url,init)=>{calls++;const body=JSON.parse(init.body);assert.ok(JSON.stringify(body).includes(c.sourceHash));assert.ok(!JSON.stringify(body).includes('test-key'));const text=JSON.stringify(p);return new Response(JSON.stringify(provider==='api'?{status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}],usage:{input_tokens:90,output_tokens:50}}:provider==='anthropic'?{stop_reason:'end_turn',content:[{type:'text',text}],usage:{input_tokens:90,output_tokens:50}}:{candidates:[{finishReason:'STOP',content:{parts:[{text}]}}],usageMetadata:{promptTokenCount:90,candidatesTokenCount:50}}),{headers:{'content-type':'application/json'}});}});
  assert.equal(calls,1);assert.equal(result.plan.sourceHash,c.sourceHash);assert.equal(result.usage.input_tokens,90);
 }
 const request=buildSourceAnalysisRequest(c,'model');assert.equal(request.input[0].content.filter(p=>p.type==='input_image').length,1);assert.equal(request.tools,undefined);
});
test('analysis cancellation and malformed replies cannot produce a conversion plan',async()=>{
 const image=raster(4,4,()=>[0,0,0,255]),controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(requestSourceAnalysis({image,width:16,height:16,provider:'api',key:'test',model:'model',signal:controller.signal,fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);
 await assert.rejects(requestSourceAnalysis({image,width:16,height:16,provider:'api',key:'test',model:'model',fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}]}))}),/Invalid or stale/);
});
test('semantic app proposals preserve masks, detail protection, exact alpha, palette and inactive layers atomically',()=>{
 const image=raster(64,64,(x,y)=>x>5&&y>5?[220,180,70,255]:[0,0,0,0]),base64=PNG.sync.write(image).toString('base64');
 for(const wholeImage of [false,true])for(const method of ['semantic','recompose']){
  const document=ensureLayers(createDocument(16,16));document.palette=['#00000000','#12345680','#DCB446FF'];document.pixels.fill(1);
  activeLayer(document).refinementProtection=Array(256).fill(false);activeLayer(document).refinementProtection[4]=true;
  document.layers.push({...structuredClone(activeLayer(document)),id:'other'});
  const input={document,mask:Array(256).fill(true),advancedGeneration:true,wholeImage,alphaLock:true,paletteOnly:true,prompt:'Material conversion'};input.mask[3]=false;
  const before=structuredClone(input),source=sourceForAnalysis(input,base64),context=sourceAnalysisContext(source.image,source),p=plan(context);
  p.regions=[region([0],'primary')];p.features=[{...feature('small structure',[0]),box:[.3,.3,.02,.02],minCells:[2,2]}];
  const result=imageProposal(input,base64,null,{method,fit:'content',colors:16,analysis:{context,plan:p}}),checked=applyProposal(document,input.mask,result.proposal,input);
  assert.deepEqual(input,before);assert.deepEqual(checked.document.palette,document.palette);assert.deepEqual(checked.document.layers[1],document.layers[1]);
  assert.equal(checked.document.pixels[3],1);assert.equal(checked.document.pixels[4],1);
  assert.ok(documentRGBA(checked.document,false).every((v,i)=>i%4!==3||v===128));
  assert.throws(()=>imageProposal(input,base64,null,{method:'semantic',analysis:{context,plan:{...p,sourceHash:'0'.repeat(64)}}}));assert.deepEqual(input,before);
 }
});
test('analysis caching isolates owners, omits the second raster, accounts for bytes and releases everything',()=>{
 const cache=new GeneratedSourceCache(100000),owner={},input={document:ensureLayers(createDocument(8,8)),mask:Array(64).fill(true)},result=cache.put(owner,input,{sourceImage:'abc'}),image=raster(8,8,()=>[100,20,30,255]),context=sourceAnalysisContext(image,{width:8,height:8}),p=plan(context),before=cache.bytes;
 assert.equal(cache.setAnalysis(owner,result.sourceId,{context,plan:p}),true);assert.ok(cache.bytes>before);
 assert.equal(cache.get(owner,result.sourceId).analysis.context.image,undefined);
 assert.throws(()=>cache.get({},result.sourceId));assert.throws(()=>cache.setAnalysis({},result.sourceId,{context,plan:p}));
 cache.setAnalysis(owner,result.sourceId,{context,plan:p});const size=cache.bytes;cache.setAnalysis(owner,result.sourceId,{context,plan:p});assert.equal(cache.bytes,size);
 cache.release(owner,result.sourceId);assert.equal(cache.bytes,0);
});
test('analysis history records transmitted preview dimensions and usage without retaining source analysis or pixels',async()=>{
 let saved;const log=new TransmissionLog({read:async()=>null,write:async text=>saved=text}),context={previewWidth:768,previewHeight:384,image:'PRIVATE',palette:['PRIVATE'],sourceHash:'PRIVATE'};
 const row=await log.startAnalysis(context,'api','model');row.calls++;await log.finish(row,'completed',{input_tokens:123,output_tokens:45});
 assert.ok(!saved.includes('PRIVATE'));assert.equal(log.snapshot().entries[0].mode,'analysis');assert.equal(log.snapshot().entries[0].pixels,768*384);assert.equal(log.snapshot().entries[0].usage.output_tokens,45);
 await assert.rejects(log.startAnalysis({...context,previewWidth:4096},'api','model'));
});
test('high-priority thin material retains a supported continuous diagonal without turning white fill into glare',()=>{
 const image=raster(128,128,(x,y)=>Math.abs(x-y)<4?[160,100,60,255]:[250,250,250,255]),context=sourceAnalysisContext(image,{width:16,height:16}),p=plan(context),brown=context.palette.find(s=>s.rgb[0]===160).id;
 p.regions=[region([brown],'primary',100),{...region([1-brown],'primary',95),name:'white primary'}];
 const r=semanticDraft(image,16,16,{context,plan:p,contour:false});
 assert.ok(r.diagnostics.strokes.some(s=>s.cells>=14));for(let i=0;i<16;i++)assert.equal(r.data[(i*16+i)*4],160);assert.equal(r.data[(2*16+9)*4],250);
});
test('mandatory identifying shade is reserved before palette fitting even when it is rare and low contrast',()=>{
 const image=raster(64,64,(x,y)=>x>=20&&x<24&&y>=20&&y<24?[121,122,123,255]:x<20?[100,100,100,255]:x<40?[120,120,120,255]:[200,200,200,255]),context=sourceAnalysisContext(image,{width:16,height:16}),p=plan(context),shade=context.palette.find(s=>s.rgb.join(',')==='121,122,123').id;
 p.features=[{...feature('identifying shade',[shade]),box:[20/64,20/64,4/64,4/64]}];
 const result=semanticDraft(image,16,16,{context,plan:p,colors:3,contour:false});
 assert.equal(result.diagnostics.palette[0].status,'source-color-reserved');assert.deepEqual([...result.data.subarray((5*16+5)*4,(5*16+6)*4)],[121,122,123,255]);
 const colors=new Set();for(let i=0;i<256;i++)if(result.data[i*4+3])colors.add([...result.data.subarray(i*4,i*4+3)].join(','));assert.ok(colors.size<=2);
});
