import { t } from "./i18n.mjs";
import { transferLinkedMask, layerFlags } from "./layer-structure.mjs";
import {
  assertOrdinaryLayer,
  transferProtection,
} from "./document-operations.mjs";
import { clone, linePoints, recolorPixel, documentRGBA } from "./core.mjs";

import { wrapCoordinate } from "./tiles.mjs";
import { ellipsePoints, symmetryPoints } from "./raster-tools.mjs";

// Remove only the transient middle of an orthogonal L in a one-pixel stroke.
// The caller redraws this stroke over its original snapshot, never erasing artwork.
export function appendPixelPerfect(path, points) {
  for (const p of points) {
    const b = path.at(-1),
      a = path.at(-2);
    if (b && b[0] === p[0] && b[1] === p[1]) continue;
    if (
      a &&
      Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1 &&
      Math.abs(b[0] - p[0]) + Math.abs(b[1] - p[1]) === 1 &&
      Math.abs(a[0] - p[0]) === 1 &&
      Math.abs(a[1] - p[1]) === 1
    )
      path.pop();
    path.push([...p]);
  }
  return path;
}

export function brushOffsets(size = 1, shape = "square") {
  const offset = Math.floor((size - 1) / 2),
    points = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // Strict disk interior: at 3px the diagonal corner contacts stay empty.
      // At 1–2px both shapes necessarily share the same pixel footprint.
      const dx = 2 * x + 1 - size,
        dy = 2 * y + 1 - size;
      if (
        shape !== "circle" ||
        size === 1 ||
        dx * dx + dy * dy < size * size - 1
      )
        points.push([x - offset, y - offset]);
    }
  return points;
}

export function paintPoints(
  doc,
  mask,
  points,
  color,
  size = 1,
  alphaLock = false,
  symmetry = false,
  wrap = Boolean(doc.tileMode?.wrap),
  shape = "square",
) {
  const restricted = mask.some(Boolean),
    offsets = brushOffsets(size, shape);
  for (const [cx, cy] of points)
    for (const [dx, dy] of offsets) {
      const x = cx + dx,
        y = cy + dy;
      for (const [sx, sy] of symmetryPoints(
        x,
        y,
        doc.width,
        doc.height,
        symmetry,
      )) {
        const px = wrap ? wrapCoordinate(sx, doc.width) : sx;
        const py = wrap ? wrapCoordinate(sy, doc.height) : sy;
        if (
          px >= 0 &&
          py >= 0 &&
          px < doc.width &&
          py < doc.height &&
          (!restricted || mask[py * doc.width + px])
        )
          recolorPixel(doc, py * doc.width + px, color, alphaLock);
      }
    }
}
export function shapePoints(tool, start, end, filled = false) {
  if (tool === "line") return linePoints(...start, ...end);
  if (tool === "ellipse") return ellipsePoints(start, end, filled);
  const left = Math.min(start[0], end[0]),
    right = Math.max(start[0], end[0]);
  const top = Math.min(start[1], end[1]),
    bottom = Math.max(start[1], end[1]);
  const points = [];
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++)
      if (filled || x === left || x === right || y === top || y === bottom)
        points.push([x, y]);
  return points;
}
export function floodFill(
  doc,
  mask,
  x,
  y,
  color,
  alphaLock = false,
  wrap = Boolean(doc.tileMode?.wrap),
  reference = "layer",
) {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= doc.width ||
    y >= doc.height
  )
    return;
  // Freeze boundaries before painting, including when the target layer is visible.
  const rgba = reference === "visible" ? documentRGBA(doc) : null;
  const sources = doc.pixels.map((c, i) =>
    rgba ? rgba.slice(i * 4, i * 4 + 4).join(",") : doc.palette[c],
  );
  const start = y * doc.width + x,
    source = sources[start],
    restricted = mask.some(Boolean);
  if (
    (restricted && !mask[start]) ||
    (reference !== "visible" && source === doc.palette[color]) ||
    (alphaLock &&
      (doc.palette[doc.pixels[start]].slice(7) === "00" ||
        doc.palette[color].slice(7) === "00"))
  )
    return;
  const pending = [start],
    visited = new Set();
  while (pending.length) {
    const i = pending.pop();
    if (visited.has(i)) continue;
    visited.add(i);
    if ((restricted && !mask[i]) || sources[i] !== source) continue;
    recolorPixel(doc, i, color, alphaLock);
    const px = i % doc.width,
      py = Math.floor(i / doc.width);
    for (const [nx, ny] of [
      [px - 1, py],
      [px + 1, py],
      [px, py - 1],
      [px, py + 1],
    ]) {
      if (wrap)
        pending.push(
          wrapCoordinate(ny, doc.height) * doc.width +
            wrapCoordinate(nx, doc.width),
        );
      else if (nx >= 0 && nx < doc.width && ny >= 0 && ny < doc.height)
        pending.push(ny * doc.width + nx);
    }
  }
}
export function selectionBounds(doc, mask) {
  let left = doc.width,
    right = -1,
    top = doc.height,
    bottom = -1;
  mask.forEach((v, i) => {
    if (v) {
      const x = i % doc.width,
        y = Math.floor(i / doc.width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  });
  return right < 0
    ? null
    : {
        left,
        top,
        right,
        bottom,
        width: right - left + 1,
        height: bottom - top + 1,
      };
}
export function moveSelection(source, mask, dx, dy, copy = false) {
  assertOrdinaryLayer(source);
  if (source.autotile)
    throw new Error(t("오토타일 공유 조각의 배치와 경계는 고정되어 있어요."));
  const bounds = selectionBounds(source, mask),
    doc = clone(source),
    selection = [...mask];
  if (!bounds) return { document: doc, selection };
  dx = Math.max(-bounds.left, Math.min(source.width - 1 - bounds.right, dx));
  dy = Math.max(-bounds.top, Math.min(source.height - 1 - bounds.bottom, dy));
  selection.fill(false);
  const painted = (i) => source.palette[source.pixels[i]].slice(7) !== "00";
  mask.forEach((v, i) => {
    if (v && !copy && painted(i)) doc.pixels[i] = 0;
  });
  const mapping = [];
  mask.forEach((v, i) => {
    if (v) {
      const target = i + dx + dy * doc.width;
      // Empty pixels carry the selection shape, but never erase the destination.
      if (painted(i)) {
        doc.pixels[target] = source.pixels[i];
        mapping.push([i, target]);
      }
      selection[target] = true;
    }
  });
  transferProtection(source, doc, mapping, copy);
  transferLinkedMask(source, doc, mapping, copy);
  return { document: doc, selection };
}
export function copyPixels(doc, mask) {
  const active = mask.some(Boolean) ? mask : mask.map(() => true),
    b = selectionBounds(doc, active);
  const pixels = [];
  for (let y = b.top; y <= b.bottom; y++)
    for (let x = b.left; x <= b.right; x++) {
      const i = y * doc.width + x;
      pixels.push(active[i] ? doc.palette[doc.pixels[i]] : null);
    }
  return { width: b.width, height: b.height, pixels };
}
export function pastePixels(source, clip, x = 0, y = 0) {
  assertOrdinaryLayer(source);
  if (source.autotile)
    throw new Error(t("오토타일 공유 조각의 배치와 경계는 고정되어 있어요."));
  if (clip.width > source.width || clip.height > source.height)
    throw new Error(
      t("복사한 영역보다 캔버스가 작아요. 더 큰 캔버스에 붙여넣어 주세요."),
    );
  const doc = clone(source),
    selection = doc.pixels.map(() => false);
  x = Math.max(0, Math.min(source.width - clip.width, x));
  y = Math.max(0, Math.min(source.height - clip.height, y));
  const colors = new Map(doc.palette.map((c, i) => [c, i]));
  clip.pixels.forEach((color, i) => {
    if (color === null) return;
    const target =
      (y + Math.floor(i / clip.width)) * doc.width + x + (i % clip.width);
    selection[target] = true;
    if (color.slice(7) === "00") return;
    if (!colors.has(color)) {
      if (doc.palette.length === 256)
        throw new Error(t("붙여넣기에 필요한 색상이 256색 한도를 초과해요."));
      colors.set(color, doc.palette.length);
      doc.palette.push(color);
    }
    doc.pixels[target] = colors.get(color);
  });
  return { document: doc, selection };
}

// Always recompute from the frozen source, never from a composited preview.
export function placementPreview(
  source,
  mask,
  { clip = null, copy = false, x = 0, y = 0, layerIds = null } = {},
) {
  const bounds = clip
    ? { left: 0, top: 0, right: clip.width - 1, bottom: clip.height - 1 }
    : selectionBounds(source, mask);
  if (!bounds)
    return { document: clone(source), selection: [...mask], x: 0, y: 0 };
  x = Math.max(-bounds.left, Math.min(source.width - 1 - bounds.right, x));
  y = Math.max(-bounds.top, Math.min(source.height - 1 - bounds.bottom, y));
  if (layerIds && !clip) {
    if (
      !Array.isArray(layerIds) ||
      !layerIds.length ||
      layerIds.length > 32 ||
      new Set(layerIds).size !== layerIds.length ||
      !layerIds.includes(source.activeLayerId)
    )
      throw new Error(t("레이어 데이터가 올바르지 않아요."));
    for (const id of layerIds) {
      const layer = source.layers.find((l) => l.id === id);
      if (
        !layer ||
        layerFlags(source, layer).locked ||
        !layerFlags(source, layer).visible ||
        layer.alphaLocked ||
        layer.geometryGuide
      )
        throw new Error(
          t(
            "선택한 모든 레이어의 표시, 잠금, 투명 잠금, 입체 가이드를 확인해 주세요.",
          ),
        );
    }
    const document = clone(source);
    let selection = [...mask];
    for (const id of layerIds) {
      const layer = source.layers.find((l) => l.id === id);
      const view = clone({ ...source, layers: [layer], activeLayerId: id });
      const result = moveSelection(view, mask, x, y, copy);
      Object.assign(
        document.layers.find((l) => l.id === id),
        result.document.layers[0],
      );
      selection = result.selection;
    }
    return { document, selection, x: x || 0, y: y || 0 };
  }
  const result = clip
    ? pastePixels(source, clip, x, y)
    : moveSelection(source, mask, x, y, copy);
  return { ...result, x: x || 0, y: y || 0 };
}
