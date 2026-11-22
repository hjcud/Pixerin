import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument,ensureLayers,activeLayer,applyProposal} from '../src/core.mjs';
import {fixedScope} from '../electron/fixed-patch.mjs';
import {buildNativeReviewRequest,decodeNativeReview,requestNativeReview,nativeReviewInput} from '../electron/native-review.mjs';
import {requestWithQuality} from '../electron/quality-pipeline.mjs';
import {buildRequest,parseResponse} from '../electron/ai.mjs';
const fixture=()=>{
 const document=ensureLayers(createDocument(8,8));document.layers[0].alphaLocked=false;
 const input={document,mask:Array(64).fill(true),prompt:'A face with two readable eyes',quality:{mode:'repair',protect:true},alphaLock:false,paletteOnly:false};
 const proposal={summary:'Face draft',new_colors:[],runs:[{x:1,y:1,colors:[7,7,7,7]},{x:1,y:2,colors:[7,7,7,7]},{x:1,y:3,colors:[7,7,7,7]}]};
 const draft=applyProposal(document,input.mask,proposal,input).document;
 return {input,draft,first:{proposal,usage:{input_tokens:40,output_tokens:20}}};
};
function verdict(input,draft,{x=2,y=2,color=1,decision='revise'}={}){
 const scope=fixedScope(nativeReviewInput(input,draft));const at=scope.segments.find(s=>s.y===y&&s.x<=x&&s.x+s.length>x);
 return {decision,summary:'Restore a missing eye',findings:decision==='keep'?[]:['The left eye is absent.'],patch:{summary:'One eye pixel',new_colors:[],segments:decision==='keep'?[]:[{id:at?.id??0,colors:{set:[x-(at?.x??0),color]}}]}};
}
const wire=(provider,value,usage={})=>provider==='api'?{status:'completed',usage,output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}:
 provider==='anthropic'?{stop_reason:'end_turn',usage:{input_tokens:7,output_tokens:3},content:[{type:'text',text:JSON.stringify(value)}]}:
 {usageMetadata:{promptTokenCount:7,candidatesTokenCount:3},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]};

test('native review sees rendered draft, original identity and reference purposes without modifying snapshots',()=>{
 const {input,draft}=fixture();input.document.pixels[60]=7;
 const before=structuredClone({input,draft});const request=buildNativeReviewRequest(input,draft,'test-model');
 const context=JSON.parse(request.input[0].content[0].text);
 assert.equal(context.request,input.prompt);assert.equal(context.rows[2][2],7);assert.equal(context.native_review.original_rows[2][2],0);
 assert.equal(context.native_review.maximum_changed_pixels,3);assert.equal(context.palette_only,true);
 assert.equal(request.text.format.name,'native_visual_review');assert.equal(request.input[0].content.filter(p=>p.type==='input_image').length,2);
 assert.deepEqual({input,draft},before);
});

test('visual review omits unused role metadata while retaining saved detail protection',()=>{
 const {input}=fixture();activeLayer(input.document).refinementProtection=Array(64).fill(false);
 activeLayer(input.document).refinementProtection[0]=true;input.visualReviewPending=true;
 const request=buildRequest(input,'test-model'),context=JSON.parse(request.input[0].content[0].text);
 assert.equal(request.text.format.schema.properties.roles,undefined);assert.equal(context.icon_design,undefined);
 assert.equal(fixedScope(input).mask[0],false);
 const result=parseResponse(wire('api',{summary:'Keep',new_colors:[],segments:[]}),input);
 assert.equal(result.roles,undefined);
});

test('a sparse subject cannot be replaced wholesale using a mostly empty canvas budget',()=>{
 const {input,draft}=fixture(),scope=fixedScope(nativeReviewInput(input,draft));
 const values=scope.segments.filter(s=>s.y>=1&&s.y<=3).map(s=>({id:s.id,colors:{set:[1,1,2,1,3,1,4,1]}}));
 const proposal={decision:'revise',summary:'Replace subject',findings:['Replace every painted cell'],patch:{summary:'Redraw',new_colors:[],segments:values}};
 assert.throws(()=>decodeNativeReview(proposal,input,draft),/too much/);
 const request=buildNativeReviewRequest(input,draft,'test-model');
 assert.equal(JSON.parse(request.input[0].content[0].text).native_review.maximum_changed_pixels,3);
});

test('reviewing an unchanged source draft does not send its rendered image twice',()=>{
 const {input,draft}=fixture();input.document=draft;
 const request=buildNativeReviewRequest(input,draft,'test-model');
 const images=request.input[0].content.filter(p=>p.type==='input_image');
 assert.equal(images.length,1);assert.equal(new Set(images.map(p=>p.image_url)).size,images.length);
 assert.ok(request.input[0].content.some(p=>p.type==='input_text'&&p.text.includes('not sent twice')));
});

test('an explicit total-color budget includes transparency and unused palette colors cannot bypass it',()=>{
 const {input,draft}=fixture();input.reviewColorBudget=2;
 const value=verdict(input,draft);
 assert.throws(()=>decodeNativeReview(value,input,draft),/color budget/);
 assert.equal(JSON.parse(buildNativeReviewRequest(input,draft,'test-model').input[0].content[0].text).native_review.maximum_used_colors,2);
 input.reviewColorBudget=3;assert.equal(decodeNativeReview(value,input,draft).changed,1);
 for(const limit of[1,257,'16',NaN]){input.reviewColorBudget=limit;assert.throws(()=>buildNativeReviewRequest(input,draft,'test-model'),/color budget/);}
});

test('a bounded visual patch restores a missing part even without role annotations or a contrast defect',async()=>{
 const {input,draft,first}=fixture(),before=structuredClone(input);let firstCalls=0,reviewCalls=0;
 const result=await requestWithQuality({input,request:async source=>{firstCalls++;assert.equal(source.visualReviewPending,true);assert.equal(source.quality.protect,true);return first;},review:async(source,rendered)=>{
   reviewCalls++;const decoded=decodeNativeReview(verdict(source,rendered),source,rendered);return {...decoded,usage:{input_tokens:7,output_tokens:3}};
 }});
 assert.equal(firstCalls,1);assert.equal(reviewCalls,1);assert.equal(result.quality.status,'reconstructed');
 assert.equal(result.quality.visualReview.changed,1);assert.ok(result.draftProposal);
 const final=applyProposal(input.document,input.mask,result.proposal,input).document;
 assert.equal(final.pixels[18],1);assert.equal(draft.pixels[18],7);assert.deepEqual(input,before);
 assert.deepEqual(result.usage,{input_tokens:47,output_tokens:23});
});

test('keep cannot smuggle edits; redraws, new colors, repeated IDs and ungrounded revision verdicts fail',()=>{
 const {input,draft}=fixture();const valid=verdict(input,draft);
 assert.throws(()=>decodeNativeReview({...valid,decision:'keep'},input,draft));
 assert.throws(()=>decodeNativeReview({...valid,findings:[]},input,draft));
 assert.throws(()=>decodeNativeReview({...valid,summary:'x'.repeat(601)},input,draft));
 assert.throws(()=>decodeNativeReview({...valid,patch:{...valid.patch,new_colors:['#123456FF']}},input,draft));
 assert.throws(()=>decodeNativeReview({...valid,patch:{...valid.patch,segments:[...valid.patch.segments,...valid.patch.segments]}},input,draft));
 const segments=fixedScope(nativeReviewInput(input,draft)).segments.map(s=>({id:s.id,colors:1}));
 assert.throws(()=>decodeNativeReview({...valid,patch:{...valid.patch,segments}},input,draft),/too much/);
});

test('original selection, detail protection, inactive layers and exact locked alpha remain authoritative',()=>{
 const {input,draft}=fixture();input.mask[18]=false;
 activeLayer(input.document).refinementProtection=Array(64).fill(false);activeLayer(input.document).refinementProtection[19]=true;
 draft.layers[0].refinementProtection=[...activeLayer(input.document).refinementProtection];
 const scope=fixedScope(nativeReviewInput(input,draft));
 assert.equal(scope.mask[18],false);assert.equal(scope.mask[19],false);
 const firstSegment=scope.segments[0];const bad={decision:'revise',summary:'Bad',findings:['Bad'],patch:{summary:'Bad',new_colors:[],segments:[{id:9999,colors:1}]}};
 assert.throws(()=>decodeNativeReview(bad,input,draft));assert.ok(firstSegment);
 const locked=fixture();locked.input.document.palette.push('#11223373');locked.input.document.pixels[18]=locked.input.document.palette.length-1;
 locked.input.document.layers[0].alphaLocked=true;
 locked.draft=structuredClone(locked.input.document);locked.draft=ensureLayers(locked.draft);
 assert.throws(()=>decodeNativeReview(verdict(locked.input,locked.draft),locked.input,locked.draft));
 const extra={...structuredClone(activeLayer(draft)),id:'context'};input.document.layers.push(extra);draft.layers.push(structuredClone(extra));
 const result=decodeNativeReview(verdict(input,draft,{x:4}),input,draft);assert.deepEqual(result.document.layers[1],draft.layers[1]);
});

test('check-only, economy, tiles and empty changes do not spend a visual-review call',async()=>{
 for(const mode of ['check','off','economy','unchanged','tile']){
  const {input,first}=fixture();if(['check','off'].includes(mode))input.quality.mode=mode;
  if(mode==='economy')input.economy=true;if(mode==='unchanged')first.proposal.runs=[];
  if(mode==='tile')input.document.tileMode={material:'grass',wrap:true};
  let reviews=0;await requestWithQuality({input,request:async()=>first,review:async()=>{reviews++;throw Error('No call expected');}});
  assert.equal(reviews,0,mode);
 }
});

test('review failure, timeout and missing usage keep the validated first draft',async()=>{
 for(const mode of ['failure','timeout']){
  const {input,first}=fixture();let reviews=0;
  const result=await requestWithQuality({input,request:async()=>first,repairTimeoutMs:10,review:async(_input,_draft,progress,signal)=>{
    reviews++;progress({type:'usage',usage:{input_tokens:7}});
    if(mode==='failure')throw Error('Failed');
    return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Timeout','AbortError')),{once:true}));
  }});
  assert.equal(reviews,1);assert.equal(result.quality.status,'fallback');assert.equal(result.quality.visualReview.status,'failed');
  assert.deepEqual(result.proposal,first.proposal);assert.equal(result.quality.usageIncomplete,true);assert.equal(result.usage.input_tokens,47);
 }
});

test('user cancellation propagates instead of returning a draft or a late visual result',async()=>{
 const {input,first}=fixture(),controller=new AbortController();
 await assert.rejects(requestWithQuality({input,signal:controller.signal,request:async()=>first,review:async(source,draft)=>{
  controller.abort();return {...decodeNativeReview(verdict(source,draft),source,draft),usage:{}};
 }}),{name:'AbortError'});
});

test('all three provider transports use structured visual review and expose usage, never an image-generation tool',async()=>{
 for(const provider of ['api','anthropic','gemini']){
  const {input,draft}=fixture();let calls=0;
  const result=await requestNativeReview({provider,key:'fixture-only',model:'test-model',input,draft,fetchImpl:async(_url,options)=>{
    calls++;const body=JSON.parse(options.body);assert.equal(body.tools,undefined);
    return Response.json(wire(provider,verdict(input,draft),{input_tokens:7,output_tokens:3}));
  }});
  assert.equal(calls,1);assert.equal(result.changed,1);assert.equal(result.usage.output_tokens,3);
 }
});
