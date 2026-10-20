import { perceptualColor, colorDistance } from './pixel-conversion.mjs';
import { sampleSourceStructure } from './source-structure.mjs';

const inside=(x,y,b)=>x>=b[0]&&y>=b[1]&&x<b[0]+b[2]&&y<b[1]+b[3];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const norm=(x,y)=>{const n=Math.hypot(x,y);return[x/n,y/n];};
function components(data,w,h){const seen=new Uint8Array(w*h);let count=0;for(let i=0;i<seen.length;i++)if(data[i*4+3]&&!seen[i]){count++;seen[i]=1;const q=[i];for(const at of q){const x=at%w,y=Math.floor(at/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,n=yy*w+xx;if(xx>=0&&yy>=0&&xx<w&&yy<h&&!seen[n]&&data[n*4+3]){seen[n]=1;q.push(n);}}}}return count;}

// Optical correction, not a source-support sampler: important features may grow
// locally by up to three native cells per dimension. The source supplies all art,
// colors, directions and feature relationships; no named-object drawing rules.
export function recomposeNative({data,raw,width:w,height:h,context,plan,crop,image,allowed,mode='structure'}){
 const out=data.slice(),sw=w*8,sh=h*8,labels=new Int16Array(sw*sh).fill(-1),sourceLabs=context.palette.map(p=>perceptualColor(p.rgb)),labelCache=new Map(),colors=[...new Set(Array.from({length:w*h},(_,i)=>out[i*4+3]?[...out.subarray(i*4,i*4+3)].join(','):null).filter(Boolean))].map(k=>k.split(',').map(Number));
 const diagnostics={mode,operations:[],warnings:[]};if(!colors.length)return{data:out,diagnostics};
 const colorLabs=colors.map(perceptualColor),colorCache=new Map(),closest=(rgb,labs)=>{const lab=perceptualColor(rgb);let best=0,d=Infinity;for(let i=0;i<labs.length;i++){const next=colorDistance(lab,labs[i]);if(next<d){best=i;d=next;}}return best;};
 const mapColor=rgb=>{const key=rgb.join(',');if(!colorCache.has(key))colorCache.set(key,colors[closest(rgb,colorLabs)]);return colorCache.get(key);};
 const point=(x,y)=>[(x*image.width-crop.x)/crop.width*w,(y*image.height-crop.y)/crop.height*h];
 const full=(x,y)=>[(crop.x+x/w*crop.width)/image.width,(crop.y+y/h*crop.height)/image.height];
 for(let p=0;p<labels.length;p++)if(raw[p*4+3]&&allowed[Math.floor(Math.floor(p/sw)/8)*w+Math.floor(p%sw/8)]){const rgb=[...raw.subarray(p*4,p*4+3)],key=rgb.join(',');if(!labelCache.has(key))labelCache.set(key,closest(rgb,sourceLabs));labels[p]=labelCache.get(key);}
 function sourceColor(x,y,swatches=[]){let best=null,distance=Infinity;const cx=x*8,cy=y*8;for(let yy=Math.max(0,Math.floor(cy-16));yy<Math.min(sh,Math.ceil(cy+16));yy++)for(let xx=Math.max(0,Math.floor(cx-16));xx<Math.min(sw,Math.ceil(cx+16));xx++){const p=yy*sw+xx;if(labels[p]<0||swatches.length&&!swatches.includes(labels[p]))continue;const d=(xx+.5-cx)**2+(yy+.5-cy)**2;if(d<distance){distance=d;best=[...raw.subarray(p*4,p*4+3)];}}return best?mapColor(best):null;}
 function commit(name,kind,changes){
  if(!changes.size)return false;
  for(const[i,value]of changes)if(i<0||i>=w*h||!allowed[i]){diagnostics.operations.push({name,kind,status:'deferred',reason:'protected-or-clipped'});return false;}
  if(kind==='tip'){const candidate=out.slice();for(const[i,value]of changes)candidate[i*4+3]=value?255:0;if(components(candidate,w,h)>components(out,w,h)){diagnostics.operations.push({name,kind,status:'deferred',reason:'disconnected-tip'});return false;}}
  let count=0;for(const[i,value]of changes){const rgba=value?[...value,255]:[0,0,0,0];if(rgba.some((v,ch)=>out[i*4+ch]!==v)){out.set(rgba,i*4);count++;}}
  diagnostics.operations.push({name,kind,status:'applied',changed:count});return true;
 }
 const maps=[],features=plan.features.filter(f=>!f.optional&&f.confidence>=.85).sort((a,b)=>b.box[2]*b.box[3]-a.box[2]*a.box[3]);
 function targetBox(f){const a=point(f.box[0],f.box[1]),b=point(f.box[0]+f.box[2],f.box[1]+f.box[3]),parent=maps.filter(m=>m.feature!==f&&f.box[0]>=m.feature.box[0]&&f.box[1]>=m.feature.box[1]&&f.box[0]+f.box[2]<=m.feature.box[0]+m.feature.box[2]&&f.box[1]+f.box[3]<=m.feature.box[1]+m.feature.box[3]).sort((a,b)=>a.feature.box[2]*a.feature.box[3]-b.feature.box[2]*b.feature.box[3])[0];
  if(!parent)return[a[0],a[1],b[0]-a[0],b[1]-a[1]];
  const p=parent.feature.box,d=parent.rect,box=[d[0]+(f.box[0]-p[0])/p[2]*d[2],d[1]+(f.box[1]-p[1])/p[3]*d[3],f.box[2]/p[2]*d[2],f.box[3]/p[3]*d[3]];
  // Keep a nested identifying mark distinguishable from its parent's border.
  // Optical displacement is bounded to one cell; its source appearance is kept.
  if(f.kind==='identity'&&d[2]>=5&&box[2]<=2){const cx=box[0]+box[2]/2,target=clamp(cx,d[0]+1.5,d[0]+d[2]-1.5);box[0]+=clamp(target-cx,-1,1);}
  return box;
 }
 // Enlarging a source patch, rather than drawing a generic eye/face/hand, keeps
 // its expression and pose. Nested features follow the enlarged parent patch.
 for(const f of features.filter(f=>['identity','joint'].includes(f.kind))){const box=targetBox(f),minimum=f.minCells||[1,1],bw=Math.max(1,Math.round(box[2])),bh=Math.max(1,Math.round(box[3])),tw=Math.max(bw,minimum[0]),th=Math.max(bh,minimum[1]);
  if(tw===bw&&th===bh&&!maps.length)continue;
  if(tw-box[2]>3.01||th-box[3]>3.01||tw>8||th>8){diagnostics.operations.push({name:f.name,kind:'feature',status:'deferred',reason:'growth-limit'});continue;}
  const left=Math.round(box[0]+box[2]/2-tw/2),top=Math.round(box[1]+box[3]/2-th/2);
  if(left<0||top<0||left+tw>w||top+th>h){diagnostics.operations.push({name:f.name,kind:'feature',status:'deferred',reason:'protected-or-clipped'});continue;}
  const srcA=point(f.box[0],f.box[1]),srcB=point(f.box[0]+f.box[2],f.box[1]+f.box[3]),x0=clamp(Math.floor(srcA[0]*8),0,sw-1),y0=clamp(Math.floor(srcA[1]*8),0,sh-1),x1=clamp(Math.ceil(srcB[0]*8),x0+1,sw),y1=clamp(Math.ceil(srcB[1]*8),y0+1,sh),patch={width:x1-x0,height:y1-y0,data:new Uint8ClampedArray((x1-x0)*(y1-y0)*4)};
  let blocked=false,sourceColors=new Map();for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(!allowed[Math.floor(y/8)*w+Math.floor(x/8)])blocked=true;const p=y*sw+x;if(labels[p]<0||!f.swatches.includes(labels[p]))continue;const rgb=[...raw.subarray(p*4,p*4+3)],key=rgb.join(',');sourceColors.set(key,(sourceColors.get(key)||0)+1);patch.data.set(raw.subarray(p*4,p*4+4),((y-y0)*patch.width+x-x0)*4);}
  if(blocked){diagnostics.operations.push({name:f.name,kind:'feature',status:'deferred',reason:'protected-source'});continue;}
  const sampled=sampleSourceStructure(patch,tw,th,{colors:Math.min(64,colors.length+1)}).data,changes=new Map();
  if(tw===1&&th===1&&sourceColors.size){const rgb=[...sourceColors].sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number);changes.set(top*w+left,mapColor(rgb));}
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){const p=(y*tw+x)*4;if(sampled[p+3])changes.set((top+y)*w+left+x,mapColor([...sampled.subarray(p,p+3)]));}
  if(commit(f.name,'feature',changes))maps.push({feature:f,rect:[left,top,tw,th]});
 }
 if(mode==='features')return{data:out,diagnostics};
 // Rebuild a narrow pointed part from its observed terminal, functional joint
 // and cross-section widths. Quantize the connected part as a whole, rather
 // than trimming a few endpoint cells off an independently sampled blade.
 for(const f of features.filter(f=>f.kind==='tip')){
  const direction=norm(...f.direction),parts=plan.regions.filter(r=>r.role==='primary'&&r.confidence>=.85&&r.swatches.some(i=>f.swatches.includes(i))),samples=[];
  const focus=point(f.box[0]+f.box[2]/2,f.box[1]+f.box[3]/2);
  for(const r of parts){const points=[];for(let p=0;p<labels.length;p++)if(labels[p]>=0&&r.swatches.includes(labels[p])){const x=(p%sw+.5)/8,y=(Math.floor(p/sw)+.5)/8,q=full(x,y),dx=x-focus[0],dy=y-focus[1],along=dx*direction[0]+dy*direction[1],across=-dx*direction[1]+dy*direction[0];if(inside(...q,r.box)&&along>=-4&&along<=1&&Math.abs(across)<2)points.push([x,y]);}
   if(points.length<8)continue;let a=0,b=0;for(const p of points){a+=p[0];b+=p[1];}const cx=a/points.length,cy=b/points.length;let xx=0,xy=0,yy=0;for(const[x,y]of points){xx+=(x-cx)**2;xy+=(x-cx)*(y-cy);yy+=(y-cy)**2;}const angle=.5*Math.atan2(2*xy,xx-yy),axis=[Math.cos(angle),Math.sin(angle)];if(axis[0]*direction[0]+axis[1]*direction[1]<0){axis[0]*=-1;axis[1]*=-1;}
   const alignment=axis[0]*direction[0]+axis[1]*direction[1];if(alignment<.75)continue;const tail=points.filter(([x,y])=>inside(...full(x,y),f.box));if(tail.length<2)continue;
   samples.push({r,points,tail,axis,cx,cy,alignment});
  }
  samples.sort((a,b)=>b.alignment-a.alignment||b.points.length-a.points.length);const part=samples[0];if(!part){diagnostics.operations.push({name:f.name,kind:'tip',status:'deferred',reason:'no-directed-source-part'});continue;}
  const{tail,r}=part;tail.sort((a,b)=>(b[0]-a[0])*direction[0]+(b[1]-a[1])*direction[1]);
  const terminal=tail.slice(0,Math.max(1,Math.ceil(tail.length*.1))),end=terminal.reduce((p,q)=>[p[0]+q[0]/terminal.length,p[1]+q[1]/terminal.length],[0,0]);
  const joints=features.filter(g=>g.kind==='joint').map(g=>({feature:g,at:point(g.box[0]+g.box[2]/2,g.box[1]+g.box[3]/2)})).map(g=>({...g,length:Math.hypot(end[0]-g.at[0],end[1]-g.at[1]),alignment:((end[0]-g.at[0])*direction[0]+(end[1]-g.at[1])*direction[1])/Math.hypot(end[0]-g.at[0],end[1]-g.at[1])})).filter(g=>g.length>=4&&g.alignment>.9).sort((a,b)=>b.alignment-a.alignment||a.length-b.length);
  if(!joints.length){diagnostics.operations.push({name:f.name,kind:'tip',status:'deferred',reason:'no-aligned-source-joint'});continue;}
  const start=joints[0].at,length=joints[0].length,axis=norm(end[0]-start[0],end[1]-start[1]),perp=[-axis[1],axis[0]],sections=[];let branched=0,sectionCount=0;
  for(let t=length*.35;t<=length*.75;t+=.25){const runs=[];let run=null;
   for(let o=-3;o<=3;o+=.125){const x=Math.floor((start[0]+axis[0]*t+perp[0]*o)*8),y=Math.floor((start[1]+axis[1]*t+perp[1]*o)*8),on=x>=0&&y>=0&&x<sw&&y<sh&&r.swatches.includes(labels[y*sw+x]);if(on){if(!run)run=[o,o];run[1]=o;}else if(run){runs.push(run);run=null;}}
   if(run)runs.push(run);sectionCount++;if(runs.filter(r=>r[1]-r[0]>=.125).length>1)branched++;runs.sort((a,b)=>Math.abs(a[0]+a[1])-Math.abs(b[0]+b[1]));if(runs[0]&&Math.abs((runs[0][0]+runs[0][1])/2)<.85)sections.push(runs[0]);
  }
  if(branched>sectionCount*.2){diagnostics.operations.push({name:f.name,kind:'tip',status:'deferred',reason:'branched-source-part'});continue;}
  if(sections.length<3)continue;const widths=sections.map(r=>r[1]-r[0]+.125).sort((a,b)=>a-b),centers=sections.map(r=>(r[0]+r[1])/2).sort((a,b)=>a-b),diameter=widths[Math.floor(widths.length/2)],offset=centers[Math.floor(centers.length/2)];
  if(diameter>2.4||diameter<.3||Math.abs(offset)>.75){diagnostics.operations.push({name:f.name,kind:'tip',status:'deferred',reason:'not-a-narrow-aligned-part'});continue;}
  // At tiny sizes a short optical extension separates the terminal from the
  // two-color body. It follows the observed axis and never leaves the frame.
  if(w<=24&&h<=24){const extension=Math.min(.75,Math.max(0,1.2-diameter/2)),x=end[0]+axis[0]*extension,y=end[1]+axis[1]*extension;if(x>=0&&y>=0&&x<w&&y<h){end[0]=x;end[1]=y;}}
  const vertical=Math.abs(axis[1])>=Math.abs(axis[0]),major=vertical?1:0,minor=1-major,sign=Math.sign(axis[major]),first=Math.floor(start[major]),last=Math.floor(end[major]),steps=Math.abs(last-first),cross=Math.abs(perp[minor]),bodyWidth=clamp(Math.round(diameter/cross),1,4),outline=plan.outline==='dark'?plan.regions.filter(g=>g.role==='outline').flatMap(g=>g.swatches):[],changes=new Map();
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const t=(x+.5-start[0])*axis[0]+(y+.5-start[1])*axis[1],off=(x+.5-start[0])*perp[0]+(y+.5-start[1])*perp[1];if(t>1.4&&t<length+1&&Math.abs(off-offset)<diameter/2+1.25)changes.set(y*w+x,null);}
  for(let step=0;step<=steps;step++){const coordinate=first+sign*step,t=(coordinate+.5-start[major])/axis[major];if(t<1.2)continue;const center=start[minor]+axis[minor]*t+offset*perp[minor],remaining=steps-step,width=Math.min(bodyWidth+(outline.length?1:0),remaining+1),left=Math.floor(center-(width-1)/2);
   for(let k=0;k<width;k++){const xy=vertical?[left+k,coordinate]:[coordinate,left+k];if(xy[0]<0||xy[1]<0||xy[0]>=w||xy[1]>=h){changes.set(-1,null);continue;}
    const isBorder=outline.length&&width>2&&k===0,color=sourceColor(xy[0]+.5,xy[1]+.5,isBorder?outline:r.swatches)||sourceColor(start[0]+axis[0]*t,start[1]+axis[1]*t,r.swatches);if(color)changes.set(xy[1]*w+xy[0],color);
   }
  }
  // A pointed reconstruction may not erase another mandatory source feature.
  const blocked=features.some(g=>g!==f&&g.priority>=f.priority&&g.kind!=='tip'&&[...changes].some(([i,c])=>!c&&inside(...full(i%w+.5,Math.floor(i/w)+.5),g.box)));
  if(blocked)diagnostics.operations.push({name:f.name,kind:'tip',status:'deferred',reason:'feature-conflict'});else commit(f.name,'tip',changes);
 }
 // Preserve true negative space by giving small openings a native footprint.
 // A complete source-supported rim is required; reflections cannot become holes.
 for(const f of features.filter(f=>f.kind==='gap')){const box=targetBox(f),minimum=f.minCells||[1,1],tw=Math.max(1,minimum[0],Math.ceil(box[2])),th=Math.max(1,minimum[1],Math.ceil(box[3]));if(tw>4||th>4||tw-box[2]>2||th-box[3]>2)continue;
  const left=Math.round(box[0]+box[2]/2-tw/2),top=Math.round(box[1]+box[3]/2-th/2);if(left<1||top<1||left+tw>=w||top+th>=h)continue;
  const sourceBox=point(f.box[0]+f.box[2]/2,f.box[1]+f.box[3]/2),at=(clamp(Math.floor(sourceBox[1]*8),0,sh-1)*sw+clamp(Math.floor(sourceBox[0]*8),0,sw-1));if(raw[at*4+3]){diagnostics.operations.push({name:f.name,kind:'gap',status:'deferred',reason:'opaque-source'});continue;}
  const changes=new Map();let supported=true;
  for(let y=top-1;y<=top+th;y++)for(let x=left-1;x<=left+tw;x++){
   if(x>=left&&x<left+tw&&y>=top&&y<top+th){changes.set(y*w+x,null);continue;}
   const color=sourceColor(x+.5,y+.5);if(!color){supported=false;break;}changes.set(y*w+x,color);
  }
  if(supported)commit(f.name,'gap',changes);else diagnostics.operations.push({name:f.name,kind:'gap',status:'deferred',reason:'unsupported-rim'});
 }
 return{data:out,diagnostics};
}
