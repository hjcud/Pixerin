import test from 'node:test';import assert from 'node:assert/strict';
import {sourceAnalysisContext,validateSemanticPlan,buildSourceAnalysisRequest} from '../electron/semantic-analysis.mjs';
import {buildStructuredProviderRequest} from '../electron/providers.mjs';
import {semanticDraft} from '../electron/semantic-conversion.mjs';
const raster=(fn)=>({width:128,height:128,data:Buffer.from(Array.from({length:16384},(_,i)=>fn(i%128,Math.floor(i/128))).flat())});
const makePlan=c=>({sourceHash:c.sourceHash,summary:'Source structures',confidence:.95,outline:'none',regions:[],features:[],warnings:[]});
const feat=(name,box,kind,swatches,minCells=[1,1],direction=[0,0])=>({name,box,kind,swatches,minCells,direction,optional:false,priority:99,confidence:.95});
const rod=()=>{const image=raster((x,y)=>y>=8&&y<116&&Math.abs(x-64)<Math.min(8,(y-8)/2)?[100,140,200,255]:[0,0,0,0]),context=sourceAnalysisContext(image,{width:16,height:16}),plan=makePlan(context);plan.regions=[{name:'narrow material',box:[.35,.05,.3,.9],role:'primary',swatches:[0],priority:95,confidence:.95}];plan.features=[feat('acute endpoint',[.42,.05,.16,.14],'tip',[0],[1,1],[0,-1]),feat('functional join',[.45,.82,.1,.08],'joint',[0])];return{image,context,plan};};
function components(data,w=16){const seen=new Set();let count=0;for(let i=0;i<data.length/4;i++)if(data[i*4+3]&&!seen.has(i)){count++;const q=[i];seen.add(i);for(const n of q){const x=n%w,y=Math.floor(n/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,p=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&p<data.length/4&&data[p*4+3]&&!seen.has(p)){seen.add(p);q.push(p);}}}}return count;}
test('source-axis reconstruction yields one terminal cell with a connected body and bounded palette',()=>{
 const{image,context,plan}=rod(),result=semanticDraft(image,16,16,{context,plan,reconstruct:true,contour:false,colors:8});
 assert.ok(result.diagnostics.recomposition.operations.some(o=>o.kind==='tip'&&o.status==='applied'));
 const rows=Array.from({length:16},(_,y)=>Array.from({length:16},(_,x)=>result.data[(y*16+x)*4+3]>0).filter(Boolean).length);
 assert.equal(rows.find(Boolean),1);assert.equal(components(result.data),1);assert.ok(rows.slice(5,12).some(n=>n>=2));
 assert.ok(result.data.every((v,i)=>i%4!==3||v===0||v===255));
});
test('a protected cell defers the whole structural operation without partial changes',()=>{
 const{image,context,plan}=rod(),writable=new Uint8Array(256).fill(1);writable[2*16+8]=0;
 const options={context,plan,writable,contour:false},before=semanticDraft(image,16,16,options),after=semanticDraft(image,16,16,{...options,reconstruct:true});
 assert.deepEqual(after.data,before.data);assert.ok(after.diagnostics.recomposition.operations.some(o=>o.reason==='protected-or-clipped'));
});
test('a source parent can gain room while nested identifying marks remain separate and source-colored',()=>{
 const image=raster((x,y)=>x>=40&&x<72&&y>=40&&y<64?((x>=46&&x<50||x>=64&&x<68)&&y>=45&&y<50||x>=54&&x<58&&y>=58&&y<62?[20,20,20,255]:[240,180,130,255]):x>=32&&x<88&&y>=24&&y<112?[120,65,40,255]:[0,0,0,0]),context=sourceAnalysisContext(image,{width:16,height:16}),plan=makePlan(context),skin=context.palette.find(p=>p.rgb[0]===240).id,dark=context.palette.find(p=>p.rgb[0]===20).id;
 plan.features=[feat('parent detail',[40/128,40/128,32/128,24/128],'identity',[skin,dark],[5,3]),feat('mark one',[46/128,45/128,4/128,5/128],'identity',[dark]),feat('mark two',[64/128,45/128,4/128,5/128],'identity',[dark]),feat('mark three',[54/128,58/128,4/128,4/128],'identity',[dark])];
 const result=semanticDraft(image,16,16,{context,plan,reconstruct:true,contour:false});
 assert.ok(result.diagnostics.recomposition.operations.find(o=>o.name==='parent detail'&&o.changed>0));
 const darkOnly=result.data.slice();for(let i=0;i<256;i++)if(darkOnly[i*4]!==20)darkOnly[i*4+3]=0;
 assert.ok(components(darkOnly)>=3,'nested marks merged');
});
test('real openings receive negative space but opaque reflections are never carved into holes',()=>{
 for(const opaque of [false,true]){const image=raster((x,y)=>((x-64)**2+(y-64)**2<40**2&&(opaque||(x-64)**2+(y-64)**2>5**2))?[80,120,180,255]:[0,0,0,0]),context=sourceAnalysisContext(image,{width:16,height:16}),plan=makePlan(context);plan.features=[feat('opening',[.47,.47,.06,.06],'gap',[],[2,2])];
  const before=semanticDraft(image,16,16,{context,plan,contour:false}),after=semanticDraft(image,16,16,{context,plan,contour:false,reconstruct:true});
  if(opaque){assert.deepEqual(after.data,before.data);assert.ok(after.diagnostics.recomposition.operations.some(o=>o.reason==='opaque-source'));}
  else{for(const y of [7,8])for(const x of [7,8])assert.equal(after.data[(y*16+x)*4+3],0);assert.equal(after.data[(6*16+7)*4+3],255);assert.equal(components(after.data),1);}
 }
});
test('round sources stay unchanged without a source-supported acute endpoint or minimum-space request',()=>{
 const image=raster((x,y)=>(x-64)**2+(y-64)**2<40**2?[180,60,120,255]:[0,0,0,0]),context=sourceAnalysisContext(image,{width:16,height:16}),plan=makePlan(context);plan.regions=[{name:'body',box:[0,0,1,1],role:'primary',swatches:[0],priority:95,confidence:.95}];
 const before=semanticDraft(image,16,16,{context,plan}),after=semanticDraft(image,16,16,{context,plan,reconstruct:true});assert.deepEqual(after.data,before.data);
});
test('native footprint bounds reject malformed plans and survive all provider transport schemas',()=>{
 const{context,plan}=rod();for(const minCells of [[0,1],[7,1],[1.5,2],[1],[1,2,3],'large'])assert.throws(()=>validateSemanticPlan({...plan,features:[{...plan.features[0],minCells}]},context));
 const request=buildSourceAnalysisRequest(context,'model');for(const provider of ['api','anthropic','gemini']){const body=buildStructuredProviderRequest(provider,request,'model').body,text=JSON.stringify(body);assert.ok(text.includes('"minCells"'));assert.ok(text.includes('"minCells":{"type":"array"'));}
});
