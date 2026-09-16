import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, validateDocument, documentRGBA, History } from "../src/core.mjs";
import { MAX_DOCUMENT_SIZE, maximumZoom, assertCanvasSize, fitsCanvasSize, fitCanvasSize } from "../src/document-region.mjs";

test("4096-square pixels render exactly and compress internally for undo without changing project JSON", () => {
  assert.equal(MAX_DOCUMENT_SIZE, 4096);
  const doc = validateDocument({...createDocument(1,1),width:4096,height:4096,pixels:Array(4096*4096).fill(0)}), last = doc.pixels.length - 1;
  doc.pixels[last] = 7;
  const rgba = documentRGBA(doc);
  assert.equal(rgba.length, 4096 * 4096 * 4);
  assert.deepEqual(Array.from(rgba.slice(-4)), [80, 168, 137, 255]);
  const encoded = History.encode({ document: doc, selection: Array(doc.pixels.length).fill(false) });
  assert.ok(encoded.length < 10000);
  const restored = History.decode(encoded);
  assert.equal(restored.document.pixels[last], 7); assert.equal(restored.selection.length, doc.pixels.length);
  assert.ok(Array.isArray(restored.document.pixels));
  assert.equal(maximumZoom(doc), 64);
});

test("new canvases share the native image-model edge and area limits without restricting tiny pixel art",()=>{
  for(const [w,h] of [[3840,2160],[2160,3840],[2880,2880],[8,8],[1,3840]])assert.doesNotThrow(()=>assertCanvasSize(w,h));
  for(const [w,h] of [[3841,1],[3840,2161],[2880,2881],[4096,4096]]) {
    assert.equal(fitsCanvasSize(w,h),false);assert.throws(()=>createDocument(w,h),/8,294,400/);
  }
  assert.deepEqual(fitCanvasSize(4096,4096),{width:2880,height:2880});
  assert.equal(createDocument(8,8).pixels.length,64);
});

test("4K layer budgets reject excess allocations before cloning and preserve legacy dimensions", () => {
  assert.throws(() => validateDocument({ format: "pixeltool", version: 2, width: 4096, height: 4096,
    layers: Array.from({ length: 5 }, () => ({ pixels: [] })) }), /메모리 상한/);
  assert.throws(() => createDocument(4097, 1));
  assert.equal(maximumZoom(createDocument(256, 256)), 16);
});
