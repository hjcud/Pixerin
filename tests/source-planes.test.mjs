import test from 'node:test';
import assert from 'node:assert/strict';
import {samplingPlanesContext,renderSamplingPlanes,fitAxis,sampleAxes,sampleAxesWithSupport} from '../electron/source-planes.mjs';
import {documentRGBA,validateDocument} from '../src/core.mjs';

function fixture(){
 const image={width:64,height:64,data:new Uint8Array(64*64*4)};
 const fill=(x,y,w,h,rgb)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)image.data.set([...rgb,255],(yy*64+xx)*4);};
 fill(16,12,32,46,[180,90,50]);fill(12,16,1,40,[40,80,160]);fill(12,28,8,4,[40,80,160]);
 const context=samplingPlanesContext(image,{width:16,height:16}),plan={format:'pixel-mat-sampling-planes',version:1,sourceHash:context.sourceHash,width:16,height:16,summary:'Keep the source silhouette and supported thin contact',x:[],y:[],omissions:[]};
 return{image,context,plan};
}
test('sampling planes create an exact native project without mutating source, plan or context',()=>{
 const {image,context,plan}=fixture(),before=structuredClone({image,context,plan}),r=renderSamplingPlanes(image,{context,plan,width:16,height:16,colors:4});
 validateDocument(r.document);assert.equal(r.document.width,16);assert.equal(r.document.height,16);assert.ok(r.document.palette.length<=4);for(let i=3,a=documentRGBA(r.document,false);i<a.length;i+=4)assert.ok([0,255].includes(a[i]));
 assert.deepEqual({image,context,plan},before);assert.equal(r.diagnostics.requiresVisualReview,true);assert.equal(r.diagnostics.newComposition,true);
});
test('the axis allocation finds the lowest allowed placement cost and yields a strictly ordered separable grid',()=>{
 const anchors=[{position:1.8,role:'first',weight:3},{position:2.1,role:'second',weight:1}],r=fitAxis(5,anchors,1.5);let minimum=Infinity;
 for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)if(Math.abs(1.8-a-.5)<=1.5&&Math.abs(2.1-b-.5)<=1.5)minimum=Math.min(minimum,(1.8-a-.5)**2*3+(2.1-b-.5)**2);
 assert.ok(Math.abs(r.cost-minimum)<1e-10);for(let i=1;i<r.positions.length;i++)assert.ok(r.positions[i]>r.positions[i-1]);assert.equal(fitAxis(5,[{position:1.8,weight:1},{position:2.1,weight:1}],.1),null);
 const {image,context,plan}=fixture();plan.x=[{position:.3,role:'left core',weight:3,preserveTransparent:false},{position:.34,role:'right core',weight:2,preserveTransparent:false}];
 const d=renderSamplingPlanes(image,{context,plan,width:16,height:16});for(let x=1;x<16;x++)for(let y=1;y<16;y++)assert.ok((d.diagnostics.x.positions[x]-d.diagnostics.x.positions[x-1])*(d.diagnostics.y.positions[y]-d.diagnostics.y.positions[y-1])>0);
});
test('source-area support recovers a missed thin contact using real source RGB and honors explicit transparent columns',()=>{
 const {image}=fixture(),axis=fitAxis(16,[],2.75),point=sampleAxes(image,16,axis,axis),supported=sampleAxesWithSupport(image,16,axis,axis),at=5*16+3;
 assert.equal(point.data[at*4+3],0);assert.equal(supported.data[at*4+3],255);assert.deepEqual([...supported.data.subarray(at*4,at*4+3)],[40,80,160]);
 const sourceColors=new Set;for(let p=0;p<image.data.length;p+=4)if(image.data[p+3]>=128)sourceColors.add([...image.data.subarray(p,p+3)].join(','));
 for(const c of supported.support.filled){assert.ok(c.coverage>=.5||c.coverage>=.125&&c.crossing>=2&&c.connected);assert.ok(sourceColors.has(c.sourceRGB.join(',')));}
 const negative=fitAxis(16,[{position:3.5,role:'actual transparent sample line',weight:1,preserveTransparent:true}],2.75),guarded=sampleAxesWithSupport(image,16,negative,axis);assert.equal(guarded.data[at*4+3],0);
 for(let p=0;p<point.data.length;p+=4)if(point.data[p+3])assert.deepEqual(supported.data.subarray(p,p+4),point.data.subarray(p,p+4));
});
test('stale source identities, target mismatches and unsupported geometry are rejected before producing an asset',()=>{
 const {image,context,plan}=fixture(),changed=structuredClone(image);changed.data[0]=1;
 assert.throws(()=>renderSamplingPlanes(changed,{context,plan,width:16,height:16}),/stale/);
 assert.throws(()=>renderSamplingPlanes(image,{context:{...context,purpose:'source-layout'},plan,width:16,height:16}),/stale/);
 assert.throws(()=>renderSamplingPlanes(image,{context,plan:{...plan,width:32},width:16,height:16}),/stale/);
 assert.throws(()=>samplingPlanesContext({...image,width:32,data:new Uint8Array(32*64*4)},{width:16,height:16}),/square/);
 assert.throws(()=>samplingPlanesContext(image,{width:64,height:64}),/16x16 or 32x32/);
});
test('invalid, duplicate, oversubscribed or infeasible guide planes do not relax their constraints',()=>{
 const {image,context,plan}=fixture(),base={position:.5,role:'feature',weight:1,preserveTransparent:false},run=x=>renderSamplingPlanes(image,{context,plan:{...plan,x},width:16,height:16});
 for(const bad of [{...base,position:NaN},{...base,position:0},{...base,position:1},{...base,weight:0},{...base,weight:5},{...base,preserveTransparent:'yes'},{...base,role:'bad\nlabel'}])assert.throws(()=>run([bad]),/anchor/);
 assert.throws(()=>run([base,{...base}]),/distinct/);assert.throws(()=>run(Array.from({length:17},(_,i)=>({...base,position:(i+1)/18}))),/Too many/);
 assert.throws(()=>run(Array.from({length:8},(_,i)=>({...base,position:.45+i*.001}))),/cannot fit/);
});
test('fixed palettes remain unchanged and a stricter total RGBA budget is enforced',()=>{
 const {image,context,plan}=fixture(),palette=['#00000000','#B45A32FF','#2850A0FF'],copy=[...palette],r=renderSamplingPlanes(image,{context,plan,width:16,height:16,colors:3,palette});
 assert.deepEqual(r.document.palette,palette);assert.deepEqual(palette,copy);assert.throws(()=>renderSamplingPlanes(image,{context,plan,width:16,height:16,colors:2,palette}),/color budget/);
 assert.throws(()=>renderSamplingPlanes(image,{context,plan,width:16,height:16,palette:['#00000000','#B45A3280']}),/opaque/);
});
