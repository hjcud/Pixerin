import { t } from "./i18n.mjs";
export const MAX_DOCUMENT_SIZE = 4096;
// Keep the previous read/save ceiling for existing project compatibility.
// New canvases and image-model requests share the provider's 4K pixel budget.
export const MAX_CANVAS_EDGE = 3840;
export const MAX_CANVAS_PIXELS = 8294400;
export function fitsCanvasSize(width, height) {
  return [width,height].every(n=>Number.isInteger(n)&&n>=1&&n<=MAX_CANVAS_EDGE) && width*height<=MAX_CANVAS_PIXELS;
}
export function assertCanvasSize(width,height) {
  if (!fitsCanvasSize(width,height))
    throw new Error(t("캔버스는 각 변 3840px, 총 8,294,400픽셀 이하여야 해요. 3840×2160, 2160×3840, 2880×2880까지 지원해요."));
}
export function fitCanvasSize(width,height) {
  const scale=Math.min(1,MAX_CANVAS_EDGE/width,MAX_CANVAS_EDGE/height,Math.sqrt(MAX_CANVAS_PIXELS/(width*height)));
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
export const MAX_AI_SIZE = 64;
export const MAX_IMPORT_SIZE = 4096;
export const PROJECT_FILE_LIMIT = 512 * 1024 * 1024;
export const PNG_FILE_LIMIT = 128 * 1024 * 1024;
export const MAX_DOCUMENT_CELLS = 64 * 1024 * 1024;

// A bounded context window; segment IDs still map to full-document coordinates.
export function aiRegion(doc, mask, { tight = false } = {}) {
  if (!tight && doc.width <= MAX_AI_SIZE && doc.height <= MAX_AI_SIZE)
    return { x: 0, y: 0, width: doc.width, height: doc.height, cropped: false };
  let left = doc.width,
    top = doc.height,
    right = -1,
    bottom = -1;
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      const x = i % doc.width,
        y = Math.floor(i / doc.width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  if (
    right < 0 ||
    right - left + 1 > MAX_AI_SIZE ||
    bottom - top + 1 > MAX_AI_SIZE
  )
    throw new Error(
      t(
        "큰 캔버스에서는 가로와 세로 64px 이내의 영역을 선택해 주세요. 요청은 아직 보내지 않았어요.",
      ),
    );
  const contextLeft = tight ? Math.max(0, left - 4) : 0,
    contextTop = tight ? Math.max(0, top - 4) : 0,
    contextRight = tight ? Math.min(doc.width, right + 5) : doc.width,
    contextBottom = tight ? Math.min(doc.height, bottom + 5) : doc.height;
  const width = Math.min(MAX_AI_SIZE, contextRight - contextLeft),
    height = Math.min(MAX_AI_SIZE, contextBottom - contextTop);
  const x = Math.max(
    contextLeft,
    Math.min(contextRight - width, Math.floor((left + right + 1 - width) / 2)),
  );
  const y = Math.max(
    contextTop,
    Math.min(contextBottom - height, Math.floor((top + bottom + 1 - height) / 2)),
  );
  return { x, y, width, height, cropped: width !== doc.width || height !== doc.height };
}
export function cropCells(values, sourceWidth, region, channels = 1) {
  const out = [];
  for (let y = 0; y < region.height; y++) {
    const start = ((y + region.y) * sourceWidth + region.x) * channels;
    for (let i = start; i < start + region.width * channels; i++)
      out.push(values[i]);
  }
  return out;
}
export function maximumZoom(doc) {
  // Large views use a bounded overlay bitmap, independent of CSS zoom extent.
  if (doc.width > 256 || doc.height > 256) return 64;
  return Math.min(
    64,
    Math.max(1, Math.floor(4096 / Math.max(doc.width, doc.height))),
  );
}
