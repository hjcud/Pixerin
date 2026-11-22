export const COMMANDS = [
  ["pencil", "연필", "b"],
  ["eraser", "지우개", "e"],
  ["picker", "스포이트", "i"],
  ["fill", "채우기", "f"],
  ["line", "직선", "l"],
  ["rectangle", "사각형", "u"],
  ["select", "사각 선택", "m"],
  ["brush-select", "선택 브러시", "s"],
  ["wand", "연결 선택", "w"],
  ["move", "선택 이동", "v"],
  ["hand", "화면 이동", "h"],
  ["undo", "실행 취소", "Ctrl+z"],
  ["redo", "다시 실행", "Ctrl+Shift+z", "Ctrl+y"],
  ["work-next", "다음 작업", "Ctrl+tab"],
  ["work-previous", "이전 작업", "Ctrl+Shift+tab"],
  ["work-close", "작업 닫기", "Ctrl+w"],
  ["work-reopen", "닫은 작업 다시 열기", "Ctrl+Shift+t"],
  ["command-search", "명령 검색", "Ctrl+k"],
  ["canvas-focus", "캔버스 집중 모드", "Ctrl+Shift+f"],
  ["save", "프로젝트 저장", "Ctrl+s"],
  ["save-as", "다른 이름으로 저장", "Ctrl+Shift+s"],
  ["copy", "복사", "Ctrl+c"],
  ["copy-merged", "합성 복사", "Ctrl+Shift+c"],
  ["cut", "잘라내기", "Ctrl+x"],
  ["paste", "붙여넣기", "Ctrl+v"],
  ["select-all", "전체 선택", "Ctrl+a"],
  ["deselect", "선택 해제", "Ctrl+d"],
  ["reselect", "선택 복원", "Ctrl+Shift+d"],
  ["selection-layer-copy", "선택을 새 레이어로 복사", "Ctrl+j"],
  ["selection-layer-cut", "선택을 새 레이어로 잘라내기", "Ctrl+Shift+j"],
  ["layer-up", "앞으로"],
  ["layer-down", "뒤로"],
  ["folder-add", "폴더 추가"],
  ["layer-clip-add", "클리핑 레이어 추가"],
  ["layer-mask-open", "마스크 편집"],
  ["layer-mask-toggle", "마스크 전환"],
  ["layer-mask-link", "마스크와 그림 이동 연결"],
  ["layer-selection-mask", "선택 영역을 마스크로"],
  ["layer-mask-selection", "마스크를 선택 영역으로"],
  ["layer-align-open", "레이어 정렬"],
  ["view-mirror", "화면 좌우 반전"],
  ["transform-flip-x", "좌우 반전"],
  ["transform-flip-y", "상하 반전"],
  ["transform-rotate-cw", "시계 방향 90°"],
  ["transform-rotate-ccw", "반시계 방향 90°"],
  ["resize-open", "캔버스 크기와 여백"],
  ["image-size-open", "이미지 크기 조절"],
  ["palette-cleanup-open", "팔레트 정리"],
  ["palette-library-open", "팔레트 보관함"],
  ["invert", "선택 반전", "Ctrl+Shift+i"],
  ["delete", "삭제", "delete", "backspace"],
  ["rename", "레이어 이름 변경", "f2"],
  ["grid", "격자", "g"],
  ["alpha", "투명 잠금", "t"],
  ["swap", "색상 교환", "x"],
  ["colors-reset", "기본 색상", "d"],
  ["shade-down", "어두운 색", ","],
  ["shade-up", "밝은 색", "."],
  ["brush-down", "브러시 축소", "["],
  ["brush-up", "브러시 확대", "]"],
  ["zoom-in", "확대", "=", "Shift+="],
  ["zoom-out", "축소", "-"],
  ["fit", "화면 맞춤", "0"],
  ["zoom-actual", "100% 보기", "1"],
  ["zoom-selection", "선택 영역 맞춤"],
  ["ai", "AI 수정", "/"],
  ["generate", "변경안 만들기", "Ctrl+enter"],
  ["apply", "변경안 적용", "enter"],
  ["placement-confirm", "위치 확정", "enter"],
  ["help", "도움말", "Shift+/"],
  ["geometry-open", "3D 도형"],
  ["refine-open", "픽셀 보정"],
  ["script-open", "사용자 도구"],
  ["new-btn", "새 작업", "Ctrl+n"],
  ["open-btn", "열기", "Ctrl+o"],
  ["export-btn", "PNG 내보내기", "Ctrl+Shift+e"],
  ["settings-btn", "설정"],
].map(([id, label, ...keys]) => ({ id, label, keys }));
const reserved = new Set([
  "escape",
  "space",
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
]);
export function keyOf(event) {
  let key = event.key.toLowerCase();
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
  const punctuation = {
    BracketLeft: "[",
    BracketRight: "]",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Equal: "=",
    Minus: "-",
  };
  key = punctuation[event.code] || key;
  if (["control", "shift", "alt", "meta", "dead", "unidentified"].includes(key))
    return null;
  if (key === " ") key = "space";
  return [
    ...(event.ctrlKey || event.metaKey ? ["Ctrl"] : []),
    ...(event.altKey ? ["Alt"] : []),
    ...(event.shiftKey ? ["Shift"] : []),
    key,
  ].join("+");
}
export function validBinding(key) {
  return (
    typeof key === "string" &&
    /^(Ctrl\+)?(Alt\+)?(Shift\+)?([a-z0-9]|f[1-9]|f1[0-2]|enter|delete|backspace|tab|[\[\],.\/=\-])$/.test(
      key,
    ) &&
    !reserved.has(key.split("+").at(-1)) &&
    !["Alt+f4", "Ctrl+Shift+w", "Ctrl+Alt+delete"].includes(key)
  );
}
export function normalizeBindings(raw, commands = COMMANDS) {
  const result = {},
    used = new Map();
  for (const command of commands) {
    const keys = Array.isArray(raw?.[command.id])
      ? raw[command.id]
      : command.keys;
    result[command.id] = keys
      .filter(
        (k) =>
          validBinding(k) &&
          !(used.get(k) || []).some((id) =>
            overlappingCommands(id, command.id),
          ),
      )
      .slice(0, 2);
    result[command.id] = [...new Set(result[command.id])];
    result[command.id].forEach((k) =>
      used.set(k, [...(used.get(k) || []), command.id]),
    );
  }
  return result;
}
function overlappingCommands(a, b) {
  return !(
    (a === "apply" && b === "placement-confirm") ||
    (b === "apply" && a === "placement-confirm")
  );
}
export function bindingConflict(bindings, key, id, slot) {
  for (const [other, keys] of Object.entries(bindings))
    for (let i = 0; i < keys.length; i++)
      if (
        keys[i] === key &&
        (other !== id || i !== slot) &&
        overlappingCommands(other, id)
      )
        return other;
  return null;
}
export function commandFor(event, bindings, context = "editor") {
  const key = keyOf(event);
  return (
    Object.keys(bindings).find(
      (id) =>
        bindings[id].includes(key) &&
        (id === "placement-confirm"
          ? context === "placement"
          : id !== "apply" || context !== "placement"),
    ) || null
  );
}
// Keep the existing guarded command handlers; remap a registered binding to its canonical event.
export function canonicalEvent(event, command) {
  const original = COMMANDS.find((c) => c.id === command)?.keys[0];
  if (!original) return null;
  const bits = original.split("+"),
    key = bits.at(-1);
  const values = {
    key: original === "Shift+/" ? "?" : original === "Shift+=" ? "+" : key,
    ctrlKey: bits.includes("Ctrl"),
    metaKey: false,
    altKey: bits.includes("Alt"),
    shiftKey: bits.includes("Shift"),
  };
  return new Proxy(event, {
    get(target, prop) {
      if (prop in values) return values[prop];
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
