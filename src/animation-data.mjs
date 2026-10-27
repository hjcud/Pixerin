import { t } from "./i18n.mjs";
import { MAX_DOCUMENT_CELLS } from "./document-region.mjs";

export const MAX_ANIMATION_FRAMES = 128;
export const MIN_FRAME_MS = 10;
export const MAX_FRAME_MS = 10000;
export function animationCells(doc) {
  return (doc.layers || [doc]).reduce((n, layer) => n + doc.width * doc.height *
    (1 + Number(Boolean(layer.mask)) + Number(Boolean(layer.refinementProtection))), 0);
}
export function assertFrameDuration(value) {
  if (!Number.isInteger(value) || value < MIN_FRAME_MS || value > MAX_FRAME_MS)
    throw new Error(t("프레임 시간은 10–10000ms로 입력해 주세요."));
  return value;
}
export function assertAnimationDocument(doc) {
  if (doc.tileMode || doc.autotile || doc.layers?.some(layer => layer.geometryGuide))
    throw new Error(t("애니메이션은 일반 픽셀 레이어에서 사용할 수 있어요. 가이드를 먼저 해제해 주세요."));
}

// The active cel lives in the root document. Only inactive frames carry a
// snapshot, so strokes cannot leave an outdated duplicate of the active frame.
export function validateAnimation(raw, current, validateDocument) {
  assertAnimationDocument(current);
  if (!raw || raw.version !== 1 || !Array.isArray(raw.frames) || !raw.frames.length ||
      raw.frames.length > MAX_ANIMATION_FRAMES || !Number.isInteger(raw.active) ||
      raw.active < 0 || raw.active >= raw.frames.length || typeof raw.loop !== "boolean")
    throw new Error(t("애니메이션 데이터가 올바르지 않아요."));
  let cells = animationCells(current);
  const ids = new Set();
  // Reject the full allocation before validating/cloning individual snapshots.
  for (const [index, frame] of raw.frames.entries()) {
    if (!frame || typeof frame.id !== "string" || !/^[\w-]{1,100}$/.test(frame.id) || ids.has(frame.id))
      throw new Error(t("애니메이션 데이터가 올바르지 않아요."));
    ids.add(frame.id); assertFrameDuration(frame.duration);
    if (index === raw.active) {
      if (frame.document !== null) throw new Error(t("애니메이션 데이터가 올바르지 않아요."));
      continue;
    }
    const source = frame.document;
    if (!source || source.version !== 2 || source.animation !== undefined || source.editorContext !== undefined ||
        source.width !== current.width || source.height !== current.height ||
        !Array.isArray(source.layers) || source.layers.length > 32)
      throw new Error(t("모든 프레임의 캔버스 크기는 같아야 해요."));
    cells += animationCells(source);
  }
  if (cells > MAX_DOCUMENT_CELLS)
    throw new Error(t("애니메이션의 픽셀 메모리 한도를 초과했어요. 프레임 수나 크기를 줄여 주세요."));
  return {
    version: 1, active: raw.active, loop: raw.loop,
    frames: raw.frames.map((frame, index) => {
      const document = index === raw.active ? null : validateDocument(frame.document);
      if (document) assertAnimationDocument(document);
      return { id: frame.id, duration: frame.duration, document };
    }),
  };
}
