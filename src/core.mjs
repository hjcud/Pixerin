import { t } from "./i18n.mjs";
import { MAX_DOCUMENT_SIZE, MAX_DOCUMENT_CELLS, assertCanvasSize } from "./document-region.mjs";
import { validateProjectContext } from "./project-context.mjs";
import { validateAnimation } from "./animation-data.mjs";
import {
  validateLayerStructure,
  layerFlags,
  layerCoverageMap,
  clippingBase,
} from "./layer-structure.mjs";
import { validateGuide, guideConstraints } from "./geometry.mjs";
import { validateTileMode } from "./tiles.mjs";
import {
  validateAutotile,
  autoConstraints,
  assertAutoIntegrity,
} from "./autotile.mjs";
export const MAX_SIZE = MAX_DOCUMENT_SIZE;
export const MAX_COLORS = 256;
export const DEFAULT_PALETTE = [
  "#00000000",
  "#242B3AFF",
  "#526078FF",
  "#97ABC0FF",
  "#DCE9EFFF",
  "#FFFFFFFF",
  "#286A63FF",
  "#50A889FF",
  "#95D5AEFF",
  "#D1EBC4FF",
  "#97516AFF",
  "#D77887FF",
  "#F4B4A4FF",
  "#A2754AFF",
  "#D6AA67FF",
  "#F5D99AFF",
];
export const clone = (value) => revive(structuredClone(value));
function revive(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) if (item && typeof item === "object") revive(item);
    return value;
  }
  if (ArrayBuffer.isView(value)) return value;
  if (value.format === "pixeltool" && [2, 3].includes(value.version)) {
    if (value.version === 3) for (const frame of value.animation?.frames || []) if (frame.document) revive(frame.document);
    return attachPixels(value);
  }
  for (const key of Object.keys(value))
    if (typeof value[key] === "object") revive(value[key]);
  return value;
}
function attachPixels(doc) {
  Object.defineProperty(doc, "pixels", {
    configurable: true,
    enumerable: false,
    get() {
      return activeLayer(this).pixels;
    },
    set(pixels) {
      activeLayer(this).pixels = pixels;
    },
  });
  return doc;
}
export function activeLayer(doc) {
  return doc.layers?.find((layer) => layer.id === doc.activeLayerId) || null;
}
export function ensureLayers(raw) {
  const doc = validateDocument(raw);
  if ([2, 3].includes(doc.version)) return doc;
  const pixels = doc.pixels;
  delete doc.pixels;
  return attachPixels({
    ...doc,
    version: 2,
    activeLayerId: "layer-1",
    layers: [
      { id: "layer-1", name: "레이어 1", visible: true, locked: false, pixels },
    ],
  });
}
export function colorHex(value) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value))
    throw new Error(t("색상은 #RRGGBB 또는 #RRGGBBAA 형식이어야 해요."));
  const color = (value.length === 7 ? value + "FF" : value).toUpperCase();
  return color.endsWith("00") ? "#00000000" : color;
}
export function createDocument(width = 16, height = 16, name = "Untitled") {
  assertCanvasSize(width,height);
  return validateDocument({
    format: "pixeltool",
    version: 1,
    name,
    width,
    height,
    palette: [...DEFAULT_PALETTE],
    pixels: Array(width * height).fill(0),
  });
}
export function validateDocument(raw) {
  if (!raw || raw.format !== "pixeltool" || ![1, 2, 3].includes(raw.version))
    throw new Error(t("PixelTool 프로젝트 파일이 아니에요."));
  const { width, height } = raw;
  if (
    ![width, height].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= MAX_SIZE,
    )
  )
    throw new Error(t`캔버스 크기는 1–${MAX_SIZE}px여야 해요.`);
  // Reject oversized layer/auxiliary allocations before cloning any pixel grids.
  const cells = (raw.version >= 2 && Array.isArray(raw.layers) ? raw.layers : [raw])
    .reduce((sum, layer) => sum + width * height * (1 + Number(Boolean(layer.mask)) + Number(Boolean(layer.refinementProtection))), 0);
  if (cells > MAX_DOCUMENT_CELLS)
    throw new Error(t("문서의 레이어, 마스크가 메모리 상한을 초과해요. 크기나 레이어 수를 줄여 주세요."));
  if (
    !Array.isArray(raw.palette) ||
    !raw.palette.length ||
    raw.palette.length > MAX_COLORS
  )
    throw new Error(t("팔레트는 1–256색이어야 해요."));
  const palette = raw.palette.map(colorHex);
  if (raw.tileMode && (width > 64 || height > 64))
    throw new Error(t("반복 타일은 각 변 64px까지 지원해요."));
  if (palette[0] !== "#00000000")
    throw new Error(t("팔레트의 첫 번째 색상은 투명이어야 해요."));
  if (raw.version >= 2) {
    if (
      !Array.isArray(raw.layers) ||
      !raw.layers.length ||
      raw.layers.length > 32
    )
      throw new Error(t("레이어는 1–32개여야 해요."));
    const ids = new Set();
    const layers = raw.layers.map((layer) => {
      if (
        !layer ||
        typeof layer.id !== "string" ||
        !layer.id ||
        layer.id.length > 100 ||
        ids.has(layer.id) ||
        typeof layer.visible !== "boolean" ||
        typeof layer.locked !== "boolean"
      )
        throw new Error(t("레이어 데이터가 올바르지 않아요."));
      ids.add(layer.id);
      if (
        layer.alphaLocked !== undefined &&
        typeof layer.alphaLocked !== "boolean"
      )
        throw new Error(t("레이어 데이터가 올바르지 않아요."));
      if (
        layer.refinementProtection !== undefined &&
        (!Array.isArray(layer.refinementProtection) ||
          layer.refinementProtection.length !== width * height ||
          Array.from(layer.refinementProtection).some(
            (v) => typeof v !== "boolean",
          ))
      )
        throw new Error(t("디테일 보호 영역이 올바르지 않아요."));
      if (
        layer.protectionMode !== undefined &&
        !["canvas", "pixels"].includes(layer.protectionMode)
      )
        throw new Error(t("디테일 보호 영역이 올바르지 않아요."));
      const checked = validateDocument({
        ...raw,
        version: 1,
        animation: undefined,
        pixels: layer.pixels,
      });
      return {
        id: layer.id,
        name: String(layer.name || "레이어").slice(0, 100),
        visible: layer.visible,
        locked: layer.locked,
        ...(layer.alphaLocked !== undefined
          ? { alphaLocked: layer.alphaLocked }
          : {}),
        pixels: checked.pixels,
        ...(layer.protectionMode
          ? { protectionMode: layer.protectionMode }
          : {}),
        ...(layer.refinementProtection !== undefined
          ? { refinementProtection: [...layer.refinementProtection] }
          : {}),
        ...(layer.geometryGuide !== undefined
          ? { geometryGuide: validateGuide(layer.geometryGuide) }
          : {}),
      };
    });
    const folders = validateLayerStructure(raw, layers, width * height);
    if (!ids.has(raw.activeLayerId))
      throw new Error(t("활성 레이어가 올바르지 않아요."));
    if (
      raw.tileMode !== undefined &&
      layers.some((layer) => layer.geometryGuide)
    )
      throw new Error(
        t("타일 모드를 사용하려면 입체 가이드를 먼저 해제해 주세요."),
      );
    let shadeRamps;
    if (raw.shadeRamps !== undefined) {
      if (!Array.isArray(raw.shadeRamps) || raw.shadeRamps.length > 16)
        throw new Error(t("명암 묶음은 최대 16개예요."));
      const rampIds = new Set();
      shadeRamps = raw.shadeRamps.map((ramp) => {
        if (
          !ramp ||
          typeof ramp.id !== "string" ||
          !ramp.id ||
          ramp.id.length > 100 ||
          rampIds.has(ramp.id) ||
          !Array.isArray(ramp.colors) ||
          ramp.colors.length !== 3
        )
          throw new Error(t("명암 묶음 형식이 올바르지 않아요."));
        rampIds.add(ramp.id);
        return {
          id: ramp.id,
          name: String(ramp.name || "명암 묶음").slice(0, 50),
          colors: ramp.colors.map(colorHex),
        };
      });
    }
    const checkedDocument = attachPixels({
      format: "pixeltool",
      version: 2,
      name: String(raw.name || "Untitled").slice(0, 100),
      width,
      height,
      palette,
      layers,
      activeLayerId: raw.activeLayerId,
      ...(raw.folders !== undefined ? { folders } : {}),
      ...(shadeRamps ? { shadeRamps } : {}),
      ...(raw.editorContext !== undefined
        ? { editorContext: validateProjectContext(raw.editorContext) }
        : {}),
      ...(raw.autotile !== undefined
        ? {
            autotile: validateAutotile(
              raw.autotile,
              width,
              layers,
              raw.activeLayerId,
            ),
          }
        : {}),
      ...(raw.tileMode !== undefined
        ? { tileMode: validateTileMode(raw.tileMode) }
        : {}),
    });
    if (checkedDocument.autotile) {
      if (
        width !== height ||
        raw.tileMode !== undefined ||
        layers.some((l) => l.geometryGuide)
      )
        throw new Error(
          t("오토타일 원본은 다른 가이드 모드와 함께 사용할 수 없어요."),
        );
      assertAutoIntegrity(checkedDocument);
    }
    if (raw.version === 3) {
      checkedDocument.animation = validateAnimation(raw.animation, checkedDocument, validateDocument);
      checkedDocument.version = 3;
    } else if (raw.animation !== undefined) {
      throw new Error(t("애니메이션 프로젝트는 버전 3으로 저장해야 해요."));
    }
    return checkedDocument;
  }
  if (raw.animation !== undefined)
    throw new Error(t("애니메이션 프로젝트는 버전 3으로 저장해야 해요."));
  if (
    !Array.isArray(raw.pixels) ||
    raw.pixels.length !== width * height ||
    !raw.pixels.every(
      (n) => Number.isInteger(n) && n >= 0 && n < palette.length,
    )
  )
    throw new Error(t("픽셀 데이터가 올바르지 않아요."));
  return {
    format: "pixeltool",
    version: 1,
    name: String(raw.name || "Untitled").slice(0, 100),
    width,
    height,
    palette,
    pixels: [...raw.pixels],
    ...(raw.tileMode !== undefined
      ? { tileMode: validateTileMode(raw.tileMode) }
      : {}),
  };
}
export function validateMask(mask, length) {
  const packed = mask instanceof Uint8Array;
  if (
    (!Array.isArray(mask) && !packed) ||
    mask.length !== length ||
    !mask.every((v) => packed ? v === 0 || v === 1 : typeof v === "boolean")
  )
    throw new Error(t("선택 영역이 올바르지 않아요."));
  if (!mask.some(Boolean))
    throw new Error(t("수정할 영역을 먼저 선택해 주세요."));
  return packed ? mask.slice() : [...mask];
}
export function linePoints(x0, y0, x1, y1) {
  const out = [],
    dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1,
    dy = -Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e = 2 * err;
    if (e >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}
export function rectMask(
  width,
  height,
  a,
  b,
  initial = null,
  mode = "replace",
) {
  if (mode === "intersect") {
    const region = rectMask(width, height, a, b);
    return region.map((v, i) => v && Boolean(initial?.[i]));
  }
  const mask =
    mode === "replace" ? Array(width * height).fill(false) : [...initial];
  for (
    let y = Math.max(0, Math.min(a[1], b[1]));
    y <= Math.min(height - 1, Math.max(a[1], b[1]));
    y++
  )
    for (
      let x = Math.max(0, Math.min(a[0], b[0]));
      x <= Math.min(width - 1, Math.max(a[0], b[0]));
      x++
    )
      mask[y * width + x] = mode !== "subtract";
  return mask;
}
export function maskRuns(mask, width) {
  const runs = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const start = i;
    while (i + 1 < mask.length && (i + 1) % width && mask[i + 1]) i++;
    runs.push({
      y: Math.floor(start / width),
      x: start % width,
      length: i - start + 1,
    });
  }
  return runs;
}
export function paintedMask(doc) {
  return doc.pixels.map((color) => doc.palette[color].slice(7) !== "00");
}
export function editableMask(doc, selection, alphaLock = false, { packed = false } = {}) {
  const selected = selection.some(Boolean),
    flags = layerFlags(doc),
    layer = activeLayer(doc),
    base = layer?.clipped ? clippingBase(doc, layer) : null,
    auto = autoConstraints(doc);
  const baseVisible = base && layerFlags(doc, base).visible;
  return (packed ? Uint8Array : Array).from(selection,
    (v, i) =>
      (!selected || v) &&
      flags.visible &&
      !flags.locked &&
      (!layer?.mask || layer.maskEnabled === false || layer.mask[i]) &&
      (!layer?.clipped || (baseVisible &&
        (!base.mask || base.maskEnabled === false || base.mask[i]) && !doc.palette[base.pixels[i]].endsWith("00"))) &&
      (!alphaLock || !doc.palette[doc.pixels[i]].endsWith("00")) &&
      (!auto || auto.editable[i]),
  );
}
// Change RGB while keeping this pixel's exact alpha. Transparent paint is a no-op.
export function recolorPixel(doc, index, color, alphaLock = false) {
  const auto = autoConstraints(doc);
  if (auto && !auto.editable[index]) return;
  alphaLock ||= Boolean(auto);
  if (!alphaLock) {
    doc.pixels[index] = color;
    return;
  }
  const old = doc.palette[doc.pixels[index]],
    next = doc.palette[color];
  if (old.slice(7) === "00" || next.slice(7) === "00") return;
  const rgba = next.slice(0, 7) + old.slice(7);
  let target = doc.palette.indexOf(rgba);
  if (target < 0) {
    if (doc.palette.length >= MAX_COLORS)
      throw new Error(
        t("투명도를 유지하는 데 필요한 색상이 256색 한도를 초과해요."),
      );
    target = doc.palette.length;
    doc.palette.push(rgba);
  }
  doc.pixels[index] = target;
}
export function applyProposal(
  raw,
  mask,
  proposal,
  { alphaLock = false, paletteOnly = false } = {},
) {
  if (proposal?.raster != null)
    return applyRasterProposal(raw, mask, proposal, { alphaLock, paletteOnly });
  const doc = validateDocument(raw);
  const original = clone(doc);
  const geometry = guideConstraints(doc),
    auto = autoConstraints(doc);
  if (layerFlags(doc).locked || !layerFlags(doc).visible)
    throw new Error(t("숨겨지거나 잠긴 레이어는 수정할 수 없어요."));
  validateMask(mask, doc.pixels.length);
  if (
    !proposal ||
    typeof proposal.summary !== "string" ||
    proposal.summary.length > 4000 ||
    !Array.isArray(proposal.new_colors) ||
    !Array.isArray(proposal.runs)
  )
    throw new Error(t("AI 변경안의 형식이 올바르지 않아요."));
  if (doc.palette.length + proposal.new_colors.length > MAX_COLORS)
    throw new Error(t("팔레트가 256색을 초과해요."));
  if (paletteOnly && proposal.new_colors.length)
    throw new Error(
      t("기존 팔레트만 사용하도록 설정되어 있어 새 색상 변경안을 거부했어요."),
    );
  doc.palette.push(...proposal.new_colors.map(colorHex));
  if (proposal.runs.length > doc.pixels.length)
    throw new Error(t("AI 변경안이 너무 커요."));
  const touched = new Set();
  const coverage = layerCoverageMap(original);
  for (const run of proposal.runs) {
    if (
      !run ||
      !Number.isInteger(run.x) ||
      !Number.isInteger(run.y) ||
      !Array.isArray(run.colors) ||
      !run.colors.length
    )
      throw new Error(
        t(
          "AI 변경안의 좌표, 색상 목록 형식이 올바르지 않아요. 원본은 그대로예요. 다시 요청해 주세요.",
        ),
      );
    if (
      run.x < 0 ||
      run.y < 0 ||
      run.y >= doc.height ||
      run.x + run.colors.length > doc.width
    )
      throw new Error(
        t(
          "AI 변경안의 픽셀 좌표가 캔버스 크기를 벗어나 전체 변경안을 적용하지 않았어요. 원본은 그대로예요. 현재 캔버스 크기 안에서 수정하도록 다시 요청해 주세요.",
        ),
      );
    run.colors.forEach((color, offset) => {
      const i = run.y * doc.width + run.x + offset;
      if (!coverage[i])
        throw new Error(
          t("마스크 또는 클리핑으로 숨겨진 픽셀은 AI가 수정할 수 없어요."),
        );
      // The submitted mask already excludes protected pixels. Explain the
      // underlying protection before falling back to a selection-boundary error.
      if (auto && !auto.editable[i])
        throw new Error(
          t(
            "AI 변경안에 오토타일의 공유 경계, 보호 영역(X {0}, Y {1})이 포함되어 있어 전체 변경안을 적용하지 않았어요. 원본은 그대로예요. 경계를 유지하고 조각 안쪽만 꾸미도록 다시 요청해 주세요.",
            run.x + offset,
            run.y,
          ),
        );
      if (geometry && !geometry.editable[i])
        throw new Error(
          t(
            "AI 변경안에 입체 가이드의 보호 영역(X {0}, Y {1})이 포함되어 있어 전체 변경안을 적용하지 않았어요. 외곽, 면 경계, 보호된 면은 수정할 수 없어요. 원본은 그대로예요. 수정 가능한 면 안쪽만 꾸미도록 다시 요청해 주세요.",
            run.x + offset,
            run.y,
          ),
        );
      if (alphaLock && original.palette[original.pixels[i]].slice(7) === "00")
        throw new Error(
          t(
            "AI 변경안에 투명 잠금으로 보호된 픽셀(X {0}, Y {1})이 포함되어 있어 전체 변경안을 적용하지 않았어요. 원본은 그대로예요. 칠해진 부분만 수정하도록 요청해 주세요. 새 픽셀이 필요하다면 투명 잠금, 색만 변경 설정을 확인해 주세요.",
            run.x + offset,
            run.y,
          ),
        );
      if (!mask[i])
        throw new Error(
          t(
            "AI 변경안에 선택 영역 밖의 픽셀(X {0}, Y {1})이 포함되어 있어 전체 변경안을 적용하지 않았어요. 원본은 그대로예요. 선택 안쪽만 수정하도록 다시 요청해 주세요.",
            run.x + offset,
            run.y,
          ),
        );
      if (touched.has(i)) throw new Error(t("AI 변경안에 중복 좌표가 있어요."));
      if (!Number.isInteger(color) || color < 0 || color >= doc.palette.length)
        throw new Error(t("AI가 팔레트에 없는 색상을 사용했어요."));
      touched.add(i);
      recolorPixel(doc, i, color, alphaLock || Boolean(geometry));
      if (paletteOnly && doc.palette.length !== original.palette.length)
        throw new Error(
          t(
            "투명도를 유지한 결과가 기존 팔레트에 없는 색이에요. 원본을 유지했어요.",
          ),
        );
    });
  }
  const changed = doc.pixels.reduce(
    (n, c, i) =>
      n + (doc.palette[c] !== original.palette[original.pixels[i]] ? 1 : 0),
    0,
  );
  return { document: doc, changed, summary: proposal.summary };
}
// Session-only raster proposals avoid millions of JSON run objects. Project
// files still use the existing indexed-array format. 65535 means unchanged.
function applyRasterProposal(raw, mask, proposal, { alphaLock, paletteOnly }) {
  const doc = validateDocument(raw), layer = activeLayer(doc), size = doc.width * doc.height;
  if (!layerFlags(doc).visible || layerFlags(doc).locked)
    throw new Error(t("숨겨지거나 잠긴 레이어는 수정할 수 없어요."));
  if (doc.tileMode || doc.autotile || layer?.geometryGuide)
    throw new Error(t("전체 수정은 일반 픽셀 레이어에서 사용할 수 있습니다."));
  validateMask(mask, size);
  const raster = proposal.raster;
  if (typeof proposal.summary !== "string" || proposal.summary.length > 4000 ||
      !Array.isArray(proposal.new_colors) || proposal.runs != null ||
      raster.width !== doc.width || raster.height !== doc.height ||
      !(raster.pixels instanceof Uint16Array) || raster.pixels.length !== size)
    throw new Error(t("AI 변경안의 형식이 올바르지 않아요."));
  if (doc.palette.length + proposal.new_colors.length > MAX_COLORS)
    throw new Error(t("팔레트가 256색을 초과해요."));
  if (paletteOnly && proposal.new_colors.length)
    throw new Error(t("기존 팔레트만 사용하도록 설정되어 있어 새 색상 변경안을 거부했어요."));
  const oldPalette = [...doc.palette];
  doc.palette.push(...proposal.new_colors.map(colorHex));
  const base = layer?.clipped ? clippingBase(doc, layer) : null;
  const baseVisible = base && layerFlags(doc, base).visible;
  let changed = 0;
  for (let i = 0; i < size; i++) {
    const color = raster.pixels[i];
    if (color === 65535) continue;
    if (color >= doc.palette.length) throw new Error(t("AI가 팔레트에 없는 색상을 사용했어요."));
    if (!mask[i]) throw new Error(t("전체 수정 변경안에 보호된 픽셀이 포함되어 적용하지 않았어요."));
    if ((layer?.mask && layer.maskEnabled !== false && !layer.mask[i]) ||
        (layer?.clipped && (!baseVisible || (base.mask && base.maskEnabled !== false && !base.mask[i]) || oldPalette[base.pixels[i]].endsWith("00"))))
      throw new Error(t("마스크 또는 클리핑으로 숨겨진 픽셀은 AI가 수정할 수 없어요."));
    const previous = oldPalette[doc.pixels[i]], next = doc.palette[color];
    if ((alphaLock || layer?.alphaLocked) && (previous.endsWith("00") || previous.slice(7) !== next.slice(7)))
      throw new Error(t("전체 수정 변경안이 잠긴 투명도를 바꾸어 적용하지 않았어요."));
    if (next !== previous) { doc.pixels[i] = color; changed++; }
  }
  return { document: doc, changed, summary: proposal.summary };
}
export function rgbaToDocument(width, height, rgba, name = "Imported") {
  const doc = createDocument(width, height, name);
  doc.palette = ["#00000000"];
  const lookup = new Map([["#00000000", 0]]);
  if (rgba.length !== width * height * 4)
    throw new Error(t("이미지 데이터 크기가 맞지 않아요."));
  for (let i = 0; i < doc.pixels.length; i++) {
    const k = i * 4;
    const hex =
      rgba[k + 3] === 0
        ? "#00000000"
        : "#" +
          Array.from(rgba.slice(k, k + 4), (n) =>
            n.toString(16).padStart(2, "0"),
          )
            .join("")
            .toUpperCase();
    if (!lookup.has(hex)) {
      if (doc.palette.length >= MAX_COLORS)
        throw new Error(
          t(
            "이 PNG는 256색을 초과해요. 원본을 유지하기 위해 자동 감색하지 않았어요.",
          ),
        );
      lookup.set(hex, doc.palette.length);
      doc.palette.push(hex);
    }
    doc.pixels[i] = lookup.get(hex);
  }
  return doc;
}
export function documentRGBA(doc, composite = true) {
  const colors = doc.palette.map((color) =>
    [1, 3, 5, 7].map((ch) => parseInt(color.slice(ch, ch + 2), 16)),
  );
  const size = doc.width * doc.height;
  const data = new Uint8ClampedArray(size * 4);
  const visible = doc.version >= 2 && composite ? doc.layers.filter((layer) => layerFlags(doc, layer).visible) : null;
  if (!visible || (visible.length === 1 && !visible[0].clipped && (!visible[0].mask || visible[0].maskEnabled === false))) {
    const pixels = visible ? visible[0].pixels : doc.pixels;
    // Native byte order packed writes avoid four channel assignments per pixel.
    const paletteBytes = new Uint8ClampedArray(colors.flat()), packed = new Uint32Array(paletteBytes.buffer);
    const output = new Uint32Array(data.buffer);
    for (let i = 0; i < size; i++) output[i] = packed[pixels[i]];
    return data;
  }
  if (!visible.length) return data;
  const stacks = [];
  for (let index = 0; index < doc.layers.length; index++) {
    const layer = doc.layers[index];
    if (layer.clipped || !layerFlags(doc, layer).visible) continue;
    const clips = [];
    for (let j = index + 1; j < doc.layers.length; j++) {
      const clip = doc.layers[j];
      if (!clip.clipped || clip.folderId !== layer.folderId) break;
      if (layerFlags(doc, clip).visible) clips.push(clip);
    }
    stacks.push({ layer, clips });
  }
  // Keep exact double-precision accumulation, but bound scratch memory to 2 MiB
  // rather than allocating 512 MiB for a 4096-square composite.
  const chunkSize = 65536, sums = new Float64Array(Math.min(size, chunkSize) * 4);
  for (let start = 0; start < size; start += chunkSize) {
    const end = Math.min(size, start + chunkSize); sums.fill(0);
    for (const { layer, clips } of stacks) for (let i = start; i < end; i++) {
      if (layer.mask && layer.maskEnabled !== false && !layer.mask[i]) continue;
      const color = colors[layer.pixels[i]], a = color[3] / 255, k = (i - start) * 4;
      if (!a) continue;
      let r = color[0], g = color[1], b = color[2];
      for (const clip of clips) {
        if (clip.mask && clip.maskEnabled !== false && !clip.mask[i]) continue;
        const over = colors[clip.pixels[i]], ca = over[3] / 255;
        r = over[0] * ca + r * (1 - ca); g = over[1] * ca + g * (1 - ca); b = over[2] * ca + b * (1 - ca);
      }
      sums[k] = r * a + sums[k] * (1 - a); sums[k + 1] = g * a + sums[k + 1] * (1 - a);
      sums[k + 2] = b * a + sums[k + 2] * (1 - a); sums[k + 3] = a + sums[k + 3] * (1 - a);
    }
    for (let i = start; i < end; i++) {
      const k = (i - start) * 4, a = sums[k + 3], dst = i * 4;
      if (a) for (let ch = 0; ch < 3; ch++) data[dst + ch] = Math.round(sums[k + ch] / a);
      data[dst + 3] = Math.round(a * 255);
    }
  }
  return data;
}

export class History {
  constructor(limit = 100, memoryBytes = 64 * 1024 * 1024) {
    this.past = [];
    this.future = [];
    this.configure({ limit, memoryBytes });
  }
  static encode(value) {
    return new TextEncoder().encode(JSON.stringify(value, (_key, item) => {
      if (!Array.isArray(item) || item.length < 65536) return item;
      const runs = [];
      let previous = item[0], count = 0;
      for (const current of item) {
        if (typeof current !== "boolean" && (!Number.isInteger(current) || current < 0 || current > 255)) return item;
        if (current === previous) count++;
        else {
          runs.push(previous, count); previous = current; count = 1;
          // Abort before allocating a second dense grid for noisy artwork.
          if (runs.length > Math.min(item.length / 8, 65536)) return item;
        }
      }
      runs.push(previous, count);
      return { __pixelMatHistoryRLE: 1, length: item.length, runs };
    }));
  }
  static decode(bytes) {
    return revive(JSON.parse(new TextDecoder().decode(bytes), (_key, item) => {
      if (item?.__pixelMatHistoryRLE !== 1 || !Number.isInteger(item.length) || item.length < 1 ||
          item.length > MAX_DOCUMENT_CELLS || !Array.isArray(item.runs) || item.runs.length % 2) return item;
      const values = Array(item.length); let at = 0;
      for (let i = 0; i < item.runs.length; i += 2) {
        const value = item.runs[i], count = item.runs[i + 1];
        if (!Number.isInteger(count) || count < 1 || at + count > values.length) throw Error("Invalid history span");
        values.fill(value, at, at + count); at += count;
      }
      if (at !== values.length) throw Error("Invalid history length");
      return values;
    }));
  }
  static size(value) {
    return History.encode(value).byteLength;
  }
  get usedBytes() {
    return [...this.past, ...this.future].reduce(
      (n, bytes) => n + bytes.byteLength,
      0,
    );
  }
  configure({ limit = this.limit, memoryBytes = this.memoryBytes }) {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      !Number.isSafeInteger(memoryBytes) ||
      memoryBytes < 1
    )
      throw new Error("Invalid history budget");
    this.limit = limit;
    this.memoryBytes = memoryBytes;
    this.trim();
  }
  trim() {
    let bytes = this.usedBytes;
    while (
      this.past.length + this.future.length > this.limit ||
      bytes > this.memoryBytes
    ) {
      // Remove the farthest state, preserving contiguous undo and redo chains.
      const stack =
        this.past.length >= this.future.length ? this.past : this.future;
      bytes -= stack.shift().byteLength;
    }
  }
  record(before, after) {
    const a = History.encode(before),
      b = History.encode(after);
    if (a.length === b.length && a.every((v, i) => v === b[i])) return false;
    this.future = [];
    this.past.push(a);
    this.trim();
    return true;
  }
  undo(current) {
    if (!this.past.length) return null;
    const previous = this.past.pop();
    this.future.push(History.encode(current));
    this.trim();
    return History.decode(previous);
  }
  redo(current) {
    if (!this.future.length) return null;
    const next = this.future.pop();
    this.past.push(History.encode(current));
    this.trim();
    return History.decode(next);
  }
  clear() {
    this.past = [];
    this.future = [];
  }
}
