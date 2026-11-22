import {
  clone,
  validateDocument,
  ensureLayers,
  documentRGBA,
  rgbaToDocument,
} from "./core.mjs";
import { layerFlags } from "./layer-structure.mjs";
import { t } from "./i18n.mjs";
import { MAX_IMPORT_SIZE, assertCanvasSize } from "./document-region.mjs";
import { mapAnimationFrames } from "./animation.mjs";

function dimensions(width, height) {
  assertCanvasSize(width,height);
}
// Pixel-center nearest-neighbor sampling. No interpolation or new colors.
export function sampleMap(sourceWidth, sourceHeight, width, height) {
  dimensions(width, height);
  return Array.from(
    { length: width * height },
    (_, i) =>
      Math.min(
        sourceHeight - 1,
        Math.floor(((Math.floor(i / width) + 0.5) * sourceHeight) / height),
      ) *
        sourceWidth +
      Math.min(
        sourceWidth - 1,
        Math.floor((((i % width) + 0.5) * sourceWidth) / width),
      ),
  );
}
export function scaleDocument(
  source,
  selection,
  width,
  height,
  { detachGuides = false } = {},
) {
  dimensions(width, height);
  if (source.animation) return mapAnimationFrames(source, width, height, frame => scaleDocument(frame, selection, width, height, { detachGuides }));
  const doc = ensureLayers(clone(validateDocument(source)));
  if (doc.autotile)
    throw new Error(t("오토타일 공유 원본의 크기는 고정되어 있어요."));
  if (doc.layers.some((l) => layerFlags(doc, l).locked || l.alphaLocked))
    throw new Error(
      t(
        "이미지 크기를 바꾸려면 모든 레이어의 잠금과 투명 잠금을 해제해 주세요.",
      ),
    );
  if (doc.layers.some((l) => l.geometryGuide) && !detachGuides)
    throw new Error(
      t("크기를 바꾸려면 입체 가이드를 일반 픽셀로 전환해 주세요."),
    );
  if (!Array.isArray(selection) || selection.length !== doc.width * doc.height)
    throw new Error(t("선택 영역이 올바르지 않아요."));
  const map = sampleMap(doc.width, doc.height, width, height);
  for (const layer of doc.layers) {
    for (const key of ["pixels", "mask", "refinementProtection"])
      if (layer[key]) layer[key] = map.map((i) => layer[key][i]);
    if (detachGuides) delete layer.geometryGuide;
  }
  doc.width = width;
  doc.height = height;
  return {
    document: validateDocument(doc),
    selection: map.map((i) => selection[i]),
  };
}
export function validateImportImage(image) {
  if (
    !image ||
    ![image.width, image.height].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= MAX_IMPORT_SIZE,
    ) ||
    !image.rgba ||
    image.rgba.length !== image.width * image.height * 4
  )
    throw new Error(t("가져올 PNG는 각 변 4096px 이하여야 해요."));
  return image;
}
// Weighted median-cut in premultiplied RGBA. Transparent cells stay transparent.
export function reduceColors(rgba, limit = 255) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 255)
    throw new RangeError("Invalid color limit");
  const histogram = new Map();
  // Bound histogram memory for photographic 4K imports. Small images retain
  // exact-color median cut; large images accumulate weighted 4-bit RGBA bins.
  const binned = rgba.length > 65536 * 4;
  const keyAt = i => binned
    ? String((rgba[i] >> 4) * 4096 + (rgba[i + 1] >> 4) * 256 + (rgba[i + 2] >> 4) * 16 + (rgba[i + 3] >> 4))
    : Array.from(rgba.slice(i, i + 4)).join(",");
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3]) continue;
    const key = keyAt(i);
    const old = histogram.get(key);
    if (old) {
      old.count++;
      if (binned) for (let ch = 0; ch < 4; ch++)
        old.color[ch] += ch === 3 ? rgba[i + 3] : rgba[i + ch] * rgba[i + 3] / 255;
    }
    else
      histogram.set(key, {
        key,
        count: 1,
        color: [
          (rgba[i] * rgba[i + 3]) / 255,
          (rgba[i + 1] * rgba[i + 3]) / 255,
          (rgba[i + 2] * rgba[i + 3]) / 255,
          rgba[i + 3],
        ],
      });
  }
  if (!binned && histogram.size <= limit) return rgba;
  if (binned) for (const item of histogram.values())
    item.color = item.color.map(value => value / item.count);
  const box = (items) => {
    const spans = [0, 1, 2, 3].map((ch) => {
      let lo = 255,
        hi = 0;
      for (const item of items) {
        lo = Math.min(lo, item.color[ch]);
        hi = Math.max(hi, item.color[ch]);
      }
      return hi - lo;
    });
    const axis = spans.indexOf(Math.max(...spans));
    return {
      items,
      axis,
      score:
        items.length > 1
          ? spans[axis] * items.reduce((n, p) => n + p.count, 0)
          : 0,
    };
  };
  const boxes = [box([...histogram.values()])];
  while (boxes.length < limit) {
    boxes.sort((a, b) => b.score - a.score);
    const current = boxes.shift();
    if (!current.score) {
      boxes.unshift(current);
      break;
    }
    current.items.sort(
      (a, b) =>
        a.color[current.axis] - b.color[current.axis] ||
        a.key.localeCompare(b.key, "en"),
    );
    const half = current.items.reduce((n, p) => n + p.count, 0) / 2;
    let sum = 0,
      split = 0;
    do {
      sum += current.items[split++].count;
    } while (sum < half && split < current.items.length - 1);
    split = Math.min(split, current.items.length - 1);
    boxes.push(
      box(current.items.slice(0, split)),
      box(current.items.slice(split)),
    );
  }
  const lookup = new Map();
  for (const group of boxes) {
    const count = group.items.reduce((n, p) => n + p.count, 0);
    const mean = [0, 1, 2, 3].map(
      (ch) =>
        group.items.reduce((n, p) => n + p.color[ch] * p.count, 0) / count,
    );
    const alpha = Math.max(1, Math.round(mean[3]));
    const color = [
      ...mean
        .slice(0, 3)
        .map((v) =>
          Math.max(0, Math.min(255, Math.round((v * 255) / mean[3]))),
        ),
      alpha,
    ];
    for (const item of group.items) lookup.set(item.key, color);
  }
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4)
    if (rgba[i + 3])
      out.set(lookup.get(keyAt(i)), i);
  return out;
}
export function prepareImport(image, crop, width, height, reduce = false) {
  validateImportImage(image);
  dimensions(width, height);
  if (
    !crop ||
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x + crop.width > image.width ||
    crop.y + crop.height > image.height
  )
    throw new Error(t("잘라낼 영역이 이미지 밖에 있어요."));
  const map = sampleMap(crop.width, crop.height, width, height),
    rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < map.length; i++) {
    const from =
      ((Math.floor(map[i] / crop.width) + crop.y) * image.width +
        (map[i] % crop.width) +
        crop.x) *
      4;
    for (let ch = 0; ch < 4; ch++) rgba[i * 4 + ch] = image.rgba[from + ch];
  }
  const output = reduce ? reduceColors(rgba) : rgba;
  return rgbaToDocument(
    width,
    height,
    output,
    String(image.name || "Imported").slice(0, 100),
  );
}
export function documentImage(doc) {
  return {
    width: doc.width,
    height: doc.height,
    rgba: documentRGBA(doc),
    name: doc.name,
  };
}
