import { t } from "./i18n.mjs";
import { isLanguage } from "./locales.mjs";
export const DEFAULT_PREFERENCES = Object.freeze({
  language: "ko",
  theme: "dark",
  showHints: false,
  pickerToPencil: true,
  pickerSource: "visible",
  duplicateModifier: "ctrl",
  intersectionModifier: "alt-shift",
  rightButton: "secondary",
  historyMemoryMB: 64,
  historyLimit: 100,
  recoveryRetentionDays: 30,
  recoveryMemoryMB: 256,
  canvasSize: 16,
  grid: true,
  selectionOutline: true,
  canvasBackground: "theme",
  zoomSpeed: 1,
  reverseZoom: false,
  previewKind: "result",
  livePreview: true,
});

const rules = {
  language: isLanguage,
  theme: (v) => ["dark", "light"].includes(v),
  showHints: (v) => typeof v === "boolean",
  pickerToPencil: (v) => typeof v === "boolean",
  pickerSource: (v) => ["visible", "layer"].includes(v),
  duplicateModifier: (v) => ["ctrl", "alt"].includes(v),
  intersectionModifier: (v) => ["alt-shift", "ctrl-shift"].includes(v),
  rightButton: (v) => ["secondary", "picker"].includes(v),
  historyMemoryMB: (v) => Number.isInteger(v) && v >= 8 && v <= 512,
  historyLimit: (v) => Number.isInteger(v) && v >= 10 && v <= 2000,
  recoveryRetentionDays: (v) => Number.isInteger(v) && v >= 1 && v <= 3650,
  recoveryMemoryMB: (v) => Number.isInteger(v) && v >= 16 && v <= 16384,
  canvasSize: (v) => [8, 16, 32, 64].includes(v),
  grid: (v) => typeof v === "boolean",
  selectionOutline: (v) => typeof v === "boolean",
  canvasBackground: (v) => ["theme", "dark", "light"].includes(v),
  zoomSpeed: (v) => [0.5, 1, 2].includes(v),
  reverseZoom: (v) => typeof v === "boolean",
  previewKind: (v) => ["result", "source"].includes(v),
  livePreview: (v) => typeof v === "boolean",
};

// Disk migration uses per-field defaults; IPC rejects malformed values atomically.
export function normalizePreferences(raw, strict = false) {
  if (strict && (!raw || typeof raw !== "object" || Array.isArray(raw)))
    throw new Error(t("편집 설정을 확인해 주세요."));
  const result = { ...DEFAULT_PREFERENCES };
  // Read legacy preset IDs only for migration. Explicit individual settings win,
  // and normalized output no longer writes the old product-named preset field.
  if (raw?.interactionProfile === "aseprite")
    result.intersectionModifier = "ctrl-shift";
  if (raw?.interactionProfile === "csp") {
    result.duplicateModifier = "alt";
    result.rightButton = "picker";
  }
  for (const [key, valid] of Object.entries(rules)) {
    const value = raw?.[key];
    if (value === undefined) continue;
    if (valid(value)) result[key] = value;
    else if (strict)
      throw new Error(t("설정 값이 허용 범위를 벗어났어요: {0}", key));
  }
  return result;
}
