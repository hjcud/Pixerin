import { t } from "./i18n.mjs";
import { layerFlags, transferLinkedMask } from "./layer-structure.mjs";
import { clone, activeLayer, documentRGBA, colorHex } from "./core.mjs";
import { selectionBounds } from "./editing.mjs";
import {
  assertOrdinaryLayer,
  transferProtection,
} from "./document-operations.mjs";

export function mergeDown(source) {
  if (source.autotile)
    throw new Error(t("오토타일 공유 조각의 배치와 경계는 고정되어 있어요."));
  const doc = clone(source),
    at = doc.layers.findIndex((l) => l.id === doc.activeLayerId);
  if (at < 1) throw new Error(t("아래에 합칠 레이어가 없어요."));
  const pair = doc.layers.slice(at - 1, at + 1);
  if (pair.some((l) => l.geometryGuide))
    throw new Error(t("가이드를 해제한 뒤 레이어를 합쳐 주세요."));
  if (pair[0].folderId !== pair[1].folderId || pair[0].clipped)
    throw new Error(t("같은 폴더 안의 기준 레이어와 합쳐 주세요."));
  if (
    pair.some((l) => layerFlags(doc, l).locked || !layerFlags(doc, l).visible)
  )
    throw new Error(t("두 레이어를 표시하고 잠금을 해제해 주세요."));
  const before = documentRGBA(doc),
    rgba = documentRGBA({ ...doc, layers: pair });
  const pixels = [];
  for (let i = 0; i < rgba.length; i += 4) {
    const hex = colorHex(
      "#" +
        Array.from(rgba.slice(i, i + 4), (c) =>
          c.toString(16).padStart(2, "0"),
        ).join(""),
    );
    let index = doc.palette.indexOf(hex);
    if (index < 0) {
      if (doc.palette.length === 256)
        throw new Error(
          t("합성 색상이 256색 한도를 초과해요. 레이어는 유지돼요."),
        );
      index = doc.palette.push(hex) - 1;
    }
    pixels.push(index);
  }
  pair[0].pixels = pixels;
  delete pair[0].mask;
  delete pair[0].maskEnabled;
  delete pair[0].maskLinked;
  if (pair.some((layer) => layer.refinementProtection))
    pair[0].refinementProtection = pixels.map((_, i) =>
      pair.some((layer) => layer.refinementProtection?.[i] === true),
    );
  if (pair.some((l) => l.refinementProtection?.some(Boolean)))
    pair[0].protectionMode = pair.every(
      (l) =>
        !l.refinementProtection?.some(Boolean) || l.protectionMode === "pixels",
    )
      ? "pixels"
      : "canvas";
  doc.layers.splice(at, 1);
  doc.activeLayerId = pair[0].id;
  if (documentRGBA(doc).some((c, i) => c !== before[i]))
    throw new Error(
      t(
        "반투명 합성을 한 레이어로 저장하면 색이 달라져요. 원래 레이어를 유지했어요.",
      ),
    );
  return doc;
}

export function transformSelection(source, mask, operation) {
  assertOrdinaryLayer(source);
  if (source.autotile)
    throw new Error(t("오토타일 공유 조각의 배치와 경계는 고정되어 있어요."));
  if (!["flip-x", "flip-y", "rotate-cw", "rotate-ccw"].includes(operation))
    throw new Error(t("지원하지 않는 변형이에요."));
  if (layerFlags(source).locked || !layerFlags(source).visible)
    throw new Error(t("레이어 잠금을 해제하고 표시해 주세요."));
  const b = selectionBounds(source, mask);
  if (!b) throw new Error(t("변형할 영역을 먼저 선택해 주세요."));
  const rotate = operation.startsWith("rotate"),
    width = rotate ? b.height : b.width,
    height = rotate ? b.width : b.height;
  if (width > source.width || height > source.height)
    throw new Error(
      t("회전한 영역이 캔버스보다 커요. 픽셀을 자르지 않고 원본을 유지했어요."),
    );
  const left = Math.min(b.left, source.width - width),
    top = Math.min(b.top, source.height - height);
  const doc = clone(source),
    selection = mask.map(() => false);
  const painted = (i) => source.palette[source.pixels[i]].slice(7) !== "00";
  const mapping = [];
  mask.forEach((v, i) => {
    if (v && painted(i)) doc.pixels[i] = 0;
  });
  mask.forEach((v, i) => {
    if (!v) return;
    const x = (i % source.width) - b.left,
      y = Math.floor(i / source.width) - b.top;
    const [tx, ty] =
      operation === "flip-x"
        ? [b.width - 1 - x, y]
        : operation === "flip-y"
          ? [x, b.height - 1 - y]
          : operation === "rotate-cw"
            ? [b.height - 1 - y, x]
            : [y, b.width - 1 - x];
    const target = (top + ty) * doc.width + left + tx;
    if (painted(i)) {
      doc.pixels[target] = source.pixels[i];
      mapping.push([i, target]);
    }
    selection[target] = true;
  });
  transferProtection(source, doc, mapping);
  transferLinkedMask(source, doc, mapping);
  return { document: doc, selection };
}

export function selectionToLayer(
  source,
  mask,
  { cut = false, id = crypto.randomUUID() } = {},
) {
  if (source.autotile)
    throw new Error(t("오토타일 공유 조각의 배치와 경계는 고정되어 있어요."));
  const current = activeLayer(source);
  if (
    !current ||
    !layerFlags(source).visible ||
    (cut && layerFlags(source).locked)
  )
    throw new Error(t("레이어 잠금을 해제하고 표시해 주세요."));
  if (cut && (current.alphaLocked || current.geometryGuide))
    throw new Error(t("투명 잠금이나 입체 가이드를 해제한 뒤 잘라내세요."));
  if (source.layers.length >= 32) throw new Error(t("레이어는 최대 32개예요."));
  if (
    !Array.isArray(mask) ||
    mask.length !== source.width * source.height ||
    !mask.some(
      (v, i) => v && source.palette[current.pixels[i]].slice(7) !== "00",
    )
  )
    throw new Error(t("분리할 칠해진 픽셀을 선택해 주세요."));
  const doc = clone(source),
    at = doc.layers.findIndex((l) => l.id === current.id),
    original = activeLayer(doc);
  const layer = {
    id,
    name: t("레이어 {0}", source.layers.length + 1),
    visible: true,
    locked: false,
    ...(current.folderId ? { folderId: current.folderId } : {}),
    ...(current.clipped ? { clipped: true } : {}),
    ...(current.mask
      ? {
          mask: [...current.mask],
          maskEnabled: current.maskEnabled !== false,
          ...(current.maskLinked !== undefined
            ? { maskLinked: current.maskLinked }
            : {}),
        }
      : {}),
    ...(current.alphaLocked ? { alphaLocked: true } : {}),
    ...(current.protectionMode
      ? { protectionMode: current.protectionMode }
      : {}),
    pixels: current.pixels.map((v, i) => (mask[i] ? v : 0)),
    ...(current.refinementProtection
      ? {
          refinementProtection: current.refinementProtection.map((v, i) =>
            Boolean(v && mask[i]),
          ),
        }
      : {}),
  };
  if (cut) {
    original.pixels = original.pixels.map((v, i) => (mask[i] ? 0 : v));
    if (original.refinementProtection)
      original.refinementProtection = original.refinementProtection.map(
        (v, i) => v && !mask[i],
      );
  }
  doc.layers.splice(at + 1, 0, layer);
  doc.activeLayerId = id;
  return doc;
}
