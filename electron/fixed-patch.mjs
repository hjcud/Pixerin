import { t } from "../src/i18n.mjs";
import { aiRegion } from "../src/document-region.mjs";
import { layerFlags, layerCoverageMap } from "../src/layer-structure.mjs";
import {
  validateDocument,
  validateMask,
  maskRuns,
  paintedMask,
  activeLayer,
} from "../src/core.mjs";
import { autoConstraints } from "../src/autotile.mjs";
import { guideConstraints } from "../src/geometry.mjs";
import { qualityOptions, detailProtection } from "../src/icon-quality.mjs";

export const SEGMENT_SIZE = 8;
// Avoid grammar/instruction overhead on tiny edits. Reference tokenizer checks
// put sparse-span break-even near 40 segments; retain a conservative margin.
export const usesCompactPatch = (count) => count >= 48;
// Derived exclusively from the request snapshot, never from model-provided coordinates.
export function fixedScope(input) {
  const document = validateDocument(input.document);
  if (layerFlags(document).locked || !layerFlags(document).visible)
    throw new Error(t("보이고 잠기지 않은 레이어를 선택해 주세요."));
  let mask = validateMask(input.mask, document.pixels.length);
  const coverage = layerCoverageMap(document);
  mask = mask.map((v, i) => v && coverage[i] > 0);
  const geometry = guideConstraints(document),
    auto = autoConstraints(document);
  if (auto) {
    mask = mask.map((v, i) => v && auto.editable[i]);
    if (!mask.some(Boolean))
      throw new Error(
        t("선택 안에 꾸밀 수 있는 조각 내부가 없어요. 16px 이상을 권장해요."),
      );
  }
  if (geometry) {
    mask = mask.map((v, i) => v && geometry.editable[i]);
    if (!mask.some(Boolean))
      throw new Error(
        t(
          "선택 영역 안에 꾸밀 수 있는 면 내부 픽셀이 없어요. 선택이나 입체 가이드 각도를 바꿔 주세요.",
        ),
      );
  }
  if (input.paletteOnly != null && typeof input.paletteOnly !== "boolean")
    throw new Error(t("팔레트 제한 설정이 올바르지 않아요."));
  if (input.alphaLock != null && typeof input.alphaLock !== "boolean")
    throw new Error(t("투명 영역 잠금 설정이 올바르지 않아요."));
  if (input.alphaLock) {
    const painted = paintedMask(document);
    mask = mask.map((v, i) => v && painted[i]);
    if (!mask.some(Boolean))
      throw new Error(
        t(
          "수정할 색상 픽셀이 없어요. 투명 영역 잠금을 해제하거나 칠해진 영역을 선택하세요.",
        ),
      );
  }
  const protectedPixels = detailProtection(document, qualityOptions(input));
  mask = mask.map((v, i) => v && !protectedPixels[i]);
  if (!mask.some(Boolean))
    throw new Error(
      t("수정할 픽셀이 없어요. 선택 범위나 세부 보호를 확인해 주세요."),
    );
  return {
    document,
    region: aiRegion(document, mask, { tight: input.economy === true && !geometry && !auto && !document.tileMode }),
    mask,
    geometry,
    auto,
    segments: fixedSegments(mask, document.width),
  };
}
export function fixedSegments(mask, width) {
  return maskRuns(mask, width)
    .flatMap(({ x, y, length }) =>
      Array.from({ length: Math.ceil(length / SEGMENT_SIZE) }, (_, n) => ({
        x: x + n * SEGMENT_SIZE,
        y,
        length: Math.min(SEGMENT_SIZE, length - n * SEGMENT_SIZE),
      })),
    )
    .map((segment, id) => Object.freeze({ id, ...segment }));
}
export function patchSchema(count) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      new_colors: { type: "array", items: { type: "string" } },
      segments: {
        type: "array",
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: {
              type: "integer",
              minimum: 0,
              maximum: Math.max(0, count - 1),
            },
            colors: usesCompactPatch(count) ? {
              anyOf: [
                {
                  type: "array", minItems: 1, maxItems: SEGMENT_SIZE,
                  items: { anyOf: [
                    { type: "integer", minimum: 0, maximum: 255 },
                    { type: "null" },
                  ] },
                },
                { type: "integer", minimum: 0, maximum: 255 },
                {
                  type: "object", additionalProperties: false,
                  properties: { set: {
                    type: "array", minItems: 2, maxItems: SEGMENT_SIZE * 2,
                    items: { type: "integer", minimum: 0, maximum: 255 },
                  } },
                  required: ["set"],
                },
              ],
            } : {
              type: "array", minItems: 1, maxItems: SEGMENT_SIZE,
              items: { anyOf: [{ type: "integer", minimum: 0, maximum: 255 }, { type: "null" }] },
            },
          },
          required: ["id", "colors"],
        },
      },
    },
    required: ["summary", "new_colors", "segments"],
  };
}
function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
export function decodePatch(patch, segments) {
  const fail = () => {
    throw new Error(
      t(
        "AI 변경안의 고정 구간 형식이 맞지 않아요. 구간 번호나 색상 개수를 확인할 수 없어 적용하지 않았어요. 원본은 그대로예요.",
      ),
    );
  };
  if (
    !exactKeys(patch, ["summary", "new_colors", "segments"]) ||
    typeof patch.summary !== "string" ||
    !Array.isArray(patch.new_colors) ||
    !Array.isArray(patch.segments) ||
    patch.segments.length > segments.length
  )
    fail();
  const seen = new Set(),
    runs = [];
  for (const item of patch.segments) {
    if (
      !exactKeys(item, ["id", "colors"]) ||
      !Number.isSafeInteger(item.id) ||
      item.id < 0 ||
      !segments[item.id] ||
      seen.has(item.id)
    )
      fail();
    seen.add(item.id);
    const segment = segments[item.id];
    // Expand transport compression only within the immutable, server-owned span.
    // Dense v1 responses remain valid; no document coordinate comes from the model.
    let colors = item.colors;
    if (Number.isInteger(colors)) colors = Array(segment.length).fill(colors);
    else if (exactKeys(colors, ["set"])) {
      const pairs = colors.set;
      if (!Array.isArray(pairs) || !pairs.length || pairs.length > segment.length * 2 || pairs.length % 2) fail();
      colors = Array(segment.length).fill(null);
      let previous = -1;
      for (let n = 0; n < pairs.length; n += 2) {
        const at = pairs[n], color = pairs[n + 1];
        if (!Number.isInteger(at) || at <= previous || at >= segment.length ||
            !Number.isInteger(color) || color < 0 || color > 255) fail();
        colors[at] = color;
        previous = at;
      }
    }
    if (!Array.isArray(colors) || colors.length !== segment.length) fail();
    let run = null;
    for (let offset = 0; offset < colors.length; offset++) {
      const color = colors[offset];
      if (color === null) {
        run = null;
        continue;
      }
      if (!Number.isInteger(color) || color < 0 || color > 255) fail();
      if (!run) {
        run = { x: segment.x + offset, y: segment.y, colors: [] };
        runs.push(run);
      }
      run.colors.push(color);
    }
  }
  return { summary: patch.summary, new_colors: patch.new_colors.slice(), runs };
}
