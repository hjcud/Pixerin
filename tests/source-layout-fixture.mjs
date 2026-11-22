import { sourceAnalysisContext } from "../electron/semantic-analysis.mjs";

export function layoutFixture() {
  const image = { width: 32, height: 32, data: Buffer.alloc(32 * 32 * 4) };
  for (let y = 4; y < 28; y++)
    for (let x = 4; x < 28; x++) {
      let rgb = [40, 100, 180];
      if (x >= 12 && x < 24 && y >= 8 && y < 18) rgb = [240, 180, 120];
      if (((x >= 16 && x < 18) || (x >= 20 && x < 22)) && y >= 10 && y < 12)
        rgb = [20, 15, 10];
      if (x >= 10 && x < 14 && y >= 18 && y < 24) rgb = [25, 60, 110];
      if (x >= 6 && x < 8 && y >= 6 && y < 10) continue;
      image.data.set([...rgb, 255], (y * 32 + x) * 4);
    }
  const context = sourceAnalysisContext(image, { width: 16, height: 16 });
  const swatch = (rgb) =>
    context.palette.find((c) => c.rgb.join(",") === rgb.join(",")).id;
  const blue = swatch([40, 100, 180]),
    shadow = swatch([25, 60, 110]),
    skin = swatch([240, 180, 120]),
    ink = swatch([20, 15, 10]);
  const plan = {
    format: "pixel-mat-source-layout",
    version: 1,
    width: 16,
    height: 16,
    sourceHash: context.sourceHash,
    palette: [blue, shadow, skin, ink],
    materials: [
      { id: "blue", base: blue, swatches: [blue, shadow] },
      { id: "skin", base: skin, swatches: [skin] },
      { id: "ink", base: ink, swatches: [ink] },
    ],
    parts: [
      {
        id: "body",
        source: [0.125, 0.125, 0.75, 0.75],
        target: [2, 2, 12, 12],
        swatches: [],
        fill: "source",
      },
      {
        id: "face",
        source: [0.375, 0.25, 0.375, 0.3125],
        target: [6, 4, 6, 5],
        swatches: [skin],
        fill: "rows",
        material: "skin",
      },
    ],
    marks: [
      {
        id: "eye-a",
        source: [0.5, 0.3125, 0.0625, 0.0625],
        parent: "face",
        at: [8, 5],
        size: [1, 1],
        swatches: [ink],
        clearance: "sides",
      },
      {
        id: "eye-b",
        source: [0.625, 0.3125, 0.0625, 0.0625],
        parent: "face",
        at: [10, 5],
        size: [1, 1],
        swatches: [ink],
        clearance: "sides",
      },
    ],
    gaps: [
      {
        id: "opening",
        part: "body",
        source: [0.1875, 0.1875, 0.0625, 0.125],
        target: [3, 3, 1, 2],
      },
    ],
    groups: [{ id: "whole", parts: ["body", "face"] }],
    contacts: [{ a: "body", b: "face", maxGap: 1, visible: true }],
    visibility: [
      { id: "body", minCells: 20 },
      { id: "face", minCells: 6 },
    ],
    separation: [{ a: "eye-a", b: "eye-b", axis: "x", minGap: 2 }],
    negativeSpace: [],
  };
  return { image, context, plan };
}
