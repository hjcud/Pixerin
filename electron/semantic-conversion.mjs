import { sampleDraft, reduceDraftColors, perceptualColor, colorDistance } from './pixel-conversion.mjs';
import { fitDraft, sampleSourceStructure } from './source-structure.mjs';
import { fitSourceContour } from './contour-fit.mjs';
import { sourcePixelHash, validateSemanticPlan } from './semantic-analysis.mjs';
import { recomposeNative } from './native-recomposition.mjs';

const inside=(x,y,b)=>x>=b[0]&&y>=b[1]&&x<b[0]+b[2]&&y<b[1]+b[3];
const nearest=(rgb,labs)=>{const lab=perceptualColor(rgb);let best=0,d=Infinity;for(let i=0;i<labs.length;i++){const next=colorDistance(lab,labs[i]);if(next<d){best=i;d=next;}}return best;};
function reserveSourceColors(raw,reduced,learn,sw,sh,context,plan,crop,image,limit){
 const palette=new Map(),labels=new Map(),labs=context.palette.map(p=>perceptualColor(p.rgb));
 for(let p=0;p<learn.length;p++)if(learn[p]&&reduced[p*4+3]){const key=[...reduced.subarray(p*4,p*4+3)].join(',');palette.set(key,(palette.get(key)||0)+1);}
 const required=plan.features.filter(f=>!f.optional&&f.kind!=='gap'&&f.confidence>=.7).sort((a,b)=>b.priority-a.priority),reserved=new Set(),diagnostics=[];
 for(const f of required){const votes=new Map();
  for(let sy=Math.max(0,Math.floor((f.box[1]*image.height-crop.y)/crop.height*sh));sy<sh&&(crop.y+(sy+.5)/sh*crop.height)/image.height<f.box[1]+f.box[3];sy++)
   for(let sx=Math.max(0,Math.floor((f.box[0]*image.width-crop.x)/crop.width*sw));sx<sw&&(crop.x+(sx+.5)/sw*crop.width)/image.width<f.box[0]+f.box[2];sx++){
    const p=sy*sw+sx;if(!learn[p]||!raw[p*4+3])continue;const rgb=[...raw.subarray(p*4,p*4+3)],key=rgb.join(',');if(!labels.has(key))labels.set(key,nearest(rgb,labs));
    if(f.swatches.includes(labels.get(key)))votes.set(key,(votes.get(key)||0)+1);
   }
  const groups=new Map();for(const[key,mass]of votes){const id=labels.get(key);groups.set(id,(groups.get(id)||0)+mass);}
  const group=[...groups].sort((a,b)=>b[1]-a[1])[0];if(!group||group[1]<5)continue;
  const best=[...votes].filter(([key])=>labels.get(key)===group[0]).sort((a,b)=>b[1]-a[1])[0];
  const key=best[0];if(!reserved.has(key)&&reserved.size===limit){diagnostics.push({name:f.name,status:'palette-capacity'});continue;}
  reserved.add(key);if(!palette.has(key))palette.set(key,0);diagnostics.push({name:f.name,status:'source-color-reserved'});
 }
 while(palette.size>limit){const removable=[...palette].filter(([key])=>!reserved.has(key)).sort((a,b)=>a[1]-b[1])[0];if(!removable)break;palette.delete(removable[0]);}
 const colors=[...palette.keys()].map(key=>key.split(',').map(Number));if(!colors.length)return{source:reduced,diagnostics};
 const out=reduced.slice(),colorLabs=colors.map(perceptualColor),lookup=new Map();
 for(let p=0;p<learn.length;p++)if(learn[p]&&raw[p*4+3]){const rgb=[...raw.subarray(p*4,p*4+3)],key=rgb.join(',');if(!lookup.has(key))lookup.set(key,colors[nearest(rgb,colorLabs)]);out.set(lookup.get(key),p*4);}
 return{source:out,diagnostics};
}
function topology(mask,w,h){
 const seen=new Uint8Array(mask.length);let components=0,holes=0;
 for(let i=0;i<mask.length;i++)if(!seen[i]){const value=mask[i];let border=false;const queue=[i];seen[i]=1;
  for(let q=0;q<queue.length;q++){const at=queue[q],x=at%w,y=Math.floor(at/w);border ||= !x||!y||x===w-1||y===h-1;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy||!value&&dx&&dy)continue;const xx=x+dx,yy=y+dy,n=yy*w+xx;if(xx>=0&&yy>=0&&xx<w&&yy<h&&!seen[n]&&mask[n]===value){seen[n]=1;queue.push(n);}}
  }if(value)components++;else if(!border)holes++;
 }return{components,holes};
}

// The model describes source semantics; it never supplies output pixels.
// Projection uses per-cell source support. Explicit reconstruction additionally
// permits bounded optical relocation. Neither uses named-object templates.
export function semanticDraft(image,width,height,{context,plan,colors=16,threshold=128,fit='frame',anchor='center',writable,contour=true,reconstruct=false}={}){
 if(width>64||height>64||width<1||height<1||!Number.isInteger(width)||!Number.isInteger(height)||!Number.isInteger(colors)||colors<2||colors>64||writable&&writable.length!==width*height)throw Error('Semantic conversion supports grids up to64px');
 if(!context||sourcePixelHash(image)!==context.sourceHash)throw Error('Source analysis does not match this image');
 plan=validateSemanticPlan(plan,context);
 const placed=fitDraft(image,width,height,{fit,threshold,anchor}),{width:w,height:h}=placed;
 const allowed=Array.from({length:w*h},(_,i)=>!writable||Boolean(writable[(Math.floor(i/w)+placed.top)*width+i%w+placed.left]));
 const base=sampleSourceStructure(placed.image,w,h,{colors,threshold,writable:allowed});
 const diagnostics={features:[],warnings:[...plan.warnings],contour:{enabled:contour},confidence:plan.confidence};
 if(plan.confidence<.7||!plan.regions.length&&!plan.features.length){diagnostics.warnings.push(plan.confidence<.7?'Low-confidence analysis: kept source-structure conversion':'No actionable source analysis: kept source-structure conversion');return place(base.data);}
 const sw=w*8,sh=h*8,raw=sampleDraft(placed.image,sw,sh,threshold,'nearest'),learn=Uint8Array.from({length:sw*sh},(_,i)=>Number(allowed[Math.floor(Math.floor(i/sw)/8)*w+Math.floor(i%sw/8)]));
 const crop=placed.source||{x:0,y:0,width:image.width,height:image.height};
 const fittedPalette=reserveSourceColors(raw,reduceDraftColors(raw,colors-1,learn),learn,sw,sh,context,plan,crop,image,colors-1);
 const source=fittedPalette.source,labs=context.palette.map(p=>perceptualColor(p.rgb)),cache=new Map();diagnostics.palette=fittedPalette.diagnostics;
 const cells=Array.from({length:w*h},()=>new Map()),hits=plan.features.map(()=>new Map());
 const regions=plan.regions.filter(r=>r.confidence>=.7);
 for(let sy=0;sy<sh;sy++)for(let sx=0;sx<sw;sx++){
  const p=sy*sw+sx,cell=Math.floor(sy/8)*w+Math.floor(sx/8);if(!allowed[cell]||!source[p*4+3])continue;
  const rgb=[...source.subarray(p*4,p*4+3)],key=rgb.join(','),x=(crop.x+(sx+.5)/sw*crop.width)/image.width,y=(crop.y+(sy+.5)/sh*crop.height)/image.height;
  if(!cache.has(key))cache.set(key,nearest(rgb,labs));const swatch=cache.get(key);
  let weight=1,best=-1;
  for(const r of regions)if(r.swatches.includes(swatch)&&inside(x,y,r.box)&&r.priority>best){best=r.priority;weight=r.role==='highlight'?.18+.5*r.priority/100:1+2*r.priority/100;}
  const vote=cells[cell].get(key)||{rgb,mass:0,score:0};vote.mass++;vote.score+=weight;cells[cell].set(key,vote);
  plan.features.forEach((f,i)=>{if(f.confidence>=.7&&f.kind!=='gap'&&f.swatches.includes(swatch)&&inside(x,y,f.box)){const old=hits[i].get(cell)||{mass:0,colors:new Map()};old.mass++;old.colors.set(key,(old.colors.get(key)||0)+1);hits[i].set(cell,old);}});
 }
 const mask=Uint8Array.from({length:w*h},(_,i)=>Number(base.data[i*4+3]>0)),originalMask=mask.slice(),reserved=new Map();
 if(contour){
  const fitted=fitSourceContour(placed.image,w,h,{threshold}),old=topology(mask,w,h);
  diagnostics.contour={...diagnostics.contour,...fitted.diagnostics};
  if(fitted.mask){const candidate=fitted.mask;for(let i=0;i<mask.length;i++)if(!allowed[i])candidate[i]=mask[i];
   const next=topology(candidate,w,h),changed=candidate.reduce((n,v,i)=>n+Number(v!==mask[i]),0),painted=mask.reduce((a,b)=>a+b,0);
   diagnostics.contour.comparison={before:old,after:next,changed,painted};
   if(next.components<=old.components&&next.holes===old.holes&&changed<=Math.max(2,painted*.2)){mask.set(candidate);diagnostics.contour.changed=changed;}
   else diagnostics.contour.rejected='topology-or-area';
  }
 }
 const data=base.data.slice();
 for(let i=0;i<mask.length;i++)if(allowed[i]){
  if(!mask[i]){data.fill(0,i*4,i*4+4);continue;}
  const options=[...cells[i].values()].sort((a,b)=>b.score-a.score);if(!options.length){mask[i]=0;data.fill(0,i*4,i*4+4);continue;}
  data.set([...options[0].rgb,255],i*4);
 }
 // Reserve scarce cells by semantic priority. Optional accents cannot steal a
 // mandatory detail's pixel, nor relocate more than one intersecting cell.
 const order=plan.features.map((f,i)=>({f,i})).sort((a,b)=>Number(a.f.optional)-Number(b.f.optional)||b.f.priority-a.f.priority||a.i-b.i);
 for(const{f,i}of order){
  if(f.confidence<.7||f.kind==='gap'){diagnostics.features.push({name:f.name,status:'deferred',reason:f.kind==='gap'?'source-contour-retains-gaps':'low-confidence'});continue;}
  const cx=((f.box[0]+f.box[2]/2)*image.width-crop.x)/crop.width*w,cy=((f.box[1]+f.box[3]/2)*image.height-crop.y)/crop.height*h;
  const candidates=[...hits[i]].filter(([cell,v])=>allowed[cell]&&v.mass>=5&&!reserved.has(cell)&&Math.hypot(cell%w+.5-cx,Math.floor(cell/w)+.5-cy)<=Math.max(.85,Math.hypot(f.box[2]*image.width/crop.width*w,f.box[3]*image.height/crop.height*h)/2));
  candidates.sort(([a,aa],[b,bb])=>{
   const score=(cell,v)=>v.mass/64-Math.hypot(cell%w+.5-cx,Math.floor(cell/w)+.5-cy)*.12+(f.kind==='tip'?((cell%w+.5)*f.direction[0]+(Math.floor(cell/w)+.5)*f.direction[1])*.35:0);
   return score(b,bb)-score(a,aa);
  });
  if(!candidates.length){diagnostics.features.push({name:f.name,status:'deferred',reason:'no-free-supported-cell'});continue;}
  const [cell,hit]=candidates[0],key=[...hit.colors].sort((a,b)=>b[1]-a[1])[0][0];
  // Never replace a silhouette with isolated feature specks.
  if(!mask[cell]&&!originalMask[cell]){diagnostics.features.push({name:f.name,status:'deferred',reason:'outside-silhouette'});continue;}
  data.set([...key.split(',').map(Number),255],cell*4);mask[cell]=1;reserved.set(cell,f.name);
  diagnostics.features.push({name:f.name,status:'reserved',cell});
 }
 // A high-priority material may form a thin continuous shaft, seam or wire.
 // Detect this from supported source geometry, without naming the subject or
 // guessing a line between hand-authored endpoints. Reserve one supported cell
 // per major-axis step; pre-existing identity reservations always win.
 diagnostics.strokes=[];
 for(const r of regions.filter(r=>r.role==='primary'&&r.priority>=85).sort((a,b)=>b.priority-a.priority)){
  const votes=new Map();let n=0,mx=0,my=0,xx=0,yy=0,xy=0;
  for(let sy=0;sy<sh;sy++)for(let sx=0;sx<sw;sx++){
   const p=sy*sw+sx,cell=Math.floor(sy/8)*w+Math.floor(sx/8);if(!allowed[cell]||!source[p*4+3])continue;
   const rgb=[...source.subarray(p*4,p*4+3)],key=rgb.join(','),x=(crop.x+(sx+.5)/sw*crop.width)/image.width,y=(crop.y+(sy+.5)/sh*crop.height)/image.height;
   if(!r.swatches.includes(cache.get(key))||!inside(x,y,r.box))continue;
   n++;mx+=sx;my+=sy;xx+=sx*sx;yy+=sy*sy;xy+=sx*sy;
   const v=votes.get(cell)||{mass:0,colors:new Map()};v.mass++;v.colors.set(key,(v.colors.get(key)||0)+1);votes.set(cell,v);
  }
  if(n<16)continue;const a=xx/n-(mx/n)**2,b=xy/n-mx*my/n**2,c=yy/n-(my/n)**2,delta=Math.hypot(a-c,2*b),major=(a+c+delta)/2,minor=Math.max(.1,(a+c-delta)/2);
  if(major/minor<40||Math.sqrt(major)/8<1.1)continue;
  const axis=a>=c?'x':'y',steps=new Map();
  for(const[cell,v]of votes)if(v.mass>=5&&mask[cell]){const step=axis==='x'?cell%w:Math.floor(cell/w),old=steps.get(step);if(!old||v.mass>old[1].mass)steps.set(step,[cell,v]);}
  let kept=0;for(const[cell,v]of steps.values())if(!reserved.has(cell)){const key=[...v.colors].sort((a,b)=>b[1]-a[1])[0][0];data.set([...key.split(',').map(Number),255],cell*4);reserved.set(cell,r.name);kept++;}
  diagnostics.strokes.push({name:r.name,cells:kept});
 }
 if(reconstruct){const result=recomposeNative({data,raw,width:w,height:h,context,plan,crop,image,allowed,mode:reconstruct==='features'?'features':'structure'});diagnostics.recomposition=result.diagnostics;return place(result.data);}
 return place(data);
 function place(native){const data=new Uint8ClampedArray(width*height*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(native.subarray((y*w+x)*4,(y*w+x+1)*4),((y+placed.top)*width+x+placed.left)*4);return{data,diagnostics,placement:{left:placed.left,top:placed.top,width:w,height:h,source:placed.source}};}
}
