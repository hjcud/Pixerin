import { sampleDraft, reduceDraftColors, perceptualColor, colorDistance } from "./pixel-conversion.mjs";
import { colorHex, ensureLayers, rgbaToDocument } from "../src/core.mjs";
import { replaceAnimation } from "../src/animation.mjs";
import { assertCanvasSize, MAX_DOCUMENT_CELLS } from "../src/document-region.mjs";
import { assertFrameDuration } from "../src/animation-data.mjs";
import { contentBounds, structureDraft, fitDraft } from "./source-structure.mjs";

// All draft frames are quantized together. Independent per-frame palettes cause
// color-role flicker even when each individual frame looks plausible.
export function convertSpriteDrafts(images, { width, height, colors = 16, threshold = 128, method = "features", fit = "frame", palette, duration = 100, loop = true } = {}) {
  assertCanvasSize(width, height); assertFrameDuration(duration);
  if (!Array.isArray(images) || !images.length || images.length > 128 || width * height * images.length > MAX_DOCUMENT_CELLS ||
      !Number.isInteger(colors) || colors < 2 || colors > 256 || !Number.isInteger(threshold) || threshold < 1 || threshold > 255 || !["features", "nearest", "structure"].includes(method)||!["frame","content"].includes(fit))
    throw Error("Invalid sprite conversion limits");
  let sourceCells = 0;
  for (const image of images) {
    if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 4096 || image.height > 4096 ||
        !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * 4)
      throw Error("Invalid draft raster");
    sourceCells += image.width * image.height;
  }
  if (sourceCells > 32 * 1024 * 1024) throw Error("Draft batch exceeds 128 MiB of source pixels");
  let bounds;
  if(fit==='content'){
    if(images.some(image=>image.width!==images[0].width||image.height!==images[0].height))throw Error('Content-fit animation frames must share source dimensions');
    const boxes=images.map(image=>contentBounds(image,threshold)).filter(Boolean);
    if(boxes.length){const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));bounds={x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};}
  }
  const frameBytes = width * height * 4, combined = new Uint8ClampedArray(frameBytes * images.length);
  images.forEach((image,i)=>{
    let rgba;
    if(method==='structure')rgba=structureDraft(image,width,height,{threshold,colors,fit,bounds}).data;
    else {
      // Keep the same aspect-preserving placement as structure and the app.
      // Frame fitting retains source margins; it must not stretch the frame.
      const p=fitDraft(image,width,height,{fit,threshold,bounds});rgba=new Uint8ClampedArray(frameBytes);const sampled=sampleDraft(p.image,p.width,p.height,threshold,method);
      for(let y=0;y<p.height;y++)rgba.set(sampled.subarray(y*p.width*4,(y+1)*p.width*4),((y+p.top)*width+p.left)*4);
    }
    combined.set(rgba,i*frameBytes);
  });
  let sharedPalette;
  if (palette) {
    if (!Array.isArray(palette) || palette.length < 2 || palette.length > 256) throw Error("Invalid fixed palette");
    sharedPalette = palette.map(colorHex);
    if (sharedPalette[0] !== "#00000000" || !sharedPalette.some(color => color.endsWith("FF"))) throw Error("A fixed palette needs transparent index 0 and opaque colors");
    const candidates = sharedPalette.map((color, index) => ({ index, color, lab: perceptualColor([1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16))) })).filter(item => item.color.endsWith("FF"));
    const cache = new Map();
    for (let i = 0; i < combined.length; i += 4) {
      if (!combined[i + 3]) continue;
      const key = `${combined[i]},${combined[i + 1]},${combined[i + 2]}`;
      let target = cache.get(key);
      if (target === undefined) {
        const lab = perceptualColor(combined.subarray(i, i + 3));
        target = candidates.reduce((a, b) => colorDistance(a.lab, lab) <= colorDistance(b.lab, lab) ? a : b);
        cache.set(key, target);
      }
      combined.set([1, 3, 5, 7].map(start => parseInt(target.color.slice(start, start + 2), 16)), i);
    }
  } else {
    combined.set(reduceDraftColors(combined, colors - 1, new Uint8Array(combined.length / 4).fill(1)));
    sharedPalette = ["#00000000"];
    const known = new Set(sharedPalette);
    for (let i = 0; i < combined.length; i += 4) if (combined[i + 3]) {
      const color = "#" + [...combined.subarray(i, i + 4)].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
      if (!known.has(color)) { known.add(color); sharedPalette.push(color); }
    }
  }
  const lookup = new Map(sharedPalette.map((color, index) => [color, index]));
  const documents = images.map((_, frame) => {
    const rgba = combined.subarray(frame * frameBytes, (frame + 1) * frameBytes);
    const doc = ensureLayers(rgbaToDocument(width, height, rgba, "Sprite"));
    doc.pixels = doc.pixels.map(index => lookup.get(doc.palette[index])); doc.palette = [...sharedPalette];
    return doc;
  });
  return documents.length === 1 ? documents[0] : replaceAnimation(documents[0], documents, documents.map(() => duration), { loop });
}
