// Intentionally no IPC bridge. The trusted opener retains all editor actions.
// The native host supplies only a listen-only activity bit for decorative motion.
const { ipcRenderer } = require("electron");
let uiWindowActive = true;
const publishWindowActivity = () => {
  if (!document.documentElement) return;
  document.documentElement.toggleAttribute("data-ui-host-inactive", !uiWindowActive);
  window.dispatchEvent(new CustomEvent("pixel-mat-window-active", { detail: uiWindowActive }));
};
ipcRenderer.on("ui:window-active", (_event, active) => {
  uiWindowActive = active === true;
  publishWindowActivity();
});
document.addEventListener("DOMContentLoaded", publishWindowActivity, { once: true });
