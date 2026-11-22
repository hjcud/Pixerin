// Offline transport benchmark, not a model-artwork quality evaluation.
// Optional argument: absolute path to an installed js-tiktoken module.
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createDocument, applyProposal, maskRuns } from "../src/core.mjs";
import { decodePatch } from "../electron/fixed-patch.mjs";
const require = createRequire(import.meta.url);
const encoder = require(process.argv[2] || "js-tiktoken").getEncoding("o200k_base");
const tokens = value => encoder.encode(JSON.stringify(value)).length;
const cases = [];
for (const size of [64, 80, 96, 128, 256]) for (const span of [4, 8, 16, 32]) {
  const counts = [], annotated = [];
  let testedPixels = 0, checked = 0;
  for (let seed = 0; seed < 3; seed++) for (const pattern of ["thin", "seams", "noise", "shade", "sparse"]) {
    const doc = createDocument(size, size);
    // Every fourth column remains protected, except one-pixel bridges.
    const mask = doc.pixels.map((_, i) => (i % size) % 4 !== 0 || Math.floor(i / size) % 7 === 0);
    const segments = maskRuns(mask, size).flatMap(({x,y,length}) =>
      Array.from({length: Math.ceil(length / span)}, (_, n) => ({x: x+n*span,y,length:Math.min(span,length-n*span)})))
      .map((s,id) => ({id,...s}));
    // Also measure an unrestricted high-entropy response, the output worst case.
    const full = Array.from({length: size * Math.ceil(size/span)}, (_, id) => ({id,
      colors: Array.from({length: Math.min(span, size-(id % Math.ceil(size/span))*span)}, (_, n) => 1+((id*31+n*17+seed)%255))}));
    if (pattern === "noise") {
      counts.push(tokens({summary:"Edit",new_colors:[],segments:full}));
      annotated.push(tokens({summary:"Edit",new_colors:[],segments:full,roles:full.map(s => ({id:s.id,
        roles:s.colors.map((_,n)=>"bshd"[(n+seed)%4]).join(""),materials:"a".repeat(s.colors.length),faces:"a".repeat(s.colors.length)}))}));
    }
    const expected = [...doc.pixels];
    const wire = {summary:"Generated fixture",new_colors:[],segments:segments.flatMap(s => {
      const colors = Array.from({length:s.length}, (_, n) => {
        const x=s.x+n, y=s.y;
        const on = pattern === "thin" ? x === (y+seed)%size : pattern === "seams" ? x%span===0 || x%span===span-1 : pattern === "sparse" ? (x*13+y*7+seed)%37===0 : true;
        const value = on ? 1+((x*3+y*5+seed)%12) : null;
        if(value!==null) expected[y*size+x]=value;
        return value;
      });
      const set = colors.flatMap((c,n)=>c===null?[]:[n,c]);
      if(!set.length) return [];
      return [{id:s.id, colors:set.length < colors.length ? {set} : colors}];
    })};
    const output = applyProposal(doc, mask, decodePatch(wire,segments)).document;
    assert.deepEqual(output.pixels, expected);
    assert.ok(doc.pixels.every(p=>p===0));
    if (wire.segments.length) {
      const corrupt=structuredClone(wire); corrupt.segments.push({...corrupt.segments[0]});
      assert.throws(()=>decodePatch(corrupt,segments));
    }
    testedPixels += size*size; checked++;
  }
  cases.push({size,span,repetitions:checked,testedPixels,transportPixelAccuracy:1,
    outsideScopeWrites:0, worstDenseTextTokens:Math.max(...counts),worstAnnotatedTextTokens:Math.max(...annotated),
    denseFitsWith25PercentReserve:Math.max(...counts)*1.25<=32768,
    annotatedFitsWith25PercentReserve:Math.max(...annotated)*1.25<=32768});
}
const report={note:"Synthetic exact-response transport tests only. Accuracy is serialization/mapping fidelity, not AI drawing quality. o200k_base reference text counts exclude model-specific overhead, images and reasoning. 25% reserve is an engineering guard, not a reliability guarantee.",cases};
await fs.mkdir(new URL("../artifacts/",import.meta.url),{recursive:true});
await fs.writeFile(new URL("../artifacts/ai-scope-benchmark.json",import.meta.url),JSON.stringify(report,null,2)+"\n");
console.table(cases);
