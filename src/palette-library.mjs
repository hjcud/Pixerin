import { clone, colorHex, MAX_COLORS } from "./core.mjs";
import { t } from "./i18n.mjs";

export const PALETTE_FILE_LIMIT = 262144;
export function validatePalette(raw) {
  const invalid = () => {
    throw new Error(t("팔레트 파일 형식이 올바르지 않아요."));
  };
  if (
    !raw ||
    raw.format !== "pixerin-palette" ||
    raw.version !== 1 ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    raw.name.length > 60 ||
    !Array.isArray(raw.colors) ||
    !raw.colors.length ||
    raw.colors.length > MAX_COLORS
  )
    invalid();
  const colors = [...new Set(raw.colors.map(colorHex))];
  const ramps = raw.shadeRamps ?? [];
  if (!Array.isArray(ramps) || ramps.length > 16) invalid();
  const shadeRamps = ramps.map((ramp) => {
    if (
      !ramp ||
      typeof ramp.name !== "string" ||
      !ramp.name.trim() ||
      ramp.name.length > 50 ||
      !Array.isArray(ramp.colors) ||
      ramp.colors.length !== 3
    )
      invalid();
    return { name: ramp.name.trim(), colors: ramp.colors.map(colorHex) };
  });
  return {
    format: "pixerin-palette",
    version: 1,
    name: raw.name.trim(),
    colors,
    shadeRamps,
  };
}
export function capturePalette(doc, name) {
  return validatePalette({
    format: "pixerin-palette",
    version: 1,
    name,
    colors: doc.palette,
    shadeRamps: doc.shadeRamps || [],
  });
}
export function appendPalette(source, raw) {
  const palette = validatePalette(raw),
    doc = clone(source);
  for (const color of palette.colors)
    if (!doc.palette.includes(color)) doc.palette.push(color);
  if (doc.palette.length > MAX_COLORS)
    throw new Error(
      t(
        "팔레트는 최대 256색이에요. 사용하지 않는 색을 정리한 뒤 다시 시도해 주세요.",
      ),
    );
  const ramps = [...(doc.shadeRamps || [])];
  for (const ramp of palette.shadeRamps) {
    if (
      ramps.some(
        (r) =>
          r.name === ramp.name &&
          r.colors.every((c, i) => c === ramp.colors[i]),
      )
    )
      continue;
    let index = 1;
    while (ramps.some((r) => r.id === "library-" + index)) index++;
    ramps.push({ ...ramp, id: "library-" + index });
  }
  if (ramps.length > 16) throw new Error(t("명암 묶음은 최대 16개예요."));
  if (ramps.length) doc.shadeRamps = ramps;
  return doc;
}
