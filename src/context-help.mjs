import { uiDocument, uiWindow } from "./ui-surfaces.mjs";

// Native popovers escape scroll containers and modal stacking contexts. Bind to
// the actual controls so help follows panels when their DOM is adopted.
export function attachContextHelp(root = document) {
  const positions = new WeakMap();
  let changing = false;
  for (const trigger of root.querySelectorAll(".help-trigger[popovertarget]")) {
    const popup = root.getElementById(trigger.getAttribute("popovertarget"));
    let pinned = false, timer;
    const opened = () => popup.matches(":popover-open");
    const close = () => {
      clearTimeout(timer);
      changing = true;
      try { if (opened()) popup.hidePopover(); }
      finally { changing = false; pinned = false; }
    };
    const position = () => {
      const win = trigger.ownerDocument.defaultView;
      const anchor = trigger.getBoundingClientRect();
      if (!anchor.width || anchor.bottom < 0 || anchor.top >= win.innerHeight) { close(); return; }
      // Leave the trigger exposed even in a 320x240 detached panel. Longer
      // explanations scroll within the available space above or below it.
      const spaceBelow = Math.max(0, win.innerHeight - anchor.bottom - 14);
      const spaceAbove = Math.max(0, anchor.top - 14);
      popup.style.maxHeight = `${Math.min(320, Math.max(24, spaceAbove, spaceBelow))}px`;
      const box = popup.getBoundingClientRect();
      const left = Math.max(8, Math.min(anchor.right - box.width, win.innerWidth - box.width - 8));
      const below = anchor.bottom + 6;
      const top = below + box.height <= win.innerHeight - 8 ? below :
        Math.max(8, Math.min(anchor.top - box.height - 6, win.innerHeight - box.height - 8));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    };
    positions.set(popup, position);
    const show = () => {
      // Native dismissal can synchronously restore focus to an invoker. Do not
      // reopen its popup while another show/hide operation is still running.
      if (changing) return;
      clearTimeout(timer);
      changing = true;
      try { if (!opened()) popup.showPopover(); }
      finally { changing = false; }
      position();
    };
    const leave = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const active = trigger.ownerDocument.activeElement;
        if (!pinned && !trigger.matches(":hover") && !popup.matches(":hover") &&
          active !== trigger && !popup.contains(active)) close();
      }, 120);
    };
    trigger.addEventListener("pointerenter", show);
    trigger.addEventListener("pointerleave", leave);
    trigger.addEventListener("focus", show);
    trigger.addEventListener("blur", leave);
    // Keep native button activation and text scrolling out of canvas shortcuts.
    for (const node of [trigger, popup]) node.addEventListener("keydown", event => {
      if (event.key !== "Escape") event.stopPropagation();
    });
    trigger.addEventListener("click", event => {
      event.preventDefault(); // Focus/hover may have opened it before this click.
      if (pinned && opened()) close();
      else { show(); pinned = true; }
    });
    popup.addEventListener("pointerenter", () => clearTimeout(timer));
    popup.addEventListener("pointerleave", leave);
    popup.addEventListener("focusout", leave);
    popup.addEventListener("toggle", () => {
      trigger.setAttribute("aria-expanded", String(opened()));
      if (!opened()) pinned = false;
    });
  }
  const closeAll = () => {
    changing = true;
    try {
      for (const popup of uiDocument.querySelectorAll(".context-help:popover-open")) popup.hidePopover();
    } finally { changing = false; }
  };
  // Dismiss help without also canceling artwork, a pending request or its dialog.
  uiDocument.addEventListener("keydown", event => {
    if (event.key === "Escape" && uiDocument.querySelector(".context-help:popover-open")) {
      closeAll(); event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  uiWindow.addEventListener("resize", closeAll);
  uiWindow.addEventListener("blur", closeAll);
  uiDocument.addEventListener("scroll", event => {
    if (!event.target.closest?.(".context-help"))
      for (const popup of uiDocument.querySelectorAll(".context-help:popover-open")) positions.get(popup)?.();
  }, true);
}
