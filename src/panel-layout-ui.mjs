import {t} from "./i18n.mjs";
import {bindText,bindAttr} from "./i18n-dom.mjs";
import {createIcon} from "./icons.mjs";
import {readUISetting,writeUISetting} from "./ui-settings.mjs";
import {PANEL_IDS,DOCK_ZONES,defaultPanelLayout,normalizePanelLayout,panelGroup,movePanel,fitFloating,closePanel} from "./panel-layout.mjs";
import {attachNativePanels} from "./native-panels-ui.mjs";

const KEY="panel-layout.v1", STORAGE_KEY="pixeltool.ui."+KEY;
const names={tools:"편집 도구",palette:"팔레트",layers:"레이어",ai:"AI 수정",preview:"미리보기",animation:"애니메이션"};
const places={"left-top":"왼쪽 위","left-bottom":"왼쪽 아래","right-top":"오른쪽 위","right-bottom":"오른쪽 아래",bottom:"아래쪽",float:"떠 있는 패널"};

export function attachPanelLayout({canChange,changed,activate,notify}) {
  const workspace=document.querySelector(".workspace");
  const tools=document.querySelector(".tools-panel"),palette=tools.querySelector(".color-library");
  const layers=document.querySelector(".layer-dock"),ai=document.querySelector(".ai-panel"),preview=document.getElementById("preview-content");
  const inspectorTabs={ai:document.getElementById("inspector-ai"),preview:document.getElementById("inspector-preview")};
  const animation=document.getElementById("animation-panel");
  const panels={tools,palette,layers,ai,preview,animation},bodies={},tabs={},groups=new Map();
  let layout=normalizePanelLayout(readUISetting(KEY,null)),drag=null,resizing=null,pending=null,frame=0,front=0,native=null;
  const make=(tag,className)=>{const el=document.createElement(tag);el.className=className;return el;};
  document.body.classList.add("dock-layout");
  const left=make("aside","dock-side dock-left"),right=make("aside","dock-side dock-right"),bottom=make("section","dock-bottom"),floats=make("div","dock-floats");
  workspace.prepend(left);workspace.append(right,bottom,floats);
  for(const id of PANEL_IDS) {
    const body=make("section","dock-body");body.id="dock-body-"+id;body.setAttribute("role","tabpanel");body.dataset.panel=id;
    body.setAttribute("aria-labelledby",id==="ai"||id==="preview"?"inspector-"+id:"dock-tab-"+id);
    body.append(panels[id]);bodies[id]=body;
    if(id==="layers") {
      const note=make("p","dock-unavailable field-help");bindText(note,()=>t("오토타일 모드에서는 레이어 패널을 사용하지 않아요."));body.append(note);
    }
    let tab=inspectorTabs[id]||make("button","");
    tab.classList.add("dock-tab");tab.type="button";tab.dataset.panel=id;
    if(!tab.id)tab.id="dock-tab-"+id;
    tab.setAttribute("role","tab");tab.setAttribute("aria-controls",body.id);
    bindText(tab,()=>t(names[id]));bindAttr(tab,"title",()=>t("끌어서 패널 이동, 탭으로 합치기"));
    if(id!=="ai"&&id!=="preview")tab.addEventListener("click",()=>{if(!tab.dataset.dragged)show(id);delete tab.dataset.dragged;});
    tab.addEventListener("pointerdown",event=>startDrag(event,id));
    tab.addEventListener("keydown",event=>{
      if(native?.has(id))return;
      if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
      event.preventDefault();event.stopImmediatePropagation();
      const list=visiblePanels(panelGroup(layout,id)),at=list.indexOf(id);
      const index=event.key==="Home"?0:event.key==="End"?list.length-1:(at+(event.key==="ArrowRight"?1:list.length-1))%list.length;
      show(list[index]);tabs[list[index]].focus();
    },true);
    tabs[id]=tab;
  }
  ai.querySelector(".inspector-tabs").remove();
  ai.dataset.inspector="ai";
  ai.querySelector("#assistant-content").hidden=false;preview.hidden=false;
  for(const side of ["left","right"]) {
    const container=side==="left"?left:right;
    container.append(makeGroup(side+"-top"));
    const split=separator(side+"Split","horizontal");split.classList.add("dock-stack-divider");container.append(split,makeGroup(side+"-bottom"));
  }
  bottom.append(makeGroup("bottom"));
  for(const [key,orientation] of [["left","vertical"],["right","vertical"],["bottom","horizontal"]]) {
    const handle=separator(key,orientation);handle.classList.add("dock-divider-"+key);workspace.append(handle);
  }
  const overlay=make("div","dock-drop-overlay");overlay.hidden=true;workspace.append(overlay);
  for(const zone of DOCK_ZONES) {
    const target=make("div","dock-target dock-target-"+zone);target.dataset.dockTarget=zone;
    bindText(target,()=>t(places[zone]));overlay.append(target);
  }
  const layoutMenu=make("details","dock-layout-menu file-more");layoutMenu.id="panel-layout-menu";
  const summary=make("summary","icon-button");summary.append(createIcon("panels"));
  const panelLabel=make("span","header-panel-label");bindText(panelLabel,()=>t("패널"));summary.append(panelLabel);
  const lockIndicator=createIcon("lock");lockIndicator.classList.add("dock-lock-indicator");summary.append(lockIndicator);
  bindAttr(summary,"title",()=>t(layout.locked?"패널 배치, 잠김":"패널 배치"));
  bindAttr(summary,"aria-label",()=>t(layout.locked?"패널 배치, 잠김":"패널 배치"));
  const menu=make("div","file-menu");layoutMenu.append(summary,menu);
  for(const id of PANEL_IDS) {
    const button=make("button","");button.type="button";button.dataset.showPanel=id;
    const label=make("span","dock-panel-name"),state=make("small","dock-panel-state");
    bindText(label,()=>t(names[id]));
    const status=()=>t(button.dataset.panelState==="window"?"별도 창":button.dataset.panelState==="closed"?"닫힘":"앱 내부");
    bindText(state,status);bindAttr(button,"aria-label",()=>t(names[id])+", "+status());
    button.append(label,state);
    button.onclick=()=>{layoutMenu.open=false;show(id);};menu.append(button);
  }
  menu.append(document.createElement("hr"));
  const lock=make("button","");lock.type="button";lock.id="panel-layout-lock";
  lock.append(createIcon("lock"));const lockLabel=make("span","");bindText(lockLabel,()=>t("패널 배치 잠금"));lock.append(lockLabel);
  bindAttr(lock,"title",()=>t("앱 내부 패널의 드래그 이동과 크기 조절을 잠가요. 메뉴 조작과 별도 창 이동은 가능해요."));
  lock.onclick=()=>{
    if(!canChange())return;
    if(drag||resizing)finish({pointerId:drag?.pointer??resizing.pointer},true);
    layout.locked=!layout.locked;save();apply();
  };menu.append(lock);
  const returnAll=make("button","");returnAll.type="button";returnAll.id="panel-layout-return-all";
  bindText(returnAll,()=>t("분리 창만 모두 가져오기"));
  bindAttr(returnAll,"title",()=>t("현재 작업의 분리된 패널을 가져와요. 배치와 크기, 닫힌 패널은 유지해요."));
  returnAll.onclick=()=>{
    if(!canChange())return;
    layoutMenu.open=false;native.restoreAll({preserveLayout:true});refreshMenu();summary.focus();
  };menu.append(returnAll);
  const reset=make("button","");reset.id="panel-layout-reset";reset.type="button";bindText(reset,()=>t("기본 배치로 복원"));
  reset.onclick=()=>{if(!canChange())return;layoutMenu.open=false;native.restoreAll();layout=defaultPanelLayout();save();apply();};menu.append(reset);
  document.getElementById("settings-btn").before(layoutMenu);
  native=attachNativePanels({bodies,tabs,canChange,changed:apply,notify,returned:(id,{preserveLayout})=>{
    if(!preserveLayout) {
      layout.hidden=layout.hidden.filter(panel=>panel!==id);
      layout.active[panelGroup(layout,id)]=id;save();
    }
    apply();
  }});
  layoutMenu.addEventListener("toggle",()=>{if(layoutMenu.open)refreshMenu();});

  function makeGroup(key) {
    const group=make("section","dock-group");group.dataset.dockGroup=key;
    const header=make("div","dock-group-header"),strip=make("div","dock-tab-strip");strip.setAttribute("role","tablist");
    bindAttr(strip,"aria-label",()=>t("패널 탭"));strip.dataset.group=key;
    const options=make("details","dock-panel-menu"),summary=make("summary","");summary.append(createIcon("more-vertical"));
    bindAttr(summary,"title",()=>t("패널 위치"));bindAttr(summary,"aria-label",()=>t("패널 위치"));
    const menu=make("div","file-menu");options.append(summary,menu);
    options.addEventListener("toggle",()=>{
      if(!options.open)return;
      menu.style.top="32px";menu.style.bottom="auto";
      if(menu.getBoundingClientRect().bottom>innerHeight-8){menu.style.top="auto";menu.style.bottom="32px";}
    });
    for(const target of [...DOCK_ZONES,"float"]) {
      const b=make("button","");b.type="button";b.dataset.movePanel=target;bindText(b,()=>t(places[target]));
      b.onclick=()=>{
        options.open=false;if(!canChange())return;
        const id=selectedPanel(key);if(!id)return;
        const area=workspace.getBoundingClientRect(),floatKey="float-"+id;
        const bounds=target==="float"&&!layout.floating[floatKey]
          ? fitFloating({x:area.width/2-180,y:40,width:360,height:420},area):undefined;
        layout=movePanel(layout,id,target==="float"?floatKey:target,Infinity,bounds);save();apply();
      };menu.append(b);
    }
    const detach=make("button","");detach.type="button";detach.dataset.movePanel="window";
    bindText(detach,()=>t("별도 창으로 분리"));
    detach.onclick=()=>{options.open=false;const id=selectedPanel(key);if(id)native.detach(id);};menu.append(detach);
    const close=make("button","dock-close");close.type="button";close.append(createIcon("close"));
    bindAttr(close,"title",()=>t("패널 닫기"));bindAttr(close,"aria-label",()=>t("패널 닫기"));
    close.onclick=()=>{if(!canChange())return;layout=closePanel(layout,selectedPanel(key));save();apply();
      (tabs[selectedPanel(key)]||document.querySelector("#panel-layout-menu > summary")).focus();};
    const content=make("div","dock-group-content");header.append(strip,options,close);group.append(header,content);
    if(key.startsWith("float-"))group.addEventListener("pointerdown",()=>{group.style.zIndex=String(++front);});
    groups.set(key,{group,header,strip,content});return group;
  }
  function separator(key,orientation) {
    const handle=make("div","dock-resizer");handle.tabIndex=0;handle.dataset.resizeDock=key;
    handle.setAttribute("role","separator");handle.setAttribute("aria-orientation",orientation);
    bindAttr(handle,"aria-label",()=>t("패널 크기 조절"));
    handle.addEventListener("pointerdown",event=>{
      if(event.button!==0||!canChange()||layout.locked)return;
      event.preventDefault();resizing={key,pointer:event.pointerId,x:event.clientX,y:event.clientY,before:structuredClone(layout)};
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("keydown",event=>{
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)||!canChange()||layout.locked)return;
      event.preventDefault();const delta=(event.key==="ArrowRight"||event.key==="ArrowDown"?1:-1)*16;
      if(key.startsWith("float-"))layout.floating[key][event.key==="ArrowUp"||event.key==="ArrowDown"?"height":"width"]+=delta;
      else layout.sizes[key]+=delta*(key==="right"||key==="bottom"||key.endsWith("Split")?-1:1);
      layout=normalizePanelLayout(layout);save();apply();
    });return handle;
  }
  function save() { if(!writeUISetting(KEY,layout))notify(t("화면 배치를 저장하지 못했어요. 이번 실행에만 유지돼요."),true); }
  function show(id) {
    if(!canChange())return;
    if(native?.focus(id)){activate(id);return;}
    const key=panelGroup(layout,id);if(!key)return;
    document.body.classList.remove("canvas-focus");document.getElementById("canvas-focus").setAttribute("aria-pressed","false");
    layout.hidden=layout.hidden.filter(panel=>panel!==id);
    layout.active[key]=id;apply();save();activate(id);
    if(key.startsWith("float-"))groups.get(key).group.style.zIndex=String(++front);
  }
  function apply() {
    const area=workspace.getBoundingClientRect();
    for(const [key,g] of groups) if(key.startsWith("float-")&&!layout.groups[key]) {g.group.remove();groups.delete(key);}
    for(const [key,ids] of Object.entries(layout.groups)) {
      if(!groups.has(key)) {
        const group=makeGroup(key);floats.append(group);group.classList.add("dock-floating");
        const size=separator(key,"vertical");size.classList.add("dock-floating-resize");group.append(size);
      }
      const visible=visiblePanels(key),selectedId=selectedPanel(key);
      const g=groups.get(key);g.group.hidden=!visible.length;
      for(const id of ids) {
        if(native?.has(id))continue;
        g.strip.append(tabs[id]);g.content.append(bodies[id]);
        tabs[id].hidden=layout.hidden.includes(id);
        const selected=selectedId===id;bodies[id].hidden=!selected;
        tabs[id].setAttribute("aria-selected",String(selected));tabs[id].tabIndex=selected?0:-1;
      }
      if(key.startsWith("float-")) {
        const r=fitFloating(layout.floating[key],area);
        Object.assign(g.group.style,{left:r.x+"px",top:r.y+"px",width:r.width+"px",height:r.height+"px"});
      }
    }
    const visible=key=>visiblePanels(key).length>0;
    const hasLeft=visible("left-top")||visible("left-bottom");
    const hasRight=visible("right-top")||visible("right-bottom");
    const factor=Math.max(0,Math.min(1,(area.width-400)/((hasLeft?layout.sizes.left:0)+(hasRight?layout.sizes.right:0)||1)));
    const size={left:hasLeft?Math.floor(layout.sizes.left*factor):0,right:hasRight?Math.floor(layout.sizes.right*factor):0,
      bottom:visible("bottom")?Math.min(layout.sizes.bottom,Math.max(100,area.height-220)):0};
    for(const key of ["left","right","bottom"])workspace.style.setProperty("--dock-"+key,size[key]+"px");
    left.hidden=!hasLeft;right.hidden=!hasRight;bottom.hidden=!size.bottom;
    for(const [side,container] of [["left",left],["right",right]]) {
      const both=visible(side+"-top")&&visible(side+"-bottom");
      container.style.gridTemplateRows=both?`minmax(120px,1fr) 6px ${Math.min(layout.sizes[side+"Split"],Math.max(100,area.height-180))}px`:
        visible(side+"-top")?"minmax(0,1fr) 0 0":"0 0 minmax(0,1fr)";
      container.querySelector(".dock-stack-divider").hidden=!both;
    }
    for(const key of ["left","right","bottom"])workspace.querySelector(".dock-divider-"+key).hidden=!size[key];
    for(const handle of workspace.querySelectorAll("[data-resize-dock]")) {
      const key=handle.dataset.resizeDock,isFloat=key.startsWith("float-");
      handle.setAttribute("aria-valuenow",String(isFloat?layout.floating[key].width:layout.sizes[key]));
      handle.setAttribute("aria-valuemin",String(isFloat?220:key==="left"||key==="right"?180:100));
      handle.setAttribute("aria-valuemax",String(isFloat?1600:key==="bottom"?420:key.endsWith("Split")?600:440));
      handle.setAttribute("aria-disabled",String(layout.locked));handle.tabIndex=layout.locked?-1:0;
    }
    document.body.classList.toggle("dock-layout-locked",layout.locked);
    refreshMenu();
    schedule();
  }
  function visiblePanels(key) {return layout.groups[key].filter(id=>!layout.hidden.includes(id)&&!native?.has(id));}
  function selectedPanel(key) {const ids=visiblePanels(key);return ids.includes(layout.active[key])?layout.active[key]:ids[0];}
  function refreshMenu() {
    lock.setAttribute("aria-pressed",String(layout.locked));lockIndicator.hidden=!layout.locked;
    summary.title=summary.ariaLabel=t(layout.locked?"패널 배치, 잠김":"패널 배치");
    returnAll.disabled=!native?.count();
    for(const button of menu.querySelectorAll("[data-show-panel]")) {
      const id=button.dataset.showPanel;
      button.dataset.panelState=native?.has(id)?"window":layout.hidden.includes(id)?"closed":"inside";
      button.dataset.closed=String(button.dataset.panelState==="closed");
      bindText(button.querySelector(".dock-panel-state"),()=>t(button.dataset.panelState==="window"?"별도 창":button.dataset.panelState==="closed"?"닫힘":"앱 내부"));
      bindAttr(button,"aria-label",()=>t(names[id])+", "+button.querySelector(".dock-panel-state").textContent);
    }
  }
  function schedule() {cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>changed());}
  function flushPending() {if(pending&&!drag&&!resizing&&canChange()){layout=pending;pending=null;apply();}}
  function startDrag(event,id) {
    if(event.button!==0||!canChange()||layout.locked||native?.has(id))return;
    drag={id,pointer:event.pointerId,x:event.clientX,y:event.clientY,moved:false,tab:tabs[id]};
    tabs[id].setPointerCapture(event.pointerId);
  }
  window.addEventListener("pointermove",event=>{
    if(resizing&&event.pointerId===resizing.pointer) {
      const {key,before,x,y}=resizing;layout=structuredClone(before);
      if(key.startsWith("float-")) {
        layout.floating[key].width+=event.clientX-x;layout.floating[key].height+=event.clientY-y;
      } else layout.sizes[key]+=(key==="left"?event.clientX-x:key==="right"?x-event.clientX:y-event.clientY);
      layout=normalizePanelLayout(layout);apply();return;
    }
    if(!drag||event.pointerId!==drag.pointer){flushPending();return;}
    if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6) {
      drag.moved=true;drag.tab.dataset.dragged="true";overlay.hidden=false;document.body.classList.add("dragging-panel");
    }
  });
  function finish(event,cancel=false) {
    if(resizing&&event.pointerId===resizing.pointer) {
      if(cancel)layout=resizing.before;else save();resizing=null;
      if(pending){layout=pending;pending=null;}apply();return;
    }
    if(!drag||event.pointerId!==drag.pointer){flushPending();return;}
    const current=drag;drag=null;
    // Reparenting on an ordinary pointer-up would suppress the following click.
    if(!current.moved){flushPending();return;}
    const hit=cancel?null:document.elementFromPoint(event.clientX,event.clientY);
    const target=hit?.closest("[data-dock-target]")?.dataset.dockTarget;
    const strip=hit?.closest(".dock-tab-strip");
    const sourceGroup=panelGroup(layout,current.id);
    const movingFloat=sourceGroup.startsWith("float-")&&layout.groups[sourceGroup].length===1;
    if(current.moved&&!cancel) {
      if(target)layout=movePanel(layout,current.id,target);
      else if(strip&&!(movingFloat&&strip.dataset.group===sourceGroup)) {
        const buttons=[...strip.querySelectorAll(".dock-tab")];
        let index=buttons.findIndex(b=>{const r=b.getBoundingClientRect();return event.clientX<r.x+r.width/2;});
        layout=movePanel(layout,current.id,strip.dataset.group,index<0?Infinity:index);
      } else {
        const r=workspace.getBoundingClientRect();
        const source=panelGroup(layout,current.id),previous=layout.floating[source];
        const bounds=previous&&layout.groups[source].length===1
          ? {...previous,x:previous.x+event.clientX-current.x,y:previous.y+event.clientY-current.y}
          : {x:event.clientX-r.x-70,y:event.clientY-r.y-16,width:360,height:420};
        layout=movePanel(layout,current.id,"float-"+current.id,Infinity,fitFloating(bounds,r));
      }
      save();
    }
    overlay.hidden=true;document.body.classList.remove("dragging-panel");apply();
    setTimeout(()=>delete current.tab.dataset.dragged,0);
    if(pending){layout=pending;pending=null;apply();}
  }
  window.addEventListener("pointerup",event=>finish(event));
  window.addEventListener("pointercancel",event=>finish(event,true));
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&(drag||resizing)){event.preventDefault();event.stopImmediatePropagation();finish({pointerId:drag?.pointer??resizing.pointer},true);}
    else if(event.key==="Escape")for(const details of [layoutMenu,...workspace.querySelectorAll(".dock-panel-menu")]) {
      if(details.open){event.preventDefault();event.stopImmediatePropagation();details.open=false;details.querySelector("summary").focus();}
    }
    queueMicrotask(flushPending);
  },true);
  window.addEventListener("blur",()=>{if(drag||resizing)finish({pointerId:drag?.pointer??resizing.pointer},true);});
  window.addEventListener("storage",event=>{
    if(event.key!==STORAGE_KEY)return;
    let value;try{value=normalizePanelLayout(JSON.parse(event.newValue));}catch{value=defaultPanelLayout();}
    if(drag||resizing||!canChange())pending=value;else{layout=value;apply();}
  });
  document.addEventListener("pointerdown",event=>{
    for(const details of [layoutMenu,...workspace.querySelectorAll(".dock-panel-menu")])
      if(details.open&&!details.contains(event.target))details.open=false;
  });
  window.addEventListener("resize",apply);
  apply();
  return {show,refresh:apply};
}
