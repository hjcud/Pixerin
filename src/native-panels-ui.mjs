import {t} from "./i18n.mjs";
import {bindText,bindAttr} from "./i18n-dom.mjs";
import {readUISetting,writeUISetting} from "./ui-settings.mjs";
import {registerUISurface} from "./ui-surfaces.mjs";

const KEY="panel-window-bounds.v1";
export function attachNativePanels({bodies,tabs,canChange,changed,returned,notify}) {
  const detached=new Map(),returning=new Set();
  let retry;
  const remember=(id,bounds)=>{
    if(!bodies[id]||!bounds)return;
    const saved=readUISetting(KEY,{}),next={};
    for(const key of Object.keys(bodies)) {
      const r=key===id?bounds:saved?.[key];
      if(r&&["x","y","width","height"].every(k=>Number.isFinite(r[k])&&Math.abs(r[k])<100000))
        next[key]=Object.fromEntries(["x","y","width","height"].map(k=>[k,Math.round(r[k])]));
    }
    writeUISetting(KEY,next);
  };
  window.pixeltool.onPanelBounds(({id,bounds})=>remember(id,bounds));
  window.pixeltool.onPanelReturn(id=>restore(id));

  function sync() {
    const modal=!!document.querySelector("dialog[open]");
    for(const [id,entry] of detached) {
      if(!entry.mounted)continue;
      const doc=entry.win.document;
      doc.documentElement.lang=document.documentElement.lang;
      doc.documentElement.dataset.theme=document.documentElement.dataset.theme||"dark";
      doc.body.dataset.showHints=document.body.dataset.showHints||"false";
      doc.body.dataset.canvasBackground=document.body.dataset.canvasBackground||"theme";
      doc.body.inert=modal||document.body.inert||document.querySelector(".workspace").inert;
      const source=document.getElementById("toast"),toast=doc.getElementById("native-panel-toast");
      toast.textContent=source.textContent;toast.classList.toggle("error",source.classList.contains("error"));toast.hidden=source.hidden;
      if(modal&&!entry.modal)window.pixeltool.panelCommand({action:"focus-owner"}).catch(()=>{});
      entry.modal=modal;
    }
  }
  const observer=new MutationObserver(sync);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:["lang","data-theme"]});
  observer.observe(document.body,{attributes:true,attributeFilter:["inert","data-show-hints","data-canvas-background"]});
  observer.observe(document.querySelector(".workspace"),{attributes:true,attributeFilter:["inert"]});
  observer.observe(document.getElementById("toast"),{subtree:true,childList:true,characterData:true,attributes:true});
  for(const dialog of document.querySelectorAll("dialog"))observer.observe(dialog,{attributes:true,attributeFilter:["open"]});

  function restore(id,force=false,preserveLayout=false) {
    const entry=detached.get(id);if(!entry)return;
    if(!force&&!canChange()) {
      returning.add(id);clearTimeout(retry);
      retry=setTimeout(()=>{for(const key of [...returning])restore(key);},100);
      return;
    }
    returning.delete(id);detached.delete(id);entry.cancel?.();
    // Adopt before destroying the native document: input values, listeners,
    // canvases, live requests and the document's undo stack all survive.
    document.adoptNode(bodies[id]);document.adoptNode(tabs[id]);
    document.querySelector(".workspace").append(bodies[id],tabs[id]);
    entry.unregister?.();returned(id,{preserveLayout});
    window.pixeltool.panelCommand({action:"return",id}).catch(()=>{});
  }
  async function detach(id) {
    if(!bodies[id]||!canChange())return;
    if(detached.has(id)){focus(id);return;}
    const raw=readUISetting(KEY,{})?.[id],features=[];
    for(const [key,target] of [["x","left"],["y","top"],["width","width"],["height","height"]])
      if(Number.isFinite(raw?.[key]))features.push(target+"="+Math.round(raw[key]));
    const win=window.open("pixeltool://app/src/panel.html?panel="+id,"pixeltool-panel-"+id,features.join(","));
    if(!win){notify(t("별도 창을 열지 못했어요. 패널은 앱 안에 유지돼요."),true);return;}
    const entry={win,mounted:false};detached.set(id,entry);
    try {
      await new Promise((resolve,reject)=>{
        // Navigation replaces the initial about:blank Window's load listeners.
        // Wait in the retained owner until the trusted shell document exists.
        const poll=setInterval(()=>{
          try {
            if(win.closed)throw new Error("Panel closed");
            if(win.document.readyState==="complete"&&win.document.getElementById("native-panel-root")){clear();resolve();}
          } catch(error){clear();reject(error);}
        },25);
        const timer=setTimeout(()=>{clear();reject(new Error("Panel load timeout"));},10000);
        const clear=()=>{clearInterval(poll);clearTimeout(timer);};
        entry.cancel=()=>{clear();reject(new Error("Panel closed"));};
      });
      if(detached.get(id)!==entry)return;
      if(!canChange()){restore(id,true);return;}
      const doc=win.document,root=doc.getElementById("native-panel-root");
      const header=document.createElement("header");header.className="dock-group-header";
      const strip=document.createElement("div");strip.className="dock-tab-strip";strip.setAttribute("role","tablist");
      strip.append(tabs[id]);tabs[id].hidden=false;tabs[id].setAttribute("aria-selected","true");tabs[id].tabIndex=0;
      const back=document.createElement("button");back.type="button";back.id="native-panel-return";
      bindText(back,()=>t("앱 안으로 가져오기"));bindAttr(back,"title",()=>t("원래 패널 위치로 돌아가기"));
      back.onclick=()=>restore(id);
      header.append(strip,back);root.append(header,bodies[id]);bodies[id].hidden=false;
      entry.unregister=registerUISurface(win);entry.mounted=true;entry.cancel=null;
      win.addEventListener("resize",()=>changed());
      sync();changed();focus(id);
    } catch(error) {
      if(detached.get(id)!==entry)return;
      console.warn("Native panel could not attach:",id,error.message);
      restore(id,true);notify(t("별도 창을 열지 못했어요. 패널은 앱 안에 유지돼요."),true);
    }
  }
  function focus(id) {
    if(!detached.has(id))return false;
    window.pixeltool.panelCommand({action:"focus",id}).catch(()=>{});return true;
  }
  return {detach,restore,focus,has:id=>detached.get(id)?.mounted===true,count:()=>detached.size,
    restoreAll:({preserveLayout=false}={})=>{for(const id of [...detached.keys()])restore(id,true,preserveLayout);}};
}
