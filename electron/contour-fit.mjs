import { sampleDraft } from "./pixel-conversion.mjs";

const area=points=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
function simplify(points,tolerance){
  if(points.length<=3)return points;
  const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
  while(stack.length){
    const [a,b]=stack.pop(),p=points[a],q=points[b],dx=q[0]-p[0],dy=q[1]-p[1],length=dx*dx+dy*dy;
    let far=-1,best=tolerance*tolerance;
    for(let i=a+1;i<b;i++){
      const r=points[i],t=length?Math.max(0,Math.min(1,((r[0]-p[0])*dx+(r[1]-p[1])*dy)/length)):0,d=(r[0]-p[0]-t*dx)**2+(r[1]-p[1]-t*dy)**2;
      if(d>best){best=d;far=i;}
    }
    if(far>=0){keep.add(far);stack.push([a,far],[far,b]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
function closedSimplify(loop,tolerance){
  let far=1;for(let i=2;i<loop.length;i++)if((loop[i][0]-loop[0][0])**2+(loop[i][1]-loop[0][1])**2>(loop[far][0]-loop[0][0])**2+(loop[far][1]-loop[0][1])**2)far=i;
  return [...simplify(loop.slice(0,far+1),tolerance).slice(0,-1),...simplify([...loop.slice(far),loop[0]],tolerance).slice(0,-1)];
}

// Source-derived polygon approximation in native coordinates. No blur, AA,
// invented black border or subject-specific sharpening rule.
export function fitSourceContour(image,width,height,{threshold=128,tolerance=.28}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>64||height>64||!Number.isFinite(tolerance)||tolerance<0||tolerance>.5)throw Error('Invalid contour fitting limits');
  const w=width*8,h=height*8,source=sampleDraft(image,w,h,threshold,'nearest'),edges=new Map();let edgeCount=0;
  const on=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&source[(y*w+x)*4+3]>0;
  const add=(x,y,xx,yy,d)=>{const key=y*(w+1)+x,e={end:yy*(w+1)+xx,d};if(!edges.has(key))edges.set(key,[]);edges.get(key).push(e);edgeCount++;};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(on(x,y)){
    if(!on(x,y-1))add(x,y,x+1,y,0);if(!on(x+1,y))add(x+1,y,x+1,y+1,1);if(!on(x,y+1))add(x+1,y+1,x,y+1,2);if(!on(x-1,y))add(x,y+1,x,y,3);
    if(edgeCount>32768)return{mask:null,diagnostics:{fallback:'fragmented-reference'}};
  }
  const loops=[];let verticesBefore=0,verticesAfter=0;
  while(edges.size){
    const start=edges.keys().next().value,loop=[];let at=start,previous=0,steps=0;
    do{
      loop.push([at%(w+1)/8,Math.floor(at/(w+1))/8]);
      const choices=edges.get(at);if(!choices?.length)return{mask:null,diagnostics:{fallback:'open-contour'}};
      choices.sort((a,b)=>[1,0,3,2].indexOf((a.d-previous+4)%4)-[1,0,3,2].indexOf((b.d-previous+4)%4));
      const edge=choices.shift();if(!choices.length)edges.delete(at);previous=edge.d;at=edge.end;
      if(++steps>edgeCount)return{mask:null,diagnostics:{fallback:'contour-limit'}};
    }while(at!==start);
    if(loop.length<3||Math.abs(area(loop))<.15)continue;
    const polygon=closedSimplify(loop,tolerance);if(polygon.length<3)continue;
    loops.push(polygon);verticesBefore+=loop.length;verticesAfter+=polygon.length;
  }
  const mask=new Uint8Array(width*height);
  for(let y=0;y<height;y++){
    const yy=y+.5,crossings=[];
    for(const loop of loops)for(let i=0;i<loop.length;i++){
      const a=loop[i],b=loop[(i+1)%loop.length];if((a[1]<=yy&&b[1]>yy)||(b[1]<=yy&&a[1]>yy))crossings.push(a[0]+(yy-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    crossings.sort((a,b)=>a-b);for(let i=0;i+1<crossings.length;i+=2)for(let x=Math.max(0,Math.ceil(crossings[i]-.5));x<width&&x+.5<crossings[i+1];x++)mask[y*width+x]=1;
  }
  return{mask,diagnostics:{loops:loops.length,verticesBefore,verticesAfter,tolerance}};
}
