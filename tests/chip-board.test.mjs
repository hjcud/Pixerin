import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PNG} from 'pngjs';
import {decodeChipBoard,convertWholeChipBoard,resolveWholeStrategy} from '../electron/chip-board.mjs';
import {createDocument,ensureLayers,applyProposal,documentRGBA} from '../src/core.mjs';
import {buildImageRequest,imageProposal} from '../electron/image-generation.mjs';
import {normalizePreferences} from '../src/preferences.mjs';
function board(){
  const width=290,data=new Uint8Array(width*width*4);
  for(let i=0;i<data.length;i+=4)data.set([0,255,0,255],i);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)for(let yy=0;yy<16;yy++)for(let xx=0;xx<16;xx++)data.set(x===7&&y===7?[193,43,55,255]:[137,151,163,255],((y*18+2+yy)*width+x*18+2+xx)*4);
  return{width,height:width,data};
}
test('latest workflow selects median only at its supported native size; explicit strategies validate',()=>{
  assert.equal(resolveWholeStrategy('latest',16,16),'chip-median');
  assert.equal(resolveWholeStrategy('latest',32,32),'raster');
  assert.equal(normalizePreferences({}).wholeStrategy,'latest');
  assert.equal(normalizePreferences({wholeStrategy:'chip-region'}).wholeStrategy,'chip-region');
  assert.throws(()=>resolveWholeStrategy('chip-region',32,32));
  assert.throws(()=>resolveWholeStrategy('unknown',16,16));
});
test('chip decoder preserves fixed cells and edge-connected empty cells without native repainting',()=>{
  const source=board(),before=Buffer.from(source.data),decoded=decodeChipBoard(source);
  assert.equal(decoded.diagnostics.components,256);assert.equal(decoded.diagnostics.foregroundCells,1);
  assert.equal(decoded.diagnostics.singlePigmentContractPassed,true);
  for(const strategy of ['chip-median','chip-region']){
    const output=convertWholeChipBoard(source,{strategy,colors:16});
    assert.equal(output.document.width,16);assert.equal(output.document.height,16);
    const data=documentRGBA(output.document);assert.equal(data[(7*16+7)*4+3],255);
    assert.equal([...data].filter((v,i)=>i%4===3&&v).length,1);
  }
  assert.deepEqual(Buffer.from(source.data),before);
});
test('chip decoding rejects merged/invalid grids instead of inventing coordinates',()=>{
  const source=board();source.data.fill(255);assert.throws(()=>decodeChipBoard(source),/gate/);
  assert.throws(()=>decodeChipBoard({width:16,height:16,data:new Uint8Array(1024)}),/raster/);
});

test('current app/skill projections reproduce the retained preferred board and fixed palette exactly',async()=>{
  const directory=new URL('../docs/whole-style-recovery/',import.meta.url);
  const source=PNG.sync.read(await fs.readFile(new URL('accepted-board.png',directory)));
  const before=Buffer.from(source.data),palette=JSON.parse(await fs.readFile(new URL('palette.json',directory)));
  for(const [strategy,file]of [['chip-median','accepted-median.png'],['chip-region','accepted-region.png']]){
    const expected=PNG.sync.read(await fs.readFile(new URL(file,directory)));
    const result=convertWholeChipBoard(source,{strategy,palette,colors:16});
    assert.deepEqual(Buffer.from(documentRGBA(result.document)),expected.data);
    assert.equal(result.diagnostics.foregroundCells,99);
    assert.equal(result.diagnostics.mixedPigmentCells,50);
    assert.equal(result.diagnostics.singlePigmentContractPassed,false);
  }
  assert.deepEqual(Buffer.from(source.data),before);
});
test('unwritable chip colors cannot train the generated palette',()=>{
  const first=board(),second=board(),writable=Array(256).fill(false);writable[7*16+7]=true;
  for(const source of [first,second])for(let yy=0;yy<16;yy++)for(let xx=0;xx<16;xx++)source.data.set(source===first?[24,30,95,255]:[240,192,12,255],((8*18+2+yy)*290+8*18+2+xx)*4);
  for(const strategy of ['chip-median','chip-region']){
    const a=convertWholeChipBoard(first,{strategy,writable,colors:16}),b=convertWholeChipBoard(second,{strategy,writable,colors:16});
    assert.deepEqual(a.document.palette,b.document.palette);assert.deepEqual(documentRGBA(a.document),documentRGBA(b.document));
  }
});
test('whole-chip request holds user brief while choosing explicit board transport',()=>{
  const document=ensureLayers(createDocument(16,16)),input={document,mask:Array(256).fill(true),prompt:'A red object',advancedGeneration:true,wholeImage:true,wholeStrategy:'latest'};
  const body=buildImageRequest(input,'mock');
  assert.match(body.instructions,/256 detached/);assert.equal(body.tools[0].background,'opaque');
  assert.equal(JSON.parse(body.input[0].content[0].text).request,input.prompt);assert.equal(body.max_tool_calls,1);
  assert.equal(buildImageRequest({...input,wholeStrategy:'raster'},'mock').tools[0].background,'transparent');
});
test('whole-chip proposals retain scope, fixed palettes, locked alpha and atomic application',()=>{
  const document=ensureLayers(createDocument(16,16)),mask=Array(256).fill(false);mask[7*16+7]=true;
  document.palette=['#00000000','#C12B37FF','#7A393080'];document.pixels[7*16+7]=2;
  const input={document,mask,prompt:'A red object',advancedGeneration:true,wholeImage:true,wholeStrategy:'latest',paletteOnly:true,alphaLock:true};
  const source=board(),encoded=PNG.sync.write({...source,data:Buffer.from(source.data)}).toString('base64'),before=structuredClone(document);
  const result=imageProposal(input,encoded),applied=applyProposal(document,mask,result.proposal,input);
  assert.equal(result.imageInfo.wholeStrategy,'chip-median');assert.equal(documentRGBA(applied.document)[(7*16+7)*4+3],128);
  assert.deepEqual(document,before);assert.deepEqual(applied.document.palette,document.palette);
  for(let i=0;i<256;i++)if(!mask[i])assert.equal(applied.document.pixels[i],document.pixels[i]);
  assert.throws(()=>imageProposal(input,PNG.sync.write({width:16,height:16,data:Buffer.alloc(1024,255)}).toString('base64')));
  assert.deepEqual(document,before);
});
