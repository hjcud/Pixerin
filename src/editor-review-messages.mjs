// Compatibility view of the current application catalog.
import messages from './messages.mjs';
const keys = [
  "저장 재시도",
  "{0}, {1}회",
  "{0}픽셀을 적용했어요. 실행 취소로 되돌릴 수 있어요.",
  "참조 레이어",
  "이어진 영역만",
  "선택 1px 확장",
  "선택 1px 축소",
  "안쪽 테두리 1px 선택",
  "배율 설정",
  "배율 (%)",
  "100% 보기",
  "선택 영역 맞춤",
  "축소하면 선택 영역이 사라져요. 기존 선택을 유지했어요."
];
export default Object.fromEntries(keys.map(key => [key, messages[key]]));
