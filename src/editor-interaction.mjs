import { documentRGBA, colorHex, MAX_SIZE } from "./core.mjs";

export function normalizeBrushSizes(raw) {
  return Object.fromEntries(
    ["pencil", "eraser", "line", "brush-select"].map((tool) => [
      tool,
      Number.isInteger(raw?.[tool]) && raw[tool] >= 1 && raw[tool] <= 8
        ? raw[tool]
        : 1,
    ]),
  );
}

// Clamp the complete mask to the canvas so moving its boundary never loses cells.
export function translateMask(mask, width, height, dx, dy) {
  const cells = mask.flatMap((v, i) => (v ? [i] : []));
  if (!cells.length) return [...mask];
  const xs = cells.map((i) => i % width),
    ys = cells.map((i) => Math.floor(i / width));
  dx = Math.max(
    -Math.min(...xs),
    Math.min(width - 1 - Math.max(...xs), Math.trunc(dx)),
  );
  dy = Math.max(
    -Math.min(...ys),
    Math.min(height - 1 - Math.max(...ys), Math.trunc(dy)),
  );
  const result = Array(width * height).fill(false);
  for (const i of cells) result[i + dx + dy * width] = true;
  return result;
}

export function selectionMode(
  event,
  intersectionModifier = "alt-shift",
  fallback = "replace",
) {
  if (event.button === 2 || event.buttons & 2) return "subtract";
  if (intersectionModifier === "ctrl-shift") {
    if (event.ctrlKey && event.shiftKey) return "intersect";
    if (event.altKey && event.shiftKey) return "subtract";
  } else if (event.altKey && event.shiftKey) return "intersect";
  if (event.altKey) return "subtract";
  if (event.shiftKey) return "add";
  return fallback;
}
export function copyDrag(event, duplicateModifier = "ctrl") {
  return duplicateModifier === "alt"
    ? event.altKey && !event.ctrlKey
    : event.ctrlKey && !event.altKey && !event.shiftKey;
}
export function sampleColor(doc, index, source) {
  if (source === "layer") return doc.palette[doc.pixels[index]];
  const data = documentRGBA(doc);
  return colorHex(
    "#" +
      Array.from(data.slice(index * 4, index * 4 + 4), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
  );
}

export function commandNavigationIndex(index, count, direction) {
  if (!count) return -1;
  if (index < 0) return direction > 0 ? 0 : count - 1;
  return (index + direction + count) % count;
}
// View-only coordinates: never transform document pixels or history.
export function navigatorBounds(
  width,
  height,
  zoom,
  viewportWidth,
  viewportHeight,
  viewX,
  viewY,
) {
  const left = (width - viewportWidth / zoom) / 2 - viewX / zoom;
  const top = (height - viewportHeight / zoom) / 2 - viewY / zoom;
  const x = Math.max(0, Math.min(width, left));
  const y = Math.max(0, Math.min(height, top));
  return {
    x,
    y,
    width: Math.max(0, Math.min(width, left + viewportWidth / zoom) - x),
    height: Math.max(0, Math.min(height, top + viewportHeight / zoom) - y),
  };
}
export function navigatorPan(width, height, zoom, x, y) {
  return {
    x: (width / 2 - Math.max(0, Math.min(width, x))) * zoom,
    y: (height / 2 - Math.max(0, Math.min(height, y))) * zoom,
  };
}
export function validateClipboard(raw) {
  if (
    !raw ||
    ![raw.width, raw.height].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= MAX_SIZE,
    ) ||
    !Array.isArray(raw.pixels) ||
    raw.pixels.length !== raw.width * raw.height
  )
    throw new Error("Invalid pixel clipboard");
  const pixels = raw.pixels.map((c) => (c === null ? null : colorHex(c)));
  if (new Set(pixels.filter((c) => c !== null)).size > 256)
    throw new Error("Clipboard exceeds 256 colors");
  return { width: raw.width, height: raw.height, pixels };
}
