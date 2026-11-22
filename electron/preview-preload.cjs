const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pixelPreview", {
  onFrame: (callback) => {
    const listener = (_event, frame) => callback(frame);
    ipcRenderer.on("preview:frame", listener);
    return () => ipcRenderer.removeListener("preview:frame", listener);
  },
});
