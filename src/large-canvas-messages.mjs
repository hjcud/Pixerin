// Compatibility view of the current application catalog.
import messages from './messages.mjs';
const keys = [
  "캔버스는 각 변 3840px, 총 8,294,400픽셀 이하여야 해요. 3840×2160, 2160×3840, 2880×2880까지 지원해요.",
  "각 변 최대 3840px, 총 8,294,400픽셀, AI 전체 수정도 같은 상한",
  "각 변 1–4096px, AI 편집은 선택한 구간만 전송",
  "문서의 레이어, 마스크가 메모리 상한을 초과해요. 크기나 레이어 수를 줄여 주세요.",
  "큰 캔버스는 메모리를 많이 사용해요. 레이어, 마스크 합계에 따라 추가가 제한될 수 있어요.",
  "PNG는 128MB, 프로젝트는 512MB 이하의 파일을 열어 주세요.",
  "올바른 128MB 이하 PNG 파일을 열어 주세요.",
  "가져올 PNG는 각 변 4096px 이하여야 해요.",
  "붙여넣을 이미지는 각 변이 4096px 이하여야 해요. 필요한 부분을 복사해 주세요."
];
export default Object.fromEntries(keys.map(key => [key, messages[key]]));
