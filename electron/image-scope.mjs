import { validateDocument, validateMask, editableMask, activeLayer } from "../src/core.mjs";
import { fixedScope } from "./fixed-patch.mjs";
import { t } from "../src/i18n.mjs";

// Only the raster-image path may use whole-document context. The structured
// pixel protocol retains its independent 64px limit and immutable segment IDs.
export function imageScope(input) {
  if (input.wholeImage !== true) return fixedScope(input);
  if (input.advancedGeneration !== true)
    throw new Error(t("전체 수정은 이미지 편집 모드에서만 사용할 수 있어요."));
  const document = validateDocument(input.document), layer = activeLayer(document);
  if (document.tileMode || document.autotile || layer?.geometryGuide)
    throw new Error(t("전체 수정은 일반 픽셀 레이어에서 사용할 수 있습니다."));
  if (input.paletteOnly != null && typeof input.paletteOnly !== "boolean" ||
      input.alphaLock != null && typeof input.alphaLock !== "boolean")
    throw new Error(t("AI 변경안의 형식이 올바르지 않아요."));
  const submitted = validateMask(input.mask, document.width * document.height);
  const mask = editableMask(document, submitted, input.alphaLock === true || layer?.alphaLocked === true, { packed: true });
  if (input.quality?.protect !== false && layer?.refinementProtection)
    for (let i = 0; i < mask.length; i++) if (layer.refinementProtection[i]) mask[i] = 0;
  if (!mask.some(Boolean))
    throw new Error(t("수정할 픽셀이 없어요. 선택 범위나 세부 보호를 확인해 주세요."));
  return { document, mask, segments: [], region: { x: 0, y: 0, width: document.width, height: document.height, cropped: false } };
}
