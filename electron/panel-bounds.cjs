const PANEL_IDS = ["tools", "palette", "layers", "ai", "preview", "animation"];
function panelURL(value) {
  try {
    const url = new URL(value);
    const id = url.searchParams.get("panel");
    return value === "pixeltool://app/src/panel.html?panel=" + id && PANEL_IDS.includes(id) ? id : null;
  } catch { return null; }
}
function fitPanelBounds(raw, displays, fallback) {
  const areas = displays.map(d => d.workArea || d);
  if (!areas.length) throw new Error("No display work area");
  const number = (key, value) => Number.isFinite(raw?.[key]) && Math.abs(raw[key]) < 100000 ? Math.round(raw[key]) : value;
  const r = {x:number("x",fallback?.x ?? areas[0].x+80),y:number("y",fallback?.y ?? areas[0].y+80),
    width:Math.max(260,number("width",380)),height:Math.max(220,number("height",560))};
  const overlap = a => Math.max(0,Math.min(a.x+a.width,r.x+r.width)-Math.max(a.x,r.x))*
    Math.max(0,Math.min(a.y+a.height,r.y+r.height)-Math.max(a.y,r.y));
  const area = areas.reduce((a,b) => overlap(b)>overlap(a)?b:a,areas[0]);
  r.width=Math.min(r.width,area.width);r.height=Math.min(r.height,area.height);
  r.x=Math.round(Math.max(area.x,Math.min(r.x,area.x+area.width-r.width)));
  r.y=Math.round(Math.max(area.y,Math.min(r.y,area.y+area.height-r.height)));
  return r;
}
module.exports = {PANEL_IDS, panelURL, fitPanelBounds};
