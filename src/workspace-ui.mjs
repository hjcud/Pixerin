import { t } from "./i18n.mjs";
import { createIcon } from "./icons.mjs";

export function attachWorkspace({
  bridge,
  snapshot,
  close,
  flush,
  budget,
  settings,
  aiBusy,
  notify,
  canNavigate,
  create,
}) {
  if (!bridge?.workspaceState) return null;
  const bar = document.createElement("nav");
  bar.id = "work-tabs";
  bar.setAttribute("aria-label", t("작업 탭"));
  const list = document.createElement("div");
  list.className = "work-tab-list";
  list.setAttribute("role", "tablist");
  const add = document.createElement("button");
  add.id = "work-add";
  add.append(createIcon("plus"));
  add.title = add.ariaLabel = t("새 작업");
  add.onclick = () => {
    if (canNavigate()) create();
  };
  const more = document.createElement("details");
  more.className = "work-menu";
  const summary = document.createElement("summary");
  summary.append(createIcon("chevron-down"));
  summary.title = summary.ariaLabel = t("작업 메뉴");
  const menu = document.createElement("div");
  more.append(summary, menu);
  bar.append(list, add, more);
  document.querySelector(".app-header").after(bar);
  document.body.classList.add("has-work-tabs");
  let state,
    signature = "",
    metadata = "",
    timer,
    drag,
    lastBudget,
    lastDocumentCount;
  const command = (input) =>
    bridge
      .workspaceCommand(input)
      .catch((error) => notify(error.message, true));
  const action = (label, name, extra = {}) => {
    const button = document.createElement("button");
    button.textContent = t(label);
    button.dataset.workAction = name;
    button.onclick = () => {
      more.open = false;
      if (canNavigate()) command({ action: name, ...extra });
    };
    return button;
  };
  function render(next) {
    state = next;
    bar.ariaLabel = t("작업 탭");
    add.title = add.ariaLabel = t("새 작업");
    summary.title = summary.ariaLabel = t("작업 메뉴");
    aiBusy(Boolean(state.aiOwner && state.aiOwner !== state.id));
    if (
      lastBudget !== state.budget ||
      lastDocumentCount !== state.documentCount
    ) {
      lastBudget = state.budget;
      lastDocumentCount = state.documentCount;
      budget(lastBudget, lastDocumentCount);
    }
    if (drag) return;
    const key = JSON.stringify([
      state.tabs,
      state.active,
      state.windows,
      state.canReopen,
      document.documentElement.lang,
    ]);
    if (key === signature) return;
    signature = key;
    const focusId = document.activeElement?.dataset.workId;
    list.replaceChildren();
    menu.replaceChildren();
    for (const tab of state.tabs) {
      const item = document.createElement("div");
      item.className = "work-tab";
      item.dataset.id = tab.id;
      item.classList.toggle("active", tab.id === state.active);
      const button = document.createElement("button");
      button.className = "work-tab-select";
      button.dataset.workId = tab.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(tab.id === state.active));
      button.tabIndex = tab.id === state.active ? 0 : -1;
      button.title = `${tab.name}${tab.dirty ? ", " + t("저장하지 않은 변경") : ""}${tab.busy ? ", " + t("AI 작업 중") : tab.proposal ? ", " + t("변경안 준비됨") : ""}`;
      if (tab.placement) button.title += ", " + t("위치 확정 대기");
      if (tab.saveError) button.title += ", " + t("자동 저장 실패");
      if (tab.crashed) button.title += ", " + t("작업 복구");
      button.ariaLabel = button.title;
      if (tab.thumbnail) {
        const image = document.createElement("img");
        image.src = tab.thumbnail;
        image.alt = "";
        image.draggable = false;
        button.append(image);
      }
      const name = document.createElement("span");
      name.className = "work-tab-name";
      name.textContent = tab.name;
      button.append(name);
      const status = document.createElement("span");
      status.className = "work-tab-status";
      status.textContent =
        tab.saveError || tab.crashed
          ? "!"
          : tab.placement
            ? "◇"
            : tab.busy
              ? "◌"
              : tab.proposal
                ? "◇"
                : tab.dirty
                  ? "●"
                  : "";
      button.append(status);
      const x = document.createElement("button");
      x.className = "work-tab-close";
      x.append(createIcon("close"));
      x.ariaLabel = t("작업 닫기") + ": " + tab.name;
      x.onclick = () => {
        if (canNavigate()) command({ action: "close", id: tab.id });
      };
      button.onclick = () => {
        if (!button.dataset.dragged && canNavigate())
          command({ action: "activate", id: tab.id });
        delete button.dataset.dragged;
      };
      button.onauxclick = (e) => {
        if (e.button === 1) {
          e.preventDefault();
          if (canNavigate()) command({ action: "close", id: tab.id });
        }
      };
      button.onpointerdown = (e) => {
        if (e.button !== 0 || !canNavigate()) return;
        drag = {
          id: tab.id,
          pointer: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          button,
          moved: false,
        };
        try {
          button.setPointerCapture(e.pointerId);
        } catch {
          drag = null;
          return;
        }
        drag.start = command({
          action: "drag-start",
          id: tab.id,
          x: e.screenX,
          y: e.screenY,
        });
      };
      button.onpointermove = (e) => {
        if (!drag || drag.pointer !== e.pointerId) return;
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
          drag.moved = true;
          bar.classList.add("dragging");
          button.dataset.dragged = "true";
        }
      };
      button.onpointerup = (e) => finishDrag(e, false);
      button.onpointercancel = (e) => finishDrag(e, true);
      button.onlostpointercapture = (e) => {
        if (e.buttons) finishDrag(e, true);
      };
      button.onkeydown = (e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const i = state.tabs.findIndex((x) => x.id === tab.id),
          n = state.tabs.length;
        const index =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : (i + (e.key === "ArrowRight" ? 1 : n - 1)) % n;
        if (canNavigate())
          command({ action: "activate", id: state.tabs[index].id });
      };
      item.append(button, x);
      list.append(item);
    }
    const detach = action("새 창으로 분리", "detach");
    detach.disabled = state.tabs.length < 2;
    menu.append(detach);
    for (const host of state.windows) {
      if (host.id === state.host) continue;
      const move = action("다른 창으로 이동", "move", { window: host.id });
      move.textContent = t("다른 창으로 이동") + ", " + host.name;
      menu.append(move);
    }
    menu.append(action("작업 닫기", "close"));
    const reopen = action("닫은 작업 다시 열기", "reopen");
    reopen.disabled = !state.canReopen;
    menu.append(reopen);
    if (focusId)
      list
        .querySelector(`[data-work-id="${state.active}"]`)
        ?.focus({ preventScroll: true });
    list
      .querySelector(".active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    update();
  }
  async function finishDrag(event, cancel) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const current = drag;
    drag = null;
    bar.classList.remove("dragging");
    if (current.button.hasPointerCapture(event.pointerId))
      current.button.releasePointerCapture(event.pointerId);
    await current.start;
    await command({
      action: cancel || !current.moved ? "drag-cancel" : "drag-end",
      id: current.id,
      x: event.screenX,
      y: event.screenY,
    });
    signature = "";
    render(state);
  }
  window.addEventListener("pointerup", (e) => finishDrag(e, false));
  document.addEventListener(
    "keydown",
    (e) => {
      if (drag && e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        finishDrag({ pointerId: drag.pointer }, true);
      }
    },
    true,
  );
  window.addEventListener("blur", () => {
    if (drag) finishDrag({ pointerId: drag.pointer }, true);
  });
  document.addEventListener("pointerdown", (event) => {
    if (more.open && !more.contains(event.target)) more.open = false;
  });
  more.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      more.open = false;
      summary.focus();
    }
  });
  list.addEventListener(
    "wheel",
    (event) => {
      if (list.scrollWidth <= list.clientWidth || event.ctrlKey) return;
      event.preventDefault();
      list.scrollLeft += event.deltaX || event.deltaY;
    },
    { passive: false },
  );
  list.addEventListener("scroll", () => update(), { passive: true });
  new ResizeObserver(() => update()).observe(bar);
  function update() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const value = {
        ...snapshot(),
        blocked: !canNavigate(),
        tabStrip: (() => {
          const r=bar.getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
        })(),
        tabs: [...list.querySelectorAll(".work-tab")].map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right };
        }),
      };
      const key = JSON.stringify(value);
      if (key === metadata) return;
      metadata = key;
      bridge
        .workspaceMetadata(value)
        .catch((error) => notify(error.message, true));
    }, 80);
  }
  bridge.onWorkspace(render);
  new MutationObserver(() => update()).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open", "inert"],
  });
  bridge.onWorkspaceSettings((value) => {
    settings(value);
    signature = "";
    if (state) render(state);
  });
  bridge.onWorkspaceError((error) => notify(error, true));
  bridge.onWorkClose(close);
  bridge.onWorkFlush(flush);
  bridge
    .workspaceState()
    .then(render)
    .catch((error) => notify(error.message, true));
  for (const [id, name] of [
    ["work-next", "next"],
    ["work-previous", "previous"],
    ["work-close", "close"],
    ["work-reopen", "reopen"],
  ]) {
    const button = document.createElement("button");
    button.id = id;
    button.hidden = true;
    button.onclick = () => {
      if (canNavigate()) command({ action: name });
    };
    bar.append(button);
  }
  return { update };
}
