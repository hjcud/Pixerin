import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { createDocument, ensureLayers, activeLayer, applyProposal, documentRGBA } from "../src/core.mjs";
import { sampleDraft, reduceDraftColors, perceptualColor } from "../electron/pixel-conversion.mjs";
import { imageProposal } from "../electron/image-generation.mjs";
import { convertSpriteDrafts } from "../electron/sprite-conversion.mjs";

const raster = (width, height, at) => ({ width, height,
  data: Buffer.from(Array.from({ length: width * height }, (_, i) => at(i % width, Math.floor(i / width))).flat()) });
const input = () => ({ document: ensureLayers(createDocument(8, 8)), mask: Array(64).fill(true),
  prompt: "A green face", advancedGeneration: true, quality: { mode: "check", protect: true } });
const rgb = (data, x, y, width = 8) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));

test('perceptual color conversion preserves fractional channels for arrays and byte-array views',()=>{
 for(const color of [[63,100,168],[251,195,140],[192,43,54],[150,77,47],[41,43,76]]){
  const expected=perceptualColor(color);assert.ok(expected[0]>0&&expected[0]<1);
  for(const typed of [Buffer.from(color),new Uint8Array(color),new Uint8ClampedArray(color)])assert.deepEqual(perceptualColor(typed),expected);
 }
});

test('fixed-palette sprite conversion preserves exact source clothing and skin colors across all samplers',()=>{
 const palette=['#00000000','#200B09FF','#3F64A8FF','#FBC38CFF','#C02B36FF','#964D2FFF'],colors=palette.slice(1).map(c=>[1,3,5].map(p=>parseInt(c.slice(p,p+2),16))),image=raster(10,2,(x)=>[...colors[x%colors.length],255]);
 for(const method of ['nearest','features','structure']){
  const doc=convertSpriteDrafts([image],{width:10,height:2,palette,method}),out=documentRGBA(doc,false);
  assert.deepEqual([...out],[...image.data],method+': fixed palette changed an exact source color');
 }
});

test('nearest AI palette fitting cannot invent intermediate colors across unrelated materials',()=>{
 const image=raster(16,16,(x,y)=>x===0?[0,0,0,0]:[25+x*13,18+y*13,60+((x+y)%13)*13,255]);
 image.data.set([151,183,230,255],(8*16+8)*4);
 image.data.set([169,102,34,255],(2*16+8)*4);
 const available=new Set();for(let i=0;i<image.data.length;i+=4)if(image.data[i+3])available.add(image.data.subarray(i,i+3).toString('hex'));
 for(const wholeImage of[false,true]){
  const document=ensureLayers(createDocument(16,16)),mask=Array(256).fill(true),source={document,mask,prompt:'Retain the glass and cork colors',advancedGeneration:true,wholeImage,alphaLock:false,paletteOnly:false,quality:{mode:'check',protect:true}};
  const result=imageProposal(source,PNG.sync.write(image).toString('base64'),null,{method:'nearest',colors:8});
  const output=documentRGBA(applyProposal(document,mask,result.proposal,source).document),used=new Set();
  for(let i=0;i<output.length;i+=4)if(output[i+3]){const color=Buffer.from(output.subarray(i,i+3)).toString('hex');assert.ok(available.has(color),'A source material must not acquire an invented averaged color');used.add(color);}
  assert.ok(used.size<=7);
 }
});

test("feature sampling retains supported off-center eyes that nearest sampling misses", () => {
  const image = raster(64, 64, (x, y) => {
    if (x < 8 || x >= 56 || y < 8 || y >= 56) return [255, 0, 255, 0];
    if (((x >= 24 && x < 27) || (x >= 40 && x < 43)) && y >= 24 && y < 28) return [20, 20, 20, 255];
    return [50, 190, 80, 255];
  });
  const original = Buffer.from(image.data), nearest = sampleDraft(image, 8, 8, 128, "nearest");
  const features = sampleDraft(image, 8, 8, 128, "features");
  for (const x of [3, 5]) {
    assert.deepEqual(rgb(nearest, x, 3), [50, 190, 80, 255]);
    assert.deepEqual(rgb(features, x, 3), [20, 20, 20, 255]);
  }
  for (let i = 3; i < features.length; i += 4) assert.equal(features[i], nearest[i]);
  assert.deepEqual(image.data, original);
  assert.deepEqual(sampleDraft(image, 8, 8, 128, "features"), features);
});

test("source speckles and invisible RGB do not become invented details or opaque edges", () => {
  const image = raster(32, 32, (x, y) => x % 4 === 0 && y % 4 === 0 ? [0, 0, 0, 255] : [50, 190, 80, 255]);
  const features = sampleDraft(image, 8, 8, 128, "features");
  for (let i = 0; i < 64; i++) assert.deepEqual(rgb(features, i % 8, Math.floor(i / 8)), [50, 190, 80, 255]);
  const sparse = raster(32, 32, (x, y) => x % 4 === 2 && y % 4 === 2 ? [50, 190, 80, 255] : [255, 0, 255, 0]);
  assert.ok(sampleDraft(sparse, 8, 8, 128, "features").every((v) => v === 0));
  const alpha = raster(8, 8, () => [50, 190, 80, 100]);
  assert.equal(sampleDraft(alpha, 8, 8, 128, "features")[3], 0);
  assert.equal(sampleDraft(alpha, 8, 8, 64, "features")[3], 255);
});

test("thin connected strokes survive without rescuing isolated transparent-cell speckles", () => {
  for (const horizontal of [false, true]) {
    const line = raster(32, 32, (x, y) => (horizontal ? y : x) === 14 ? [20, 20, 20, 255] : [255, 0, 255, 0]);
    const result = sampleDraft(line, 8, 8, 128, "features");
    assert.equal([...result].filter((v, i) => i % 4 === 3 && v === 255).length, 8);
    assert.deepEqual(result, sampleDraft(line, 8, 8, 128, "nearest"));
  }
  const dot = raster(32, 32, (x, y) => x === 14 && y === 14 ? [20, 20, 20, 255] : [0, 0, 0, 0]);
  assert.ok(sampleDraft(dot, 8, 8, 128, "features").every((v) => v === 0));
});

test("perceptual palette learning excludes protected context and respects color budgets", () => {
  const data = Uint8ClampedArray.from(raster(8, 8, (x, y) => [x * 30, y * 30, (x + y) * 15, 255]).data);
  const before = new Uint8ClampedArray(data), mask = Array(64).fill(true);
  const reduced = reduceDraftColors(data, 8, mask);
  const colors = new Set(Array.from({ length: 64 }, (_, i) => rgb(reduced, i % 8, Math.floor(i / 8)).join(",")));
  assert.ok(colors.size <= 8); assert.ok([...colors].every((c) => c.endsWith(",255")));
  assert.deepEqual(data, before);
  const selected = mask.map((_, i) => i < 8), changed = new Uint8ClampedArray(data);
  for (let i = 8; i < 64; i++) changed.set([255, 0, 255, 255], i * 4);
  assert.deepEqual(reduceDraftColors(data, 2, selected).slice(0, 32), reduceDraftColors(changed, 2, selected).slice(0, 32));
});

test("both conversion methods preserve exact alpha, inactive layers and frozen protection", () => {
  const source = input(), layer = activeLayer(source.document);
  source.document.palette.push("#50A88973"); layer.pixels.fill(source.document.palette.length - 1);
  source.document.palette.push("#50C86473");
  layer.alphaLocked = true; layer.mask = Array(64).fill(true); layer.mask[1] = false;
  layer.refinementProtection = Array(64).fill(false); layer.refinementProtection[2] = true;
  source.mask[3] = false; source.paletteOnly = true;
  source.document.layers.push({ id: "other", name: "Other", visible: true, locked: false, pixels: Array(64).fill(7) });
  const before = structuredClone(source), image = raster(64, 64, () => [80, 200, 100, 255]);
  for (const method of ["nearest", "features", "structure"]) {
    const result = imageProposal(source, PNG.sync.write(image).toString("base64"), null, { method });
    const applied = applyProposal(source.document, source.mask, result.proposal, { alphaLock: true, paletteOnly: true }).document;
    assert.equal(result.proposal.runs.length, 61);
    assert.deepEqual(result.proposal.new_colors, []);
    assert.ok(!result.proposal.runs.some((run) => run.y === 0 && [1, 2, 3].includes(run.x)));
    assert.ok(activeLayer(applied).pixels.every((index) => applied.palette[index].endsWith("73")));
    assert.deepEqual(applied.layers[1], before.document.layers[1]);
  }
  assert.deepEqual(source, before);
  assert.throws(() => imageProposal(source, PNG.sync.write(image).toString("base64"), null, { method: "unknown" }));
});

test("existing-palette conversion still honors the requested draft color budget", () => {
  const source = input(); source.paletteOnly = true;
  const image = raster(8, 8, (x, y) => [x * 30, y * 30, (x + y) * 15, 255]);
  const result = imageProposal(source, PNG.sync.write(image).toString("base64"), null, { method: "features", colors: 8 });
  const applied = applyProposal(source.document, source.mask, result.proposal, { paletteOnly: true }).document;
  assert.ok(new Set(activeLayer(applied).pixels).size <= 8);
  assert.deepEqual(applied.palette, source.document.palette);
});

test("large draft bins enforce the color budget even when many shades share one bin", () => {
  const size=65537, rgba=new Uint8ClampedArray(size*4), mask=new Uint8Array(size).fill(1);
  for(let i=0;i<size;i++) rgba.set([64+(i%16),96+(Math.floor(i/16)%16),128+(Math.floor(i/256)%16),255],i*4);
  const result=reduceDraftColors(rgba,8,mask), colors=new Set();
  for(let i=0;i<size;i++) colors.add(result.subarray(i*4,i*4+4).join(","));
  assert.ok(colors.size<=8);assert.equal(rgba[4],65);
});

test('app draft color budgets reserve transparency for both samplers and whole/cropped proposals',()=>{
 for(const method of ['features','nearest','structure'])for(const wholeImage of [false,true]){
  const source=input();source.wholeImage=wholeImage;
  const image=raster(8,8,(x,y)=>x===0?[0,0,0,0]:[x*30,y*30,(x+y)*15,255]);
  const result=imageProposal(source,PNG.sync.write(image).toString('base64'),null,{method,colors:8});
  const doc=applyProposal(source.document,source.mask,result.proposal,source).document;
  assert.ok(new Set(doc.pixels.map(i=>doc.palette[i])).size<=8,method+'/'+wholeImage);
  assert.ok(doc.pixels.some(i=>doc.palette[i].endsWith('00')));
 }
});

test('perceptual palette seeds retain a small contrasting accent instead of duplicating dominant shades',()=>{
 const data=new Uint8ClampedArray(128*4);
 for(let i=0;i<120;i++)data.set([240+i%8,130+i%7,30+i%5,255],i*4);
 for(let i=120;i<127;i++)data.set([25,15,10,255],i*4);
 data.set([95,175,20,255],127*4);
 const original=new Uint8ClampedArray(data),mask=Array(128).fill(true);
 for(const budget of [3,4,5]){
  const reduced=reduceDraftColors(data,budget,mask);
  assert.deepEqual([...reduced.slice(127*4)],[95,175,20,255]);
  assert.ok(new Set(Array.from({length:128},(_,i)=>reduced.subarray(i*4,i*4+3).join(','))).size<=budget);
  assert.deepEqual(reduced,reduceDraftColors(data,budget,mask));
 }
 assert.deepEqual(data,original);
});
