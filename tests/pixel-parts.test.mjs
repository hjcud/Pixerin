import test from "node:test";
import assert from "node:assert/strict";
import { composePixelParts } from "../src/pixel-parts.mjs";

const plan = () => ({ format: "pixel-mat-parts", version: 1, width: 4, height: 4,
  palette: ["#00000000", "#AA5533FF", "#EEE2B3FF"], parts: [
    { id: "head", x: 1, y: 0, rows: [[1, 1], [1, 1]] },
    { id: "face", x: 1, y: 1, rows: [[0, 2], [2, 2]] },
  ] });
test("native parts retain exact cells, holes and painter order without mutating the design", () => {
  const source = plan(), original = structuredClone(source), document = composePixelParts(source);
  assert.deepEqual(document.pixels, [0,1,1,0, 0,1,2,0, 0,2,2,0, 0,0,0,0]);
  assert.deepEqual(source, original);
  assert.deepEqual(document.palette, source.palette);
});
test("native parts reject clipping, fractional placement and malformed or oversized designs", () => {
  for (const mutate of [p=>p.parts[0].x=3, p=>p.parts[0].y=.5,
    p=>p.parts[0].rows[0][0]=3, p=>p.parts[0].rows[1].pop(),
    p=>p.parts[1].id="head", p=>p.width=65, p=>p.parts[0].rows=[],
    p=>p.parts=Array.from({length:129},(_,i)=>({...p.parts[0],id:'part'+i})),
    p=>p.palette[0]='#123456FF', p=>p.palette[1]='#xyz', p=>p.version=2]) {
    const source=plan(); mutate(source); assert.throws(()=>composePixelParts(source));
  }
});
