import { t } from "./i18n.mjs";
import { validateReference, referenceHeader } from "./reference.mjs";

// Optional v2 metadata. Store only the prepared crop, never a source path/image.
export function validateProjectContext(raw) {
  if (!raw || typeof raw.prompt !== "string" || raw.prompt.length > 4000)
    throw new Error(t("프로젝트 참고 정보를 읽을 수 없어요."));
  const reference = validateReference(raw.reference);
  if (reference) {
    const encoded = reference.image.split(",")[1];
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const header = referenceHeader(bytes);
    if (
      header.type !== "image/png" ||
      header.width > 512 ||
      header.height > 512
    )
      throw new Error(t("프로젝트 참고 정보를 읽을 수 없어요."));
  }
  return { prompt: raw.prompt, reference };
}
