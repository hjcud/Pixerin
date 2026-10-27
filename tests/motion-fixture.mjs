import { createDocument, ensureLayers } from "../src/core.mjs";

export function motionFixture(size = 16, count = 4) {
  const doc = ensureLayers(createDocument(size, size, "Frog idle fixture"));
  doc.layers[0].name = "Frog";
  const rows = ["....HH....HH....", "...HWWG..G WWH...".replaceAll(" ", ""), "...HWKG..GKWH...", "..HGGGGGGGGGGH..",
    ".HGGGGGGGGGGGGH.", ".HGGGHHHHHHGGGH.", ".SGGGGGGGGGGGGS.", "..SGGKKKKKKGGS..", "...SGGGGGGGGS...", "...SSGGGGGGSS...", "..SSS......SSS..", ".SSSS......SSSS."];
  const colors = { H: 8, G: 7, S: 6, W: 5, K: 1 };
  const dx = Math.floor((size - 16) / 2), dy = Math.floor((size - rows.length) / 2), moving = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (colors[row[x]] !== undefined) {
      doc.pixels[(y + dy) * size + x + dx] = colors[row[x]];
      if (y < 10) moving.push([x + dx, y + dy]);
    }
  });
  const runs = moving.map(([x, y]) => ({ x, y, length: 1 }));
  const plan = { version: 1, summary: "Synthetic frog idle, anchored feet", parts: [{ id: "body", pivotX: Math.floor(size / 2), pivotY: Math.floor(size / 2), runs }],
    frames: Array.from({ length: count }, (_, i) => ({ duration: i % 2 ? 140 : 100, poses: [{ id: "body", dx: 0, dy: [0, -1, 0, 1][i % 4], turn: 0, flipX: false, visible: true }], edits: [] })) };
  return { document: doc, plan, input: { document: doc, mask: Array(size * size).fill(true), prompt: "Breathe gently with planted feet", frameCount: count, duration: 100, qualityReview: false } };
}
