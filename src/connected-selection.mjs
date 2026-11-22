import { documentRGBA } from "./core.mjs";

// Selection samples a frozen source; it never changes artwork or write scope.
export function connectedSelection(
  doc,
  x,
  y,
  {
    mode = "color",
    diagonal = false,
    wrap = false,
    source = "active",
    contiguous = true,
  } = {},
) {
  const result = Array(doc.width * doc.height).fill(false);
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= doc.width ||
    y >= doc.height
  )
    return result;
  const rgba = source === "visible" ? documentRGBA(doc) : null;
  const colors = rgba
    ? result.map((_, i) => Array.from(rgba.slice(i * 4, i * 4 + 4)).join(","))
    : doc.pixels.map((i) => doc.palette[i]);
  const color = colors[y * doc.width + x];
  const matches = (i) =>
    mode === "opaque"
      ? rgba
        ? rgba[i * 4 + 3] !== 0
        : doc.palette[doc.pixels[i]].slice(7) !== "00"
      : colors[i] === color;
  if (!contiguous) return result.map((_, i) => matches(i));
  const pending = [y * doc.width + x],
    seen = new Set();
  while (pending.length) {
    const i = pending.pop();
    if (seen.has(i)) continue;
    seen.add(i);
    if (!matches(i)) continue;
    result[i] = true;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
        let nx = (i % doc.width) + dx,
          ny = Math.floor(i / doc.width) + dy;
        if (wrap) {
          nx = (nx + doc.width) % doc.width;
          ny = (ny + doc.height) % doc.height;
        }
        if (nx >= 0 && ny >= 0 && nx < doc.width && ny < doc.height)
          pending.push(ny * doc.width + nx);
      }
  }
  return result;
}

// One-pixel square morphology, clipped at the canvas edge. Outside cells are
// unselected, so erosion also treats the canvas edge as a selection boundary.
export function modifySelection(mask, width, height, operation) {
  if (
    mask.length !== width * height ||
    !["grow", "shrink", "border"].includes(operation)
  )
    throw new Error("Invalid selection operation");
  const erosion = mask.map((selected, i) => {
    if (!selected) return false;
    const x = i % width,
      y = Math.floor(i / width);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (
          x + dx < 0 ||
          y + dy < 0 ||
          x + dx >= width ||
          y + dy >= height ||
          !mask[(y + dy) * width + x + dx]
        )
          return false;
    return true;
  });
  if (operation === "shrink") return erosion;
  if (operation === "border")
    return mask.map((v, i) => Boolean(v && !erosion[i]));
  const grown = mask.map(Boolean);
  mask.forEach((selected, i) => {
    if (!selected) return;
    const x = i % width,
      y = Math.floor(i / width);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height)
          grown[(y + dy) * width + x + dx] = true;
  });
  return grown;
}
export function combineSelection(before, region, mode = "replace") {
  return before.map((v, i) =>
    mode === "add"
      ? v || region[i]
      : mode === "subtract"
        ? v && !region[i]
        : mode === "intersect"
          ? v && region[i]
          : region[i],
  );
}
