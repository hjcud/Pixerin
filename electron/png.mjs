import { t } from "../src/i18n.mjs";
import { renderAutotile, autotileManifest } from "../src/autotile.mjs";
import { PNG } from "pngjs";
import { MAX_IMPORT_SIZE, PNG_FILE_LIMIT } from "../src/document-region.mjs";
import {
  validateDocument,
  documentRGBA,
  rgbaToDocument,
  MAX_SIZE,
} from "../src/core.mjs";
export function encodePNG(raw) {
  const doc = validateDocument(raw);
  return PNG.sync.write(
    {
      width: doc.width,
      height: doc.height,
      data: Buffer.from(documentRGBA(doc)),
    },
    { colorType: 6, inputColorType: 6, bitDepth: 8 },
  );
}
export function decodePNG(input, name) {
  const png = decodeSourcePNG(input, MAX_SIZE);
  return rgbaToDocument(png.width, png.height, png.data, name);
}
function decodeSourcePNG(input, maximum) {
  const data = Buffer.from(input);
  if (
    data.length > PNG_FILE_LIMIT ||
    data.length < 33 ||
    data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    data.subarray(12, 16).toString("ascii") !== "IHDR"
  )
    throw new Error(t("올바른 128MB 이하 PNG 파일을 열어 주세요."));
  const width = data.readUInt32BE(16),
    height = data.readUInt32BE(20);
  if (!width || !height || width > maximum || height > maximum)
    throw new Error(
      t`각 변이 ${maximum}px 이하인 PNG를 열어 주세요. 자동 축소하지 않아요.`,
    );
  const png = PNG.sync.read(data, { checkCRC: true });
  return png;
}
export function importPNG(input, name) {
  const png = decodeSourcePNG(input, MAX_IMPORT_SIZE);
  try {
    return rgbaToDocument(png.width, png.height, png.data, name);
  } catch {
    return {
      imageImport: {
        width: png.width,
        height: png.height,
        rgba: new Uint8ClampedArray(png.data),
        name,
      },
    };
  }
}

export function encodeAutotile(raw) {
  const doc = validateDocument(raw);
  if (!doc.autotile) throw new Error(t("오토타일 세트를 먼저 만들어 주세요."));
  const image = renderAutotile(doc);
  return {
    png: PNG.sync.write(
      { ...image, data: Buffer.from(image.data) },
      { colorType: 6, inputColorType: 6, bitDepth: 8 },
    ),
    manifest: autotileManifest(doc),
    document: doc,
  };
}
