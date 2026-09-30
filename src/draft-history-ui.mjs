import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import { bindText } from "./i18n-dom.mjs";
import { t } from "./i18n.mjs";

// Merge only auto-repeat from the same held key. A fresh press, focus change,
// pointer gesture or history command starts a new operation.
export function attachArrowHistory(dialog, record) {
  let group = null;
  const clear = () => {
    group = null;
  };
  for (const type of ["keyup", "focusout", "pointerdown", "close"])
    dialog.addEventListener(type, clear, true);
  uiWindow.addEventListener("blur", clear);
  dialog.addEventListener(
    "keydown",
    (e) => {
      if (!e.key.startsWith("Arrow") || !e.repeat) clear();
    },
    true,
  );
  return (e) => {
    const same =
      group &&
      e.repeat &&
      group.key === e.key &&
      group.target === e.target &&
      group.shift === e.shiftKey;
    if (!same)
      group = {
        key: e.key,
        target: e.target,
        shift: e.shiftKey,
        changed: false,
      };
    const changed = record(group.changed);
    group.changed ||= changed;
  };
}

export function attachDraftHistoryUI(
  dialog,
  prefix,
  host,
  { undo, redo, cancelGesture },
) {
  for (const [action, label] of [
    ["undo", "실행 취소"],
    ["redo", "다시 실행"],
  ]) {
    const button = uiDocument.getElementById(`${prefix}-${action}`);
    bindText(button.querySelector("[data-action-label]") || button, () => t(label));
    button.onclick = action === "undo" ? undo : redo;
  }
  dialog.addEventListener("keydown", (e) => {
    if (
      e.isComposing ||
      e.keyCode === 229 ||
      e.target.matches(
        'textarea, input:not([type="number"]):not([type="checkbox"]):not([type="range"]), [contenteditable="true"]',
      )
    )
      return;
    const action = host.historyCommand?.(e);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (cancelGesture?.()) return;
    (action === "undo" ? undo : redo)();
  });
}
