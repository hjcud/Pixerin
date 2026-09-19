import { t } from "./i18n.mjs";

const invalid = () => {
  throw new Error(t("레이어 데이터가 올바르지 않아요."));
};
export function validateLayerStructure(raw, layers, size) {
  const folders = raw.folders === undefined ? [] : raw.folders;
  if (
    !Array.isArray(folders) ||
    folders.length > 32 ||
    (raw.autotile && folders.length)
  )
    invalid();
  const ids = new Set(layers.map((l) => l.id));
  const checked = folders.map((f) => {
    if (
      !f ||
      typeof f.id !== "string" ||
      !f.id ||
      f.id.length > 100 ||
      ids.has(f.id) ||
      typeof f.visible !== "boolean" ||
      typeof f.locked !== "boolean" ||
      typeof f.collapsed !== "boolean"
    )
      invalid();
    ids.add(f.id);
    return {
      id: f.id,
      name: String(f.name || "Folder").slice(0, 100),
      visible: f.visible,
      locked: f.locked,
      collapsed: f.collapsed,
    };
  });
  const folderIds = new Set(checked.map((f) => f.id)),
    ended = new Set();
  let previous;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i],
      source = raw.layers[i];
    if (source.folderId !== undefined) {
      if (!folderIds.has(source.folderId)) invalid();
      layer.folderId = source.folderId;
    }
    if (layer.folderId !== previous) {
      if (previous) ended.add(previous);
      if (layer.folderId && ended.has(layer.folderId)) invalid();
      previous = layer.folderId;
    }
    if (source.clipped !== undefined) {
      if (typeof source.clipped !== "boolean") invalid();
      layer.clipped = source.clipped;
    }
    if (source.mask !== undefined) {
      if (
        !Array.isArray(source.mask) ||
        source.mask.length !== size ||
        Array.from(source.mask).some((v) => typeof v !== "boolean")
      )
        invalid();
      layer.mask = [...source.mask];
    }
    if (source.maskEnabled !== undefined) {
      if (typeof source.maskEnabled !== "boolean" || !source.mask) invalid();
      layer.maskEnabled = source.maskEnabled;
    }
    if (source.maskLinked !== undefined) {
      if (typeof source.maskLinked !== "boolean" || !source.mask) invalid();
      layer.maskLinked = source.maskLinked;
    }
    if (raw.autotile && (source.mask || source.clipped || source.folderId))
      invalid();
  }
  return checked;
}
export function layerFlags(
  doc,
  layer = doc.layers?.find((l) => l.id === doc.activeLayerId),
) {
  const folder = doc.folders?.find((f) => f.id === layer?.folderId);
  return {
    visible: layer?.visible !== false && folder?.visible !== false,
    locked: Boolean(layer?.locked || folder?.locked),
  };
}
export function clippingBase(doc, layer) {
  const at = doc.layers?.findIndex((l) => l.id === layer.id) ?? -1;
  for (let i = at - 1; i >= 0; i--) {
    const candidate = doc.layers[i];
    if (candidate.folderId !== layer.folderId) break;
    if (!candidate.clipped) return candidate;
  }
  return null;
}
// Coverage is independent of the target's own paint, allowing AI to add pixels.
export function layerCoverage(doc, layer, i) {
  if (
    !layerFlags(doc, layer).visible ||
    (layer.mask && layer.maskEnabled !== false && !layer.mask[i])
  )
    return 0;
  if (!layer.clipped) return 1;
  const base = clippingBase(doc, layer);
  if (
    !base ||
    !layerFlags(doc, base).visible ||
    (base.mask && base.maskEnabled !== false && !base.mask[i])
  )
    return 0;
  return parseInt(doc.palette[base.pixels[i]].slice(7), 16) / 255;
}
export function layerCoverageMap(
  doc,
  layer = doc.layers?.find((l) => l.id === doc.activeLayerId),
) {
  const size = doc.width * doc.height;
  if (!layer) return Array(size).fill(1);
  if (!layerFlags(doc, layer).visible) return Array(size).fill(0);
  const base = layer.clipped ? clippingBase(doc, layer) : null;
  if (layer.clipped && (!base || !layerFlags(doc, base).visible))
    return Array(size).fill(0);
  if (!base && (!layer.mask || layer.maskEnabled === false))
    return Array(size).fill(1);
  return Array.from({ length: size }, (_, i) => {
    if (layer.mask && layer.maskEnabled !== false && !layer.mask[i]) return 0;
    if (!base) return 1;
    if (base.mask && base.maskEnabled !== false && !base.mask[i]) return 0;
    return parseInt(doc.palette[base.pixels[i]].slice(7), 16) / 255;
  });
}
export function isolatedLayerRGBA(doc, layer) {
  // Ignore the target's display switch for an explicit layer export, but retain
  // its mask and clipping base coverage from the actual document.
  const view = {
    ...doc,
    folders: doc.folders?.map((f) => ({ ...f, visible: true })),
    layers: doc.layers.map((l) =>
      l.id === layer.id ? { ...l, visible: true } : l,
    ),
  };
  const coverage = layerCoverageMap(
    view,
    view.layers.find((l) => l.id === layer.id),
  );
  return new Uint8ClampedArray(
    layer.pixels.flatMap((c, i) => {
      const color = doc.palette[c];
      const alpha = Math.round(parseInt(color.slice(7), 16) * coverage[i]);
      return alpha
        ? [1, 3, 5]
            .map((k) => parseInt(color.slice(k, k + 2), 16))
            .concat(alpha)
        : [0, 0, 0, 0];
    }),
  );
}
export function normalizeClipping(doc) {
  for (const l of doc.layers)
    if (l.clipped && !clippingBase(doc, l)) delete l.clipped;
}
// Legacy masks without this option retain their fixed-position behavior.
export function transferLinkedMask(source, target, mapping, copy = false) {
  const old = source.layers?.find((l) => l.id === source.activeLayerId);
  const next = target.layers?.find((l) => l.id === target.activeLayerId);
  if (!old?.mask || old.maskLinked !== true) return;
  const mask = [...old.mask];
  if (!copy) for (const [from] of mapping) mask[from] = true;
  for (const [from, to] of mapping) mask[to] = old.mask[from];
  next.mask = mask;
}
export function layersAtPixel(doc, index) {
  return [...doc.layers]
    .reverse()
    .filter(
      (l) =>
        layerCoverage(doc, l, index) > 0 &&
        !doc.palette[l.pixels[index]].endsWith("00"),
    );
}
export function moveLayerToFolder(
  doc,
  id,
  folderId,
  beforeId = null,
  after = false,
) {
  const at = doc.layers.findIndex((l) => l.id === id),
    layer = doc.layers[at];
  const folder = doc.folders?.find((f) => f.id === folderId);
  if (
    !layer ||
    layerFlags(doc, layer).locked ||
    (folderId && !folder) ||
    folder?.locked
  )
    throw new Error(t("숨겨지거나 잠긴 레이어는 수정할 수 없어요."));
  if (id === beforeId) return;
  doc.layers.splice(at, 1);
  if (folderId) layer.folderId = folderId;
  else delete layer.folderId;
  let destination = beforeId
    ? doc.layers.findIndex((l) => l.id === beforeId)
    : -1;
  if (destination >= 0 && after) destination++;
  if (destination < 0) {
    const last = doc.layers.findLastIndex((l) => l.folderId === folderId);
    destination = last < 0 ? doc.layers.length : last + 1;
  }
  doc.layers.splice(destination, 0, layer);
  normalizeClipping(doc);
}
export function moveFolder(doc, id, targetId, after = false) {
  const group = doc.layers.filter((l) => l.folderId === id);
  if (!group.length || group.some((l) => layerFlags(doc, l).locked)) return;
  const target = doc.layers.find(
    (l) => l.id === targetId || l.folderId === targetId,
  );
  if (!target || target.folderId === id) return;
  doc.layers = doc.layers.filter((l) => l.folderId !== id);
  const at = target.folderId
    ? after
      ? doc.layers.findLastIndex((l) => l.folderId === target.folderId) + 1
      : doc.layers.findIndex((l) => l.folderId === target.folderId)
    : doc.layers.findIndex((l) => l.id === target.id) + Number(after);
  doc.layers.splice(at, 0, ...group);
}
