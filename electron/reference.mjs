import { PNG } from "pngjs";
import {
  REFERENCE_LIMITS,
  referenceHeader,
  validateReference,
} from "../src/reference.mjs";
import { t } from "../src/i18n.mjs";

export function referenceContent(raw) {
  const reference = validateReference(raw);
  if (!reference) return null;
  try {
    const bytes = Buffer.from(
      reference.image.slice("data:image/png;base64,".length),
      "base64",
    );
    const size = referenceHeader(bytes);
    if (
      size.type !== "image/png" ||
      size.width > REFERENCE_LIMITS.outputEdge ||
      size.height > REFERENCE_LIMITS.outputEdge
    )
      throw new Error("Size");
    const image = PNG.sync.read(bytes, { checkCRC: true });
    // Only re-encoded raster pixels cross the provider boundary, never file metadata.
    const data =
      "data:image/png;base64," + PNG.sync.write(image).toString("base64");
    if (data.length > REFERENCE_LIMITS.dataLength) throw new Error("Size");
    return {
      ...reference,
      image: data,
      width: image.width,
      height: image.height,
    };
  } catch {
    throw new Error(t("참고 이미지나 참고 목적을 확인해 주세요."));
  }
}
