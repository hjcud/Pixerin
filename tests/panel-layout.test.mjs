import test from "node:test";
import assert from "node:assert/strict";
import {PANEL_IDS,defaultPanelLayout,normalizePanelLayout,panelGroup,movePanel,closePanel,fitFloating} from "../src/panel-layout.mjs";
const unique=layout=>assert.deepEqual(Object.values(layout.groups).flat().sort(),[...PANEL_IDS].sort());

test("layout lock is an opt-in boolean compatible with existing version-one settings",()=>{
  const old=defaultPanelLayout();delete old.locked;
  assert.equal(normalizePanelLayout(old).locked,false);
  assert.equal(normalizePanelLayout({...old,locked:"true"}).locked,false);
  let locked=normalizePanelLayout({...old,locked:true});
  locked=movePanel(locked,"palette","bottom");locked=closePanel(locked,"preview");
  assert.equal(normalizePanelLayout(JSON.parse(JSON.stringify(locked))).locked,true);
  unique(locked);
});

test("panel layout sanitizes unknown versions, duplicates, positions and unrelated persisted data",()=>{
  assert.deepEqual(normalizePanelLayout({version:2}),defaultPanelLayout());
  const raw={version:1,groups:{"left-top":["ai","ai","unknown"],"float-tools":["palette"]},active:{"left-top":"wrong"},
    floating:{"float-tools":{x:-100,y:Infinity,width:1e8,height:1}},sizes:{left:-50,right:5000,bottom:NaN},hidden:["ai","ai","bad"],artwork:"private"};
  const value=normalizePanelLayout(raw);unique(value);
  assert.equal(value.active["left-top"],"tools");assert.deepEqual(value.hidden,["ai","animation"]);
  assert.equal(value.sizes.left,180);assert.equal(value.sizes.right,440);
  assert.deepEqual(value.floating["float-tools"],{x:0,y:40,width:1600,height:160});
  assert.ok(!JSON.stringify(value).includes("private"));
});

test("docking, tab reorder and floating merges keep exactly one live copy of each panel",()=>{
  const original=defaultPanelLayout(),before=structuredClone(original);
  let layout=movePanel(original,"palette","right-top",1);unique(layout);
  assert.deepEqual(layout.groups["right-top"],["ai","palette","preview"]);
  layout=movePanel(layout,"preview","right-top",0);assert.deepEqual(layout.groups["right-top"],["preview","ai","palette"]);
  layout=movePanel(layout,"ai","float-ai",Infinity,{x:300,y:50,width:420,height:500});
  layout=movePanel(layout,"palette","float-ai");unique(layout);
  assert.deepEqual(layout.groups["float-ai"],["ai","palette"]);
  layout=movePanel(layout,"ai","bottom");layout=movePanel(layout,"palette","bottom");unique(layout);
  assert.equal(layout.groups["float-ai"],undefined);assert.equal(layout.floating["float-ai"],undefined);
  assert.deepEqual(original,before);
});

test("closing all panels preserves their groups and bounds for reopening after restart",()=>{
  let layout=movePanel(defaultPanelLayout(),"ai","float-ai",Infinity,{x:250,y:100,width:400,height:450});
  for(const id of PANEL_IDS)layout=closePanel(layout,id);
  unique(layout);assert.equal(layout.hidden.length,PANEL_IDS.length);
  layout=normalizePanelLayout(JSON.parse(JSON.stringify(layout)));
  assert.equal(panelGroup(layout,"ai"),"float-ai");assert.equal(layout.floating["float-ai"].x,250);
  layout=movePanel(layout,"ai","float-ai");assert.ok(!layout.hidden.includes("ai"));assert.equal(layout.active["float-ai"],"ai");
  assert.equal(layout.floating["float-ai"].width,400);
});

test("floating panels remain reachable after window or monitor size changes",()=>{
  assert.deepEqual(fitFloating({x:1500,y:1200,width:500,height:450},{width:1100,height:646}),{x:600,y:196,width:500,height:450});
  assert.deepEqual(fitFloating({x:-200,y:-100,width:2000,height:2000},{width:1100,height:646}),{x:0,y:0,width:1100,height:646});
});
