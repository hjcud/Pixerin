import { t } from "./i18n.mjs";
import {
  validateDocument,
  ensureLayers,
  activeLayer,
  MAX_SIZE,
} from "./core.mjs";
import { guideConstraints } from "./geometry.mjs";
import { assertCanvasSize, MAX_CANVAS_EDGE, MAX_CANVAS_PIXELS } from "./document-region.mjs";
import { mapAnimationFrames } from "./animation.mjs";

// Validate before history/autosave, including guide metadata on inactive layers.
// Existing invalid guides may be detached or left unchanged during recovery.
export function validateOperation(before, after) {
  const next = validateDocument(after);
  for (const layer of next.layers || []) {
    if (!layer.geometryGuide) continue;
    const old = before.layers?.find((l) => l.id === layer.id);
    if (
      old &&
      JSON.stringify(old.geometryGuide) ===
        JSON.stringify(layer.geometryGuide) &&
      old.pixels.every(
        (c, i) => before.palette[c] === next.palette[layer.pixels[i]],
      ) &&
      before.width === next.width &&
      before.height === next.height
    )
      continue;
    guideConstraints({ ...next, activeLayerId: layer.id });
  }
  return next;
}

export function assertOrdinaryLayer(doc) {
  if (activeLayer(doc)?.geometryGuide)
    throw new Error(t("가이드를 해제한 뒤 픽셀을 이동, 변형해 주세요."));
}

// Only object-following marks travel. Legacy layers without a mode stay fixed.
export function transferProtection(source, target, mapping, copy = false) {
  const layer = activeLayer(source),
    next = activeLayer(target);
  if (!layer?.refinementProtection || layer.protectionMode !== "pixels") return;
  const marks = [...layer.refinementProtection];
  if (!copy) for (const [from] of mapping) marks[from] = false;
  for (const [from, to] of mapping)
    marks[to] = Boolean(marks[to] || layer.refinementProtection[from]);
  next.refinementProtection = marks;
}

export function resizeCanvas(
  source,
  mask,
  width,
  height,
  anchor = "center",
  { detachGuides = false, offset = null } = {},
) {
  assertCanvasSize(width,height);
  if (source.animation) return mapAnimationFrames(source, width, height, frame => resizeCanvas(frame, mask, width, height, anchor, { detachGuides, offset }));
  const doc = ensureLayers(source);
  if (doc.autotile)
    throw new Error(t("오토타일 공유 원본의 크기는 고정되어 있어요."));
  if (
    !Array.isArray(mask) ||
    mask.length !== doc.width * doc.height ||
    mask.some((v) => typeof v !== "boolean")
  )
    throw new Error(t("선택 영역이 올바르지 않아요."));
  const anchors = {
    nw: [0, 0],
    n: [0.5, 0],
    ne: [1, 0],
    w: [0, 0.5],
    center: [0.5, 0.5],
    e: [1, 0.5],
    sw: [0, 1],
    s: [0.5, 1],
    se: [1, 1],
  };
  if (!anchors[anchor]) throw new Error(t("기준 위치를 선택해 주세요."));
  if (
    offset &&
    ![offset.x, offset.y].every(
      (v) => Number.isInteger(v) && Math.abs(v) <= 4096,
    )
  )
    throw new Error(t("기준 위치를 선택해 주세요."));
  const [ax, ay] = anchors[anchor],
    dx = offset ? offset.x : Math.floor((width - doc.width) * ax),
    dy = offset ? offset.y : Math.floor((height - doc.height) * ay);
  if (
    doc.layers.some((l) => l.geometryGuide) &&
    !detachGuides &&
    (width !== doc.width || height !== doc.height || dx !== 0 || dy !== 0)
  )
    throw new Error(
      t("크기를 바꾸려면 입체 가이드를 일반 픽셀로 전환해 주세요."),
    );
  let croppedPixels = 0,
    croppedProtection = 0;
  const remap = (values, empty, visit = () => {}) => {
    const result = Array(width * height).fill(empty);
    values.forEach((v, i) => {
      const x = (i % doc.width) + dx,
        y = Math.floor(i / doc.width) + dy;
      if (x >= 0 && x < width && y >= 0 && y < height)
        result[y * width + x] = v;
      else visit(v);
    });
    return result;
  };
  const layers = doc.layers.map((layer) => ({
    ...layer,
    pixels: remap(layer.pixels, 0, (v) => {
      if (!doc.palette[v].endsWith("00")) croppedPixels++;
    }),
    ...(layer.mask ? { mask: remap(layer.mask, true) } : {}),
    ...(layer.refinementProtection
      ? {
          refinementProtection: remap(
            layer.refinementProtection,
            false,
            (v) => {
              if (v) croppedProtection++;
            },
          ),
        }
      : {}),
  }));
  if (detachGuides) for (const layer of layers) delete layer.geometryGuide;
  const selection = remap(mask, false);
  return {
    document: validateDocument({ ...doc, width, height, layers }),
    selection,
    croppedPixels,
    croppedProtection,
    dx,
    dy,
  };
}

// Resize a boundary in document pixels, keeping its opposite edge stationary.
// Every gesture is calculated from its frozen starting rectangle.
export function dragCanvasBounds(start, edge, dx, dy) {
  if (
    !["n", "ne", "e", "se", "s", "sw", "w", "nw"].includes(edge) ||
    ![start.width, start.height].every(
      (v) => Number.isInteger(v) && v >= 1 && v <= MAX_SIZE,
    ) ||
    ![start.dx, start.dy, dx, dy].every(Number.isFinite)
  )
    throw new Error(t("기준 위치를 선택해 주세요."));
  const next = { ...start };
  const clamp = (v) => Math.max(1, Math.min(MAX_CANVAS_EDGE, v));
  if (edge.includes("e")) next.width = clamp(start.width + Math.round(dx));
  if (edge.includes("s")) next.height = clamp(start.height + Math.round(dy));
  if (edge.includes("w")) {
    next.width = clamp(start.width - Math.round(dx));
    next.dx += next.width - start.width;
  }
  if (edge.includes("n")) {
    next.height = clamp(start.height - Math.round(dy));
    next.dy += next.height - start.height;
  }
  if(next.width*next.height>MAX_CANVAS_PIXELS) {
    const oldWidth=next.width,oldHeight=next.height;
    if(edge.length===2) {
      const factor=Math.sqrt(MAX_CANVAS_PIXELS/(next.width*next.height));
      next.width=Math.max(1,Math.floor(next.width*factor));next.height=Math.max(1,Math.floor(next.height*factor));
    } else if(edge.includes("e")||edge.includes("w")) next.width=Math.min(next.width,Math.floor(MAX_CANVAS_PIXELS/next.height));
    else next.height=Math.min(next.height,Math.floor(MAX_CANVAS_PIXELS/next.width));
    if(edge.includes("w")) next.dx+=next.width-oldWidth;
    if(edge.includes("n")) next.dy+=next.height-oldHeight;
  }
  return next;
}

export function compactPalette(
  source,
  { keepIndices = [], mergeDuplicates = true } = {},
) {
  const doc = ensureLayers(source),
    used = new Set([0, ...keepIndices]);
  for (const layer of doc.layers) for (const i of layer.pixels) used.add(i);
  // Custom ramps are intentional prepared colors, even when not on the canvas.
  const rampColors = new Set((doc.shadeRamps || []).flatMap((r) => r.colors));
  doc.palette.forEach((color, i) => {
    if (rampColors.has(color)) used.add(i);
  });
  const palette = [],
    indices = [],
    lookup = new Map();
  doc.palette.forEach((color, i) => {
    if (!used.has(i)) {
      indices[i] = 0;
      return;
    }
    if (mergeDuplicates && lookup.has(color)) {
      indices[i] = lookup.get(color);
      return;
    }
    indices[i] = palette.length;
    lookup.set(color, palette.length);
    palette.push(color);
  });
  for (const layer of doc.layers)
    layer.pixels = layer.pixels.map((i) => indices[i]);
  const removed = doc.palette.length - palette.length;
  doc.palette = palette;
  return { document: validateOperation(source, doc), indices, removed };
}
