// Icon artwork is generated from the editable PNG files in ./icons/.
import { ICON_PIXELS } from "./icons/data.mjs";
export { ICON_PIXELS };
function pixelPath(rows) {
  const runs = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      if (row[x] !== "#") continue;
      const start = x;
      while (x + 1 < 16 && row[x + 1] === "#") x++;
      runs.push(
        "M" + start + " " + y + "h" + (x - start + 1) + "v1H" + start + "z",
      );
    }
  });
  return runs.join("");
}
export const ICON_PATHS = Object.freeze(
  Object.fromEntries(
    Object.entries(ICON_PIXELS).map(([name, rows]) => [name, pixelPath(rows)]),
  ),
);
export function iconMarkup(name, color = "currentColor") {
  if (!Object.hasOwn(ICON_PATHS, name))
    throw new Error("Unknown UI icon: " + name);
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="' +
    color +
    '" stroke="none" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path d="' +
    ICON_PATHS[name] +
    '"/></svg>'
  );
}
export function createIcon(name) {
  const span = document.createElement("span");
  span.dataset.icon = name;
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = iconMarkup(name);
  return span;
}

export function mountIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = iconMarkup(el.dataset.icon);
  }
}
