const { contextBridge, ipcRenderer } = require("electron");
// Listen-only presentation state, with no new renderer-to-main capability.
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
const call = async (channel, input) => {
  const result = await ipcRenderer.invoke(channel, input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
contextBridge.exposeInMainWorld("pixeltool", {
  panelCommand: (input) => call("panel:command", input),
  onPanelReturn: (callback) => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on("panel:return", listener);
    return () => ipcRenderer.removeListener("panel:return", listener);
  },
  onPanelBounds: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("panel:bounds", listener);
    return () => ipcRenderer.removeListener("panel:bounds", listener);
  },
  listPalettes: () => call("palette:list"),
  savePalette: (input) => call("palette:save", input),
  removePalette: (id) => call("palette:remove", id),
  importPalette: () => call("palette:import"),
  exportPalette: (input) => call("palette:export", input),
  workspaceState: () => call("workspace:state"),
  workspaceMetadata: (input) => call("workspace:metadata", input),
  workspaceCommand: (input) => call("workspace:command", input),
  createWork: (input) => call("workspace:create", input),
  workBaseline: () => call("workspace:baseline"),
  onWorkspace: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("workspace:state", listener);
    return () => ipcRenderer.removeListener("workspace:state", listener);
  },
  onWorkspaceSettings: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("workspace:settings", listener);
    return () => ipcRenderer.removeListener("workspace:settings", listener);
  },
  onWorkspaceError: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("workspace:error", listener);
    return () => ipcRenderer.removeListener("workspace:error", listener);
  },
  onWorkClose: (callback) => {
    const listener = async (_event, channel) => {
      if (!/^workspace:close-reply:[a-f0-9-]{36}$/.test(channel)) return;
      let accepted = false;
      try {
        accepted = await callback();
      } catch {
      } finally {
        ipcRenderer.send(channel, accepted === true);
      }
    };
    ipcRenderer.on("workspace:close-request", listener);
    return () =>
      ipcRenderer.removeListener("workspace:close-request", listener);
  },
  onWorkFlush: (callback) => {
    const listener = async (_event, channel) => {
      if (!/^workspace:flush-reply:[a-f0-9-]{36}$/.test(channel)) return;
      let accepted = false;
      try {
        accepted = await callback();
      } catch {
      } finally {
        ipcRenderer.send(channel, accepted === true);
      }
    };
    ipcRenderer.on("workspace:flush-request", listener);
    return () =>
      ipcRenderer.removeListener("workspace:flush-request", listener);
  },
  acknowledgeAI: (version) => call("ai:acknowledge", version),
  getLegalInfo: () => call("legal:info"),
  openChromiumNotices: () => call("legal:chromium"),
  savePreferences: (input) => call("preferences:save", input),
  getSettings: () => call("settings:get"),
  inspectCodex: () => call("codex:inspect"),
  forgetCodexInspection: () => call("codex:forget"),
  openCodexSkillGuide: () => call("codex:guide"),
  saveSettings: (input) => call("settings:save", input),
  clearKey: (provider) => call("settings:clear", { provider }),
  loadDraft: () => call("draft:load"),
  saveDraft: (doc) => call("draft:save", doc),
  savePlacement: (input) => call("placement:save", input),
  loadPlacement: () => call("placement:load"),
  clearPlacement: () => call("placement:clear"),
  newProject: () => call("project:new"),
  openProject: () => call("project:open"),
  saveProject: (doc) => call("project:save", doc),
  saveProjectAs: (doc) => call("project:save-as", doc),
  listRecovery: () => call("recovery:list"),
  previewRecoveryStorage: (policy) => call("recovery:storage-preview", policy),
  cleanRecoveryStorage: () => call("recovery:storage-clean"),
  readRecovery: (input) => call("recovery:read", input),
  exportPNG: (doc) => call("png:export", doc),
  exportAnimation: (doc) => call("animation:export", doc),
  exportAutotile: (doc) => call("autotile:export", doc),
  openPreview: (input) => call("preview:open", input),
  updatePreview: (input) => call("preview:update", input),
  onPreviewClosed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("preview:closed", listener);
    return () => ipcRenderer.removeListener("preview:closed", listener);
  },
  importPNG: (input) => call("png:import", input),
  readReferenceClipboard: () => call("reference:clipboard"),
  copyPixels: (clip) => call("pixels:copy", clip),
  pastePixels: () => call("pixels:paste"),
  requestPatch: (input) => call("ai:request", input),
  openAPISetup: (provider) => call("api:setup", provider),
  checkAPIModel: (input) => call("api:check", input),
  transmissionHistory: () => call("ai:history"),
  clearTransmissionHistory: () => call("ai:history-clear"),
  reconvertImage: (input) => call("ai:reconvert", input),
  releaseGeneratedImage: (sourceId) => call("ai:release-source", { sourceId }),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("ai:progress", listener);
    return () => ipcRenderer.removeListener("ai:progress", listener);
  },
  cancelRequest: () => call("ai:cancel"),
});
