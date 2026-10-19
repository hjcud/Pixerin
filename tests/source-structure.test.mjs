import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {contentBounds,fitDraft,sampleSourceStructure,structureDraft,validateSourceSupport} from '../electron/source-structure.mjs';
import {createDocument,ensureLayers,activeLayer,documentRGBA,applyProposal} from '../src/core.mjs';
import {imageProposal} from '../electron/image-generation.mjs';
import {convertSpriteDrafts} from '../electron/sprite-conversion.mjs';
import {frameAt} from '../src/animation.mjs';
const raster=(w,h,fn)=>({width:w,height:h,data:Buffer.from(Array.from({length:w*h},(_,i)=>fn(i%w,Math.floor(i/w))).flat())});
test('content fit retains source proportions, frame fit placement and transparent-source behavior',()=>{
 const src=raster(80,80,(x,y)=>x>=30&&x<50&&y>=10&&y<70?[160,80,40,255]:[255,0,255,0]);
 assert.deepEqual(contentBounds(src),{x:30,y:10,width:20,height:60});
 const frame=fitDraft(src,32,32),trim=fitDraft(src,32,32,{fit:'content'});
 assert.deepEqual([frame.width,frame.height,frame.left,frame.top],[32,32,0,0]);
 assert.deepEqual([trim.width,trim.height,trim.left,trim.top],[10,30,11,1]);
 const blank=raster(20,20,()=>[255,0,255,0]);assert.equal(contentBounds(blank),null);
 assert.ok(structureDraft(blank,16,16,{fit:'content'}).data.every(c=>c===0));
 assert.throws(()=>fitDraft(src,16,16,{fit:'bad'}));
});
test('a circular source body stays symmetric and round in native coordinates',()=>{
 const src=raster(128,128,(x,y)=>(x-64)**2+(y-64)**2<=48**2?[120,70,180,255]:[0,0,0,0]);
 const out=structureDraft(src,16,16,{fit:'content'}),spans=[];
 for(let y=0;y<16;y++){const xs=Array.from({length:16},(_,x)=>x).filter(x=>out.data[(y*16+x)*4+3]);if(xs.length){assert.ok(Math.abs(xs[0]+xs.at(-1)-15)<=1);spans.push([y,xs.at(-1)-xs[0]+1]);}}
 assert.ok(Math.abs(Math.max(...spans.map(s=>s[1]))-(spans.at(-1)[0]-spans[0][0]+1))<=1);
 assert.ok(spans[0][1]<Math.max(...spans.map(s=>s[1])));
 assert.ok(spans.at(-1)[1]<Math.max(...spans.map(s=>s[1])));
 assert.equal(validateSourceSupport(out.data,out.constraints),true);
});
test('source support rejects moving an accent or changing the contour, regardless of valid palette and size',()=>{
 const src=raster(16,16,(x,y)=>x===7&&y===8?[220,30,40,255]:x>=3&&x<13&&y>=3&&y<13?[80,140,190,255]:[0,0,0,0]);
 const out=structureDraft(src,16,16),moved=new Uint8ClampedArray(out.data),changedAlpha=new Uint8ClampedArray(out.data);
 moved.set([220,30,40,255],(8*16+10)*4);
 changedAlpha.set([80,140,190,255],0);
 assert.throws(()=>validateSourceSupport(moved,out.constraints),/source support/);
 assert.throws(()=>validateSourceSupport(changedAlpha,out.constraints),/silhouette/);
 assert.ok(out.constraints.allowed[8*16+7].includes('#DC1E28FF'));
 assert.deepEqual(out.data,structureDraft(src,16,16).data);
});
test('protected source context cannot influence the source-structure palette or writable output',()=>{
 const src=raster(64,64,(x,y)=>[x*3,y*3,50,255]),other={...src,data:Buffer.from(src.data)},writable=Array.from({length:64},(_,i)=>i%8<4);
 for(let y=0;y<64;y++)for(let x=32;x<64;x++)other.data.set([255,0,255,255],(y*64+x)*4);
 const a=sampleSourceStructure(src,8,8,{writable,colors:4}),b=sampleSourceStructure(other,8,8,{writable,colors:4});
 assert.deepEqual(a.data,b.data);assert.deepEqual(a.constraints,b.constraints);
 assert.throws(()=>sampleSourceStructure(src,8,8,{writable:[true]}));
});
test('large and pathologically fragmented references take a bounded fallback',()=>{
 const src=raster(128,128,(x,y)=>(x+y)%2?[220,30,40,255]:[80,140,190,255]);
 assert.equal(sampleSourceStructure(src,65,8).diagnostics.boundedFallback,true);
 const noisy=raster(512,512,(x,y)=>(x+y)%2?[220,30,40,255]:[80,140,190,255]);
 const result=sampleSourceStructure(noisy,64,64);
 assert.equal(result.diagnostics.reason,'region-limit');assert.equal(result.constraints,null);
});
test('new conversion and fit preserve frozen masks, exact alpha, palette and inactive layers',()=>{
 const doc=ensureLayers(createDocument(16,16)),layer=activeLayer(doc);
 doc.palette.push('#508CBE73');layer.pixels.fill(doc.palette.length-1);layer.alphaLocked=true;
 layer.refinementProtection=Array(256).fill(false);layer.refinementProtection[119]=true;
 layer.mask=Array(256).fill(true);layer.mask[120]=false;
 doc.layers.push({id:'other',name:'Other',visible:true,locked:false,pixels:Array(256).fill(7)});
 const mask=Array(256).fill(true);mask[121]=false;
 const src=raster(64,64,(x,y)=>x>=8&&x<56&&y>=8&&y<56?[80,140,190,255]:[0,0,0,0]);
 const input={document:doc,mask,prompt:'Keep pose',advancedGeneration:true,paletteOnly:true,alphaLock:true,quality:{mode:'check',protect:true}};
 const before=structuredClone(doc);
 for(const wholeImage of[false,true])for(const fit of['frame','content']){
  const request={...input,wholeImage},result=imageProposal(request,PNG.sync.write(src).toString('base64'),null,{method:'structure',fit,colors:16});
  const applied=applyProposal(doc,mask,result.proposal,request).document;
  assert.deepEqual(applied.palette,doc.palette);assert.deepEqual(applied.layers[1],doc.layers[1]);
  for(const i of[119,120,121])assert.equal(applied.pixels[i],doc.pixels[i]);
  assert.ok(applied.pixels.every(i=>applied.palette[i].endsWith('73')));
 }
 assert.deepEqual(doc,before);
});
test('content-fit animation uses one union crop, preserving movement instead of recentering each frame',()=>{
 const images=[12,36].map(left=>raster(64,64,(x,y)=>x>=left&&x<left+12&&y>=20&&y<44?[180,60,50,255]:[0,0,0,0]));
 const clip=convertSpriteDrafts(images,{width:16,height:16,method:'structure',fit:'content',colors:8});
 const centers=[0,1].map(i=>{const rgba=documentRGBA(frameAt(clip,i));let sum=0,n=0;for(let j=0;j<256;j++)if(rgba[j*4+3]){sum+=j%16;n++;}return sum/n;});
 assert.ok(centers[1]-centers[0]>=8);
 assert.deepEqual(frameAt(clip,0).palette,frameAt(clip,1).palette);
 assert.throws(()=>convertSpriteDrafts([images[0],raster(32,32,()=>[0,0,0,0])],{width:16,height:16,fit:'content'}),/share source dimensions/);
});

test('all sprite samplers preserve non-square frame proportions without trimming or stretching',()=>{
 for(const [width,height] of [[64,128],[128,64]]){
  const src=raster(width,height,(x,y)=>x>=width/2-24&&x<width/2+24&&y>=height/2-24&&y<height/2+24?[180,60,50,255]:[255,0,255,0]);
  const before=Buffer.from(src.data);
  for(const method of ['nearest','features','structure']){
   const rgba=documentRGBA(convertSpriteDrafts([src],{width:16,height:16,method,fit:'frame'}));
   const xs=[],ys=[];for(let i=0;i<256;i++)if(rgba[i*4+3]){xs.push(i%16);ys.push(Math.floor(i/16));}
   assert.equal(Math.max(...xs)-Math.min(...xs)+1,6,method);
   assert.equal(Math.max(...ys)-Math.min(...ys)+1,6,method);
   assert.equal(Math.min(...xs),5);assert.equal(Math.min(...ys),5);
  }
  assert.deepEqual(src.data,before);
 }
});

test('frame-fit animation shares source placement rather than stretching or recentering moving artwork',()=>{
 const sources=[24,72].map(y=>raster(64,128,(x,yy)=>x>=16&&x<48&&yy>=y&&yy<y+16?[180,60,50,255]:[0,0,0,0]));
 for(const method of ['nearest','features','structure']){
  const clip=convertSpriteDrafts(sources,{width:16,height:16,method,fit:'frame',colors:8});
  const centers=[0,1].map(frame=>{const rgba=documentRGBA(frameAt(clip,frame));let x=0,y=0,n=0;for(let i=0;i<256;i++)if(rgba[i*4+3]){x+=i%16;y+=Math.floor(i/16);n++;}assert.equal(n,8);return[x/n,y/n];});
  assert.equal(centers[0][0],centers[1][0]);assert.equal(centers[1][1]-centers[0][1],6,method);
  assert.deepEqual(frameAt(clip,0).palette,frameAt(clip,1).palette);
 }
});
