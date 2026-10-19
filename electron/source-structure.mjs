import { sampleDraft, reduceDraftColors } from "./pixel-conversion.mjs";

// Source-coordinate constraints, not object recognition. Region labels may only
// occupy native cells they actually intersect in the reference.
export function contentBounds(image, threshold = 128) {
  let x=image.width,y=image.height,right=0,bottom=0;
  for(let yy=0;yy<image.height;yy++)for(let xx=0;xx<image.width;xx++)if(image.data[(yy*image.width+xx)*4+3]>=threshold){
    x=Math.min(x,xx);y=Math.min(y,yy);right=Math.max(right,xx+1);bottom=Math.max(bottom,yy+1);
  }
  return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
}
export function fitDraft(image, width, height, { fit="frame", threshold=128, anchor="center", bounds }={}) {
  if(!["frame","content"].includes(fit))throw Error("Invalid draft fitting mode");
  const source=fit==='content'?(bounds||contentBounds(image,threshold)):null;
  if(source){
    const data=new Uint8ClampedArray(source.width*source.height*4);
    for(let y=0;y<source.height;y++)data.set(image.data.subarray(((y+source.y)*image.width+source.x)*4,((y+source.y)*image.width+source.x+source.width)*4),y*source.width*4);
    image={width:source.width,height:source.height,data};
  }
  const padding=fit==='content'&&source&&width>2&&height>2?1:0;
  const scale=Math.min((width-padding*2)/image.width,(height-padding*2)/image.height);
  const w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
  const align=anchor==='start'?0:anchor==='end'?1:.5;
  return {image,width:w,height:h,left:padding+Math.floor((width-padding*2-w)*align),top:padding+Math.floor((height-padding*2-h)*align),source};
}

export function sampleSourceStructure(image,width,height,{threshold=128,colors=16,writable}={}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Number.isInteger(colors)||colors<2||colors>256||!Number.isInteger(threshold)||threshold<1||threshold>255||writable&&writable.length!==width*height)
    throw Error("Invalid source structure limits");
  if(width>64||height>64)return {data:sampleDraft(image,width,height,threshold,width*height<=65536?'features':'nearest'),constraints:null,diagnostics:{boundedFallback:true}};
  const factor=8,w=width*factor,h=height*factor,n=w*h;
  const source=sampleDraft(image,w,h,threshold,'nearest'),learn=new Uint8Array(n);
  for(let i=0;i<n;i++)learn[i]=Number(!writable||Boolean(writable[Math.floor(Math.floor(i/w)/factor)*width+Math.floor(i%w/factor)]));
  const reduced=reduceDraftColors(source,colors-1,learn),labels=new Int32Array(n).fill(-1),keys=new Int32Array(n).fill(-1),regions=[];
  for(let i=0;i<n;i++)if(learn[i]&&reduced[i*4+3])keys[i]=(reduced[i*4]<<16)|(reduced[i*4+1]<<8)|reduced[i*4+2];
  const queue=new Int32Array(n);
  for(let i=0;i<n;i++)if(keys[i]>=0&&labels[i]<0){
    if(regions.length>=8192)return {data:sampleDraft(image,width,height,threshold,'features'),constraints:null,diagnostics:{boundedFallback:true,reason:'region-limit'}};
    const id=regions.length,region={id,rgb:[...reduced.subarray(i*4,i*4+3)],area:0,x:0,y:0,cells:new Map(),count:0};
    let length=1;queue[0]=i;labels[i]=id;
    for(let q=0;q<length;q++){
      const at=queue[q],x=at%w,y=Math.floor(at/w),cell=Math.floor(y/factor)*width+Math.floor(x/factor),mass=1/(factor*factor);
      region.area+=mass;region.x+=(x+.5)/factor*mass;region.y+=(y+.5)/factor*mass;
      region.cells.set(cell,(region.cells.get(cell)||0)+mass);
      for(const next of[x?at-1:-1,x+1<w?at+1:-1,y?at-w:-1,y+1<h?at+w:-1])if(next>=0&&labels[next]<0&&keys[next]===keys[i]){labels[next]=id;queue[length++]=next;}
    }
    region.x/=region.area;region.y/=region.area;region.target=Math.round(region.area);
    if(region.area>=.35)region.target=Math.max(1,region.target);
    regions.push(region);
  }
  const options=Array.from({length:width*height},()=>[]),chosen=new Int32Array(width*height).fill(-1);
  for(const r of regions)for(const[cell,mass]of r.cells)options[cell].push([r.id,mass]);
  const silhouette=sampleDraft(image,width,height,threshold,'features');
  for(let i=0;i<chosen.length;i++)if(silhouette[i*4+3]&&options[i].length){
    options[i].sort((a,b)=>b[1]-a[1]);chosen[i]=options[i][0][0];regions[chosen[i]].count++;
  }
  let reassigned=0;
  for(let pass=0;pass<3;pass++){
    const wanted=regions.filter(r=>r.count<r.target).sort((a,b)=>(b.target-b.count)/(b.area+.5)-(a.target-a.count)/(a.area+.5));
    for(const r of wanted)while(r.count<r.target){
      let best=-1,cost=Infinity;
      for(const[cell,mass]of r.cells){
        const old=chosen[cell];if(old<0||old===r.id||regions[old].count<=Math.max(1,regions[old].target))continue;
        const center=(cell%width+.5-r.x)**2+(Math.floor(cell/width)+.5-r.y)**2;
        const score=(regions[old].cells.get(cell)||0)-mass+center*.03;
        if(mass>=.08&&score<cost){best=cell;cost=score;}
      }
      if(best<0)break;
      regions[chosen[best]].count--;r.count++;chosen[best]=r.id;reassigned++;
    }
  }
  const data=new Uint8ClampedArray(width*height*4),allowed=[];
  const hex=rgb=>'#'+rgb.map(c=>c.toString(16).padStart(2,'0')).join('').toUpperCase()+'FF';
  for(let i=0;i<chosen.length;i++){
    if(chosen[i]>=0)data.set([...regions[chosen[i]].rgb,255],i*4);
    allowed.push(chosen[i]<0?['#00000000']:[...new Set(options[i].filter(([id,mass])=>mass>=.08||id===chosen[i]).map(([id])=>hex(regions[id].rgb)))]);
  }
  return {data,constraints:{format:'pixel-mat-source-support',version:1,width,height,allowed},
    diagnostics:{boundedFallback:false,regions:regions.length,reassigned,unrepresented:regions.filter(r=>r.target>0&&!r.count).length}};
}

export function validateSourceSupport(rgba,constraints) {
  if(!constraints||constraints.format!=='pixel-mat-source-support'||constraints.version!==1||!Number.isInteger(constraints.width)||!Number.isInteger(constraints.height)||constraints.width<1||constraints.height<1||constraints.width>64||constraints.height>64||!Array.isArray(constraints.allowed)||constraints.allowed.length!==constraints.width*constraints.height||rgba.length!==constraints.allowed.length*4)
    throw Error("Invalid source structure context");
  for(let i=0;i<constraints.allowed.length;i++){
    const choices=constraints.allowed[i];
    if(!Array.isArray(choices)||!choices.length||choices.length>256||choices.some(c=>typeof c!=='string'||!/^#[0-9A-F]{8}$/.test(c)))throw Error("Invalid source structure support");
    const color='#'+Array.from(rgba.subarray(i*4,i*4+4),c=>c.toString(16).padStart(2,'0')).join('').toUpperCase();
    if(!choices.includes(color))throw Error("Edit changes the reference silhouette or moves a color region outside its source support");
  }
  return true;
}

export function structureDraft(image,width,height,options={}) {
  const placed=fitDraft(image,width,height,options);
  const writable=options.writable?Array.from({length:placed.width*placed.height},(_,i)=>options.writable[(Math.floor(i/placed.width)+placed.top)*width+i%placed.width+placed.left]):undefined;
  const result=sampleSourceStructure(placed.image,placed.width,placed.height,{...options,writable});
  const data=new Uint8ClampedArray(width*height*4),allowed=Array.from({length:width*height},()=>['#00000000']);
  for(let y=0;y<placed.height;y++)for(let x=0;x<placed.width;x++){
    const src=y*placed.width+x,dst=(y+placed.top)*width+x+placed.left;data.set(result.data.subarray(src*4,src*4+4),dst*4);
    if(result.constraints)allowed[dst]=result.constraints.allowed[src];
  }
  const constraints=result.constraints?{...result.constraints,width,height,allowed}:null;
  return {data,constraints,diagnostics:result.diagnostics,placement:{left:placed.left,top:placed.top,width:placed.width,height:placed.height,source:placed.source}};
}
