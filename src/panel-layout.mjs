// UI geometry only. Never include document data, colors, paths or credentials.
export const PANEL_IDS = ["tools", "palette", "layers", "ai", "preview", "animation"];
export const DOCK_ZONES = ["left-top", "left-bottom", "right-top", "right-bottom", "bottom"];
const defaults = {
  "left-top": ["tools"], "left-bottom": ["palette"],
  "right-top": ["ai", "preview"], "right-bottom": [], bottom: ["layers", "animation"],
};
const number = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
const validGroup = id => DOCK_ZONES.includes(id) || PANEL_IDS.some(panel => id === "float-" + panel);
export function defaultPanelLayout() {
  return {version: 1, locked:false, groups: structuredClone(defaults), active: {"left-top":"tools","left-bottom":"palette","right-top":"ai",bottom:"layers"},
    sizes: {left:220,right:320,bottom:220,leftSplit:220,rightSplit:220}, floating: {}, hidden: ["animation"]};
}
export function normalizePanelLayout(raw) {
  if (raw?.version !== 1 || !raw.groups || typeof raw.groups !== "object") return defaultPanelLayout();
  const result = defaultPanelLayout(), seen = new Set();
  result.locked=raw.locked===true;
  result.groups = Object.fromEntries(DOCK_ZONES.map(zone => [zone,[]]));
  result.active = {}; result.floating = {};
  result.hidden = [...new Set((Array.isArray(raw.hidden)?raw.hidden:[]).filter(id=>PANEL_IDS.includes(id)))];
  for (const group of [...DOCK_ZONES,...PANEL_IDS.map(id=>"float-"+id)]) {
    if (!Array.isArray(raw.groups[group])) continue;
    const panels = raw.groups[group].filter(id => {
      if (!PANEL_IDS.includes(id) || seen.has(id)) return false;
      seen.add(id); return true;
    });
    if (!panels.length && !DOCK_ZONES.includes(group)) continue;
    result.groups[group] = panels;
    result.active[group] = panels.includes(raw.active?.[group]) && !result.hidden.includes(raw.active[group])
      ? raw.active[group] : panels.find(id=>!result.hidden.includes(id));
    if (group.startsWith("float-")) {
      const r = raw.floating?.[group];
      result.floating[group] = {x:number(r?.x,40,0,10000),y:number(r?.y,40,0,10000),
        width:number(r?.width,360,220,1600),height:number(r?.height,420,160,1200)};
    }
  }
  for (const id of PANEL_IDS) if (!seen.has(id)) {
    if (id === "animation" && !result.hidden.includes(id)) result.hidden.push(id);
    const group = DOCK_ZONES.find(zone => defaults[zone].includes(id));
    result.groups[group].push(id); if(!result.hidden.includes(id))result.active[group] ||= id;
  }
  for (const key of ["left","right"]) result.sizes[key] = number(raw.sizes?.[key],result.sizes[key],180,440);
  result.sizes.bottom = number(raw.sizes?.bottom,220,100,420);
  for (const key of ["leftSplit","rightSplit"]) result.sizes[key] = number(raw.sizes?.[key],220,100,600);
  return result;
}
export function panelGroup(layout,id) { return Object.keys(layout.groups).find(key=>layout.groups[key].includes(id)); }
export function movePanel(raw,id,target,index=Infinity,bounds) {
  const layout = normalizePanelLayout(raw);
  if (!PANEL_IDS.includes(id) || !validGroup(target)) return layout;
  layout.hidden=layout.hidden.filter(panel=>panel!==id);
  const previous = panelGroup(layout,id), oldIndex=layout.groups[previous].indexOf(id);
  const previousBounds=layout.floating[target];
  layout.groups[previous].splice(oldIndex,1);
  if (layout.active[previous] === id) layout.active[previous] = layout.groups[previous][0];
  if (!layout.groups[previous].length && previous.startsWith("float-")) {
    delete layout.groups[previous]; delete layout.active[previous]; delete layout.floating[previous];
  }
  const list = layout.groups[target] ||= [];
  const position = Math.max(0,Math.min(list.length,Number.isFinite(index) ? Math.floor(index) - Number(previous===target && index>oldIndex) : list.length));
  list.splice(position,0,id); layout.active[target] = id;
  if (target.startsWith("float-")) layout.floating[target] = bounds || previousBounds || {x:40,y:40,width:360,height:420};
  return normalizePanelLayout(layout);
}
export function closePanel(raw,id) {
  const layout=normalizePanelLayout(raw);
  if(!PANEL_IDS.includes(id))return layout;
  if(!layout.hidden.includes(id))layout.hidden.push(id);
  return normalizePanelLayout(layout);
}
export function fitFloating(bounds,area) {
  const width=Math.min(Math.max(220,bounds.width),Math.max(220,area.width));
  const height=Math.min(Math.max(160,bounds.height),Math.max(160,area.height));
  return {width,height,x:Math.max(0,Math.min(bounds.x,area.width-width)),y:Math.max(0,Math.min(bounds.y,area.height-height))};
}
