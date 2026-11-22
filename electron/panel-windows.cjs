const {screen} = require("electron");
const path = require("node:path");
const {panelURL,fitPanelBounds} = require("./panel-bounds.cjs");
const NAMES={tools:"편집 도구",palette:"팔레트",layers:"레이어",ai:"AI 수정",preview:"미리보기",animation:"애니메이션"};

class PanelWindows {
  constructor(workspace) {
    this.workspace=workspace;this.owners=new Map();
    const recover=()=>{
      for(const windows of this.owners.values())for(const win of windows.values()) {
        if(win.isDestroyed())continue;
        const fitted=fitPanelBounds(win.getBounds(),screen.getAllDisplays());
        if(JSON.stringify(fitted)!==JSON.stringify(win.getBounds()))win.setBounds(fitted);
      }
    };
    this.recover=recover;
  }
  bind(d) {
    if(!this.listening) {
      for(const event of ["display-removed","display-metrics-changed"])screen.on(event,this.recover);
      this.listening=true;
    }
    const contents=d.view.webContents;
    contents.setWindowOpenHandler(details=>{
      const id=panelURL(details.url);
      if(!id||details.frameName!=="pixeltool-panel-"+id||this.workspace.quitting||d.crashed||!this.workspace.documents.has(d.id))
        return {action:"deny"};
      const existing=this.owners.get(d.id)?.get(id);
      if(existing&&!existing.isDestroyed()){existing.show();existing.focus();return {action:"deny"};}
      const raw={};
      for(const entry of details.features.split(",")) {
        const [key,value]=entry.split("=");
        if(["left","top","width","height"].includes(key))raw[key==="left"?"x":key==="top"?"y":key]=Number(value);
      }
      const owner=d.host.window.getBounds();
      const bounds=fitPanelBounds(raw,screen.getAllDisplays(),{x:owner.x+80,y:owner.y+80});
      return {action:"allow",overrideBrowserWindowOptions:{...bounds,minWidth:260,minHeight:220,
        title:"Pixel Mat",autoHideMenuBar:true,backgroundColor:"#222222",
        webPreferences:{preload:path.join(__dirname,"panel-preload.cjs"),contextIsolation:true,
          nodeIntegration:false,sandbox:true,backgroundThrottling:false}}};
    });
    contents.on("did-create-window",(win,details)=>{
      const id=panelURL(details.url);
      if(!id){win.destroy();return;}
      let windows=this.owners.get(d.id);
      if(!windows)this.owners.set(d.id,windows=new Map());
      windows.set(id,win);win.setMenu(null);
      const activity=()=>{if(!win.isDestroyed())win.webContents.send("ui:window-active",win.isFocused());};
      win.on("focus",activity);win.on("blur",activity);
      win.webContents.on("did-finish-load",activity);
      win.webContents.on("page-title-updated",event=>{event.preventDefault();this.updateTitles(d);});
      win.webContents.on("did-finish-load",()=>this.updateTitles(d));
      this.updateTitles(d);
      win.webContents.setWindowOpenHandler(()=>({action:"deny"}));
      let loaded=false;
      win.webContents.once("did-finish-load",()=>{loaded=true;});
      win.webContents.on("will-navigate",(event,url)=>{
        if(!loaded&&panelURL(typeof url==="string"?url:event.url)===id)return;
        event.preventDefault();
      });
      win.webContents.on("will-redirect",event=>event.preventDefault());
      win.on("close",event=>{
        // The owner adopts controls back before this native window is destroyed.
        event.preventDefault();
        if(!win.pixelMatPanelReturned)this.workspace.send(d,"panel:return",id);
      });
      const bounds=()=>{if(!win.isDestroyed())this.workspace.send(d,"panel:bounds",{id,bounds:win.getNormalBounds()});};
      win.on("move",bounds);win.on("resize",bounds);
      win.on("closed",()=>{
        if(windows.get(id)===win)windows.delete(id);
        if(!windows.size)this.owners.delete(d.id);
        if(!win.pixelMatPanelReturned)this.workspace.send(d,"panel:return",id);
      });
      win.webContents.on("render-process-gone",()=>{if(!win.isDestroyed())win.destroy();});
      bounds();
    });
  }
  command(d,input) {
    if(input?.action==="focus-owner") {this.workspace.focusDocument(d);return true;}
    const win=this.owners.get(d.id)?.get(input?.id);
    if(!win||win.isDestroyed())return false;
    if(input.action==="return") {win.pixelMatPanelReturned=true;win.destroy();}
    else if(input.action==="focus") {if(win.isMinimized())win.restore();win.show();win.focus();}
    else return false;
    return true;
  }
  updateTitles(d) {
    for(const [id,win] of this.owners.get(d.id)||[]) {
      if(win.isDestroyed())continue;
      const title=`${this.workspace.t(NAMES[id])} — ${d.name} — Pixel Mat`;
      if(win.getTitle()!==title)win.setTitle(title);
    }
  }
  destroy(d) {
    const windows=this.owners.get(d.id);
    this.owners.delete(d.id);
    if(windows)for(const win of windows.values())if(!win.isDestroyed()) {
      win.pixelMatPanelReturned=true;win.destroy();
    }
  }
}
module.exports={PanelWindows};
