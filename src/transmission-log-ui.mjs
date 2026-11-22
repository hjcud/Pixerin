import { uiDocument } from "./ui-surfaces.mjs";
import { t, getLanguage } from "./i18n.mjs";
import { PROVIDERS } from "./providers.mjs";
const $ = (id) => uiDocument.getElementById(id);
let serial = 0;
const number = (value) => Number.isSafeInteger(value) ? value.toLocaleString(getLanguage()) : "—";
const statuses = { running: "진행 중", completed: "완료", error: "요청 실패", canceled: "요청 취소됨", interrupted: "중단됨" };
export async function renderTransmissionLog(bridge) {
  const id = ++serial, error = $("transmission-log-error");
  $("transmission-log-refresh").disabled = true;
  error.hidden = true;
  try {
    const data = await bridge.transmissionHistory();
    if (id !== serial) return;
    const list = $("transmission-log-list"); list.replaceChildren();
    const totals = data.entries.reduce((sum, row) => ({
      input: sum.input + (row.usage?.input_tokens ?? 0), output: sum.output + (row.usage?.output_tokens ?? 0),
      partial: sum.partial + Number(row.partial || !Number.isSafeInteger(row.usage?.input_tokens) || !Number.isSafeInteger(row.usage?.output_tokens)),
    }), { input: 0, output: 0, partial: 0 });
    $("transmission-log-total").textContent = t("보관된 {0}개, 확인된 입력 {1}, 출력 {2} 토큰, 불완전한 기록 {3}개",
      data.entries.length, number(totals.input), number(totals.output), totals.partial);
    for (const row of data.entries) {
      const details = document.createElement("details"), summary = document.createElement("summary");
      summary.textContent = `${new Date(row.started).toLocaleString(getLanguage())}, ${PROVIDERS[row.provider]?.name}, ${row.model}, ${t(statuses[row.status])}`;
      details.append(summary);
      const text = (value) => { const p = document.createElement("p"); p.className = "field-help"; p.textContent = value; details.append(p); };
      text(t("입력 {0}, 출력 {1} 토큰", number(row.usage?.input_tokens), number(row.usage?.output_tokens)));
      text(t("입력 중 캐시 {0}, 캐시 쓰기 {1}, 출력 중 추론 {2}", number(row.usage?.cached_tokens), number(row.usage?.cache_write_tokens), number(row.usage?.reasoning_tokens)));
      text(row.mode==='analysis'?t("원본 미리보기 {0}×{1}, AI 호출 시도 {2}회",row.width,row.height,row.calls):t("문맥 {0}×{1}, 수정 가능 {2}px, AI 호출 시도 {3}회", row.width, row.height, row.pixels, row.calls));
      text(t("방식: {0}, 참고 이미지: {1}, 절약 모드: {2}", row.mode==='analysis'?t("AI 원본 분석"):row.mode === "animation" ? t("AI 움직임") : row.wholeImage ? t("전체 수정, 기존 이미지 기반") : row.mode === "image" ? t("고급 이미지 생성") : t("기본 픽셀 편집"), row.reference ? t("있음") : t("없음"), row.economy ? t("사용") : t("사용 안 함")));
      if (row.mode === "animation" && row.frames) text(t("프레임 {0}개", row.frames));
      if (row.partial) text(t("사용량이 일부 또는 전부 보고되지 않았어요. 표시된 값은 확인된 부분이에요."));
      list.append(details);
    }
    if (!data.entries.length) list.textContent = t("아직 전송 기록이 없어요.");
    if (data.storageError) { error.textContent = t("전송 기록을 저장하거나 읽지 못했어요. 표시된 기록은 이번 실행에만 남을 수 있어요."); error.hidden = false; }
    $("transmission-log-clear").disabled = data.entries.some((row) => row.status === "running");
  } catch {
    error.textContent = t("전송 기록을 불러오지 못했어요."); error.hidden = false;
  } finally { if (id === serial) $("transmission-log-refresh").disabled = false; }
  $("transmission-log-refresh").onclick = () => renderTransmissionLog(bridge);
  $("transmission-log-clear").onclick = async () => {
    $("transmission-log-clear").disabled = true;
    try { await bridge.clearTransmissionHistory(); await renderTransmissionLog(bridge); }
    catch { error.textContent = t("전송 기록을 지우지 못했어요."); error.hidden = false; }
    finally { $("transmission-log-clear").disabled = false; }
  };
}
