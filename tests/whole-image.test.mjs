import test from "node:test";
import assert from "node:assert/strict";
import {PNG} from "pngjs";
import {createDocument,ensureLayers,activeLayer,applyProposal,documentRGBA} from "../src/core.mjs";
import {buildRequest} from "../electron/ai.mjs";
import {buildImageRequest,imageProposal,requestImage} from "../electron/image-generation.mjs";
import {imageScope} from "../electron/image-scope.mjs";
import {wholeImagePlan} from "../electron/whole-image.mjs";
import {TransmissionLog} from "../electron/transmission-log.mjs";
import {transmissionSummary} from "../src/disclosure.mjs";
const input=(w=128,h=96)=>({document:ensureLayers(createDocument(w,h)),mask:new Uint8Array(w*h).fill(1),
  prompt:"Change the lighting, keep the subject",advancedGeneration:true,wholeImage:true,quality:{mode:"check",protect:true}});
const png=(w=16,h=16)=>PNG.sync.write({width:w,height:h,data:Buffer.from(Array(w*h).fill([80,168,137,255]).flat())}).toString("base64");

test("whole editing sends the existing full active frame once, while precise edits stay bounded",()=>{
  const source=input();source.document.pixels[0]=7;
  source.document.layers.push({...structuredClone(activeLayer(source.document)),id:"context",pixels:Array(128*96).fill(5)});
  source.image=source.activeImage="untrusted-renderer-image";
  const before=structuredClone(source),body=buildImageRequest(source,"mock");
  assert.equal(body.tools[0].action,"edit");assert.equal(body.max_tool_calls,1);assert.equal(body.store,false);
  assert.equal(body.tools[0].size,wholeImagePlan(source.document).size);
  assert.match(body.instructions,/WHOLE-IMAGE EDIT/);assert.match(body.instructions,/must not be flattened/);
  const images=body.input[0].content.filter(c=>c.type==="input_image");assert.equal(images.length,2);
  const first=PNG.sync.read(Buffer.from(images[0].image_url.split(",")[1],"base64"));
  assert.equal(first.width,128);assert.equal(first.height,96);assert.equal(first.data[3],255);assert.equal(first.data[7],0);
  assert.throws(()=>buildRequest(source,"mock"),/64px/);
  assert.deepEqual(source,before);
  assert.equal(buildImageRequest(input(),"mock").tools[0].action,"generate");
  assert.match(transmissionSummary(source.document,{wholeImage:true}),/전체/);
});

test("native 4K planning preserves landscape, portrait and square maxima within every provider bound",()=>{
  for(const [w,h] of [[3840,2160],[2160,3840],[2880,2880]])
    assert.equal(wholeImagePlan({width:w,height:h}).size,`${w}x${h}`);
  let state=913;
  for(let n=0;n<500;n++) {
    state=(Math.imul(state,1664525)+1013904223)>>>0;const w=1+state%4096;
    state=(Math.imul(state,1664525)+1013904223)>>>0;const h=1+state%4096;
    const p=wholeImagePlan({width:w,height:h});
    assert.ok(p.width<=3840&&p.height<=3840);assert.equal(p.width%16,0);assert.equal(p.height%16,0);
    assert.ok(p.width*p.height>=655360&&p.width*p.height<=8294400);
    assert.ok(p.width/p.height<=3&&p.height/p.width<=3);
  }
});

test("whole raster applies selected pixels atomically and preserves masks, details, layers and exact alpha",()=>{
  const source=input();source.paletteOnly=true;source.alphaLock=true;
  source.document.palette.push("#50A88973");source.document.pixels.fill(16);
  source.mask[0]=0;const l=activeLayer(source.document);
  l.refinementProtection=Array(128*96).fill(false);l.refinementProtection[1]=true;
  l.mask=Array(128*96).fill(true);l.mask[2]=false;l.maskEnabled=true;
  source.document.layers.push({...structuredClone(l),id:"inactive"});
  const before=structuredClone(source),result=imageProposal(source,png());
  assert.ok(result.proposal.raster.pixels instanceof Uint16Array);
  for(const i of [0,1,2]) assert.equal(result.proposal.raster.pixels[i],65535);
  const mask=imageScope(source).mask;
  const checked=applyProposal(source.document,mask,result.proposal,{alphaLock:true,paletteOnly:true});
  assert.equal(checked.document.palette[checked.document.pixels[3]].slice(7),"73");
  assert.deepEqual(checked.document.layers[1],source.document.layers[1]);assert.deepEqual(source,before);
  const bad=structuredClone(result.proposal);bad.raster.pixels[0]=1;
  assert.throws(()=>applyProposal(source.document,mask,bad,{alphaLock:true}),/보호/);
  bad.raster.pixels[0]=65535;bad.raster.pixels[3]=7;
  assert.throws(()=>applyProposal(source.document,mask,bad,{alphaLock:true}),/투명도/);
  assert.deepEqual(source,before);
});

test("whole edit handles a 3840px-wide frame with bounded raster transport, one mocked call and history",async()=>{
  const source=input(3840,128);source.document.pixels[0]=1;
  let calls=0,disk=null;
  const log=new TransmissionLog({read:async()=>disk,write:async(text)=>disk=JSON.parse(text)});await log.load();
  const row=await log.start(source,"api","mock");
  const result=await requestImage({input:source,key:"test",model:"mock",fetchImpl:async(url,options)=>{
    calls++;const body=JSON.parse(options.body);assert.equal(body.tools[0].action,"edit");
    assert.equal(body.tools[0].size,"3840x1280");
    return Response.json({status:"completed",output:[{type:"image_generation_call",status:"completed",result:png(32,1)}],usage:{input_tokens:100,output_tokens:30}});
  }});
  row.calls++;await log.finish(row,"completed",result.usage);
  assert.equal(calls,1);assert.equal(result.imageInfo.targetWidth,3840);assert.equal(result.imageInfo.scaled,true);
  const checked=applyProposal(source.document,imageScope(source).mask,result.proposal);
  assert.equal(checked.document.width,3840);assert.equal(checked.changed,3840*128);
  assert.equal(documentRGBA(checked.document,false).at(-1),255);
  const reload=new TransmissionLog({read:async()=>disk,write:async()=>{}});await reload.load();
  assert.equal(reload.snapshot().entries[0].pixels,3840*128);assert.equal(reload.snapshot().entries[0].wholeImage,true);
});

test("very wide images are padded as context and unpadded before full-width application",()=>{
  const source=input(256,8);source.document.pixels.fill(1);
  const body=buildImageRequest(source,"mock");
  const context=PNG.sync.read(Buffer.from(body.input[0].content.find(c=>c.type==="input_image").image_url.split(",")[1],"base64"));
  assert.equal(context.width,256);assert.equal(context.height,86);
  assert.equal(context.data[3],0);assert.equal(context.data[((39*256)*4)+3],255);
  const data=Buffer.alloc(96*32*4);
  for(let y=14;y<17;y++)for(let x=0;x<96;x++)data.set([80,168,137,255],(y*96+x)*4);
  const result=imageProposal(source,PNG.sync.write({width:96,height:32,data}).toString("base64"));
  const checked=applyProposal(source.document,imageScope(source).mask,result.proposal);
  assert.equal(checked.changed,256*8);assert.equal(checked.document.pixels[0],7);assert.equal(checked.document.pixels.at(-1),7);
});
