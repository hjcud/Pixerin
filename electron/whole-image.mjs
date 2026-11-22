import { t } from "../src/i18n.mjs";
import { sampleDraft, reduceDraftColors, perceptualColor, colorDistance } from "./pixel-conversion.mjs";
import { MAX_CANVAS_EDGE, MAX_CANVAS_PIXELS } from "../src/document-region.mjs";
import { fitDraft, sampleSourceStructure } from "./source-structure.mjs";
import { semanticDraft } from "./semantic-conversion.mjs";

export function wholeImagePlan(doc) {
  // Use native document resolution whenever the provider accepts it. Pad/round
  // only for its minimum pixel count, 16px increments and aspect constraints.
  const ratio = Math.max(1 / 3, Math.min(3, doc.width / doc.height));
  const edge = doc.width*doc.height < 655360
    ? Math.max(Math.max(doc.width,doc.height),ratio > 1.2 || ratio < 1/1.2 ? 1536 : 1024)
    : Math.max(doc.width,doc.height);
  let width=Math.ceil((ratio>=1?edge:edge*ratio)/16)*16;
  let height=Math.ceil((ratio>=1?edge/ratio:edge)/16)*16;
  const scale=Math.min(1,MAX_CANVAS_EDGE/width,MAX_CANVAS_EDGE/height,Math.sqrt(MAX_CANVAS_PIXELS/(width*height)));
  width=Math.max(16,Math.floor(width*scale/16)*16);
  height=Math.max(16,Math.floor(height*scale/16)*16);
  if(width>height*3)height=Math.ceil(width/3/16)*16;
  if(height>width*3)width=Math.ceil(height/3/16)*16;
  while(width*height<655360) { if(width<height)width+=16;else height+=16; }
  return { width, height, size: `${width}x${height}` };
}

export function wholeContextFrame(doc, rgba) {
  const plan=wholeImagePlan(doc), ratio=plan.width/plan.height;
  const width=Math.max(doc.width,Math.ceil(doc.height*ratio));
  const height=Math.max(doc.height,Math.ceil(doc.width/ratio));
  const x=Math.floor((width-doc.width)/2),y=Math.floor((height-doc.height)/2);
  if(width===doc.width&&height===doc.height)return{width,height,data:Buffer.from(rgba),content:{x:0,y:0,width:doc.width,height:doc.height}};
  const data=Buffer.alloc(width*height*4);
  for(let row=0;row<doc.height;row++) data.set(rgba.subarray(row*doc.width*4,(row+1)*doc.width*4),((row+y)*width+x)*4);
  return{width,height,data,content:{x,y,width:doc.width,height:doc.height}};
}

export function unpadDraft(doc,image) {
  const ratio=doc.width/doc.height;
  const width=Math.min(image.width,Math.max(1,Math.round(image.height*ratio)));
  const height=Math.min(image.height,Math.max(1,Math.round(image.width/ratio)));
  if(width===image.width&&height===image.height)return image;
  const x=Math.floor((image.width-width)/2),y=Math.floor((image.height-height)/2),data=Buffer.alloc(width*height*4);
  for(let row=0;row<height;row++)data.set(image.data.subarray(((row+y)*image.width+x)*4,((row+y)*image.width+x+width)*4),row*width*4);
  return{width,height,data};
}

// Quantize the bounded draft once, then copy palette indices with nearest-pixel
// fitting. Never allocate an object/run per 4K pixel or smooth native pixels.
export function wholeImageProposal(input, scope, image, conversion) {
  const { document: doc, mask } = scope, { colors, threshold, anchor, method, fit="frame" } = conversion;
  const sourceWidth=image.width,sourceHeight=image.height;
  // The submitted source is center-padded to the provider's frame. Remove that
  // padding before fitting, rather than leaving most of a very wide canvas unchanged.
  image=unpadDraft(doc,image);
  const semantic=['semantic','recompose'].includes(method)?semanticDraft(image,doc.width,doc.height,{...conversion,writable:mask,...conversion.analysis,reconstruct:method==='recompose'}):null;
  const placed=semantic?{image,width:doc.width,height:doc.height,left:0,top:0}:fitDraft(image,doc.width,doc.height,{fit,threshold,anchor});
  image=placed.image;
  const {width,height,left,top}=placed;
  // Sampling never needs more cells than either the source draft or destination.
  const workWidth = semantic?width:Math.min(width,image.width), workHeight = semantic?height:Math.min(height,image.height);
  const writable = new Uint8Array(workWidth * workHeight);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[(y + top) * doc.width + x + left]) continue;
    const sx = Math.min(workWidth - 1, Math.floor((x + .5) * workWidth / width));
    const sy = Math.min(workHeight - 1, Math.floor((y + .5) * workHeight / height));
    writable[sy * workWidth + sx] = 1;
  }
  const sampled=semantic?semantic.data:method==='structure'?sampleSourceStructure(image,workWidth,workHeight,{threshold,colors,writable}).data:sampleDraft(image,workWidth,workHeight,threshold,workWidth*workHeight<=65536?method:'nearest');
  const reduced = reduceDraftColors(sampled, colors - 1, writable);
  const palette = [...doc.palette], indices = new Uint16Array(doc.width * doc.height).fill(65535);
  const lookup = new Map(), labs = [];
  const rgbaHex = (r,g,b,a) => "#" + [r,g,b,a].map(v => v.toString(16).padStart(2,"0")).join("").toUpperCase();
  const match = (r,g,b,a) => {
    const key = rgbaHex(r,g,b,a);
    if (lookup.has(key)) return lookup.get(key);
    let index = palette.indexOf(key);
    if (index < 0 && !input.paletteOnly && palette.length < 256) index = palette.push(key) - 1;
    if (index < 0) {
      const lab = perceptualColor([r,g,b]); let best = Infinity;
      for (let j=0;j<palette.length;j++) {
        if (parseInt(palette[j].slice(7),16) !== a) continue;
        const candidate = labs[j] ??= perceptualColor([1,3,5].map(n=>parseInt(palette[j].slice(n,n+2),16)));
        const distance = colorDistance(lab,candidate);
        if (distance < best) { best=distance;index=j; }
      }
    }
    if(index<0) throw new Error(t("투명도를 유지하며 팔레트에 맞출 수 없어요. 새 색 허용 또는 팔레트를 확인해 주세요."));
    lookup.set(key,index);return index;
  };
  // Cache by reduced RGB and exact target alpha (at most 64 * 256 colors).
  const colorCache = new Map();
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=(y+top)*doc.width+x+left;if(!mask[i])continue;
    const sx=Math.min(workWidth-1,Math.floor((x+.5)*workWidth/width));
    const sy=Math.min(workHeight-1,Math.floor((y+.5)*workHeight/height)), p=(sy*workWidth+sx)*4;
    let a=reduced[p+3];
    if(input.alphaLock) { if(!a)continue;a=parseInt(doc.palette[doc.pixels[i]].slice(7),16); }
    const r=reduced[p],g=reduced[p+1],b=reduced[p+2],key=((r*256+g)*256+b)*256+a;
    let index=colorCache.get(key);
    if(index===undefined){index=match(r,g,b,a);colorCache.set(key,index);}
    if(palette[index]!==doc.palette[doc.pixels[i]])indices[i]=index;
  }
  return { proposal: { summary:t("기존 이미지의 전체 수정안이에요. 작은 디테일과 경계를 비교한 뒤 적용해 주세요."),
    new_colors:palette.slice(doc.palette.length),raster:{width:doc.width,height:doc.height,pixels:indices}},
    imageInfo:{sourceWidth,sourceHeight,targetWidth:doc.width,targetHeight:doc.height,
      scaled:image.width!==doc.width||image.height!==doc.height,fitted:width!==doc.width||height!==doc.height} };
}
