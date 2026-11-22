import { t } from "./i18n.mjs";
import { layerFlags } from "./layer-structure.mjs";
import { autoConstraints } from "./autotile.mjs";
import { clone, colorHex, activeLayer, recolorPixel } from "./core.mjs";

export function usedColors(doc, scope = "layer", selection = []) {
  const counts = new Map();
  const layers = scope === "all" ? doc.layers : [activeLayer(doc) || doc];
  for (const layer of layers)
    layer.pixels.forEach((index, i) => {
      if (scope === "selection" && !selection[i]) return;
      const color = doc.palette[index];
      if (color.endsWith("00")) return;
      counts.set(color, (counts.get(color) || 0) + 1);
    });
  return [...counts]
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color));
}
export function replaceColor(
  source,
  from,
  to,
  scope,
  selection,
  alphaLock = false,
) {
  if (!["selection", "layer", "all"].includes(scope))
    throw new Error(t("변경 범위를 선택해 주세요."));
  const doc = clone(source),
    target = colorHex(to),
    original = colorHex(from);
  alphaLock ||= Boolean(doc.autotile);
  let changed = 0,
    skipped = 0;
  const layers = scope === "all" ? doc.layers : [activeLayer(doc) || doc];
  for (const layer of layers) {
    if (layerFlags(doc, layer).locked) {
      skipped += layer.pixels.filter(
        (index, i) =>
          doc.palette[index] === original &&
          (scope !== "selection" || selection[i]),
      ).length;
      continue;
    }
    const lockedAlpha = Boolean(
      doc.autotile || layer.alphaLocked || (scope !== "all" && alphaLock),
    );
    const rules = autoConstraints(doc, layer.id);
    const view = { palette: doc.palette, pixels: layer.pixels };
    layer.pixels.forEach((index, i) => {
      if (
        (rules && !rules.editable[i]) ||
        (scope === "selection" && !selection[i]) ||
        doc.palette[index] !== original
      )
        return;
      if (lockedAlpha && (original.endsWith("00") || target.endsWith("00"))) {
        skipped++;
        return;
      }
      const rgba = lockedAlpha
        ? target.slice(0, 7) + original.slice(7)
        : target;
      if (rgba === original) return;
      let next = doc.palette.indexOf(rgba);
      if (next < 0) {
        if (doc.palette.length === 256)
          throw new Error(t("변경에 필요한 색상이 256색 한도를 초과해요."));
        next = doc.palette.push(rgba) - 1;
      }
      recolorPixel(view, i, next, lockedAlpha);
      changed++;
    });
  }
  return { document: doc, changed, skipped };
}
// Fixed HSL lightness steps preserve hue and saturation; the base never drifts.
export function shadeColor(base, step, strength = 0.08) {
  const hex = colorHex(base);
  if (hex.endsWith("00") || !step) return hex;
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(...rgb),
    min = Math.min(...rgb),
    d = max - min,
    l = (max + min) / 2;
  const saturation = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = !d
    ? 0
    : max === rgb[0]
      ? ((rgb[1] - rgb[2]) / d + 6) % 6
      : max === rgb[1]
        ? (rgb[2] - rgb[0]) / d + 2
        : (rgb[0] - rgb[1]) / d + 4;
  const light = Math.max(0, Math.min(1, l + step * strength));
  const c = (1 - Math.abs(2 * light - 1)) * saturation,
    x = c * (1 - Math.abs((h % 2) - 1)),
    m = light - c / 2;
  const result =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    result
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase() +
    hex.slice(7)
  );
}
