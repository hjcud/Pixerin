import { t } from "./i18n.mjs";

export const REFERENCE_LIMITS = Object.freeze({
  bytes: 12 * 1024 * 1024,
  edge: 8192,
  pixels: 16000000,
  outputEdge: 512,
  dataLength: 1500000,
});
export const REFERENCE_PURPOSES = Object.freeze({
  shape: "형태, 각도",
  palette: "색상",
  lighting: "명암",
  details: "장식",
});
export function checkReferenceDimensions(width, height) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > REFERENCE_LIMITS.edge ||
    height > REFERENCE_LIMITS.edge ||
    width * height > REFERENCE_LIMITS.pixels
  )
    throw new Error(
      t("참고 이미지는 한 변 8,192px, 전체 1,600만 픽셀 이하여야 해요."),
    );
}

// Read dimensions before decoding, including JPEG and the three static WebP headers.
export function referenceHeader(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.length ||
    bytes.length > REFERENCE_LIMITS.bytes
  )
    throw new Error(t("12MB 이하의 참고 이미지를 선택해 주세요."));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (i, n) => String.fromCharCode(...bytes.subarray(i, i + n));
  let width, height, type;
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
    ascii(12, 4) === "IHDR"
  ) {
    width = view.getUint32(16);
    height = view.getUint32(20);
    type = "image/png";
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let i = 2;
    while (i + 3 < bytes.length) {
      if (bytes[i++] !== 255) break;
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (i + 2 > bytes.length) break;
      const length = view.getUint16(i);
      if (length < 2 || i + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      ) {
        height = view.getUint16(i + 3);
        width = view.getUint16(i + 5);
        type = "image/jpeg";
        break;
      }
      i += length;
    }
  } else if (
    bytes.length >= 25 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 4) === "WEBP"
  ) {
    const kind = ascii(12, 4);
    const uint24 = (i) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
    if (kind === "VP8X" && bytes.length >= 30 && !(bytes[20] & 2)) {
      width = uint24(24) + 1;
      height = uint24(27) + 1;
    } else if (kind === "VP8L" && bytes[20] === 47) {
      const packed = view.getUint32(21, true);
      width = (packed & 16383) + 1;
      height = ((packed >>> 14) & 16383) + 1;
    } else if (
      kind === "VP8 " &&
      bytes.length >= 30 &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    ) {
      width = view.getUint16(26, true) & 16383;
      height = view.getUint16(28, true) & 16383;
    }
    type = "image/webp";
  }
  if (!width || !height)
    throw new Error(t("PNG, JPEG, 정지 WebP 이미지를 선택해 주세요."));
  checkReferenceDimensions(width, height);
  return { width, height, type };
}

export function fitReference(
  width,
  height,
  edge = REFERENCE_LIMITS.outputEdge,
) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export function clampReferenceCrop(crop, width, height) {
  const int = (v, fallback) =>
    Number.isFinite(Number(v)) ? Math.round(Number(v)) : fallback;
  const x = Math.max(0, Math.min(width - 1, int(crop.x, 0))),
    y = Math.max(0, Math.min(height - 1, int(crop.y, 0)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, int(crop.width, width))),
    height: Math.max(1, Math.min(height - y, int(crop.height, height))),
  };
}
export function adjustReferenceCrop(crop, action, dx, dy, width, height) {
  const c = clampReferenceCrop(crop, width, height);
  dx = Math.round(dx);
  dy = Math.round(dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return c;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  if (action === "move")
    return {
      ...c,
      x: clamp(c.x + dx, 0, width - c.width),
      y: clamp(c.y + dy, 0, height - c.height),
    };
  if (!["n", "ne", "e", "se", "s", "sw", "w", "nw"].includes(action)) return c;
  let left = c.x,
    top = c.y,
    right = c.x + c.width,
    bottom = c.y + c.height;
  if (action.includes("w")) left = clamp(left + dx, 0, right - 1);
  if (action.includes("e")) right = clamp(right + dx, left + 1, width);
  if (action.includes("n")) top = clamp(top + dy, 0, bottom - 1);
  if (action.includes("s")) bottom = clamp(bottom + dy, top + 1, height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function validateReference(raw) {
  if (raw == null) return null;
  if (
    typeof raw !== "object" ||
    typeof raw.image !== "string" ||
    raw.image.length > REFERENCE_LIMITS.dataLength ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw.image) ||
    !Array.isArray(raw.purposes) ||
    !raw.purposes.length ||
    raw.purposes.length > 4 ||
    raw.purposes.some((p) => !Object.hasOwn(REFERENCE_PURPOSES, p)) ||
    new Set(raw.purposes).size !== raw.purposes.length ||
    typeof raw.note !== "string" ||
    raw.note.length > 500
  )
    throw new Error(t("참고 이미지나 참고 목적을 확인해 주세요."));
  return {
    image: raw.image,
    purposes: Object.keys(REFERENCE_PURPOSES).filter((p) =>
      raw.purposes.includes(p),
    ),
    note: raw.note.trim(),
  };
}
