// UI-only preferences. Artwork, masks, colors and selected candidates never persist here.
export const REFINEMENT_DEFAULTS = Object.freeze({
  levels: 3,
  width: 1,
  strength: 40,
  palette: "new",
  maxArea: 1,
  clusterArea: 2,
  tolerance: 20,
});
export function normalizeRefinementControls(raw) {
  const value = { ...REFINEMENT_DEFAULTS };
  const range = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  const rules = {
    levels: (v) => range(v, 2, 6),
    width: (v) => range(v, 1, 3),
    strength: (v) => range(v, 0, 100),
    palette: (v) => ["new", "existing"].includes(v),
    maxArea: (v) => range(v, 1, 4),
    clusterArea: (v) => [1, 2, 4, 8].includes(v),
    tolerance: (v) => range(v, 0, 100),
  };
  for (const [key, valid] of Object.entries(rules))
    if (valid(raw?.[key])) value[key] = raw[key];
  return value;
}
export function readUISetting(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem("pixeltool.ui." + key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeUISetting(key, value) {
  try {
    localStorage.setItem("pixeltool.ui." + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
