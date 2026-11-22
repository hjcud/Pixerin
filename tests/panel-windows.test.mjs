import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const {panelURL,fitPanelBounds}=createRequire(import.meta.url)("../electron/panel-bounds.cjs");

test("native panels only accept the exact trusted shell and allowlisted panel",()=>{
  assert.equal(panelURL("pixeltool://app/src/panel.html?panel=ai"),"ai");
  for(const url of ["https://app/src/panel.html?panel=ai","pixeltool://app/index.html",
    "pixeltool://app/src/panel.html?panel=settings","pixeltool://app/src/panel.html?panel=ai&x=1",
    "pixeltool://user@app/src/panel.html?panel=ai","pixeltool://app:99/src/panel.html?panel=ai",
    "pixeltool://app/src/panel.html?panel=ai#x","pixeltool://app/src/panel.html?panel=../ai"])
    assert.equal(panelURL(url),null,url);
});
test("native panel bounds preserve a second monitor including negative coordinates",()=>{
  const displays=[{x:0,y:0,width:1920,height:1040},{x:-2560,y:-200,width:2560,height:1440}];
  const raw={x:-2000,y:-100,width:440,height:700};
  assert.deepEqual(fitPanelBounds(raw,displays),raw);
  const portrait={x:1920,y:0,width:1080,height:1920};
  assert.deepEqual(fitPanelBounds({x:2100,y:500,width:380,height:600},[displays[0],portrait]),
    {x:2100,y:500,width:380,height:600});
});
test("removed monitors and malformed saved sizes recover inside an available work area",()=>{
  const display={x:0,y:30,width:1280,height:690};
  assert.deepEqual(fitPanelBounds({x:-2000,y:-500,width:440,height:700},[display]),
    {x:0,y:30,width:440,height:690});
  assert.deepEqual(fitPanelBounds({x:Infinity,y:NaN,width:1e9,height:-30},[display]),
    {x:80,y:110,width:380,height:220});
});
