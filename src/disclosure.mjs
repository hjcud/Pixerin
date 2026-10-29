import { t } from "./i18n.mjs";
import { PROVIDERS } from "./providers.mjs";
export const AI_DISCLOSURE_VERSION = 1;

export function transmissionSummary(doc, { economy = false, provider = "codex", wholeImage = false, concise = false } = {}) {
  if (provider === "none") return t("AI 서비스가 연결되지 않았습니다.");
  if (wholeImage) return concise ? t("현재 레이어와 보이는 그림 전체") : t("OpenAI 전송, 활성 레이어와 보이는 합성 이미지 전체, 선택 밖도 문맥에 포함, 첨부한 참고 이미지");
  if (provider !== "codex" && provider !== "api")
    return concise ? t("현재 레이어와 보이는 그림 (최대 64×64px)") : t("{0} 전송, 요청, 팔레트, 편집 제약과 활성 레이어, 합성 문맥 (최대 64×64), 첨부한 참고 이미지", PROVIDERS[provider]?.company || provider);
  if (economy && !doc.autotile && !doc.tileMode && !doc.layers?.find((layer) => layer.id === doc.activeLayerId)?.geometryGuide)
    return concise ? t("선택 주변 이미지 (최대 64×64px)") : t("OpenAI 전송, 선택 주변의 활성 레이어, 합성 이미지 (최대 64×64)");
  if (doc.width > 64 || doc.height > 64)
    return concise ? t("선택 주변 이미지 (최대 64×64px)") : t(
      "OpenAI 전송, 선택을 포함한 최대 64×64 구간의 활성 레이어, 합성 이미지",
    );
  if (doc.autotile)
    return concise ? t("원본 타일, 타일 세트와 지도") : t("OpenAI 전송, 현재 원본 전체 + 5개 원본을 조합한 타일셋, 지도");
  if (doc.tileMode)
    return concise ? t("현재 레이어, 보이는 그림과 반복 이미지") : t("OpenAI 전송, 활성 레이어 전체 + 보이는 그림, 3×3 반복 이미지");
  return concise ? t("현재 레이어와 보이는 그림 전체") : t("OpenAI 전송, 활성 레이어 전체 + 보이는 레이어의 합성 이미지");
}
