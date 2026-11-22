import { fixedScope } from "../electron/fixed-patch.mjs";
export function wirePatch(input, patch) {
  const table = fixedScope(input).segments,
    values = new Map();
  for (const run of patch.runs)
    run.colors.forEach((color, offset) => {
      const x = run.x + offset;
      const segment = table.find(
        (s) => s.y === run.y && x >= s.x && x < s.x + s.length,
      );
      if (!segment) throw new Error("Test fixture writes outside fixed scope");
      if (!values.has(segment.id))
        values.set(segment.id, Array(segment.length).fill(null));
      const colors = values.get(segment.id);
      if (colors[x - segment.x] !== null)
        throw new Error("Duplicate fixture pixel");
      colors[x - segment.x] = color;
    });
  return {
    summary: patch.summary,
    new_colors: patch.new_colors,
    segments: [...values].map(([id, colors]) => ({ id, colors })),
  };
}
