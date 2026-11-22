import { validateDocument } from "./core.mjs";

// A host-authored design, not an image recognizer. Every entry is one native
// pixel. Parts composite in order; transparent entries leave earlier parts alone.
export function composePixelParts(plan) {
  const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  const fail = () => { throw new Error("Invalid native pixel-part design"); };
  if (!plan || plan.format !== "pixel-mat-parts" || plan.version !== 1 ||
      !integer(plan.width, 1, 64) || !integer(plan.height, 1, 64) ||
      !Array.isArray(plan.palette) || plan.palette.length < 2 || plan.palette.length > 256 ||
      !Array.isArray(plan.parts) || !plan.parts.length || plan.parts.length > 128) fail();
  const doc = validateDocument({ format: "pixeltool", version: 1,
    name: typeof plan.name === "string" ? plan.name : "Sprite", width: plan.width,
    height: plan.height, palette: plan.palette, pixels: Array(plan.width * plan.height).fill(0) });
  const ids = new Set(); let cells = 0;
  for (const part of plan.parts) {
    if (!part || typeof part.id !== "string" || !/^[a-zA-Z][\w-]{0,63}$/.test(part.id) || ids.has(part.id) ||
        !integer(part.x, 0, doc.width - 1) || !integer(part.y, 0, doc.height - 1) ||
        !Array.isArray(part.rows) || !part.rows.length || part.rows.length > doc.height - part.y) fail();
    ids.add(part.id);
    const width = part.rows[0]?.length;
    if (!integer(width, 1, doc.width - part.x)) fail();
    cells += width * part.rows.length;
    if (cells > doc.width * doc.height * 32) fail();
    for (const [y, row] of part.rows.entries()) {
      if (!Array.isArray(row) || row.length !== width) fail();
      for (const [x, color] of row.entries()) {
        if (!integer(color, 0, doc.palette.length - 1)) fail();
        if (!doc.palette[color].endsWith("00")) doc.pixels[(part.y + y) * doc.width + part.x + x] = color;
      }
    }
  }
  return doc;
}
