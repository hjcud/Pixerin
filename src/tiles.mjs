import { t } from "./i18n.mjs";
export const TILE_MATERIALS = {
  grass: { name: "잔디", color: "#507D3BFF" },
  dirt: { name: "흙", color: "#906446FF" },
  stone: { name: "돌", color: "#727D88FF" },
  brick: { name: "벽돌", color: "#A3624FFF" },
  water: { name: "물", color: "#35799FFF" },
  custom: { name: "직접 입력", color: "#526078FF" },
};
export function validateTileMode(raw) {
  if (
    !raw ||
    typeof raw.material !== "string" ||
    !raw.material.trim() ||
    raw.material.trim().length > 120 ||
    typeof raw.wrap !== "boolean"
  )
    throw new Error(t("타일 소재와 경계 연결 설정을 확인해 주세요."));
  return { material: raw.material.trim(), wrap: raw.wrap };
}
export const wrapCoordinate = (n, size) => ((n % size) + size) % size;

// Repeat native RGBA exactly; preview pixels never become the exported document.
export function repeatRGBA(rgba, width, height) {
  if (
    ![width, height].every((n) => Number.isInteger(n) && n >= 1 && n <= 64) ||
    rgba.length !== width * height * 4
  )
    throw new Error(t("반복 미리보기 크기가 올바르지 않아요."));
  const out = new Uint8ClampedArray(width * height * 9 * 4);
  for (let y = 0; y < height * 3; y++)
    for (let x = 0; x < width * 3; x++) {
      const from = ((y % height) * width + (x % width)) * 4;
      out.set(rgba.subarray(from, from + 4), (y * width * 3 + x) * 4);
    }
  return { width: width * 3, height: height * 3, data: out };
}
export function tilePrompt(material) {
  return t`${material} 소재의 게임용 반복 바닥 타일을 만들어줘. 캔버스 전체를 채우고, 좌우와 상하 경계를 넘는 무늬가 자연스럽게 이어지도록 해줘. 3×3 반복에서도 격자나 특정 무늬가 과하게 눈에 띄지 않게, 간결한 픽셀 덩어리와 절제된 명암으로 표현해줘.`;
}

// Contrast candidates, not a seamlessness verdict. Ignore invisible RGB values.
export function tileSeamCandidates(rgba, width, height, threshold = 24) {
  if (rgba.length !== width * height * 4 || width < 1 || height < 1)
    throw new Error("Invalid tile dimensions");
  const delta = (a, b) => {
    let squared = (rgba[a * 4 + 3] - rgba[b * 4 + 3]) ** 2;
    for (let c = 0; c < 3; c++)
      squared +=
        ((rgba[a * 4 + c] * rgba[a * 4 + 3]) / 255 -
          (rgba[b * 4 + c] * rgba[b * 4 + 3]) / 255) **
        2;
    return Math.sqrt(squared / 4);
  };
  const horizontal = [],
    vertical = [];
  if (width > 1)
    for (let y = 0; y < height; y++) {
      const a = y * width,
        b = a + width - 1;
      if (
        delta(a, b) >
        Math.max(threshold, (delta(a, a + 1) + delta(b, b - 1)) * 0.75)
      )
        horizontal.push(y);
    }
  if (height > 1)
    for (let x = 0; x < width; x++) {
      const a = x,
        b = (height - 1) * width + x;
      if (
        delta(a, b) >
        Math.max(threshold, (delta(a, a + width) + delta(b, b - width)) * 0.75)
      )
        vertical.push(x);
    }
  return { horizontal, vertical };
}
