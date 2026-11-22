import { t } from "./i18n.mjs";
import { clone, activeLayer } from "./core.mjs";
import { moveSelection, selectionBounds } from "./editing.mjs";
import {
  layerFlags,
  normalizeClipping,
  clippingBase,
} from "./layer-structure.mjs";

export function chosenLayers(doc, ids) {
  const set = new Set(ids);
  const layers = doc.layers.filter((l) => set.has(l.id));
  if (!layers.length || layers.length !== set.size)
    throw new Error(t("레이어 데이터가 올바르지 않아요."));
  return layers;
}

// Reordering never changes folder membership or a clipping layer's base.
// A clipping stack travels as a unit, even when only one member is selected.
export function orderedLayers(doc, ids, direction) {
  chosenLayers(doc, ids);
  if (doc.autotile || ![1, -1].includes(direction)) return doc.layers;
  const selected = new Set(ids),
    stacks = [];
  for (const layer of doc.layers) {
    const previous = stacks.at(-1);
    // Older projects can contain an orphaned clipping flag. Do not invent a
    // new base by reordering it; the existing Clip toggle can detach it.
    if (layer.clipped && (!previous || previous[0].folderId !== layer.folderId))
      return doc.layers;
    if (layer.clipped && previous?.[0].folderId === layer.folderId)
      previous.push(layer);
    else stacks.push([layer]);
  }
  const chosen = (s) => s.some((l) => selected.has(l.id));
  const locked = (s) => s.some((l) => layerFlags(doc, l).locked);
  if (stacks.some((s) => chosen(s) && locked(s))) return doc.layers;
  const start = direction === 1 ? stacks.length - 2 : 1;
  for (
    let i = start;
    direction === 1 ? i >= 0 : i < stacks.length;
    i -= direction
  ) {
    const a = stacks[i],
      b = stacks[i + direction];
    if (
      chosen(a) &&
      !chosen(b) &&
      !locked(b) &&
      a[0].folderId === b[0].folderId
    )
      [stacks[i], stacks[i + direction]] = [b, a];
  }
  return stacks.flat();
}

export function canOrderLayers(doc, ids, direction) {
  return orderedLayers(doc, ids, direction).some(
    (l, i) => l.id !== doc.layers[i].id,
  );
}

// Plan on a clone and reject the entire operation if any destination would
// escape a selected region. Integer translations preserve exact RGBA values.
export function alignLayers(
  source,
  ids,
  alignment,
  reference = "canvas",
  selection = [],
) {
  if (
    !["left", "center-x", "right", "top", "center-y", "bottom"].includes(
      alignment,
    ) ||
    !["canvas", "active"].includes(reference) ||
    source.autotile
  )
    throw new Error(t("레이어 데이터가 올바르지 않아요."));
  const layers = chosenLayers(source, ids),
    scoped = selection.some(Boolean);
  if (
    selection.length &&
    (selection.length !== source.width * source.height ||
      selection.some((v) => typeof v !== "boolean"))
  )
    throw new Error(t("레이어 데이터가 올바르지 않아요."));
  const content = (l) =>
    l.pixels.map(
      (p, i) =>
        (!scoped || selection[i]) && source.palette[p].slice(7) !== "00",
    );
  const referenceBounds =
    reference === "active"
      ? selectionBounds(source, content(activeLayer(source)))
      : selectionBounds(
          source,
          scoped ? selection : Array(source.width * source.height).fill(true),
        );
  if (!referenceBounds) throw new Error(t("정렬 기준에 칠해진 픽셀이 없어요."));
  const targets = layers.filter(
    (l) => reference !== "active" || l.id !== source.activeLayerId,
  );
  if (
    targets.some(
      (l) =>
        layerFlags(source, l).locked ||
        !layerFlags(source, l).visible ||
        l.alphaLocked ||
        l.geometryGuide,
    )
  )
    throw new Error(
      t(
        "선택한 모든 레이어의 표시, 잠금, 투명 잠금, 입체 가이드를 확인해 주세요.",
      ),
    );
  const document = clone(source);
  for (const layer of targets) {
    const mask = content(layer),
      bounds = selectionBounds(source, mask);
    if (!bounds) continue;
    const r = referenceBounds,
      b = bounds;
    const dx =
      alignment === "left"
        ? r.left - b.left
        : alignment === "right"
          ? r.right - b.right
          : alignment === "center-x"
            ? Math.floor((r.left + r.right - b.left - b.right) / 2)
            : 0;
    const dy =
      alignment === "top"
        ? r.top - b.top
        : alignment === "bottom"
          ? r.bottom - b.bottom
          : alignment === "center-y"
            ? Math.floor((r.top + r.bottom - b.top - b.bottom) / 2)
            : 0;
    if (
      mask.some((v, i) => {
        if (!v) return false;
        const x = (i % source.width) + dx,
          y = Math.floor(i / source.width) + dy;
        return (
          x < 0 ||
          x >= source.width ||
          y < 0 ||
          y >= source.height ||
          (scoped && !selection[y * source.width + x])
        );
      })
    )
      throw new Error(
        t(
          "정렬하면 선택 영역이나 캔버스 밖으로 나가요. 선택 범위나 정렬 기준을 바꿔 주세요.",
        ),
      );
    const view = clone({ ...source, layers: [layer], activeLayerId: layer.id });
    const moved = moveSelection(view, mask, dx, dy).document.layers[0];
    Object.assign(
      document.layers.find((l) => l.id === layer.id),
      moved,
    );
  }
  return document;
}
export function duplicateLayers(doc, ids) {
  const layers = chosenLayers(doc, ids);
  if (doc.layers.length + layers.length > 32)
    throw new Error(t("레이어는 최대 32개예요."));
  if (layers.some((l) => doc.folders?.find((f) => f.id === l.folderId)?.locked))
    throw new Error(t("레이어 잠금을 해제하고 표시해 주세요."));
  const result = [];
  for (const layer of layers) {
    const copy = {
      ...clone(layer),
      id: crypto.randomUUID(),
      name: t("{0} 복사", layer.name).slice(0, 100),
      locked: false,
    };
    doc.layers.splice(
      doc.layers.findIndex((l) => l.id === layer.id) + 1,
      0,
      copy,
    );
    result.push(copy.id);
  }
  doc.activeLayerId = result.at(-1);
  return result;
}
export function groupLayers(
  doc,
  ids,
  folderId,
  targetId = null,
  after = false,
) {
  const layers = chosenLayers(doc, ids);
  if (
    layers.some((l) => layerFlags(doc, l).locked) ||
    (folderId && doc.folders?.find((f) => f.id === folderId)?.locked)
  )
    throw new Error(t("레이어 잠금을 해제하고 표시해 주세요."));
  if (folderId && !doc.folders?.some((f) => f.id === folderId))
    throw new Error(t("레이어 데이터가 올바르지 않아요."));
  const set = new Set(ids),
    remaining = doc.layers.filter((l) => !set.has(l.id));
  if (targetId && set.has(targetId)) return;
  let at = folderId
    ? remaining.findLastIndex((l) => l.folderId === folderId) + 1
    : remaining.length;
  if (folderId && at === 0) at = remaining.length;
  if (targetId) {
    const target = remaining.findIndex((l) => l.id === targetId);
    if (target < 0 || remaining[target].folderId !== folderId)
      throw new Error(t("레이어 데이터가 올바르지 않아요."));
    at = target + Number(after);
  }
  for (const l of layers) {
    if (folderId) l.folderId = folderId;
    else delete l.folderId;
  }
  remaining.splice(at, 0, ...layers);
  doc.layers = remaining;
  normalizeClipping(doc);
}
export function deleteLayers(doc, ids) {
  const layers = chosenLayers(doc, ids);
  if (
    layers.length === doc.layers.length ||
    layers.some((l) => layerFlags(doc, l).locked)
  )
    throw new Error(t("레이어 잠금을 해제하고 표시해 주세요."));
  doc.layers = doc.layers.filter((l) => !ids.includes(l.id));
  if (!doc.layers.some((l) => l.id === doc.activeLayerId))
    doc.activeLayerId = doc.layers.at(-1).id;
  normalizeClipping(doc);
}
export function addClippingLayer(doc) {
  const active = activeLayer(doc),
    base = active.clipped ? clippingBase(doc, active) : active;
  if (!base || layerFlags(doc, active).locked)
    throw new Error(t("레이어 잠금을 해제하고 표시해 주세요."));
  if (doc.layers.length >= 32) throw new Error(t("레이어는 최대 32개예요."));
  let at = doc.layers.findIndex((l) => l.id === base.id) + 1;
  while (doc.layers[at]?.clipped && doc.layers[at]?.folderId === base.folderId)
    at++;
  const layer = {
    id: crypto.randomUUID(),
    name: t("클리핑 레이어"),
    visible: true,
    locked: false,
    clipped: true,
    pixels: Array(doc.width * doc.height).fill(0),
    ...(base.folderId ? { folderId: base.folderId } : {}),
  };
  doc.layers.splice(at, 0, layer);
  doc.activeLayerId = layer.id;
  return layer.id;
}
