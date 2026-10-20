import test from 'node:test';
import assert from 'node:assert/strict';
import {outerPixelOutline,stripConnectedInk} from '../electron/pixel-outline.mjs';
import {sourceAnalysisContext} from '../electron/semantic-analysis.mjs';
import {renderSourceLayout,assertLayoutReadable,transformLayoutGroup} from '../electron/source-layout.mjs';

export function identityFixture(){
 const image={width:32,height:32,data:Buffer.alloc(32*32*4)},ink=[32,12,40],skin=[210,130,80],white=[250,248,240],pupil=[14,22,30];
 for(let y=4;y<28;y++)for(let x=4;x<28;x++)image.data.set([...((x<6||x>25||y<6||y>25)?ink:skin),255],(y*32+x)*4);
 for(let y=10;y<14;y++)for(let x=12;x<20;x++)image.data.set([...(x<16?white:pupil),255],(y*32+x)*4);
 for(let y=18;y<24;y++)for(let x=6;x<12;x++)image.data.fill(0,(y*32+x)*4,(y*32+x)*4+4);
 const context=sourceAnalysisContext(image,{width:16,height:16}),s=rgb=>context.palette.find(c=>c.rgb.join(',')===rgb.join(',')).id;
 const plan={format:'pixel-mat-source-layout',version:1,width:16,height:16,sourceHash:context.sourceHash,palette:context.palette.map(c=>c.id),materials:context.palette.map(c=>({id:'color-'+c.id,base:c.id,swatches:[c.id],role:c.id===s(ink)?'outline':'fill'})),parts:[{id:'body',source:[.125,.125,.75,.75],target:[2,2,12,12],swatches:[],fill:'source'}],marks:[],contacts:[],separation:[],patches:[{id:'paired-eye',parent:'body',source:[.375,.3125,.25,.125],target:[6,5,4,2],swatches:[],requirements:[{swatches:[s(white)],minCells:2},{swatches:[s(pupil)],minCells:2}]}],gaps:[{id:'opening',part:'body',source:[.1875,.5625,.1875,.1875],target:[3,9,3,3],outlineInset:1}],groups:[{id:'all',parts:['body']}]};
 return {image,context,plan,white,pupil};
}
test('outer outline is one simultaneous four-neighbor pass in exactly one source color',()=>{
 const image={width:7,height:7,data:Buffer.alloc(7*7*4)};image.data.set([230,100,40,255],(3*7+3)*4);const original=Buffer.from(image.data),r=outerPixelOutline(image,[35,12,41]);
 assert.equal(r.diagnostics.added,4);assert.equal(r.diagnostics.clipped,0);
 for(let y=0;y<7;y++)for(let x=0;x<7;x++){const at=(y*7+x)*4,adj=Math.abs(x-3)+Math.abs(y-3)===1;if(adj)assert.deepEqual([...r.data.subarray(at,at+4)],[35,12,41,255]);else assert.deepEqual([...r.data.subarray(at,at+4)],[...image.data.subarray(at,at+4)]);}
 assert.deepEqual(image.data,original);assert.deepEqual(Buffer.from(outerPixelOutline(image,[35,12,41],{mode:'none'}).data),original);
});
test('frame edges never wrap and report clipping without resizing the canvas',()=>{
 const image={width:3,height:3,data:Buffer.alloc(36)};image.data.set([5,6,7,255],0);const r=outerPixelOutline(image,[1,2,3]);assert.equal(r.diagnostics.clipped,2);assert.equal(r.diagnostics.added,2);assert.equal(r.data[(2*3+2)*4+3],0);assert.equal(r.width,3);
});
test('source ink removal preserves enclosed dark identity pixels and original input',()=>{
 const image={width:7,height:7,data:Buffer.alloc(196)},ink=new Uint8Array(49);
 for(let y=1;y<6;y++)for(let x=1;x<6;x++){const i=y*7+x,bound=x===1||x===5||y===1||y===5;image.data.set(bound?[20,10,30,255]:[200,120,90,255],i*4);ink[i]=Number(bound);}
 image.data.set([20,10,30,255],(3*7+3)*4);ink[3*7+3]=1;const before=Buffer.from(image.data),r=stripConnectedInk(image,ink);assert.equal(r.data[(3*7+3)*4+3],255);assert.equal(r.removed.reduce((a,b)=>a+b,0),16);assert.deepEqual(image.data,before);
});
test('source composite keeps both required colors together and outer ink cannot overwrite them',()=>{
 const {image,context,plan,white,pupil}=identityFixture(),before=Buffer.from(image.data),text=JSON.stringify(plan),core=assertLayoutReadable(renderSourceLayout(image,context,plan,{outline:'none'})),outer=assertLayoutReadable(renderSourceLayout(image,context,plan,{outline:'outer'}));
 for(const rgb of [white,pupil]){let count=0;for(let y=5;y<7;y++)for(let x=6;x<10;x++){const at=(y*16+x)*4;if(rgb.every((v,c)=>core.data[at+c]===v))count++;}assert.ok(count>=2);}
 for(let i=0;i<256;i++)if(core.data[i*4+3])assert.deepEqual([...outer.data.subarray(i*4,i*4+4)],[...core.data.subarray(i*4,i*4+4)]);
 assert.equal(outer.data[(10*16+4)*4+3],0,'explicit inset core remains a real hole');assert.equal(outer.data[(9*16+4)*4+3],255,'neighbor rim receives the requested outline');assert.deepEqual(image.data,before);assert.equal(JSON.stringify(plan),text);
});
test('invalid feature colors, budgets, collisions, stale sources and gap insets fail without mutation',()=>{
 const {image,context,plan}=identityFixture(),before=Buffer.from(image.data);
 for(const mutate of [p=>p.patches[0].requirements[0].swatches=[99],p=>p.patches[0].requirements[0].minCells=5,p=>p.patches.push(structuredClone(p.patches[0])),p=>p.patches[0].target=[15,5,4,2],p=>p.patches[0].source=[.01,.01,.1,.1],p=>p.gaps[0].outlineInset=2,p=>p.sourceHash='0'.repeat(64)]){const bad=structuredClone(plan);mutate(bad);assert.throws(()=>renderSourceLayout(image,context,bad,{outline:'outer'}));assert.deepEqual(image.data,before);}
 const unsupported=structuredClone(plan);unsupported.patches[0].requirements[0].swatches=[plan.materials.find(m=>m.role==='outline').base];assert.throws(()=>renderSourceLayout(image,context,unsupported,{outline:'none'}),/source support/);
 const exact=structuredClone(plan);delete exact.gaps[0].outlineInset;assert.throws(()=>assertLayoutReadable(renderSourceLayout(image,context,exact,{outline:'outer'})),/structural/);
});
test('coupled group transforms carry composite patches with the source part',()=>{
 const {image,context,plan}=identityFixture(),moved=transformLayoutGroup(plan,'all',{dx:1});assert.deepEqual(moved.patches[0].target,[7,5,4,2]);assert.deepEqual(moved.patches[0].source,plan.patches[0].source);assertLayoutReadable(renderSourceLayout(image,context,moved,{outline:'none'}));
});
